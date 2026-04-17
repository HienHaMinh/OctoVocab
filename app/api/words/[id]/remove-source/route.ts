import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

type Params = { params: Promise<{ id: string }> }

// DELETE /api/words/[id]/remove-source — Remove a word's frequency from a specific source
// Only removes the word_source_frequency record, preserves the word and all its content
export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requirePermission('edit_words_directly')
  if (!auth.authorized) return auth.response

  const { id: wordId } = await params
  const { searchParams } = new URL(req.url)
  const sourceId = searchParams.get('source_id')

  if (!sourceId) return apiError('source_id is required', 400)

  const adminClient = await createAdminClient()

  // Verify the frequency record exists
  const { data: freqRecord } = await adminClient
    .from('word_source_frequency')
    .select('id, frequency')
    .eq('word_id', wordId)
    .eq('source_id', sourceId)
    .single()

  if (!freqRecord) return apiError('Word is not linked to this source', 404)

  // Delete the frequency record only
  const { error } = await adminClient
    .from('word_source_frequency')
    .delete()
    .eq('word_id', wordId)
    .eq('source_id', sourceId)

  if (error) return apiError(error.message, 500)

  // Audit log
  await adminClient.from('audit_logs').insert({
    teacher_id: auth.user.userId,
    action: 'frequency_removed',
    resource_id: wordId,
    resource_type: 'word',
    old_value: JSON.stringify({ source_id: sourceId, frequency: freqRecord.frequency }),
  })

  return apiSuccess({ removed: true, frequency_removed: freqRecord.frequency })
}
