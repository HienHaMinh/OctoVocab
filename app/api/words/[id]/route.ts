import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

type Params = { params: Promise<{ id: string }> }

// GET /api/words/[id] — Word detail with sources, translations, merge history
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const [
    { data: word },
    { data: sources },
    { data: translations },
    { data: merges },
  ] = await Promise.all([
    supabase.from('words').select('*').eq('id', id).single(),
    supabase
      .from('word_source_frequency')
      .select('frequency, sources(id, name, source_type, created_at)')
      .eq('word_id', id)
      .order('frequency', { ascending: false }),
    supabase
      .from('word_translations')
      .select('*, teachers(name, email)')
      .eq('word_id', id),
    supabase
      .from('word_merges')
      .select('*, variant:words!variant_word_id(word), teacher:teachers!initiated_by(name)')
      .or(`variant_word_id.eq.${id},canonical_word_id.eq.${id}`)
      .order('merged_at', { ascending: false }),
  ])

  if (!word) return apiError('Word not found', 404)

  return apiSuccess({ word, sources, translations, merges })
}

// PUT /api/words/[id] — Update word (CEFR, translation) — editor/admin only
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requirePermission('edit_words_directly')
  if (!auth.authorized) return auth.response

  const { id } = await params
  const supabaseAdmin = await createAdminClient()
  const user = { id: auth.user.userId }

  let body: any
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }
  const { cefr_level, vi_translation } = body

  const updates: Record<string, unknown> = {}

  if (cefr_level) {
    updates.cefr_level = cefr_level
    updates.cefr_assigned_by = user.id
    updates.cefr_assigned_at = new Date().toISOString()

    // Audit log
    const { data: existing } = await supabaseAdmin
      .from('words')
      .select('cefr_level')
      .eq('id', id)
      .single()

    await supabaseAdmin.from('audit_logs').insert({
      teacher_id: user.id,
      action: 'cefr_override',
      resource_id: id,
      resource_type: 'word',
      old_value: existing?.cefr_level,
      new_value: cefr_level,
    })
  }

  // Update word if there are changes
  if (Object.keys(updates).length > 0) {
    const { error } = await supabaseAdmin.from('words').update(updates).eq('id', id)
    if (error) return apiError(error.message, 500)
  }

  // Update/create translation if provided
  if (vi_translation !== undefined) {
    const { error: transError } = await supabaseAdmin
      .from('word_translations')
      .upsert({
        word_id: id,
        teacher_id: user.id,
        vi_translation,
        confidence: 1.0, // Manual = full confidence
        approved: true,
        approved_at: new Date().toISOString(),
      }, { onConflict: 'word_id,teacher_id' })

    if (transError) return apiError(transError.message, 500)
  }

  return apiSuccess({ message: 'Word updated' })
}

// DELETE /api/words/[id] — Hard delete (admin only, freq=0 only)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requirePermission('delete_words')
  if (!auth.authorized) return auth.response

  const { id } = await params
  const adminClient = await createAdminClient()

  // Check frequency — cannot delete words still linked to sources
  const { data: freqData } = await adminClient
    .from('word_source_frequency')
    .select('frequency')
    .eq('word_id', id)

  const totalFreq = (freqData || []).reduce((sum: number, f: { frequency: number }) => sum + f.frequency, 0)
  if (totalFreq > 0) {
    return apiError(
      `Cannot delete word with frequency ${totalFreq}. It is still linked to sources.`,
      400
    )
  }

  // Hard delete (CASCADE handles translations, examples, images, subset members)
  const { error } = await adminClient.from('words').delete().eq('id', id)
  if (error) return apiError(error.message, 500)

  // Audit log
  await adminClient.from('audit_logs').insert({
    teacher_id: auth.user.userId,
    action: 'permanent_delete',
    resource_id: id,
    resource_type: 'word',
  })

  return apiSuccess({ deleted: true })
}
