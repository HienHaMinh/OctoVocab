import { createAdminClient } from '@/lib/supabase/server'
import { extractTextFromFileGemini } from '@/lib/gemini'
import { extractVocabulary, extractVocabularyWithPositions, apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole } from '@/lib/rbac'
import { classifyWordBuiltin } from '@/lib/cefr-lists'
import { stem } from '@/lib/stemmer'

interface WordDiff {
  word: string
  found_by: ('primary' | 'gemini')[]
  primary_freq: number
  gemini_freq: number
  status: 'match' | 'primary_only' | 'gemini_only' | 'freq_mismatch'
  severity: 'critical' | 'minor'
  verdict: string  // human-readable: who likely made the error
  primary_positions?: number[]  // character offsets in primary extracted text
  gemini_positions?: number[]   // character offsets in Gemini's extracted text
}

interface ExtractionDiff {
  summary: {
    total_primary: number
    total_gemini: number
    matched: number
    primary_only_count: number
    gemini_only_count: number
  }
  words: WordDiff[]
  flagged: boolean
}

type Params = { params: Promise<{ id: string }> }

// POST /api/sources/[id]/verify — Run Gemini cross-verification on a PDF source
export async function POST(_req: Request, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  if (!process.env.GOOGLE_AI_API_KEY) {
    return apiSuccess({ verified: false, flagged: false, diff: null, message: 'Gemini API key not configured' })
  }

  const { id: sourceId } = await params
  const adminClient = await createAdminClient()

  const { data: source } = await adminClient
    .from('sources')
    .select('*')
    .eq('id', sourceId)
    .single()

  if (!source) return apiError('Source not found', 404)

  if (source.source_type === 'text') {
    return apiSuccess({ verified: true, flagged: false, diff: null })
  }

  // pdf-parse extracted text is 100% accurate — no OCR verify needed
  if (source.extraction_verified && source.extraction_provider === 'pdf-parse') {
    return apiSuccess({ verified: true, flagged: false, diff: null, message: 'Digital PDF — pdf-parse extraction, no OCR verify needed' })
  }

  // Use pre-existing Gemini text from parallel extraction, or extract fresh
  let geminiText: string

  if (source.secondary_raw_text) {
    // Gemini already ran in parallel during upload — reuse
    console.log('[verify] Using pre-existing Gemini text from parallel extraction')
    geminiText = source.secondary_raw_text
  } else {
    // No parallel text — extract with Gemini now
    if (!source.storage_path) {
      return apiSuccess({ verified: false, flagged: false, diff: null, message: 'No stored file for re-extraction' })
    }

    const { data: fileData, error: downloadError } = await adminClient.storage
      .from('source-pdfs')
      .download(source.storage_path)

    if (downloadError || !fileData) {
      return apiSuccess({ verified: false, flagged: false, diff: null, message: 'Failed to download file' })
    }

    const buffer = Buffer.from(await fileData.arrayBuffer())
    const base64Data = buffer.toString('base64')
    const mimeType = source.mime_type || (source.source_type === 'image' ? 'image/png' : 'application/pdf')

    try {
      const geminiResult = await extractTextFromFileGemini(base64Data, mimeType)
      geminiText = geminiResult.text
    } catch (err) {
      console.error('Gemini extraction failed:', err)
      await adminClient.from('sources').update({
        extraction_verified: false,
        extraction_diff_json: { error: 'Gemini extraction failed', message: String(err) },
      }).eq('id', sourceId)
      return apiSuccess({ verified: false, flagged: false, diff: null, message: 'Gemini extraction failed' })
    }
  }

  // Extract vocabulary from both providers (with positions for conflict source display)
  const primaryWordsPos = extractVocabularyWithPositions(source.extracted_text || '')
  const geminiWordsPos = extractVocabularyWithPositions(geminiText)

  // Also get simple maps
  const primaryWords = new Map<string, number>()
  for (const [w, data] of primaryWordsPos) primaryWords.set(w, data.freq)
  const geminiWords = new Map<string, number>()
  for (const [w, data] of geminiWordsPos) geminiWords.set(w, data.freq)

  const allWords = new Set([...primaryWords.keys(), ...geminiWords.keys()])

  // Build per-word attribution
  const words: WordDiff[] = []
  let matchCount = 0
  let primaryOnlyCount = 0
  let geminiOnlyCount = 0

  for (const word of allWords) {
    const primaryData = primaryWordsPos.get(word)
    const geminiData = geminiWordsPos.get(word)
    const primaryFreq = primaryData?.freq || 0
    const geminiFreq = geminiData?.freq || 0
    const inPrimary = primaryFreq > 0
    const inGemini = geminiFreq > 0
    const severity: 'critical' | 'minor' = word.length >= 4 ? 'critical' : 'minor'

    let status: WordDiff['status']
    const foundBy: ('primary' | 'gemini')[] = []

    if (inPrimary) foundBy.push('primary')
    if (inGemini) foundBy.push('gemini')

    if (inPrimary && inGemini) {
      status = primaryFreq === geminiFreq ? 'match' : 'freq_mismatch'
      matchCount++
    } else if (inPrimary) {
      status = 'primary_only'
      primaryOnlyCount++
    } else {
      status = 'gemini_only'
      geminiOnlyCount++
    }

    // Determine verdict: who likely made the error?
    let verdict = ''
    if (status === 'primary_only' || status === 'gemini_only') {
      const isKnownWord = classifyWordBuiltin(word) !== null || classifyWordBuiltin(stem(word)) !== null
      const hasOnlyProvider = status === 'primary_only' ? 'Primary extraction' : 'Gemini'
      const missingProvider = status === 'primary_only' ? 'Gemini' : 'Primary extraction'

      if (isKnownWord) {
        verdict = `${missingProvider} likely missed this word`
      } else {
        verdict = `Possibly ${hasOnlyProvider} OCR error`
      }
    } else if (status === 'freq_mismatch') {
      verdict = 'Both found it, frequency differs'
    }

    // Only include non-matching words in the diff detail
    if (status !== 'match') {
      words.push({
        word,
        found_by: foundBy,
        primary_freq: primaryFreq,
        gemini_freq: geminiFreq,
        status,
        severity,
        verdict,
        primary_positions: primaryData?.positions,
        gemini_positions: geminiData?.positions,
      })
    }
  }

  // Sort: critical first, then alphabetical
  words.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1
    return a.word.localeCompare(b.word)
  })

  const hasCriticalDiff = words.some(w => w.severity === 'critical' && (w.status === 'primary_only' || w.status === 'gemini_only'))

  const diff: ExtractionDiff = {
    summary: {
      total_primary: primaryWords.size,
      total_gemini: geminiWords.size,
      matched: matchCount,
      primary_only_count: primaryOnlyCount,
      gemini_only_count: geminiOnlyCount,
    },
    words,
    flagged: hasCriticalDiff,
  }

  // Update source record
  await adminClient.from('sources').update({
    secondary_raw_text: geminiText,
    extraction_verified: true,
    extraction_diff_json: diff,
    extraction_flagged: hasCriticalDiff,
  }).eq('id', sourceId)

  // Flag contribution items for OCR mismatch words
  if (hasCriticalDiff) {
    const { data: contribution } = await adminClient
      .from('contributions')
      .select('id')
      .eq('source_id', sourceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (contribution) {
      const criticalWords = words
        .filter(w => w.severity === 'critical' && w.status !== 'match' && w.status !== 'freq_mismatch')
      for (const wd of criticalWords) {
        await adminClient.from('contribution_items')
          .update({
            ai_flagged: true,
            ai_flag_reason: wd.verdict || (wd.status === 'primary_only' ? 'ocr_primary_only' : 'ocr_gemini_only'),
          })
          .eq('contribution_id', contribution.id)
          .eq('word', wd.word)
      }
    }
  }

  return apiSuccess({ verified: true, flagged: diff.flagged, diff })
}
