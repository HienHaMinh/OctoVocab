import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

// PostgREST/Supabase imposes a default LIMIT of 1000 on .select(). For backups
// we MUST page through the entire table, otherwise large tables (audit_logs,
// word_source_frequency, contribution_items) get silently truncated.
const PAGE_SIZE = 1000

async function fetchAll<T>(
  build: () => any
): Promise<{ data: T[] | null; error: any }> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: all, error: null }
}

// GET /api/backup — List all backup checkpoints
export async function GET() {
  const auth = await requirePermission('manage_users')
  if (!auth.authorized) return auth.response

  const adminClient = await createAdminClient()

  const { data: checkpoints } = await adminClient
    .from('backup_checkpoints')
    .select('*')
    .order('created_at', { ascending: false })

  return apiSuccess({ checkpoints: checkpoints || [] })
}

// POST /api/backup — Create named checkpoint (admin only)
// Body: { name?: string, description?: string, include_audit_logs?: boolean }
export async function POST(req: NextRequest) {
  const auth = await requirePermission('manage_users')
  if (!auth.authorized) return auth.response

  let body: { name?: string; description?: string; include_audit_logs?: boolean } = {}
  try { body = await req.json() } catch { /* no body ok */ }

  const includeAuditLogs = body.include_audit_logs === true
  const checkpointName = body.name || `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
  const adminClient = await createAdminClient()

  // All tables paged so 1000-row default LIMIT doesn't silently truncate.
  const [
    words,
    translations,
    sources,
    subsets,
    subsetMembers,
    examples,
    images,
    frequencies,
    contributions,
    contributionItems,
    wordMerges,
    wordsDeleted,
    orgSettings,
    submissionRequirements,
    wordSynonyms,
  ] = await Promise.all([
    fetchAll(() => adminClient.from('words').select('*').in('status', ['active', 'archived'])),
    fetchAll(() => adminClient.from('word_translations').select('*')),
    fetchAll(() => adminClient.from('sources').select('id, name, source_type, word_count, uploaded_by, origin_url, origin_name, created_at')),
    fetchAll(() => adminClient.from('word_subsets').select('*')),
    fetchAll(() => adminClient.from('word_subset_members').select('*')),
    fetchAll(() => adminClient.from('word_examples').select('*')),
    fetchAll(() => adminClient.from('word_images').select('*')),
    fetchAll(() => adminClient.from('word_source_frequency').select('*')),
    fetchAll(() => adminClient.from('contributions').select('*')),
    fetchAll(() => adminClient.from('contribution_items').select('*')),
    fetchAll(() => adminClient.from('word_merges').select('*')),
    fetchAll(() => adminClient.from('words_deleted').select('*')),
    fetchAll(() => adminClient.from('org_settings').select('*')),
    fetchAll(() => adminClient.from('submission_requirements').select('*')),
    fetchAll(() => adminClient.from('word_synonyms').select('*')),
  ])

  const auditLogs = includeAuditLogs
    ? await fetchAll(() => adminClient.from('audit_logs').select('*'))
    : { data: null, error: null }

  const backup = {
    timestamp: new Date().toISOString(),
    version: '3.1',
    name: checkpointName,
    options: { include_audit_logs: includeAuditLogs },
    counts: {
      words: words.data?.length || 0,
      translations: translations.data?.length || 0,
      sources: sources.data?.length || 0,
      subsets: subsets.data?.length || 0,
      examples: examples.data?.length || 0,
      images: images.data?.length || 0,
      frequencies: frequencies.data?.length || 0,
      contributions: contributions.data?.length || 0,
      contribution_items: contributionItems.data?.length || 0,
      word_merges: wordMerges.data?.length || 0,
      words_deleted: wordsDeleted.data?.length || 0,
      org_settings: orgSettings.data?.length || 0,
      submission_requirements: submissionRequirements.data?.length || 0,
      word_synonyms: wordSynonyms.data?.length || 0,
      audit_logs: auditLogs.data?.length || 0,
    },
    data: {
      words: words.data,
      translations: translations.data,
      sources: sources.data,
      subsets: subsets.data,
      subset_members: subsetMembers.data,
      examples: examples.data,
      images: images.data,
      frequencies: frequencies.data,
      contributions: contributions.data,
      contribution_items: contributionItems.data,
      word_merges: wordMerges.data,
      words_deleted: wordsDeleted.data,
      org_settings: orgSettings.data,
      submission_requirements: submissionRequirements.data,
      word_synonyms: wordSynonyms.data,
      audit_logs: auditLogs.data,
    },
  }

  const backupJson = JSON.stringify(backup)
  const storagePath = `checkpoints/${checkpointName}.json`

  let { error: uploadErr } = await adminClient.storage
    .from('backups')
    .upload(storagePath, backupJson, {
      contentType: 'application/json',
      upsert: true,
    })

  // Bootstrap: create the bucket on first run, then retry once.
  if (uploadErr && /not\s*found/i.test(uploadErr.message)) {
    await adminClient.storage.createBucket('backups', { public: false })
    const retry = await adminClient.storage
      .from('backups')
      .upload(storagePath, backupJson, {
        contentType: 'application/json',
        upsert: true,
      })
    uploadErr = retry.error
  }

  if (uploadErr) {
    return apiError(`Storage upload failed: ${uploadErr.message}`, 500)
  }

  await adminClient.from('backup_checkpoints').insert({
    name: checkpointName,
    description: body.description || null,
    storage_path: storagePath,
    created_by: auth.user.userId,
    word_count: backup.counts.words,
    source_count: backup.counts.sources,
    translation_count: backup.counts.translations,
    file_size_bytes: backupJson.length,
  })

  await adminClient.from('audit_logs').insert({
    teacher_id: auth.user.userId,
    action: 'backup_created',
    resource_type: 'system',
    new_value: JSON.stringify({ name: checkpointName, counts: backup.counts }),
  })

  return apiSuccess({
    message: `Checkpoint "${checkpointName}" created`,
    counts: backup.counts,
    file_size_bytes: backupJson.length,
  })
}
