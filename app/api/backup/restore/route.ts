import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

// Page through PostgREST default LIMIT 1000 so safety backup is complete.
const PAGE_SIZE = 1000
async function fetchAll<T>(build: () => any): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1)
    if (error || !data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

// POST /api/backup/restore — Restore from a checkpoint
// Body: { checkpoint_id: string, dry_run?: boolean }
export async function POST(req: NextRequest) {
  const auth = await requirePermission('manage_users')
  if (!auth.authorized) return auth.response

  const body = await req.json()
  const { checkpoint_id, dry_run = true } = body

  if (!checkpoint_id) return apiError('checkpoint_id required', 400)

  const adminClient = await createAdminClient()

  const { data: checkpoint } = await adminClient
    .from('backup_checkpoints')
    .select('*')
    .eq('id', checkpoint_id)
    .single()

  if (!checkpoint) return apiError('Checkpoint not found', 404)

  const { data: fileData, error: downloadErr } = await adminClient.storage
    .from('backups')
    .download(checkpoint.storage_path)

  if (downloadErr || !fileData) {
    return apiError('Failed to download checkpoint', 500)
  }

  const backupText = await fileData.text()
  let backup: any
  try {
    backup = JSON.parse(backupText)
  } catch {
    return apiError('Invalid backup format', 400)
  }

  // --- DRY RUN: compute diff ---
  const [currentWords, currentTranslations] = await Promise.all([
    fetchAll<{ id: string; word: string }>(() =>
      adminClient.from('words').select('id, word').in('status', ['active', 'archived'])),
    fetchAll<{ word_id: string; teacher_id: string }>(() =>
      adminClient.from('word_translations').select('word_id, teacher_id')),
  ])

  const currentWordMap = new Map(currentWords.map(w => [w.word, w.id]))
  const backupWords = backup.data?.words || []
  const newWords = backupWords.filter((w: any) => !currentWordMap.has(w.word))
  const existingWords = backupWords.filter((w: any) => currentWordMap.has(w.word))

  const diff = {
    checkpoint_name: checkpoint.name,
    created_at: checkpoint.created_at,
    backup_version: backup.version,
    backup_counts: backup.counts,
    changes: {
      words_to_add: newWords.length,
      words_to_update: existingWords.length,
      translations_in_backup: backup.counts?.translations || 0,
      current_translations: currentTranslations.length,
      // Extended (v3.1+) — surface counts so admin sees what's coming
      contributions_in_backup: backup.counts?.contributions || 0,
      contribution_items_in_backup: backup.counts?.contribution_items || 0,
      word_merges_in_backup: backup.counts?.word_merges || 0,
      words_deleted_in_backup: backup.counts?.words_deleted || 0,
      org_settings_in_backup: backup.counts?.org_settings || 0,
      submission_requirements_in_backup: backup.counts?.submission_requirements || 0,
      word_synonyms_in_backup: backup.counts?.word_synonyms || 0,
      audit_logs_in_backup: backup.counts?.audit_logs || 0,
    },
  }

  if (dry_run) {
    return apiSuccess({ dry_run: true, diff })
  }

  // --- ACTUAL RESTORE ---

  // Step 1: safety backup of current core state before restore
  const safetyBackupName = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`
  const [safetyWords, safetyTranslations, safetyFreqs] = await Promise.all([
    fetchAll(() => adminClient.from('words').select('*').in('status', ['active', 'archived'])),
    fetchAll(() => adminClient.from('word_translations').select('*')),
    fetchAll(() => adminClient.from('word_source_frequency').select('*')),
  ])
  const safetyBackup = {
    timestamp: new Date().toISOString(),
    version: '3.0',
    name: safetyBackupName,
    data: {
      words: safetyWords,
      translations: safetyTranslations,
      frequencies: safetyFreqs,
    },
  }
  const { error: safetyUploadErr } = await adminClient.storage.from('backups').upload(
    `checkpoints/${safetyBackupName}.json`,
    JSON.stringify(safetyBackup),
    { contentType: 'application/json', upsert: true }
  )
  if (safetyUploadErr) {
    return apiError(
      `Aborting restore — safety backup failed to upload: ${safetyUploadErr.message}. ` +
      `Ensure the "backups" bucket exists in Supabase Storage.`,
      500,
    )
  }
  await adminClient.from('backup_checkpoints').insert({
    name: safetyBackupName,
    description: 'Auto-created before restore',
    storage_path: `checkpoints/${safetyBackupName}.json`,
    created_by: auth.user.userId,
    word_count: safetyWords.length,
  })

  // Step 2: restore in FK-safe order. All upserts are non-destructive (no DELETE).
  // Helper: bulk-upsert with onConflict, count successes/errors
  const counters = {
    words: 0,
    translations: 0,
    word_synonyms: 0,
    words_deleted: 0,
    word_merges: 0,
    contributions: 0,
    contribution_items: 0,
    org_settings: 0,
    submission_requirements: 0,
    audit_logs: 0,
  }
  const errors: string[] = []

  // 2a — words (parent of most things)
  for (const word of backupWords) {
    const { error } = await adminClient.from('words').upsert({
      id: word.id,
      word: word.word,
      cefr_level: word.cefr_level,
      cefr_confidence: word.cefr_confidence,
      status: word.status || 'active',
      canonical_form: word.canonical_form,
      first_seen_at: word.first_seen_at,
    }, { onConflict: 'word' })
    if (error) errors.push(`words[${word.word}]: ${error.message}`)
    else counters.words++
  }

  // 2b — translations
  for (const t of backup.data?.translations || []) {
    const { error } = await adminClient.from('word_translations').upsert({
      word_id: t.word_id,
      teacher_id: t.teacher_id,
      vi_translation: t.vi_translation,
      confidence: t.confidence,
      approved: t.approved,
    }, { onConflict: 'word_id,teacher_id' })
    if (error) errors.push(`translations[${t.word_id}]: ${error.message}`)
    else counters.translations++
  }

  // 2c — word_synonyms (id is PK, no natural unique → upsert by id)
  for (const s of backup.data?.word_synonyms || []) {
    const { error } = await adminClient.from('word_synonyms').upsert({
      id: s.id,
      word_id: s.word_id,
      synonym_text: s.synonym_text,
      linked_word_id: s.linked_word_id,
      created_by: s.created_by,
      created_at: s.created_at,
    }, { onConflict: 'id' })
    if (error) errors.push(`word_synonyms[${s.id}]: ${error.message}`)
    else counters.word_synonyms++
  }

  // 2d — words_deleted (recycle bin)
  for (const wd of backup.data?.words_deleted || []) {
    const { error } = await adminClient.from('words_deleted').upsert({
      id: wd.id,
      word_id: wd.word_id,
      deleted_by: wd.deleted_by,
      reason: wd.reason,
      deleted_at: wd.deleted_at,
      restored_at: wd.restored_at,
      restored_by: wd.restored_by,
    }, { onConflict: 'id' })
    if (error) errors.push(`words_deleted[${wd.id}]: ${error.message}`)
    else counters.words_deleted++
  }

  // 2e — word_merges (audit trail)
  for (const m of backup.data?.word_merges || []) {
    const { error } = await adminClient.from('word_merges').upsert({
      id: m.id,
      variant_word_id: m.variant_word_id,
      canonical_word_id: m.canonical_word_id,
      total_frequency: m.total_frequency,
      initiated_by: m.initiated_by,
      merge_type: m.merge_type,
      reason: m.reason,
      merged_at: m.merged_at,
      reverted: m.reverted,
      reverted_at: m.reverted_at,
      reverted_by: m.reverted_by,
    }, { onConflict: 'id' })
    if (error) errors.push(`word_merges[${m.id}]: ${error.message}`)
    else counters.word_merges++
  }

  // 2f — contributions (parent of contribution_items)
  for (const c of backup.data?.contributions || []) {
    const { error } = await adminClient.from('contributions').upsert({
      id: c.id,
      contributor_id: c.contributor_id,
      source_id: c.source_id,
      status: c.status,
      title: c.title,
      new_words_count: c.new_words_count,
      frequency_updates_count: c.frequency_updates_count,
      conflicts_count: c.conflicts_count,
      reviewed_by: c.reviewed_by,
      reviewed_at: c.reviewed_at,
      review_comment: c.review_comment,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }, { onConflict: 'id' })
    if (error) errors.push(`contributions[${c.id}]: ${error.message}`)
    else counters.contributions++
  }

  // 2g — contribution_items
  for (const ci of backup.data?.contribution_items || []) {
    const { error } = await adminClient.from('contribution_items').upsert(ci, { onConflict: 'id' })
    if (error) errors.push(`contribution_items[${ci.id}]: ${error.message}`)
    else counters.contribution_items++
  }

  // 2h — org_settings (UNIQUE on organization_id+setting_key)
  for (const os of backup.data?.org_settings || []) {
    const { error } = await adminClient.from('org_settings').upsert({
      id: os.id,
      organization_id: os.organization_id,
      setting_key: os.setting_key,
      setting_value: os.setting_value,
      updated_by: os.updated_by,
      updated_at: os.updated_at,
    }, { onConflict: 'organization_id,setting_key' })
    if (error) errors.push(`org_settings[${os.setting_key}]: ${error.message}`)
    else counters.org_settings++
  }

  // 2i — submission_requirements
  // Schema has TWO partial unique indexes (migration 006):
  //   uq_submission_req_org_default     WHERE teacher_id IS NULL
  //   uq_submission_req_teacher_override WHERE teacher_id IS NOT NULL
  // PostgREST .upsert() can't target partial indexes by name, so emulate
  // find-then-update-or-insert per row (same approach as the API route).
  for (const sr of backup.data?.submission_requirements || []) {
    const findQuery = adminClient
      .from('submission_requirements')
      .select('id')
      .eq('scope', sr.scope)
      .eq('rule_key', sr.rule_key)

    const { data: existing } = sr.teacher_id
      ? await findQuery.eq('teacher_id', sr.teacher_id).maybeSingle()
      : await findQuery.is('teacher_id', null).maybeSingle()

    const payload = {
      organization_id: sr.organization_id,
      scope: sr.scope,
      rule_key: sr.rule_key,
      rule_value: sr.rule_value,
      is_default: sr.is_default,
      teacher_id: sr.teacher_id,
      updated_at: sr.updated_at,
    }

    const { error } = existing
      ? await adminClient.from('submission_requirements').update(payload).eq('id', existing.id)
      : await adminClient.from('submission_requirements').insert(payload)

    if (error) errors.push(`submission_requirements[${sr.scope}:${sr.rule_key}]: ${error.message}`)
    else counters.submission_requirements++
  }

  // 2j — audit_logs (append-only history; only present if backup was created with include_audit_logs=true)
  if (Array.isArray(backup.data?.audit_logs)) {
    for (const al of backup.data.audit_logs) {
      const { error } = await adminClient.from('audit_logs').upsert({
        id: al.id,
        teacher_id: al.teacher_id,
        action: al.action,
        resource_id: al.resource_id,
        resource_type: al.resource_type,
        old_value: al.old_value,
        new_value: al.new_value,
        created_at: al.created_at,
      }, { onConflict: 'id' })
      if (error) errors.push(`audit_logs[${al.id}]: ${error.message}`)
      else counters.audit_logs++
    }
  }

  await adminClient.from('audit_logs').insert({
    teacher_id: auth.user.userId,
    action: 'backup_restored',
    resource_type: 'system',
    new_value: JSON.stringify({
      checkpoint: checkpoint.name,
      restored: counters,
      safety_backup: safetyBackupName,
      error_count: errors.length,
    }),
  })

  return apiSuccess({
    restored: true,
    counters,
    safety_backup: safetyBackupName,
    error_count: errors.length,
    errors: errors.slice(0, 20),
  })
}
