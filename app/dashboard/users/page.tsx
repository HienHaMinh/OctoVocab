'use client'

import { useCallback, useEffect, useState } from 'react'

interface UserWithStats {
  id: string
  email: string
  name: string | null
  role: string
  sources_count: number
  contributions_count: number
  created_at: string
}

interface Requirement {
  id: string
  scope: 'item' | 'contribution'
  rule_key: string
  rule_value: unknown
  teacher_id: string | null
}

const ITEM_RULES = [
  { key: 'require_image', label: 'Require image' },
  { key: 'require_translation', label: 'Require translation' },
  { key: 'require_cefr', label: 'Require CEFR level' },
]

const CONTRIBUTION_RULES = [
  { key: 'require_all_conflicts_reviewed', label: 'Require all conflicts reviewed' },
]

export default function UsersPage() {
  const [users, setUsers] = useState<UserWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [reqUser, setReqUser] = useState<UserWithStats | null>(null)

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          window.location.href = '/dashboard'
          return
        }
        setUsers(data.users || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const updateRole = async (userId: string, newRole: string) => {
    setUpdating(userId)
    const res = await fetch(`/api/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    const data = await res.json()
    if (data.user) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    } else if (data.error) {
      alert(data.error)
    }
    setUpdating(null)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">User Management</h1>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Role</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Sources</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Contributions</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Joined</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{user.name || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{user.email}</td>
                <td className="px-4 py-3 text-center">
                  <select
                    value={user.role}
                    onChange={e => updateRole(user.id, e.target.value)}
                    disabled={updating === user.id}
                    className="px-2 py-1 text-xs border border-gray-300 rounded bg-white disabled:opacity-50"
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="contributor">Contributor</option>
                    <option value="student">Student</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-center text-gray-600">{user.sources_count}</td>
                <td className="px-4 py-3 text-center text-gray-600">{user.contributions_count}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setReqUser(user)}
                    className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded hover:bg-gray-50"
                  >
                    Requirements
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reqUser && (
        <RequirementsModal
          user={reqUser}
          onClose={() => setReqUser(null)}
        />
      )}
    </div>
  )
}

function RequirementsModal({
  user,
  onClose,
}: {
  user: UserWithStats
  onClose: () => void
}) {
  const [defaults, setDefaults] = useState<Requirement[]>([])
  const [overrides, setOverrides] = useState<Requirement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/submission-requirements?user_id=${user.id}`)
    const data = await res.json()
    setDefaults(data.defaults || [])
    setOverrides(data.overrides || [])
    setLoading(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

  const effective = (scope: string, key: string): 'on-default' | 'off-default' | 'on-override' | 'off-override' => {
    const override = overrides.find(r => r.scope === scope && r.rule_key === key)
    if (override) return 'on-override'
    // Overrides can also be explicit "off" — but current schema only stores "on" rules.
    // Default is on iff a matching default row exists.
    const def = defaults.find(r => r.scope === scope && r.rule_key === key)
    return def ? 'on-default' : 'off-default'
  }

  // Override actions:
  //   enable-override  → POST {scope, rule_key, teacher_id}
  //   clear-override   → DELETE ?scope=&rule_key=&teacher_id=  (revert to default)
  const enableOverride = async (scope: string, rule_key: string) => {
    setSaving(true)
    await fetch('/api/submission-requirements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, rule_key, rule_value: true, teacher_id: user.id }),
    })
    await load()
    setSaving(false)
  }

  const clearOverride = async (scope: string, rule_key: string) => {
    setSaving(true)
    const params = new URLSearchParams({ scope, rule_key, teacher_id: user.id })
    await fetch(`/api/submission-requirements?${params}`, { method: 'DELETE' })
    await load()
    setSaving(false)
  }

  const Row = ({ scope, ruleKey, label }: { scope: 'item' | 'contribution'; ruleKey: string; label: string }) => {
    const state = effective(scope, ruleKey)
    const hasOverride = state === 'on-override'
    const isDefault = state === 'on-default'

    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
        <div>
          <div className="text-sm text-gray-900">{label}</div>
          <div className="text-xs text-gray-400">
            {hasOverride
              ? 'Per-user override: ON'
              : isDefault
              ? 'Org default: ON (applies to this user)'
              : 'Org default: OFF (not enforced)'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasOverride ? (
            <button
              onClick={() => clearOverride(scope, ruleKey)}
              disabled={saving}
              className="text-xs px-2 py-1 border border-orange-200 text-orange-600 rounded hover:bg-orange-50 disabled:opacity-50"
            >
              Clear override
            </button>
          ) : (
            <button
              onClick={() => enableOverride(scope, ruleKey)}
              disabled={saving || isDefault}
              className="text-xs px-2 py-1 border border-blue-200 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-40"
              title={isDefault ? 'Already enforced by org default' : 'Enable this rule only for this user'}
            >
              Override: enable
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Submission requirements</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {user.name || user.email} — per-user overrides
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <div className="text-gray-400 text-sm py-8 text-center">Loading...</div>
          ) : (
            <>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Per-item rules</div>
              {ITEM_RULES.map(rule => (
                <Row key={`item:${rule.key}`} scope="item" ruleKey={rule.key} label={rule.label} />
              ))}

              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-5 mb-2">
                Per-contribution rules
              </div>
              {CONTRIBUTION_RULES.map(rule => (
                <Row key={`contribution:${rule.key}`} scope="contribution" ruleKey={rule.key} label={rule.label} />
              ))}

              <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
                Org defaults apply to everyone. A per-user override enables the rule just for this user, on top
                of the org default. Clear an override to revert the user to default behavior.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
