'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteSourceButton({
  sourceId,
  sourceName,
}: {
  sourceId: string
  sourceName: string
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete source "${sourceName}"? This will remove the source but keep the extracted words.`)) {
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(`/api/sources/${sourceId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Deletion failed')
        return
      }
      router.refresh()
    } catch {
      alert('Connection error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
    >
      {deleting ? 'Deleting...' : 'Delete'}
    </button>
  )
}
