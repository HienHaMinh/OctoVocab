'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function PasteText() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [originName, setOriginName] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ words_extracted: number; words_new: number; words_existing: number; needs_ai: number; contribution_id: string | null } | null>(null)
  const [enriching, setEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || `Text ${new Date().toLocaleDateString('en-US')}`,
          source_type: 'text',
          content: text,
          origin_name: originName || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to add text')
        return
      }

      setResult({
        words_extracted: data.words_extracted,
        words_new: data.words_new,
        words_existing: data.words_existing || 0,
        needs_ai: data.needs_ai || 0,
        contribution_id: data.contribution?.id || null,
      })

      // Fire AI enrichment BEFORE router.refresh() to avoid re-render interruption
      const sourceId = data.source?.id
      console.log('[PasteText] Response data:', JSON.stringify({ sourceId, needs_ai: data.needs_ai, has_source: !!data.source }))

      if (sourceId) {
        console.log('[PasteText] Triggering enrich for source:', sourceId)
        setEnriching(true)
        // Loop enrich calls until all words are processed
        ;(async () => {
          try {
            let remaining = 1
            while (remaining > 0) {
              const enrichRes = await fetch(`/api/sources/${sourceId}/enrich`, { method: 'POST' })
              const enrichData = await enrichRes.json().catch(() => null)
              console.log('[PasteText] Enrich result:', enrichData)
              remaining = enrichData?.data?.remaining || 0
              router.refresh()
            }
          } catch (err) {
            console.error('[PasteText] Enrich failed:', err)
          } finally {
            setEnriching(false)
            router.refresh()
          }
        })()
      } else {
        console.warn('[PasteText] No source.id in response:', JSON.stringify(data))
      }

      router.refresh()
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setOpen(false)
    setName('')
    setOriginName('')
    setText('')
    setResult(null)
    setError(null)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
      >
        <span>📝</span> Paste Text
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Paste Text</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>

            {result ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-3">✅</div>
                <p className="text-gray-700 font-medium">Successfully added!</p>
                <div className="mt-4 bg-green-50 rounded-lg p-3 text-sm text-left space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Words extracted</span>
                    <span className="font-medium">{result.words_extracted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">New words</span>
                    <span className="font-medium text-green-700">{result.words_new}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Frequency updates</span>
                    <span className="font-medium text-blue-700">{result.words_existing}</span>
                  </div>
                </div>
                {enriching && (
                  <div className="mt-3 bg-blue-50 rounded-lg p-3 text-sm text-blue-700 flex items-center justify-center gap-2">
                    <span className="animate-spin">🐙</span>
                    AI classifying & translating {result.needs_ai} words...
                  </div>
                )}
                <div className="mt-5 flex gap-3 justify-center">
                  <button
                    onClick={handleClose}
                    className="px-6 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                  >
                    {enriching ? 'Close (AI continues)' : 'Close'}
                  </button>
                  {result.contribution_id && (
                    <button
                      onClick={() => {
                        handleClose()
                        router.push(`/dashboard/contributions/${result!.contribution_id}/review`)
                      }}
                      className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                    >
                      Review & Submit →
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Source Name (optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Unit 5 - Reading Passage"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Origin (optional)</label>
                  <input
                    type="text"
                    value={originName}
                    onChange={(e) => setOriginName(e.target.value)}
                    placeholder="e.g., CNN, BBC News, Oxford Textbook"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Text Content <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste English text here..."
                    required
                    rows={10}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {text.split(/\s+/).filter(Boolean).length} words
                  </p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
                )}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={handleClose} className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={loading || !text.trim()} className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? '🐙 Processing...' : 'Add to Database'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
