'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Subset {
  id: string
  name: string
  description: string | null
  word_count: number
  created_at: string
  creator?: { name: string; email: string }
}

export default function SubsetsPage() {
  const [subsets, setSubsets] = useState<Subset[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchSubsets = () => {
    fetch('/api/subsets')
      .then(r => r.json())
      .then(data => {
        setSubsets(data.subsets || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchSubsets() }, [])

  const createSubset = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const res = await fetch('/api/subsets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDesc }),
    })
    if (res.ok) {
      setNewName('')
      setNewDesc('')
      setShowCreate(false)
      fetchSubsets()
    }
    setCreating(false)
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Word Subsets</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Create Subset
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Subset name (e.g., IELTS Writing Band 7)"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
            <input
              type="text"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
            <button
              onClick={createSubset}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {subsets.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No subsets yet. Create one to organize words into groups.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subsets.map(subset => (
            <Link
              key={subset.id}
              href={`/dashboard/subsets/${subset.id}`}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="font-medium text-gray-900 mb-1">{subset.name}</div>
              {subset.description && (
                <div className="text-sm text-gray-500 mb-3 line-clamp-2">{subset.description}</div>
              )}
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{subset.word_count} words</span>
                <span>{subset.creator?.name || 'Unknown'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
