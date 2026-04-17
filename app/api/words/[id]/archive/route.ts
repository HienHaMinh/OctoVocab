import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

type Params = { params: Promise<{ id: string }> }

// POST /api/words/[id]/archive — Archive a word (keeps all content, hides from active list)
export async function POST(req: NextRequest, { params }: Params) {
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
  if (word.status === 'archived') return apiError('Word is already archived', 400)

  let body: { reason?: string } = {}
  try { body = await req.json() } catch { /* no body is ok */ }

  // Set status to archived
  const { error } = await adminClient
    .from('words')
    .update({ status: 'archived' })
    .eq('id', id)

  if (error) return apiError(error.message, 500)

  // Log in words_deleted table
  await adminClient.from('words_deleted').insert({
    word_id: id,
    deleted_by: auth.user.userId,
    reason: body.reason || null,
  })

  // Audit log
  await adminClient.from('audit_logs').insert({
    teacher_id: auth.user.userId,
    action: 'word_archived',
    resource_id: id,
    resource_type: 'word',
    new_value: JSON.stringify({ word: word.word, reason: body.reason }),
  })

  return apiSuccess({ archived: true, word: word.word })
}
