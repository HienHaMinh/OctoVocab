import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { extractTextFromPdf, extractTextFromImage } from '@/lib/ocr'
import {
  extractVocabulary, hashContent, classifyWordsFast,
  apiError, apiSuccess, chunk, isLikelyProperNoun, extractSentenceForWord,
} from '@/lib/utils'
import { classifyWordBuiltin } from '@/lib/cefr-lists'
import { stem } from '@/lib/stemmer'
import { getCurrentUserRole, hasPermission } from '@/lib/rbac'
import { executeApprovedItems } from '@/lib/contributions'

// GET /api/sources — List all sources (shared pool)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const { data: sources, error } = await supabase
      .from('sources')
      .select('*, uploaded_by_teacher:teachers!uploaded_by(name, email)')
      .order('created_at', { ascending: false })

    if (error) return apiError(error.message, 500)
    return apiSuccess({ sources })
  } catch (err) {
    console.error('[sources GET] Unhandled error:', err)
    return apiError('Internal server error', 500)
  }
}

// POST /api/sources — Create source + contribution (PR model)
export async function POST(req: NextRequest) {
  let supabaseAdmin
  try {
    supabaseAdmin = await createAdminClient()
  } catch (err) {
    console.error('[sources POST] Failed to create Supabase client:', err)
    return apiError('Internal server error', 500)
  }

  const currentUser = await getCurrentUserRole()
  if (!currentUser) return apiError('Unauthorized', 401)

  let body: any
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }
  const { name, source_type, content, file_base64, file_name, mime_type, origin_url, origin_name, auto_approve } = body

  if (!name || !source_type) {
    return apiError('name and source_type are required')
  }

  // Ensure teacher record exists
  const { data: existingTeacher } = await supabaseAdmin
    .from('teachers')
    .select('id')
    .eq('id', currentUser.userId)
    .single()

  if (!existingTeacher) {
    await supabaseAdmin.from('teachers').insert({
      id: currentUser.userId,
      email: currentUser.email,
      name: currentUser.name || currentUser.email.split('@')[0],
      role: 'contributor',
    })
  }

  // ── Step 1: Extract text ────────────────────────────────────────────────
  const t0 = Date.now()
  let extractedText = ''
  let extractionProvider = 'text'
  let geminiText: string | undefined  // from parallel OCR, used for verify

  if (source_type === 'text') {
    if (!content) return apiError('content is required for text sources')
    extractedText = content
  } else if (source_type === 'pdf') {
    if (!file_base64) return apiError('file_base64 is required for PDF sources')
    try {
      const result = await extractTextFromPdf(file_base64)
      extractedText = result.text
      extractionProvider = result.method
      geminiText = result.geminiText
    } catch (err: any) {
      console.error('[sources POST] PDF extraction failed:', err?.message || err)
      const isApiKeyIssue = err?.message?.includes('MISTRAL_API_KEY')
      const hint = isApiKeyIssue ? ' (Check MISTRAL_API_KEY in Vercel env vars)' : ''
      return apiError(`PDF extraction failed${hint}. Please try again or paste the text manually.`, 500)
    }
  } else if (source_type === 'image') {
    if (!file_base64) return apiError('file_base64 is required for image sources')
    try {
      const result = await extractTextFromImage(file_base64, mime_type || 'image/png')
      extractedText = result.text
      extractionProvider = result.method
      geminiText = result.geminiText
    } catch (err: any) {
      console.error('[sources POST] Image extraction failed:', err?.message || err)
      return apiError('Image text extraction failed. Please try again or paste the text manually.', 500)
    }
  }

  if (!extractedText.trim()) {
    return apiError('No text could be extracted from this source')
  }

  // ── Step 2: Check for duplicate ─────────────────────────────────────────
  const contentHash = hashContent(extractedText)
  const { data: existingSource } = await supabaseAdmin
    .from('sources')
    .select('id, name')
    .eq('content_hash', contentHash)
    .single()

  if (existingSource) {
    return apiSuccess({
      source: existingSource,
      contribution: null,
      words_extracted: 0,
      words_new: 0,
      words_existing: 0,
      needs_ai: 0,
      duplicate: true,
      message: `This source was already imported: "${existingSource.name}"`,
    })
  }

  // ── Step 3: Extract vocabulary ──────────────────────────────────────────
  const wordFreqMap = extractVocabulary(extractedText)
  const wordList = Array.from(wordFreqMap.keys())

  if (wordList.length === 0) {
    return apiError('No vocabulary words found in this source')
  }

  // ── Step 4: Create source record (with new fields) ─────────────────────
  const fileSize = file_base64
    ? Math.ceil(file_base64.length * 0.75)
    : Buffer.byteLength(content || '', 'utf8')

  const { data: source, error: sourceError } = await supabaseAdmin
    .from('sources')
    .insert({
      teacher_id: currentUser.userId,
      name: name || file_name || 'Untitled',
      source_type,
      content_hash: contentHash,
      extracted_text: extractedText,
      word_count: wordList.length,
      file_size_bytes: fileSize,
      uploaded_by: currentUser.userId,
      origin_url: origin_url || null,
      origin_name: origin_name || null,
      mime_type: mime_type || (source_type === 'pdf' ? 'application/pdf' : null),
      extraction_provider: extractionProvider,
    })
    .select()
    .single()

  if (sourceError || !source) {
    return apiError(sourceError?.message || 'Failed to create source', 500)
  }

  // ── Step 4b: Store file + parallel Gemini text if available ─────────────
  if ((source_type === 'pdf' || source_type === 'image') && file_base64) {
    try {
      const fileBuffer = Buffer.from(file_base64, 'base64')
      const ext = source_type === 'image'
        ? (mime_type?.split('/')[1] || 'png')
        : 'pdf'
      const storagePath = `${source.id}.${ext}`
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('source-pdfs')
        .upload(storagePath, fileBuffer, {
          contentType: mime_type || 'application/pdf',
          upsert: true,
        })
      if (!uploadErr) {
        await supabaseAdmin.from('sources')
          .update({
            storage_path: storagePath,
            // pdf-parse = 100% accurate digital text → mark verified, skip OCR verify
            ...(extractionProvider === 'pdf-parse'
              ? { extraction_verified: true, extraction_flagged: false }
              : {}),
            // If Gemini ran in parallel with Mistral, store its text now
            ...(geminiText ? { secondary_raw_text: geminiText } : {}),
          })
          .eq('id', source.id)
      } else {
        console.warn('[sources] File storage upload failed:', uploadErr.message)
      }
    } catch (err) {
      console.warn('[sources] File storage upload error:', err)
    }
  }

  console.log(`[sources] Text extracted in ${Date.now() - t0}ms, ${wordList.length} unique words`)

  // ── Step 5: Built-in CEFR classify (instant) ───────────────────────────
  const { classified: builtinClassified, needsAI } = classifyWordsFast(wordList)
  const builtinMap = new Map(builtinClassified.map(c => [c.word, c.cefr_level]))

  // ── Step 6: Look up existing words in DB ───────────────────────────────
  const existingWords: Array<{ id: string; word: string; cefr_level: string }> = []
  for (const batch of chunk(wordList, 200)) {
    const { data } = await supabaseAdmin
      .from('words')
      .select('id, word, cefr_level')
      .in('word', batch)
      .eq('status', 'active')
    if (data) existingWords.push(...data)
  }
  const existingMap = new Map(existingWords.map(w => [w.word, w]))

  // ── Step 7: Build contribution items ───────────────────────────────────
  const items: any[] = []

  for (const [word, frequency] of wordFreqMap.entries()) {
    const existing = existingMap.get(word)
    const builtinCefr = builtinMap.get(word) || classifyWordBuiltin(word) || classifyWordBuiltin(stem(word))

    // Extract example sentence
    const exampleSentence = extractSentenceForWord(word, extractedText)

    if (!existing) {
      items.push({
        change_type: 'add_word',
        word,
        word_id: null,
        proposed_cefr: builtinCefr || 'Unclassified',
        proposed_translation: null,
        proposed_frequency: frequency,
        current_cefr: null,
        current_translation: null,
        current_frequency: null,
        status: 'pending',
        selected: true,
        ai_flagged: false,
        ai_flag_reason: null,
        example_sentence: exampleSentence,
        example_source_url: origin_url || null,
        example_source_name: origin_name || null,
      })
    } else {
      // Check CEFR conflict
      if (builtinCefr && existing.cefr_level !== builtinCefr && existing.cefr_level !== 'Unclassified') {
        items.push({
          change_type: 'cefr_conflict',
          word,
          word_id: existing.id,
          proposed_cefr: builtinCefr,
          proposed_translation: null,
          proposed_frequency: frequency,
          current_cefr: existing.cefr_level,
          current_translation: null,
          current_frequency: null,
          status: 'pending',
          selected: true,
          ai_flagged: false,
          ai_flag_reason: null,
          example_sentence: exampleSentence,
          example_source_url: origin_url || null,
          example_source_name: origin_name || null,
        })
      } else {
        items.push({
          change_type: 'update_frequency',
          word,
          word_id: existing.id,
          proposed_cefr: existing.cefr_level,
          proposed_translation: null,
          proposed_frequency: frequency,
          current_cefr: existing.cefr_level,
          current_translation: null,
          current_frequency: null,
          status: 'pending',
          selected: true,
          ai_flagged: false,
          ai_flag_reason: null,
          example_sentence: null,
          example_source_url: null,
          example_source_name: null,
        })
      }
    }
  }

  // ── Step 8: AI flagging ─────────────────────────────────────────────────
  for (const item of items) {
    let flagReason: string | null = null

    if (item.word.length < 3) {
      flagReason = 'too_short'
    } else if (/^\d+$/.test(item.word)) {
      flagReason = 'numeric'
    } else if (/[^a-z'-]/.test(item.word)) {
      flagReason = 'special_characters'
    } else if (isLikelyProperNoun(item.word, extractedText)) {
      flagReason = 'likely_proper_noun'
    }

    if (flagReason) {
      item.ai_flagged = true
      item.ai_flag_reason = flagReason
      item.selected = false
    }
  }

  // ── Step 9: Create contribution record ──────────────────────────────────
  const newWordsCount = items.filter(i => i.change_type === 'add_word').length
  const freqUpdatesCount = items.filter(i => i.change_type === 'update_frequency').length
  const conflictsCount = items.filter(i => i.change_type === 'cefr_conflict').length

  const { data: contribution, error: contribError } = await supabaseAdmin
    .from('contributions')
    .insert({
      contributor_id: currentUser.userId,
      source_id: source.id,
      status: 'draft',
      title: `Upload: ${name || file_name || 'Untitled'}`,
      new_words_count: newWordsCount,
      frequency_updates_count: freqUpdatesCount,
      conflicts_count: conflictsCount,
    })
    .select()
    .single()

  if (contribError || !contribution) {
    return apiError(contribError?.message || 'Failed to create contribution', 500)
  }

  // Insert items in batches
  for (let i = 0; i < items.length; i += 200) {
    const batch = items.slice(i, i + 200).map(item => ({
      ...item,
      contribution_id: contribution.id,
    }))
    await supabaseAdmin.from('contribution_items').insert(batch)
  }

  // ── Step 10: Auto-approve for admin/editor if requested ────────────────
  const canAutoApprove = hasPermission(currentUser.role, 'edit_words_directly')
  if (auto_approve === true && canAutoApprove) {
    const now = new Date().toISOString()

    // Mark contribution as approved
    await supabaseAdmin.from('contributions').update({
      status: 'approved',
      reviewed_by: currentUser.userId,
      reviewed_at: now,
      updated_at: now,
    }).eq('id', contribution.id)

    // Mark all selected items as approved
    await supabaseAdmin.from('contribution_items')
      .update({ status: 'approved' })
      .eq('contribution_id', contribution.id)
      .eq('selected', true)

    // Execute approved items
    const approvedItems = items.filter(i => i.selected).map(i => ({
      ...i,
      id: 'auto', // placeholder
      contribution_id: contribution.id,
      status: 'approved' as const,
      created_at: now,
    }))
    await executeApprovedItems(contribution.id, source.id, approvedItems, currentUser.userId)

    contribution.status = 'approved'
  }

  console.log(`[sources] Contribution created in ${Date.now() - t0}ms. ${newWordsCount} new, ${freqUpdatesCount} freq updates, ${conflictsCount} conflicts`)

  return apiSuccess({
    source,
    contribution,
    words_extracted: wordList.length,
    words_new: newWordsCount,
    words_existing: freqUpdatesCount,
    needs_ai: needsAI.length,
    duplicate: false,
  }, 201)
}
