import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

// POST /api/words/merge — Merge variant words into canonical (editor/admin only)
export async function POST(req: NextRequest) {
  const auth = await requirePermission('edit_words_directly')
  if (!auth.authorized) return auth.response

  const supabaseAdmin = await createAdminClient()
  const user = { id: auth.user.userId }

  let body: any
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }
  const { variant_word_ids, canonical_word_id, merge_type, reason } = body

  if (!variant_word_ids?.length || !canonical_word_id || !merge_type) {
    return apiError('variant_word_ids, canonical_word_id, and merge_type are required')
  }

  if (variant_word_ids.includes(canonical_word_id)) {
    return apiError('canonical_word_id cannot be in variant_word_ids')
  }

  // Verify canonical word exists
  const { data: canonical } = await supabaseAdmin
    .from('words')
    .select('id, word, status')
    .eq('id', canonical_word_id)
    .eq('status', 'active')
    .single()

  if (!canonical) return apiError('Canonical word not found', 404)

  const mergeResults = []
  const conflicts = []

  for (const variantId of variant_word_ids) {
    // Check if variant is already merged
    const { data: variant } = await supabaseAdmin
      .from('words')
      .select('id, word, canonical_form, status')
      .eq('id', variantId)
      .single()

    if (!variant) {
      conflicts.push({ word_id: variantId, reason: 'Word not found' })
      continue
    }

    if (variant.canonical_form) {
      conflicts.push({
        word_id: variantId,
        word: variant.word,
        reason: `Already merged — has canonical form`,
      })
      continue
    }

    // Check for existing merge conflict
    const { data: existingMerge } = await supabaseAdmin
      .from('word_merges')
      .select('id, canonical_word_id')
      .eq('variant_word_id', variantId)
      .eq('reverted', false)
      .single()

    if (existingMerge && existingMerge.canonical_word_id !== canonical_word_id) {
      conflicts.push({
        word_id: variantId,
        word: variant.word,
        reason: 'Merge conflict — word already merged to a different canonical',
      })
      continue
    }

    // ── Perform merge ──────────────────────────────────────────────────────

    // 1. Get total frequency of variant across all sources
    const { data: freqData } = await supabaseAdmin
      .from('word_source_frequency')
      .select('frequency')
      .eq('word_id', variantId)

    const totalFreq = (freqData || []).reduce((sum, row) => sum + row.frequency, 0)

    // 2. Transfer frequency to canonical (upsert per source)
    const { data: variantFreqSources } = await supabaseAdmin
      .from('word_source_frequency')
      .select('source_id, frequency')
      .eq('word_id', variantId)

    for (const freqRow of variantFreqSources || []) {
      // Upsert: if canonical already has freq in this source, add to it
      const { data: existingFreq } = await supabaseAdmin
        .from('word_source_frequency')
        .select('id, frequency')
        .eq('word_id', canonical_word_id)
        .eq('source_id', freqRow.source_id)
        .single()

      if (existingFreq) {
        await supabaseAdmin
          .from('word_source_frequency')
          .update({ frequency: existingFreq.frequency + freqRow.frequency })
          .eq('id', existingFreq.id)
      } else {
        await supabaseAdmin.from('word_source_frequency').insert({
          word_id: canonical_word_id,
          source_id: freqRow.source_id,
          frequency: freqRow.frequency,
        })
      }
    }

    // 3. Set canonical_form on variant + mark as pending_merge
    await supabaseAdmin
      .from('words')
      .update({ canonical_form: canonical_word_id, status: 'pending_merge' })
      .eq('id', variantId)

    // 4. Record merge in audit table
    await supabaseAdmin.from('word_merges').insert({
      variant_word_id: variantId,
      canonical_word_id,
      total_frequency: totalFreq,
      initiated_by: user.id,
      merge_type,
      reason: reason || null,
      merged_at: new Date().toISOString(),
    })

    mergeResults.push({ word_id: variantId, word: variant.word, frequency_transferred: totalFreq })
  }

  return apiSuccess({
    merged: mergeResults,
    conflicts,
    canonical_word: canonical,
    total_merged: mergeResults.length,
    total_conflicts: conflicts.length,
  })
}
