import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

interface WordUpdate {
  id: string
  vi_translation?: string
  cefr_level?: string
}

// PUT /api/words/batch — Batch update multiple words (editor/admin only)
export async function PUT(req: NextRequest) {
  const auth = await requirePermission('edit_words_directly')
  if (!auth.authorized) return auth.response

  const supabaseAdmin = await createAdminClient()
  const user = { id: auth.user.userId }

  let body: { words: WordUpdate[] }
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const { words } = body
  if (!Array.isArray(words) || words.length === 0) {
    return apiError('No words to update', 400)
  }
  if (words.length > 100) {
    return apiError('Too many words (max 100)', 400)
  }

  const now = new Date().toISOString()
  const errors: string[] = []
  let updated = 0

  // Fetch current CEFR levels for audit logging
  const wordIds = words.filter(w => w.cefr_level).map(w => w.id)
  let existingCefr: Record<string, string> = {}
  if (wordIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('words')
      .select('id, cefr_level')
      .in('id', wordIds)
    if (data) {
      existingCefr = Object.fromEntries(data.map(w => [w.id, w.cefr_level]))
    }
  }

  for (const word of words) {
    try {
      // Update CEFR level
      if (word.cefr_level) {
        const { error } = await supabaseAdmin.from('words').update({
          cefr_level: word.cefr_level,
          cefr_assigned_by: user.id,
          cefr_assigned_at: now,
        }).eq('id', word.id)

        if (error) { errors.push(`${word.id}: ${error.message}`); continue }

        // Audit log
        if (existingCefr[word.id] !== word.cefr_level) {
          await supabaseAdmin.from('audit_logs').insert({
            teacher_id: user.id,
            action: 'cefr_override',
            resource_id: word.id,
            resource_type: 'word',
            old_value: existingCefr[word.id] || null,
            new_value: word.cefr_level,
          })
        }
      }

      // Update translation
      if (word.vi_translation !== undefined) {
        const { error } = await supabaseAdmin
          .from('word_translations')
          .upsert({
            word_id: word.id,
            teacher_id: user.id,
            vi_translation: word.vi_translation,
            confidence: 1.0,
            approved: true,
            approved_at: now,
          }, { onConflict: 'word_id,teacher_id' })

        if (error) { errors.push(`${word.id}: ${error.message}`); continue }
      }

      updated++
    } catch (e) {
      errors.push(`${word.id}: unexpected error`)
    }
  }

  return apiSuccess({
    message: `Updated ${updated}/${words.length} words`,
    updated,
    errors: errors.length > 0 ? errors : undefined,
  })
}
