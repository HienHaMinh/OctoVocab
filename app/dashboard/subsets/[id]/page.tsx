'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface WordSummary {
  id: string
  word: string
  cefr_level: string
  total_frequency: number
  vi_translation: string | null
}

export default function SubsetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [subset, setSubset] = useState<any>(null)
  const [words, setWords] = useState<WordSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<WordSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/subsets/${id}`)
    const data = await res.json()
    if (data.subset) {
      setSubset(data.subset)
      setWords(data.words || [])
    }
    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  const searchWords = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    const res = await fetch(`/api/words?search=${encodeURIComponent(searchQuery)}&per_page=50`)
    const data = await res.json()
    const existingIds = new Set(words.map(w => w.id))
    setSearchResults((data.words || []).filter((w: WordSummary) => !existingIds.has(w.id)))
    setSearching(false)
  }

  const addWords = async () => {
    if (selectedIds.size === 0) return
    await fetch(`/api/subsets/${id}/words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word_ids: Array.from(selectedIds) }),
    })
    setSelectedIds(new Set())
    setShowAdd(false)
    setSearchResults([])
    setSearchQuery('')
    fetchData()
  }

  const removeWord = async (wordId: string) => {
    await fetch(`/api/subsets/${id}/words`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word_ids: [wordId] }),
    })
    fetchData()
  }

  const deleteSubset = async () => {
    if (!confirm('Delete this subset? This cannot be undone.')) return
    await fetch(`/api/subsets/${id}`, { method: 'DELETE' })
    router.push('/dashboard/subsets')
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>
  if (!subset) return <div className="p-6 text-gray-400">Subset not found</div>

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{subset.name}</h1>
          {subset.description && <p className="text-sm text-gray-500 mt-1">{subset.description}</p>}
          <p className="text-xs text-gray-400 mt-1">{words.length} words</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Add Words
          </button>
          <button
            onClick={deleteSubset}
            className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Add Words Panel */}
      {showAdd && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchWords()}
              placeholder="Search words to add..."
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
            />
            <button
              onClick={searchWords}
              disabled={searching}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Search
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={addWords}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Add {selectedIds.size} Selected
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded">
              {searchResults.map(w => (
                <label key={w.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(w.id)}
                    onChange={() => {
                      setSelectedIds(prev => {
                        const next = new Set(prev)
                        next.has(w.id) ? next.delete(w.id) : next.add(w.id)
                        return next
                      })
                    }}
                  />
                  <span className="text-sm font-medium text-gray-900">{w.word}</span>
                  <span className="text-xs text-gray-400">{w.cefr_level}</span>
                  {w.vi_translation && <span className="text-xs text-gray-500">— {w.vi_translation}</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Word Table */}
      {words.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No words in this subset yet. Click "Add Words" to get started.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Word</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">CEFR</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Frequency</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Translation</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {words.map(word => (
                <tr key={word.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{word.word}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{word.cefr_level}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{word.total_frequency}</td>
                  <td className="px-4 py-2.5 text-gray-600">{word.vi_translation || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => removeWord(word.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
