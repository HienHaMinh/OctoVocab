'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCefrColor, CEFR_LEVELS } from '@/lib/cefr-lists'
import type { WordSummary, WordTableFilter, CefrLevel } from '@/types'
import WordDetailModal from './WordDetailModal'

const SUBSET_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-pink-100 text-pink-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-rose-100 text-rose-700',
  'bg-lime-100 text-lime-700',
  'bg-cyan-100 text-cyan-700',
]

function getSubsetColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return SUBSET_COLORS[Math.abs(hash) % SUBSET_COLORS.length]
}

interface WordTableProps {
  initialWords: WordSummary[]
  totalCount: number
  page: number
  perPage: number
  sources: Array<{ id: string; name: string }>
  currentFilters: WordTableFilter
  statusFilter?: string
}

interface EditedWord {
  vi_translation?: string
  cefr_level?: CefrLevel
}

export function WordTable({
  initialWords,
  totalCount,
  page,
  perPage,
  sources,
  currentFilters,
  statusFilter = 'active',
}: WordTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(currentFilters.search)
  const [selectedCefr, setSelectedCefr] = useState<CefrLevel | ''>(
    (searchParams.get('cefr') as CefrLevel) || ''
  )

  // Sync search state with URL on browser back/forward
  useEffect(() => {
    setSearch(currentFilters.search)
    setSelectedCefr((searchParams.get('cefr') as CefrLevel) || '')
  }, [currentFilters.search, searchParams])

  // Edit mode state
  const [editMode, setEditMode] = useState(false)
  const [editedWords, setEditedWords] = useState<Record<string, EditedWord>>({})
  const [saving, setSaving] = useState(false)

  const [detailWordId, setDetailWordId] = useState<string | null>(null)

  const totalPages = Math.ceil(totalCount / perPage)
  const editCount = Object.keys(editedWords).length

  // Reset edits when leaving edit mode or navigating
  const exitEditMode = useCallback(() => {
    setEditMode(false)
    setEditedWords({})
  }, [])

  // Reset edit mode when page/filters change
  useEffect(() => {
    exitEditMode()
  }, [page, currentFilters, exitEditMode])

  function updateURL(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    params.delete('page')
    router.push(`/dashboard/words?${params.toString()}`)
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    updateURL({ search })
  }

  function handleCefrFilter(level: CefrLevel | '') {
    setSelectedCefr(level)
    updateURL({ cefr: level || null })
  }

  function handleSort(col: string) {
    const currentSort = searchParams.get('sort_by') || 'total_frequency'
    const currentDir = searchParams.get('sort_dir') || 'desc'
    const newDir = currentSort === col && currentDir === 'desc' ? 'asc' : 'desc'
    updateURL({ sort_by: col, sort_dir: newDir })
  }

  function handlePage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.push(`/dashboard/words?${params.toString()}`)
  }

  function updateWordEdit(wordId: string, field: keyof EditedWord, value: string, original: string | null) {
    setEditedWords(prev => {
      const current = prev[wordId] || {}
      const updated = { ...current, [field]: value }

      // Check if value matches original — if so, remove this field from edits
      const originalVal = original || ''
      if (value === originalVal) {
        delete updated[field]
      }

      // If no changes left for this word, remove it from the map
      if (Object.keys(updated).length === 0) {
        const { [wordId]: _, ...rest } = prev
        return rest
      }

      return { ...prev, [wordId]: updated }
    })
  }

  async function handleSaveAll() {
    if (editCount === 0) return
    setSaving(true)
    try {
      const words = Object.entries(editedWords).map(([id, changes]) => ({
        id,
        ...changes,
      }))
      const res = await fetch('/api/words/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words }),
      })
      if (!res.ok) throw new Error('Failed to save')
      exitEditMode()
      router.refresh()
    } catch {
      alert('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(wordId: string, word: string) {
    if (!confirm(`Archive "${word}"? The word and its content will be preserved but hidden from the active list.`)) return

    const reason = prompt('Reason for archiving (optional):') || ''
    try {
      const res = await fetch(`/api/words/${wordId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        alert('Archive failed.')
      }
    } catch {
      alert('Network error. Please try again.')
    }
  }

  async function handleRestore(wordId: string) {
    try {
      const res = await fetch(`/api/words/${wordId}/restore`, { method: 'POST' })
      if (res.ok) {
        router.refresh()
      } else {
        alert('Restore failed.')
      }
    } catch {
      alert('Network error. Please try again.')
    }
  }

  const sortIcon = (col: string) => {
    const current = searchParams.get('sort_by')
    if (current !== col) return <span className="text-gray-300 ml-1">↕</span>
    const dir = searchParams.get('sort_dir') || 'desc'
    return <span className="text-blue-500 ml-1">{dir === 'desc' ? '↓' : '↑'}</span>
  }

  function getDisplayValue(wordId: string, field: 'vi_translation' | 'cefr_level', original: string | null) {
    return editedWords[wordId]?.[field] ?? original ?? ''
  }

  return (
    <div>
      {/* Filters + Edit Mode Toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search words or translations..."
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
          <button
            type="submit"
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            Search
          </button>
        </form>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          {(['active', 'archived', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => updateURL({ status: s === 'active' ? null : s })}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                statusFilter === s
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {s === 'active' ? 'Active' : s === 'archived' ? 'Archived' : 'All'}
            </button>
          ))}
        </div>

        {/* CEFR Filter Chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => handleCefrFilter('')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              !selectedCefr && !searchParams.get('cefr')
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            All
          </button>
          {CEFR_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => handleCefrFilter(level)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                searchParams.get('cefr') === level
                  ? getCefrColor(level) + ' border-current'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500">
            {totalCount.toLocaleString()} words
          </span>

          {/* Edit Mode Toggle */}
          {editMode ? (
            <div className="flex items-center gap-2">
              {editCount > 0 && (
                <span className="text-xs text-blue-600 font-medium">
                  {editCount} changed
                </span>
              )}
              <button
                onClick={handleSaveAll}
                disabled={editCount === 0 || saving}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                {saving ? 'Saving...' : `Save All${editCount > 0 ? ` (${editCount})` : ''}`}
              </button>
              <button
                onClick={exitEditMode}
                disabled={saving}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded-lg transition-colors font-medium"
            >
              Edit Mode
            </button>
          )}
        </div>
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          Edit mode is on — click any translation or CEFR level to edit. Changes are saved together when you click &quot;Save All&quot;.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700" onClick={() => handleSort('word')}>
                Word {sortIcon('word')}
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Vietnamese
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700" onClick={() => handleSort('cefr_level')}>
                CEFR {sortIcon('cefr_level')}
              </th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700" onClick={() => handleSort('total_frequency')}>
                Frequency {sortIcon('total_frequency')}
              </th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Sources
              </th>
              {!editMode && <th className="px-5 py-3 w-20"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {initialWords.length === 0 ? (
              <tr>
                <td colSpan={editMode ? 5 : 6} className="px-5 py-12 text-center text-gray-400 text-sm">
                  No words found
                </td>
              </tr>
            ) : (
              initialWords.map((word) => {
                const isEdited = !!editedWords[word.id]
                return (
                  <tr
                    key={word.id}
                    className={`transition-colors group ${
                      isEdited ? 'bg-blue-50/50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Word */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => !editMode && setDetailWordId(word.id)}
                          className={`text-sm font-medium text-left ${
                            word.status === 'archived'
                              ? 'text-gray-400'
                              : editMode
                                ? 'text-gray-900 cursor-default'
                                : 'text-gray-900 hover:text-blue-600 transition-colors'
                          }`}
                          disabled={editMode}
                        >
                          {word.word}
                        </button>
                        {word.status === 'archived' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                            Archived
                          </span>
                        )}
                        {word.subset_names && word.subset_names.length > 0 && (
                          word.subset_names.map((name) => (
                            <span
                              key={name}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getSubsetColor(name)}`}
                            >
                              {name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Vietnamese Translation */}
                    <td className="px-5 py-3">
                      {editMode ? (
                        <input
                          type="text"
                          value={getDisplayValue(word.id, 'vi_translation', word.vi_translation)}
                          onChange={(e) => updateWordEdit(word.id, 'vi_translation', e.target.value, word.vi_translation)}
                          className={`text-sm px-2 py-1 border rounded w-full focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            editedWords[word.id]?.vi_translation !== undefined
                              ? 'border-blue-300 bg-blue-50'
                              : 'border-gray-200 bg-white'
                          }`}
                          placeholder="Enter translation..."
                        />
                      ) : (
                        <span className={`text-sm ${word.vi_translation ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                          {word.vi_translation || 'Not translated'}
                        </span>
                      )}
                    </td>

                    {/* CEFR */}
                    <td className="px-5 py-3">
                      {editMode ? (
                        <select
                          value={getDisplayValue(word.id, 'cefr_level', word.cefr_level)}
                          onChange={(e) => updateWordEdit(word.id, 'cefr_level', e.target.value, word.cefr_level)}
                          className={`text-xs border rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            editedWords[word.id]?.cefr_level !== undefined
                              ? 'border-blue-300 bg-blue-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          {CEFR_LEVELS.map((l) => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getCefrColor(word.cefr_level)}`}>
                          {word.cefr_level}
                        </span>
                      )}
                    </td>

                    {/* Frequency */}
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm text-gray-600">{word.total_frequency}</span>
                    </td>

                    {/* Sources */}
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm text-gray-400">{word.num_sources}</span>
                    </td>

                    {/* Actions (only in non-edit mode) */}
                    {!editMode && (
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          {word.status === 'archived' ? (
                            <button
                              onClick={() => handleRestore(word.id)}
                              className="text-xs text-green-600 hover:text-green-800"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              onClick={() => handleArchive(word.id, word.word)}
                              className="text-xs text-orange-500 hover:text-orange-700"
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">
            Page {page}/{totalPages} · {totalCount.toLocaleString()} words
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handlePage(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <button
              onClick={() => handlePage(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Word Detail Modal */}
      <WordDetailModal
        wordId={detailWordId}
        onClose={() => setDetailWordId(null)}
        onUpdate={() => router.refresh()}
      />
    </div>
  )
}
