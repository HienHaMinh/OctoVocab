import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { classifyWordsCefr } from '@/lib/gemini'
import { classifyWordsFast, chunk, apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

// POST /api/words/classify — Batch classify unclassified words (editor/admin only)
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
  const limit = Math.min(body.limit || 100, 500)

  // Get unclassified words
  const { data: unclassified, error: fetchError } = await supabaseAdmin
    .from('words')
    .select('id, word')
    .eq('cefr_level', 'Unclassified')
    .eq('status', 'active')
    .limit(limit)

  if (fetchError) {
    return apiError('Failed to fetch unclassified words: ' + fetchError.message, 500)
  }

  if (!unclassified || unclassified.length === 0) {
    return apiSuccess({
      classified: 0,
      remaining: 0,
      message: 'No unclassified words found',
    })
  }

  const wordStrings = unclassified.map((w) => w.word)

  // Step 1: Try built-in lists first
  const { classified: builtinClassified, needsAI } = classifyWordsFast(wordStrings)

  // Update words classified by built-in lists
  let classifiedCount = 0

  for (const item of builtinClassified) {
    const wordRecord = unclassified.find(
      (w) => w.word.toLowerCase() === item.word.toLowerCase(),
    )
    if (!wordRecord) continue

    const { error } = await supabaseAdmin
      .from('words')
      .update({
        cefr_level: item.cefr_level,
        cefr_confidence: 1.0,
        cefr_assigned_by: user.id,
        cefr_assigned_at: new Date().toISOString(),
      })
      .eq('id', wordRecord.id)

    if (!error) classifiedCount++
  }

  // Step 2: Use AI for remaining words
  if (needsAI.length > 0) {
    const batches = chunk(needsAI, 30)

    for (const batch of batches) {
      try {
        const aiResults = await classifyWordsCefr(batch)

        for (const result of aiResults) {
          const wordRecord = unclassified.find(
            (w) => w.word.toLowerCase() === result.word.toLowerCase(),
          )
          if (!wordRecord) continue

          const { error } = await supabaseAdmin
            .from('words')
            .update({
              cefr_level: result.cefr_level,
              cefr_confidence: result.confidence,
              cefr_assigned_by: user.id,
              cefr_assigned_at: new Date().toISOString(),
            })
            .eq('id', wordRecord.id)

          if (!error) classifiedCount++
        }
      } catch (aiError) {
        console.error('AI classification batch error:', aiError)
      }
    }
  }

  // Count remaining unclassified
  const { count: remaining } = await supabaseAdmin
    .from('words')
    .select('*', { count: 'exact', head: true })
    .eq('cefr_level', 'Unclassified')
    .eq('status', 'active')

  return apiSuccess({
    classified: classifiedCount,
    remaining: remaining || 0,
    builtin: builtinClassified.length,
    ai: classifiedCount - builtinClassified.length,
  })
}
