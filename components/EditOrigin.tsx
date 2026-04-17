'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function EditOrigin({ sourceId, currentOrigin }: { sourceId: string; currentOrigin: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(currentOrigin || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/sources/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin_name: value || null }),
      })
      if (res.ok) {
        setEditing(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g., CNN"
          className="w-28 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          {saving ? '...' : '✓'}
        </button>
        <button
          onClick={() => { setEditing(false); setValue(currentOrigin || '') }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 group">
      <span className="text-sm text-gray-500">{currentOrigin || '—'}</span>
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-gray-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Edit origin"
      >
        ✏️
      </button>
    </div>
  )
}
