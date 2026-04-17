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

const CHANGE_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  add_word: { label: 'New', color: 'bg-green-100 text-green-700' },
  update_frequency: { label: 'Freq Update', color: 'bg-blue-100 text-blue-700' },
  cefr_conflict: { label: 'Conflict', color: 'bg-yellow-100 text-yellow-700' },
  add_translation: { label: 'Translation', color: 'bg-purple-100 text-purple-700' },
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ContributorReviewPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [contribution, setContribution] = useState<any>(null)
  const [items, setItems] = useState<ContributionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [highlightWord, setHighlightWord] = useState<{ word: string; positions: number[]; provider: string } | null>(null)
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null)
  const [pdfViewerPage, setPdfViewerPage] = useState(1)

  const showInText = (data: { word: string; positions: number[]; provider: string }) => {
    setHighlightWord(data)

    const src = contribution?.source
    if (!src?.id) return

    // For PDFs: calculate page number from position
    if (src.source_type === 'pdf' && data.positions.length > 0 && src.extracted_text) {
      const text = src.extracted_text as string
      const pos = data.positions[0]
      const textBefore = text.substring(0, pos)
      const pageNum = (textBefore.match(/\f/g) || []).length + 1
      setPdfViewerPage(pageNum)
    }

    // Fetch file signed URL if not loaded yet
    if (!pdfViewerUrl && src.id && src.source_type !== 'text') {
      fetch(`/api/sources/${src.id}/pdf-url`)
        .then(r => r.json())
        .then(d => { if (d.url) setPdfViewerUrl(d.url) })
        .catch(() => {})
    }

    setTimeout(() => document.getElementById('text-viewer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
  }
  const [lockStepEnabled, setLockStepEnabled] = useState(true) // default: hard lock
  const [reviewedConflicts, setReviewedConflicts] = useState<Set<string>>(new Set())
  const [submitRequirements, setSubmitRequirements] = useState<any[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [verifyTriggered, setVerifyTriggered] = useState(false)

  const fetchData = useCallback(async () => {
    const [contribRes, settingsRes, reqsRes] = await Promise.all([
      fetch(`/api/contributions/${id}`),
      fetch('/api/settings'),
      fetch('/api/submission-requirements'),
    ])
    const data = await contribRes.json()
    const settingsData = await settingsRes.json()

    if (data.contribution) {
      setContribution(data.contribution)
      setItems(data.contribution.items || [])
      // Initialize reviewed set from saved data
      const reviewed = new Set<string>()
      for (const item of data.contribution.items || []) {
        if (item.conflicts_reviewed) reviewed.add(item.id)
      }
      setReviewedConflicts(reviewed)
    }

    // Lock-step setting (default: true = hard lock)
    if (settingsData.settings) {
      const lockStep = settingsData.settings.lock_step_conflicts
      setLockStepEnabled(lockStep !== false) // default true unless explicitly disabled
    }

    // Submission requirements
    const reqsData = await reqsRes.json()
    setSubmitRequirements(reqsData.effective || [])

    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-trigger Mistral OCR verify when review page loads for unverified PDF sources
  // Skip if already attempted (verifyTriggered) or if verification previously failed (diff_json has error)
  useEffect(() => {
    const source = contribution?.source
    if (!source || verifyTriggered) return
    if ((source.source_type === 'pdf' || source.source_type === 'image') && !source.extraction_verified) {
      // Don't retry if verification already failed (error stored in diff_json)
      if (source.extraction_diff_json?.error) return
      setVerifyTriggered(true)
      ;(async () => {
        try {
          await fetch(`/api/sources/${source.id}/verify`, { method: 'POST' })
          fetchData()
        } catch (err) {
          console.error('Auto-verify failed:', err)
        }
      })()
    }
  }, [contribution, verifyTriggered, fetchData])

  const [editingId, setEditingId] = useState<string | null>(null)

  const toggleItem = (itemId: string) => {
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, selected: !i.selected } : i
    ))
  }

  const updateItem = (itemId: string, field: string, value: any) => {
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, [field]: value } : i
    ))
  }

  const selectAll = () => setItems(prev => prev.map(i => ({ ...i, selected: true })))
  const deselectFlagged = () => setItems(prev => prev.map(i =>
    i.ai_flagged ? { ...i, selected: false } : i
  ))

  const toggleConflictReviewed = (itemId: string) => {
    setReviewedConflicts(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  // Check if all conflicts are reviewed
  const conflictItems = items.filter(i => i.change_type === 'cefr_conflict')
  const unreviewedConflicts = conflictItems.filter(i => !reviewedConflicts.has(i.id))
  const allConflictsReviewed = unreviewedConflicts.length === 0
  const conflictBlocked = lockStepEnabled && conflictItems.length > 0 && !allConflictsReviewed

  // Validate submission requirements
  const validateSubmission = useCallback(() => {
    const errors: string[] = []
    const selectedItems = items.filter(i => i.selected)

    for (const req of submitRequirements) {
      if (req.scope === 'item') {
        // Per-item rules: check each selected item
        if (req.rule_key === 'require_image') {
          const missing = selectedItems.filter(i => !i.proposed_image_url)
          if (missing.length > 0) errors.push(`${missing.length} item(s) missing required image`)
        }
        if (req.rule_key === 'require_translation') {
          const missing = selectedItems.filter(i => !i.proposed_translation)
          if (missing.length > 0) errors.push(`${missing.length} item(s) missing required translation`)
        }
        if (req.rule_key === 'require_cefr') {
          const missing = selectedItems.filter(i => !i.proposed_cefr || i.proposed_cefr === 'Unclassified')
          if (missing.length > 0) errors.push(`${missing.length} item(s) missing CEFR classification`)
        }
      }
      if (req.scope === 'contribution') {
        if (req.rule_key === 'min_items') {
          const minItems = typeof req.rule_value === 'number' ? req.rule_value : parseInt(req.rule_value) || 1
          if (selectedItems.length < minItems) errors.push(`Minimum ${minItems} items required (${selectedItems.length} selected)`)
        }
        if (req.rule_key === 'require_all_conflicts_reviewed') {
          if (!allConflictsReviewed) errors.push('All conflicts must be reviewed')
        }
      }
    }
    return errors
  }, [items, submitRequirements, allConflictsReviewed])

  const requirementErrors = validateSubmission()
  const submitBlocked = conflictBlocked || requirementErrors.length > 0

  const saveDraft = async () => {
    setSubmitting(true)
    await fetch(`/api/contributions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({
          id: i.id,
          word: i.word,
          selected: i.selected,
          proposed_cefr: i.proposed_cefr,
          proposed_frequency: i.proposed_frequency,
          proposed_translation: i.proposed_translation,
          proposed_image_url: i.proposed_image_url,
          conflicts_reviewed: reviewedConflicts.has(i.id),
        })),
      }),
    })
    setEditingId(null)
    setSubmitting(false)
  }

  const submitForReview = async () => {
    if (submitBlocked) {
      alert('Please review all conflicts before submitting.')
      return
    }
    setSubmitting(true)
    await fetch(`/api/contributions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({
          id: i.id,
          word: i.word,
          selected: i.selected,
          proposed_cefr: i.proposed_cefr,
          proposed_frequency: i.proposed_frequency,
          proposed_translation: i.proposed_translation,
          proposed_image_url: i.proposed_image_url,
          conflicts_reviewed: reviewedConflicts.has(i.id),
        })),
        status: 'pending',
      }),
    })
    setSubmitting(false)
    router.push('/dashboard/contributions')
  }

  const discard = async () => {
    if (!confirm('Are you sure you want to discard this contribution?')) return
    const res = await fetch(`/api/contributions/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      alert('Failed to discard contribution')
      return
    }
    window.location.href = '/dashboard/contributions'
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

  const source = contribution.source
  const newCount = items.filter(i => i.change_type === 'add_word').length
  const freqCount = items.filter(i => i.change_type === 'update_frequency').length
  const conflictCount = items.filter(i => i.change_type === 'cefr_conflict').length
  const autoCheckCount = items.filter(i => isAutoCheck(i)).length
  const aiFlaggedCount = items.filter(i => isAiFlagged(i)).length
  const selectedCount = items.filter(i => i.selected).length

  return (
    <div className="p-6 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Review: {contribution.title}
        </h1>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          {source && (
            <>
              <span>{source.name}</span>
              <span>{formatBytes(source.file_size_bytes)}</span>
              {source.origin_name && (
                <span>
                  Origin: {source.origin_url ? (
                    <a href={source.origin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {source.origin_name}
                    </a>
                  ) : source.origin_name}
                </span>
              )}
            </>
          )}
          {source?.extraction_verified && (
            <span className={source.extraction_flagged ? 'text-orange-600 font-medium' : 'text-green-600'}>
              {source.extraction_flagged ? '⚠️ OCR Mismatches Found' : '✅ Verified'}
            </span>
          )}
        </div>
      </div>

      {/* Review Comment (when contribution was returned by editor) */}
      {contribution.status === 'draft' && contribution.review_comment && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
          <div className="font-medium text-yellow-800 mb-1">Changes Requested</div>
          <div className="text-yellow-700">{contribution.review_comment}</div>
          {contribution.reviewer && (
            <div className="text-xs text-yellow-500 mt-1">
              — {contribution.reviewer.name || contribution.reviewer.email}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* STEP 1: Extraction Check (always visible) */}
      {/* ================================================================ */}
      <div className={`mb-6 rounded-lg border p-4 ${
        source?.extraction_flagged
          ? 'bg-orange-50 border-orange-200'
          : source?.extraction_verified
            ? 'bg-green-50 border-green-200'
            : source?.source_type !== 'text' && source?.extraction_diff_json?.error
              ? 'bg-orange-50 border-orange-200'
              : source?.source_type !== 'text'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-800">Step 1: Extraction Check</h2>
          {source?.extraction_verified && !source?.extraction_flagged && (
            <span className="text-xs text-green-600 font-medium">✅ Passed</span>
          )}
          {source?.extraction_flagged && (
            <span className="text-xs text-orange-600 font-medium">⚠️ Conflicts Found</span>
          )}
          {!source?.extraction_verified && source?.source_type !== 'text' && source?.extraction_diff_json?.error && (
            <span className="text-xs text-orange-600 font-medium">❌ Failed</span>
          )}
          {!source?.extraction_verified && source?.source_type !== 'text' && !source?.extraction_diff_json?.error && (
            <span className="text-xs text-blue-600 font-medium animate-pulse">⏳ Verifying...</span>
          )}
        </div>

        {/* Text source — no OCR verification needed */}
        {source?.source_type === 'text' && (
          <p className="text-sm text-gray-600">✅ Text source — no OCR verification needed</p>
        )}

        {/* PDF, Mistral OCR failed */}
        {source?.source_type !== 'text' && !source?.extraction_verified && source?.extraction_diff_json?.error && (
          <div className="text-sm text-orange-700">
            <p>Gemini verification failed — {source.extraction_diff_json.message?.includes('429') ? 'API quota exceeded. Try again later.' : 'extraction error.'}</p>
            <button
              onClick={async () => {
                setVerifyTriggered(true)
                await fetch(`/api/sources/${source.id}/verify`, { method: 'POST' })
                fetchData()
              }}
              className="mt-2 text-xs px-3 py-1.5 bg-white border border-orange-300 text-orange-700 rounded hover:bg-orange-50"
            >
              Retry Verification
            </button>
          </div>
        )}

        {/* PDF, not yet verified (no error — first attempt or in progress) */}
        {source?.source_type !== 'text' && !source?.extraction_verified && !source?.extraction_diff_json?.error && (
          <div className="text-sm text-blue-700">
            <p>Running Gemini cross-verification... This compares extractions to catch OCR errors.</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="animate-spin text-lg">🐙</span>
              <span className="text-xs">Extracting with Gemini and comparing results...</span>
            </div>
          </div>
        )}

        {/* Verified, no conflicts */}
        {source?.extraction_verified && !source?.extraction_flagged && source?.source_type !== 'text' && (
          <div className="text-sm text-green-700">
            <p>{source.extraction_provider === 'pdf-parse'
              ? '✅ Digital PDF — text extracted directly, 100% accurate.'
              : 'No extraction conflicts — both extractions agree on all words.'
            }</p>
            {source?.extraction_diff_json?.summary && (() => {
              const s = source.extraction_diff_json.summary
              return (
              <div className="flex gap-3 mt-2 text-xs">
                <span className="px-2 py-1 bg-white/60 rounded">Primary: {s.total_primary ?? s.total_claude ?? 0} words</span>
                <span className="px-2 py-1 bg-white/60 rounded">Gemini: {s.total_gemini ?? s.total_mistral ?? 0} words</span>
                <span className="px-2 py-1 bg-white/60 rounded">Both agree: {s.matched}</span>
              </div>
              )
            })()}
          </div>
        )}

        {/* Verified WITH conflicts — full diff table */}
        {source?.extraction_verified && source?.extraction_flagged && (
          <div className="text-sm">
            {source.extraction_diff_json?.summary && (() => {
              const s = source.extraction_diff_json.summary
              return (
              <div className="flex gap-3 mb-3 text-xs">
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded">Primary: {s.total_primary ?? s.total_claude ?? 0} words</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">Gemini: {s.total_gemini ?? s.total_mistral ?? 0} words</span>
                <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">Both agree: {s.matched}</span>
                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded">{s.primary_only_count ?? s.claude_only_count ?? 0} Primary only</span>
                <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded">{s.gemini_only_count ?? s.mistral_only_count ?? 0} Gemini only</span>
              </div>
              )
            })()}

            {source.extraction_diff_json?.words?.length > 0 && (
              <div className="border border-gray-200 rounded overflow-hidden bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Word</th>
                      <th className="text-center px-3 py-2 font-medium text-green-600">Primary</th>
                      <th className="text-center px-3 py-2 font-medium text-blue-600">Gemini</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-500">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {source.extraction_diff_json.words.map((wd: any) => {
                      // Backward compat: old data uses claude_*, new data uses primary_*
                      const pFreq = wd.primary_freq ?? wd.claude_freq ?? 0
                      const gFreq = wd.gemini_freq ?? wd.mistral_freq ?? 0
                      const pPos = wd.primary_positions ?? wd.claude_positions
                      const gPos = wd.gemini_positions ?? wd.mistral_positions
                      return (
                      <tr key={wd.word} className={wd.severity === 'critical' ? 'bg-orange-50/50' : 'bg-gray-50/30'}>
                        <td className="px-3 py-1.5 font-medium text-gray-900">{wd.word}</td>
                        <td className="px-3 py-1.5 text-center">
                          {pFreq > 0 ? <span className="text-green-600">&#10003; ({pFreq})</span> : <span className="text-red-400">&#10007;</span>}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {gFreq > 0 ? <span className="text-blue-600">&#10003; ({gFreq})</span> : <span className="text-red-400">&#10007;</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={wd.verdict?.includes('OCR error') ? 'text-red-600' : wd.verdict?.includes('missed') ? 'text-orange-600' : 'text-yellow-600'}>
                            {wd.verdict || wd.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {(pPos?.length > 0 || gPos?.length > 0) && (
                            <button
                              onClick={() => showInText({
                                word: wd.word,
                                positions: pPos || gPos || [],
                                provider: pPos?.length > 0 ? 'primary' : 'gemini',
                              })}
                              className="text-blue-500 hover:text-blue-700 text-[10px] underline"
                            >
                              Show in text
                            </button>
                          )}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Text Viewer moved outside Step 1 — see below word table */}

            {/* Conflict review checklist for CEFR conflicts */}
            {conflictItems.length > 0 && contribution.status === 'draft' && (
              <div className="mt-3 p-3 bg-white rounded border border-orange-200">
                <div className="text-xs font-medium text-orange-800 mb-2">
                  {lockStepEnabled ? '🔒' : '⚠️'} {conflictItems.length} CEFR conflict{conflictItems.length !== 1 ? 's' : ''} — {allConflictsReviewed ? 'all reviewed ✓' : `${unreviewedConflicts.length} need review`}
                </div>
                <div className="space-y-1">
                  {conflictItems.map(item => (
                    <label key={item.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-orange-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={reviewedConflicts.has(item.id)}
                        onChange={() => toggleConflictReviewed(item.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="font-medium">{item.word}</span>
                      <span className="text-gray-400">{item.current_cefr} → {item.proposed_cefr}</span>
                      {reviewedConflicts.has(item.id) && <span className="text-green-600">✓</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No-conflict conflict checklist (when there ARE CEFR conflicts but extraction is clean) */}
        {source?.extraction_verified && !source?.extraction_flagged && conflictItems.length > 0 && contribution.status === 'draft' && (
          <div className="mt-3 p-3 bg-white rounded border border-yellow-200">
            <div className="text-xs font-medium text-yellow-800 mb-2">
              {lockStepEnabled ? '🔒' : '⚠️'} {conflictItems.length} CEFR conflict{conflictItems.length !== 1 ? 's' : ''} with existing words — {allConflictsReviewed ? 'all reviewed ✓' : `${unreviewedConflicts.length} need review`}
            </div>
            <div className="space-y-1">
              {conflictItems.map(item => (
                <label key={item.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-yellow-50 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={reviewedConflicts.has(item.id)}
                    onChange={() => toggleConflictReviewed(item.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="font-medium">{item.word}</span>
                  <span className="text-gray-400">{item.current_cefr} → {item.proposed_cefr}</span>
                  {reviewedConflicts.has(item.id) && <span className="text-green-600">✓</span>}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* STEP 2: Word Editing */}
      {/* ================================================================ */}
      {conflictBlocked && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          🔒 Resolve all extraction conflicts above before editing words ({unreviewedConflicts.length} remaining)
        </div>
      )}

      <div className={conflictBlocked ? 'opacity-40 pointer-events-none select-none' : ''}>

      {/* Impact Summary */}
      <div className="flex gap-3 mb-6">
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          🟢 {newCount} new words
        </span>
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          🔵 {freqCount} frequency updates
        </span>
        {conflictCount > 0 && (
          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            🟡 {conflictCount} conflicts
          </span>
        )}
        {autoCheckCount > 0 && (
          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
            ⚙️ {autoCheckCount} auto-check
          </span>
        )}
        {aiFlaggedCount > 0 && (
          <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            🔴 {aiFlaggedCount} AI-flagged
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
            auto_check: `⚙️ Auto-check (${autoCheckCount})`,
            flagged: `🔴 AI-Flagged (${aiFlaggedCount})`,
          }
          // Hide tabs with 0 count for auto_check and flagged
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
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-8 px-2 py-3"><input type="checkbox" checked={selectedCount === items.length} onChange={selectAll} /></th>
              <th className="text-left px-3 py-3 font-medium text-gray-500" style={{width: '30%'}}>Word</th>
              <th className="text-center px-2 py-3 font-medium text-gray-500 w-16">Type</th>
              <th className="text-center px-2 py-3 font-medium text-gray-500 w-24">CEFR</th>
              <th className="text-center px-2 py-3 font-medium text-gray-500 w-12">Freq</th>
              <th className="text-left px-3 py-3 font-medium text-gray-500" style={{width: '30%'}}>Translation</th>
              {contribution.status === 'draft' && (
                <th className="w-8 px-1 py-3"></th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredItems.map(item => {
              const badge = CHANGE_TYPE_BADGES[item.change_type] || CHANGE_TYPE_BADGES.add_word
              return (
                <tr key={item.id} className={`hover:bg-gray-50 ${isAiFlagged(item) ? 'bg-red-50/50' : isAutoCheck(item) ? 'bg-orange-50/30' : ''}`}>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleItem(item.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {contribution.status === 'draft' && editingId === item.id ? (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={item.word}
                          onChange={(e) => updateItem(item.id, 'word', e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                          autoFocus
                          className="w-full text-sm font-medium border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <div className="flex items-center gap-1.5">
                          {item.proposed_image_url && (
                            <img src={item.proposed_image_url} alt="" className="w-6 h-6 object-cover rounded flex-shrink-0" />
                          )}
                          <input
                            type="url"
                            value={item.proposed_image_url || ''}
                            onChange={(e) => updateItem(item.id, 'proposed_image_url', e.target.value || null)}
                            placeholder="Image URL (optional)"
                            className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`font-medium text-gray-900 flex items-center gap-1.5 ${contribution.status === 'draft' ? 'cursor-pointer hover:underline' : ''}`}
                        onClick={() => contribution.status === 'draft' && setEditingId(item.id)}
                      >
                        {item.proposed_image_url && (
                          <img src={item.proposed_image_url} alt="" className="w-5 h-5 object-cover rounded flex-shrink-0" />
                        )}
                        {item.word}
                      </div>
                    )}
                    {isAutoCheck(item) && (
                      <div className="text-xs text-orange-500 mt-0.5">
                        ⚙️ {item.ai_flag_reason?.replace(/_/g, ' ')}
                      </div>
                    )}
                    {isAiFlagged(item) && (
                      <div className="text-xs text-red-500 mt-0.5 flex items-center gap-1.5">
                        <span>⚠️ {item.ai_flag_reason?.replace(/_/g, ' ')}</span>
                        {source?.extracted_text && (
                          <button
                            onClick={() => {
                              // Find word position in source text for highlight
                              const text = source.extracted_text || ''
                              const positions: number[] = []
                              let idx = text.toLowerCase().indexOf(item.word.toLowerCase())
                              while (idx !== -1 && positions.length < 5) {
                                positions.push(idx)
                                idx = text.toLowerCase().indexOf(item.word.toLowerCase(), idx + 1)
                              }
                              if (positions.length > 0) {
                                showInText({ word: item.word, positions, provider: 'primary' })
                              }
                            }}
                            className="text-blue-500 hover:text-blue-700 text-[10px] underline flex-shrink-0"
                          >
                            show in text
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center text-gray-600 text-xs">
                    {contribution.status === 'draft' && editingId === item.id ? (
                      <select
                        value={item.proposed_cefr || 'Unclassified'}
                        onChange={(e) => updateItem(item.id, 'proposed_cefr', e.target.value as CefrLevel)}
                        className="text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {CEFR_LEVELS.map(level => (
                          <option key={level} value={level}>{level}</option>
                        ))}
                      </select>
                    ) : item.change_type === 'cefr_conflict' ? (
                      <span
                        className={contribution.status === 'draft' ? 'cursor-pointer hover:underline' : ''}
                        onClick={() => contribution.status === 'draft' && setEditingId(item.id)}
                      >
                        {item.current_cefr} → <strong className="text-yellow-700">{item.proposed_cefr}</strong>
                      </span>
                    ) : (
                      <span
                        className={contribution.status === 'draft' ? 'cursor-pointer hover:underline' : ''}
                        onClick={() => contribution.status === 'draft' && setEditingId(item.id)}
                      >
                        {item.proposed_cefr || '—'}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center text-gray-600">
                    {contribution.status === 'draft' && editingId === item.id ? (
                      <input
                        type="number"
                        min={0}
                        value={item.proposed_frequency}
                        onChange={(e) => updateItem(item.id, 'proposed_frequency', parseInt(e.target.value) || 0)}
                        className="w-12 text-xs text-center border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <span
                        className={contribution.status === 'draft' ? 'cursor-pointer hover:underline' : ''}
                        onClick={() => contribution.status === 'draft' && setEditingId(item.id)}
                      >
                        {item.proposed_frequency}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">
                    {contribution.status === 'draft' && editingId === item.id ? (
                      <input
                        type="text"
                        value={item.proposed_translation || ''}
                        onChange={(e) => updateItem(item.id, 'proposed_translation', e.target.value || null)}
                        placeholder="Tiếng Việt..."
                        className="w-full text-xs border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <span
                        className={contribution.status === 'draft' ? 'cursor-pointer hover:underline' : ''}
                        onClick={() => contribution.status === 'draft' && setEditingId(item.id)}
                      >
                        {item.proposed_translation || <span className="text-gray-300">—</span>}
                      </span>
                    )}
                  </td>
                  {contribution.status === 'draft' && (
                    <td className="px-1 py-2 text-center">
                      {editingId === item.id ? (
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Done editing"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingId(item.id)}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit word"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                          </svg>
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      </div>{/* End of conflictBlocked wrapper */}

      {/* Text Viewer + PDF Viewer for highlighted word */}
      {highlightWord && source?.extracted_text && (
        <div id="text-viewer" className="mb-4 space-y-3">
          {/* Extracted text context */}
          <div className="border border-blue-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
              <span className="text-xs font-medium text-blue-700">
                &quot;{highlightWord.word}&quot; — Page {pdfViewerPage}
                {highlightWord.positions.length > 1 && ` (${highlightWord.positions.length} occurrences)`}
              </span>
              <button onClick={() => { setHighlightWord(null); setPdfViewerUrl(null) }} className="text-xs text-blue-500 hover:text-blue-700">Close</button>
            </div>
            <div className="p-3 max-h-32 overflow-y-auto text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed bg-white">
              {(() => {
                const text = highlightWord.provider === 'primary' ? (source.extracted_text || '') : (source.secondary_raw_text || source.extracted_text || '')
                const positions = highlightWord.positions
                const wordLen = highlightWord.word.length
                if (!positions || positions.length === 0) {
                  return <div className="text-gray-400 italic">No position data available for this word.</div>
                }
                return positions.map((pos: number, idx: number) => {
                  const start = Math.max(0, pos - 80)
                  const end = Math.min(text.length, pos + wordLen + 80)
                  return (
                    <div key={idx} className="mb-2 pb-2 border-b border-gray-100 last:border-0">
                      <span className="text-gray-500">{start > 0 ? '...' : ''}{text.slice(start, pos)}</span>
                      <mark className="bg-yellow-200 text-yellow-900 font-bold px-0.5 rounded">{text.slice(pos, pos + wordLen)}</mark>
                      <span className="text-gray-500">{text.slice(pos + wordLen, end)}{end < text.length ? '...' : ''}</span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>

          {/* Embedded file viewer (PDF iframe or image) */}
          {source?.source_type !== 'text' && pdfViewerUrl && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="text-[10px] text-gray-500">PDF — Page {pdfViewerPage}</span>
                <div className="flex gap-2">
                  {pdfViewerPage > 1 && (
                    <button onClick={() => setPdfViewerPage(p => Math.max(1, p - 1))} className="text-[10px] text-blue-500 hover:text-blue-700">← Prev</button>
                  )}
                  <button onClick={() => setPdfViewerPage(p => p + 1)} className="text-[10px] text-blue-500 hover:text-blue-700">Next →</button>
                  <a href={pdfViewerUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:text-blue-700">Open ↗</a>
                </div>
              </div>
              {source?.source_type === 'image' ? (
                <img src={pdfViewerUrl} alt="Source image" className="w-full bg-gray-100" />
              ) : (
                <iframe
                  key={pdfViewerPage}
                  src={`${pdfViewerUrl}#page=${pdfViewerPage}`}
                  className="w-full h-[500px] bg-gray-100"
                  title="PDF Viewer"
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Bar */}
      {contribution.status === 'draft' && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 -mx-6 flex items-center justify-between">
          <div className="flex gap-2">
            <button onClick={selectAll} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
              Select All
            </button>
            <button onClick={deselectFlagged} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
              Deselect Flagged
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={discard}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
            >
              Discard
            </button>
            <button
              onClick={saveDraft}
              disabled={submitting}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              Save Draft
            </button>
            <div className="relative group/submit">
              <button
                onClick={submitForReview}
                disabled={submitting || selectedCount === 0 || submitBlocked}
                className={`px-4 py-2 text-sm rounded disabled:opacity-50 ${
                  submitBlocked
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {conflictBlocked
                  ? `Review ${unreviewedConflicts.length} conflict${unreviewedConflicts.length !== 1 ? 's' : ''} first`
                  : submitBlocked
                    ? 'Requirements not met'
                    : `Submit for Review (${selectedCount} words)`}
              </button>
              {submitBlocked && requirementErrors.length > 0 && (
                <div className="absolute bottom-full right-0 mb-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover/submit:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="font-medium mb-1">Missing requirements:</div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {requirementErrors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
