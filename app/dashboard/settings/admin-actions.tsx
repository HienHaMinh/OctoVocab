'use client'

import { useState, useEffect, useCallback } from 'react'

const ITEM_RULES = [
  { key: 'require_image', label: 'Require image', description: 'Each word must have an image before submission' },
  { key: 'require_translation', label: 'Require translation', description: 'Each word must have a Vietnamese translation' },
  { key: 'require_cefr', label: 'Require CEFR level', description: 'Each word must be classified (not Unclassified)' },
]

const CONTRIBUTION_RULES = [
  { key: 'require_all_conflicts_reviewed', label: 'Require all conflicts reviewed', description: 'All CEFR conflicts must be marked as reviewed' },
]

function SubmissionRequirementsSection() {
  const [defaults, setDefaults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRequirements = useCallback(async () => {
    const res = await fetch('/api/submission-requirements')
    const data = await res.json()
    setDefaults(data.defaults || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchRequirements() }, [fetchRequirements])

  const isEnabled = (scope: string, key: string) => {
    return defaults.some(r => r.scope === scope && r.rule_key === key)
  }

  const toggleRule = async (scope: string, key: string) => {
    const existing = defaults.find(r => r.scope === scope && r.rule_key === key)
    if (existing) {
      // Remove
      await fetch(`/api/submission-requirements?id=${existing.id}`, { method: 'DELETE' })
    } else {
      // Add
      await fetch('/api/submission-requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, rule_key: key, rule_value: true }),
      })
    }
    fetchRequirements()
  }

  if (loading) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="font-semibold text-gray-900 mb-1">Submission Requirements</h2>
      <p className="text-xs text-gray-500 mb-4">Set conditions that must be met before a contribution can be submitted for review.</p>

      <div className="space-y-3">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Per-Item Rules</div>
        {ITEM_RULES.map(rule => (
          <div key={rule.key} className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm text-gray-900">{rule.label}</div>
              <div className="text-xs text-gray-500">{rule.description}</div>
            </div>
            <button
              onClick={() => toggleRule('item', rule.key)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                isEnabled('item', rule.key) ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                isEnabled('item', rule.key) ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`} />
            </button>
          </div>
        ))}

        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-2">Per-Contribution Rules</div>
        {CONTRIBUTION_RULES.map(rule => (
          <div key={rule.key} className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm text-gray-900">{rule.label}</div>
              <div className="text-xs text-gray-500">{rule.description}</div>
            </div>
            <button
              onClick={() => toggleRule('contribution', rule.key)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                isEnabled('contribution', rule.key) ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                isEnabled('contribution', rule.key) ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AdminActions() {
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [cleanupStatus, setCleanupStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [settingsSaving, setSettingsSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      setSettings(data.settings || {})
    })
  }, [])

  const updateSetting = async (key: string, value: any) => {
    setSettingsSaving(true)
    setSettings(prev => ({ ...prev, [key]: value }))
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    setSettingsSaving(false)
  }

  const [checkpoints, setCheckpoints] = useState<any[]>([])
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null)
  const [checkpointName, setCheckpointName] = useState('')
  const [includeAuditLogs, setIncludeAuditLogs] = useState(false)

  const fetchCheckpoints = useCallback(async () => {
    const res = await fetch('/api/backup')
    const data = await res.json()
    setCheckpoints(data.checkpoints || [])
  }, [])

  useEffect(() => { fetchCheckpoints() }, [fetchCheckpoints])

  const handleBackup = async () => {
    setLoading(true)
    setBackupStatus(null)
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: checkpointName || undefined,
          include_audit_logs: includeAuditLogs,
        }),
      })
      const data = await res.json()
      if (data.message) {
        setBackupStatus(`✅ ${data.message}`)
        setCheckpointName('')
        fetchCheckpoints()
      } else if (data.backup) {
        setBackupStatus(`✅ Backup created (${data.backup.counts.words} words). Note: Storage save failed — ${data.storage_error}`)
      } else {
        setBackupStatus(`❌ ${data.error}`)
      }
    } catch {
      setBackupStatus('❌ Backup failed')
    }
    setLoading(false)
  }

  const handleRestore = async (checkpointId: string, checkpointNameStr: string) => {
    // First: dry run
    setLoading(true)
    setRestoreStatus(null)
    try {
      const dryRes = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkpoint_id: checkpointId, dry_run: true }),
      })
      const dryData = await dryRes.json()
      const diff = dryData.diff?.changes

      const confirmed = confirm(
        `Restore checkpoint "${checkpointNameStr}"?\n\n` +
        `Changes:\n` +
        `• ${diff?.words_to_add || 0} words to add\n` +
        `• ${diff?.words_to_update || 0} words to update\n` +
        `• ${diff?.translations_in_backup || 0} translations in backup\n\n` +
        `A safety backup will be created automatically before restore.`
      )

      if (!confirmed) {
        setLoading(false)
        return
      }

      // Actual restore
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkpoint_id: checkpointId, dry_run: false }),
      })
      const data = await res.json()
      if (data.restored) {
        setRestoreStatus(`✅ Restored: ${data.words_restored} words, ${data.translations_restored} translations. Safety backup: ${data.safety_backup}`)
        fetchCheckpoints()
      } else {
        setRestoreStatus(`❌ ${data.error}`)
      }
    } catch {
      setRestoreStatus('❌ Restore failed')
    }
    setLoading(false)
  }

  const handleCleanup = async () => {
    if (!confirm('Clean up orphaned words (frequency = 0)?\n\n• Words with content (translations, examples, images) will be ARCHIVED (recoverable)\n• Words with no content at all will be DELETED')) return
    setLoading(true)
    setCleanupStatus(null)
    try {
      const res = await fetch('/api/words/cleanup', { method: 'POST' })
      const data = await res.json()
      if (data.message) {
        setCleanupStatus(`✅ ${data.message}`)
      } else {
        setCleanupStatus(`❌ ${data.error}`)
      }
    } catch {
      setCleanupStatus('❌ Cleanup failed')
    }
    setLoading(false)
  }

  return (
    <>
      {/* Workflow Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Workflow Settings</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <div className="text-sm font-medium text-gray-900">Lock-step Conflict Review</div>
              <div className="text-xs text-gray-500 mt-0.5">
                When enabled, contributors must review all CEFR conflicts before submitting.
                When disabled, conflicts show as warnings only.
              </div>
            </div>
            <button
              onClick={() => updateSetting('lock_step_conflicts', settings.lock_step_conflicts === false ? true : false)}
              disabled={settingsSaving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.lock_step_conflicts !== false ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.lock_step_conflicts !== false ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Submission Requirements */}
      <SubmissionRequirementsSection />

      {/* Admin Tools */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Admin Tools</h2>
        <div className="space-y-4">
          <div className="py-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">Create Checkpoint</div>
                <div className="text-xs text-gray-500 mt-0.5">Full snapshot of words, translations, images, and frequencies</div>
                {backupStatus && <div className="text-xs mt-1">{backupStatus}</div>}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAuditLogs}
                    onChange={(e) => setIncludeAuditLogs(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Include audit logs
                </label>
                <input
                  type="text"
                  value={checkpointName}
                  onChange={(e) => setCheckpointName(e.target.value)}
                  placeholder="Checkpoint name (optional)"
                  className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg w-48"
                />
                <button
                  onClick={handleBackup}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>

            {/* Checkpoints list */}
            {checkpoints.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-xs font-medium text-gray-500">Recent Checkpoints</div>
                {checkpoints.slice(0, 5).map((cp: any) => (
                  <div key={cp.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <div className="text-xs font-medium text-gray-900">{cp.name}</div>
                      <div className="text-[10px] text-gray-400">
                        {new Date(cp.created_at).toLocaleString()} · {cp.word_count} words
                        {cp.description && ` · ${cp.description}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestore(cp.id, cp.name)}
                      disabled={loading}
                      className="text-[10px] px-2 py-1 text-orange-600 border border-orange-200 rounded hover:bg-orange-50 disabled:opacity-50"
                    >
                      Restore
                    </button>
                  </div>
                ))}
                {restoreStatus && <div className="text-xs mt-1">{restoreStatus}</div>}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-medium text-gray-900">Clean Up Orphaned Words</div>
              <div className="text-xs text-gray-500 mt-0.5">Archive words with content but no frequency. Delete truly empty words.</div>
              {cleanupStatus && <div className="text-xs mt-1">{cleanupStatus}</div>}
            </div>
            <button
              onClick={handleCleanup}
              disabled={loading}
              className="text-xs px-3 py-1.5 border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50"
            >
              Clean Up
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl border border-red-200 p-6">
        <h2 className="font-semibold text-red-700 mb-4">Danger Zone</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-medium text-gray-900">Reset entire database</div>
              <div className="text-xs text-gray-500 mt-0.5">Deletes all words, sources, and history. Cannot be undone.</div>
            </div>
            <button
              disabled
              className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset database
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Database reset requires direct admin access. Create a backup first.
        </p>
      </div>
    </>
  )
}
