import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

type Params = { params: Promise<{ id: string }> }

// POST /api/words/[id]/restore — Restore an archived word back to active
export async function POST(_req: NextRequest, { params }: Params) {
  const auth = await requirePermission('delete_words')
  if (!auth.authorized) return auth.response

  const { id } = await params
  const adminClient = await createAdminClient()

  const { data: word } = await adminClient
    .from('words')
    .select('id, word, status')
    .eq('id', id)
    .single()

  if (!word) return apiError('Word not found', 404)
  if (word.status !== 'archived') return apiError('Word is not archived', 400)

  // Restore to active
  const { error } = await adminClient
    .from('words')
    .update({ status: 'active' })
    .eq('id', id)

  if (error) return apiError(error.message, 500)

  // Update words_deleted record
  await adminClient
    .from('words_deleted')
    .update({
      restored_at: new Date().toISOString(),
      restored_by: auth.user.userId,
    })
    .eq('word_id', id)
    .is('restored_at', null)

  // Audit log
  await adminClient.from('audit_logs').insert({
    teacher_id: auth.user.userId,
    action: 'word_restored',
    resource_id: id,
    resource_type: 'word',
    new_value: JSON.stringify({ word: word.word }),
  })

  return apiSuccess({ restored: true, word: word.word })
}
