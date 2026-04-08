import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

// POST /api/words/cleanup — Archive orphaned words or delete truly empty ones (admin only)
// Words with freq=0 but existing content (translations, examples, images, subsets) → archived
// Words with freq=0 and NO content at all → permanently deleted
export async function POST() {
  const auth = await requirePermission('delete_words')
  if (!auth.authorized) return auth.response

  const adminClient = await createAdminClient()

  // Find words with no frequency records
  const { data: wordsWithFreq } = await adminClient
    .from('word_source_frequency')
    .select('word_id')

  const wordIdsWithFreq = new Set((wordsWithFreq || []).map(w => w.word_id))

  const { data: allActiveWords } = await adminClient
    .from('words')
    .select('id, word')
    .eq('status', 'active')

  const orphans = (allActiveWords || []).filter(w => !wordIdsWithFreq.has(w.id))

  if (orphans.length === 0) {
    return apiSuccess({ archived_count: 0, deleted_count: 0, message: 'No orphaned words found' })
  }

  const orphanIds = orphans.map(o => o.id)

  // Check which orphans have content (translations, examples, images, subsets)
  const [
    { data: withTranslations },
    { data: withExamples },
    { data: withImages },
    { data: withSubsets },
  ] = await Promise.all([
    adminClient.from('word_translations').select('word_id').in('word_id', orphanIds),
    adminClient.from('word_examples').select('word_id').in('word_id', orphanIds),
    adminClient.from('word_images').select('word_id').in('word_id', orphanIds),
    adminClient.from('word_subset_members').select('word_id').in('word_id', orphanIds),
  ])

  const hasContent = new Set([
    ...(withTranslations || []).map(r => r.word_id),
    ...(withExamples || []).map(r => r.word_id),
    ...(withImages || []).map(r => r.word_id),
    ...(withSubsets || []).map(r => r.word_id),
  ])

  const toArchive = orphans.filter(o => hasContent.has(o.id))
  const toDelete = orphans.filter(o => !hasContent.has(o.id))

  // Archive words with content (set status to 'archived')
  if (toArchive.length > 0) {
    const archiveIds = toArchive.map(o => o.id)
    for (let i = 0; i < archiveIds.length; i += 100) {
      const batch = archiveIds.slice(i, i + 100)
      await adminClient.from('words').update({ status: 'archived' }).in('id', batch)
    }
  }

  // Delete truly empty words (no content, no frequency)
  if (toDelete.length > 0) {
    const deleteIds = toDelete.map(o => o.id)
    for (let i = 0; i < deleteIds.length; i += 100) {
      const batch = deleteIds.slice(i, i + 100)
      await adminClient.from('words').delete().in('id', batch)
    }
  }

  // Audit log
  await adminClient.from('audit_logs').insert({
    teacher_id: auth.user.userId,
    action: 'bulk_cleanup',
    resource_type: 'word',
    new_value: JSON.stringify({
      archived_count: toArchive.length,
      deleted_count: toDelete.length,
      archived_words: toArchive.map(o => o.word),
    }),
  })

  return apiSuccess({
    archived_count: toArchive.length,
    deleted_count: toDelete.length,
    message: toArchive.length > 0
      ? `Archived ${toArchive.length} words with content, deleted ${toDelete.length} empty words`
      : `Deleted ${toDelete.length} empty orphaned words`,
  })
}
