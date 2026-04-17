import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { classifyWordsCefr, translateWordsToVietnamese } from '@/lib/gemini'
import { chunk, apiError, apiSuccess } from '@/lib/utils'

// POST /api/sources/[id]/enrich — AI enrichment on contribution items (classify + translate)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sourceId } = await params

  const supabase = await createClient()
  const supabaseAdmin = await createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  console.log(`[enrich] Starting enrichment for source ${sourceId}`)

  // Find the latest contribution for this source
  const { data: contribution, error: contribError } = await supabaseAdmin
    .from('contributions')
    .select('id')
    .eq('source_id', sourceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (contribError || !contribution) {
    console.log('[enrich] No contribution found for source')
    return apiSuccess({ classified: 0, translated: 0, remaining: 0 })
  }

  // ── Get unclassified items (new words with CEFR = Unclassified) ────────
  const { data: unclassifiedItems } = await supabaseAdmin
    .from('contribution_items')
    .select('id, word')
    .eq('contribution_id', contribution.id)
    .eq('proposed_cefr', 'Unclassified')
    .in('change_type', ['add_word'])

  // ── Get untranslated items (new words without translation) ─────────────
  const { data: untranslatedItems } = await supabaseAdmin
    .from('contribution_items')
    .select('id, word')
    .eq('contribution_id', contribution.id)
    .eq('change_type', 'add_word')
    .is('proposed_translation', null)

  const toClassify = unclassifiedItems || []
  const toTranslate = (untranslatedItems || []).slice(0, 100) // max 100 per call

  console.log(`[enrich] ${toClassify.length} to classify, ${toTranslate.length} to translate`)

  if (toClassify.length === 0 && toTranslate.length === 0) {
    return apiSuccess({ classified: 0, translated: 0, remaining: 0 })
  }

  // ── Run AI classify + translate in PARALLEL ────────────────────────────
  const innerErrors: string[] = []

  const classifyPromise = (async () => {
    if (toClassify.length === 0) return 0

    const wordStrings = toClassify.map(i => i.word)
    const batches = chunk(wordStrings, 50)

    const results = await Promise.allSettled(
      batches.map(batch => classifyWordsCefr(batch))
    )

    let count = 0
    for (const result of results) {
      if (result.status !== 'fulfilled') {
        const err = String(result.reason)
        console.error('[enrich] Classification batch failed:', err)
        innerErrors.push(`classify: ${err}`)
        continue
      }

      for (const classified of result.value) {
        const item = toClassify.find(
          i => i.word.toLowerCase() === classified.word.toLowerCase()
        )
        if (!item) continue

        const { error } = await supabaseAdmin
          .from('contribution_items')
          .update({ proposed_cefr: classified.cefr_level })
          .eq('id', item.id)

        if (!error) count++
      }
    }
    return count
  })()

  const translatePromise = (async () => {
    if (toTranslate.length === 0) return 0

    try {
      const wordTexts = toTranslate.map(i => i.word)
      const translations = await translateWordsToVietnamese(wordTexts)

      const itemMap = new Map(toTranslate.map(i => [i.word, i.id]))

      let count = 0
      for (const t of translations) {
        const itemId = itemMap.get(t.word)
        if (!itemId) continue

        const { error } = await supabaseAdmin
          .from('contribution_items')
          .update({ proposed_translation: t.vi_translation })
          .eq('id', itemId)

        if (!error) count++
      }
      return count
    } catch (err) {
      const msg = String(err)
      console.error('[enrich] Translation failed:', msg)
      innerErrors.push(`translate: ${msg}`)
      return 0
    }
  })()

  const [classifyResult, translateResult] = await Promise.allSettled([
    classifyPromise,
    translatePromise,
  ])

  const classifiedCount = classifyResult.status === 'fulfilled' ? classifyResult.value : 0
  const translatedCount = translateResult.status === 'fulfilled' ? translateResult.value : 0

  if (classifyResult.status === 'rejected') {
    console.error('[enrich] Classification failed:', classifyResult.reason)
    innerErrors.push(`classify: ${String(classifyResult.reason)}`)
  }
  if (translateResult.status === 'rejected') {
    console.error('[enrich] Translation failed:', translateResult.reason)
    innerErrors.push(`translate: ${String(translateResult.reason)}`)
  }

  // Calculate remaining
  const remainingUnclassified = toClassify.length - classifiedCount
  const allUntranslated = (untranslatedItems || []).length
  const remainingUntranslated = allUntranslated - translatedCount

  console.log(`[enrich] Done: ${classifiedCount} classified, ${translatedCount} translated. Remaining: ${remainingUnclassified + remainingUntranslated}`)

  return apiSuccess({
    classified: classifiedCount,
    translated: translatedCount,
    remaining: remainingUntranslated + remainingUnclassified,
    remainingUntranslated,
    remainingUnclassified,
    ...(innerErrors.length > 0 && { errors: innerErrors }),
  })
}
