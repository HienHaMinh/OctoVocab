'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { ContributionItem, CefrLevel } from '@/types'
import { CEFR_LEVELS } from '@/lib/cefr-lists'

type FilterType = 'all' | 'new' | 'existing' | 'conflict' | 'flagged' | 'auto_check'

const AUTO_CHECK_REASONS = ['too_short', 'numeric', 'special_characters', 'likely_proper_noun']

function isAutoCheck(item: ContributionItem): boolean {
  return item.ai_flagged && AUTO_CHECK_REASONS.includes(item.ai_flag_reason || '')
}

function isAiFlagged(item: ContributionItem): boolean {
  return item.ai_flagged && !AUTO_CHECK_REASONS.includes(item.ai_flag_reason || '')
}

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  pending: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  partially_approved: { label: 'Partial', color: 'bg-blue-100 text-blue-700' },
}

const CHANGE_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  add_word: { label: 'New', color: 'bg-green-100 text-green-700' },
  update_frequency: { label: 'Freq Update', color: 'bg-blue-100 text-blue-700' },
  cefr_conflict: { label: 'Conflict', color: 'bg-yellow-100 text-yellow-700' },
  add_translation: { label: 'Translation', color: 'bg-purple-100 text-purple-700' },
}

export default function ContributionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [contribution, setContribution] = useState<any>(null)
  const [items, setItems] = useState<ContributionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [comment, setComment] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hasEdits, setHasEdits] = useState(false)

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/contributions/${id}`)
    const data = await res.json()
    if (data.contribution) {
      setContribution(data.contribution)
      setItems(data.contribution.items || [])
    }
    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  const isReviewable = contribution?.status === 'pending'

  const toggleItem = (itemId: string) => {
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, selected: !i.selected } : i
    ))
    setHasEdits(true)
  }

  const updateItem = (itemId: string, field: string, value: any) => {
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, [field]: value } : i
    ))
    setHasEdits(true)
  }

  const selectAll = () => {
    setItems(prev => prev.map(i => ({ ...i, selected: true })))
    setHasEdits(true)
  }

  const deselectFlagged = () => {
    setItems(prev => prev.map(i => i.ai_flagged ? { ...i, selected: false } : i))
    setHasEdits(true)
  }

  const buildItemsPayload = () =>
    items.map(i => ({
      id: i.id,
      selected: i.selected,
      proposed_cefr: i.proposed_cefr,
      proposed_frequency: i.proposed_frequency,
    }))

  const saveEdits = async () => {
    setSubmitting(true)
    await fetch(`/api/contributions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: buildItemsPayload() }),
    })
    setHasEdits(false)
    setEditingId(null)
    setSubmitting(false)
  }

  const approveAll = async () => {
    setSubmitting(true)
    await fetch(`/api/contributions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'approved',
        review_comment: comment || null,
        items: buildItemsPayload(),
      }),
    })
    setSubmitting(false)
    router.push('/dashboard/contributions')
  }

  const requestChanges = async () => {
    if (!comment.trim()) { alert('Comment is required when requesting changes'); return }
    setSubmitting(true)
    await fetch(`/api/contributions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'draft',
        review_comment: comment,
        items: buildItemsPayload(),
      }),
    })
    setSubmitting(false)
    router.push('/dashboard/contributions')
  }

  const rejectAll = async () => {
    if (!comment.trim()) { alert('Comment is required when rejecting'); return }
    setSubmitting(true)
    await fetch(`/api/contributions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected', review_comment: comment }),
    })
    setSubmitting(false)
    router.push('/dashboard/contributions')
  }

  const filteredItems = items.filter(item => {
    if (filter === 'all') return true
    if (filter === 'new') return item.change_type === 'add_word'
    if (filter === 'existing') return item.change_type === 'update_frequency'
    if (filter === 'conflict') return item.change_type === 'cefr_conflict'
    if (filter === 'auto_check') return isAutoCheck(item)
    if (filter === 'flagged') return isAiFlagged(item)
    return true
  })

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>
  if (!contribution) return <div className="p-6 text-gray-400">Contribution not found</div>

  const badge = STATUS_BADGES[contribution.status] || STATUS_BADGES.pending
  const newCount = items.filter(i => i.change_type === 'add_word').length
  const freqCount = items.filter(i => i.change_type === 'update_frequency').length
  const conflictCount = items.filter(i => i.change_type === 'cefr_conflict').length
  const autoCheckCount = items.filter(i => isAutoCheck(i)).length
  const aiFlaggedCount = items.filter(i => isAiFlagged(i)).length
  const selectedCount = items.filter(i => i.selected).length

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{contribution.title}</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
            {badge.label}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>By: {contribution.contributor?.name || contribution.contributor?.email}</span>
          <span>Source: {contribution.source?.name}</span>
          <span>{new Date(contribution.created_at).toLocaleDateString()}</span>
        </div>
        {contribution.review_comment && !isReviewable && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
            <span className="font-medium">Review comment:</span> {contribution.review_comment}
          </div>
        )}
      </div>

      {/* Impact Summary */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          {newCount} new words
        </span>
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          {freqCount} frequency updates
        </span>
        {conflictCount > 0 && (
          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            {conflictCount} conflicts
          </span>
        )}
        {autoCheckCount > 0 && (
          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            {autoCheckCount} auto-check
          </span>
        )}
        {aiFlaggedCount > 0 && (
          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            {aiFlaggedCount} AI-flagged
          </span>
        )}
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
          {selectedCount}/{items.length} selected
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'new', 'existing', 'conflict', 'auto_check', 'flagged'] as FilterType[]).map(f => {
          const labels: Record<FilterType, string> = {
            all: 'All',
            new: 'New Words',
            existing: 'Freq Updates',
            conflict: 'Conflicts',
            auto_check: `Auto-check (${autoCheckCount})`,
            flagged: `AI-Flagged (${aiFlaggedCount})`,
          }
          if (f === 'auto_check' && autoCheckCount === 0) return null
          if (f === 'flagged' && aiFlaggedCount === 0) return null
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {labels[f]}
            </button>
          )
        })}
      </div>

      {/* Word Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
        <table className="w-full text-sm table-fixed">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {isReviewable && (
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={selectedCount === items.length} onChange={selectAll} />
                </th>
              )}
              <th className="text-left px-3 py-3 font-medium text-gray-500">Word</th>
              <th className="text-center px-3 py-3 font-medium text-gray-500 w-24">Type</th>
              <th className="text-center px-3 py-3 font-medium text-gray-500 w-28">CEFR</th>
              <th className="text-center px-3 py-3 font-medium text-gray-500 w-14">Freq</th>
              <th className="text-left px-3 py-3 font-medium text-gray-500">Example</th>
              <th className="text-left px-3 py-3 font-medium text-gray-500 w-20">Flag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredItems.map(item => {
              const typeBadge = CHANGE_TYPE_BADGES[item.change_type] || CHANGE_TYPE_BADGES.add_word
              const isEditing = editingId === item.id
              return (
                <tr key={item.id} className={`hover:bg-gray-50 ${
                  !item.selected ? 'opacity-50' :
                  isAiFlagged(item) ? 'bg-red-50/50' :
                  isAutoCheck(item) ? 'bg-orange-50/30' : ''
                }`}>
                  {isReviewable && (
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItem(item.id)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-gray-900">{item.word}</div>
                    {isAutoCheck(item) && (
                      <div className="text-xs text-orange-500 mt-0.5">
                        {item.ai_flag_reason?.replace(/_/g, ' ')}
                      </div>
                    )}
                    {isAiFlagged(item) && (
                      <div className="text-xs text-red-500 mt-0.5">
                        {item.ai_flag_reason?.replace(/_/g, ' ')}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge.color}`}>
                      {typeBadge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-600 text-xs">
                    {isReviewable && isEditing ? (
                      <select
                        value={item.proposed_cefr || 'Unclassified'}
                        onChange={(e) => updateItem(item.id, 'proposed_cefr', e.target.value as CefrLevel)}
                        className="text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {CEFR_LEVELS.map(level => (
                          <option key={level} value={level}>{level}</option>
                        ))}
                      </select>
                    ) : item.change_type === 'cefr_conflict' ? (
                      <span
                        className={isReviewable ? 'cursor-pointer hover:underline' : ''}
                        onClick={() => isReviewable && setEditingId(item.id)}
                      >
                        {item.current_cefr} → <strong className="text-yellow-700">{item.proposed_cefr}</strong>
                      </span>
                    ) : (
                      <span
                        className={isReviewable ? 'cursor-pointer hover:underline' : ''}
                        onClick={() => isReviewable && setEditingId(item.id)}
                      >
                        {item.proposed_cefr || '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-600">
                    {isReviewable && isEditing ? (
                      <input
                        type="number"
                        min={0}
                        value={item.proposed_frequency}
                        onChange={(e) => updateItem(item.id, 'proposed_frequency', parseInt(e.target.value) || 0)}
                        className="w-14 text-xs text-center border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <span
                        className={isReviewable ? 'cursor-pointer hover:underline' : ''}
                        onClick={() => isReviewable && setEditingId(item.id)}
                      >
                        {item.change_type === 'update_frequency' ? (
                          <span className="text-blue-600 font-medium">+{item.proposed_frequency}</span>
                        ) : (
                          item.proposed_frequency
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs max-w-xs truncate">
                    {item.example_sentence || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {item.ai_flagged && (
                      <span className="text-red-600">⚠️</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Review Actions */}
      {isReviewable && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 -mx-6">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={selectAll} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
              Select All
            </button>
            <button onClick={deselectFlagged} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
              Deselect Flagged
            </button>
            {hasEdits && (
              <button
                onClick={saveEdits}
                disabled={submitting}
                className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                Save Edits
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Review comment (required for reject/request changes)..."
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none"
              rows={2}
            />
            <div className="flex gap-2 shrink-0">
              <button
                onClick={rejectAll}
                disabled={submitting}
                className="px-3 py-2 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                title="Permanently reject this contribution"
              >
                Reject
              </button>
              <button
                onClick={requestChanges}
                disabled={submitting}
                className="px-4 py-2 text-sm text-orange-600 border border-orange-300 rounded hover:bg-orange-50 disabled:opacity-50"
              >
                Request Changes
              </button>
              <button
                onClick={approveAll}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Approve ({selectedCount})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
