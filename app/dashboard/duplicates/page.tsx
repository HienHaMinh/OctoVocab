'use client'

import { useState, useEffect } from 'react'
import { GitMerge, Search, Loader2, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { getCefrColor } from '@/lib/cefr-lists'
import type { CefrLevel } from '@/types'

interface DuplicateWord {
  id: string
  word: string
  cefr_level: CefrLevel
  total_frequency: number
  num_sources: number
  vi_translation: string | null
}

interface DuplicateCluster {
  stem: string
  canonical: string
  words: DuplicateWord[]
}

export default function DuplicatesPage() {
  const [clusters, setClusters] = useState<DuplicateCluster[]>([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState<string | null>(null)
  const [mergedClusters, setMergedClusters] = useState<Set<string>>(new Set())
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDuplicates()
  }, [])

  const fetchDuplicates = async () => {
    setLoading(true)
    setError(null)
    setMergedClusters(new Set())
    try {
      const res = await fetch('/api/words/duplicates')
      const json = await res.json()

      if (json.clusters) {
        setClusters(json.clusters)
        const initial = new Set<string>(
          json.clusters.slice(0, 5).map((_: DuplicateCluster, i: number) => String(i)),
        )
        setExpandedClusters(initial)
      }
    } catch (err) {
      setError('Failed to load duplicates')
    } finally {
      setLoading(false)
    }
  }

  const handleMerge = async (
    clusterIdx: number,
    canonicalId: string,
    variantIds: string[],
  ) => {
    const key = String(clusterIdx)
    setMerging(key)

    try {
      const res = await fetch('/api/words/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variant_word_ids: variantIds,
          canonical_word_id: canonicalId,
          merge_type: 'find_duplicates',
          reason: 'Stemmer-detected duplicate',
        }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Merge failed')
      }

      setMergedClusters((prev) => new Set(Array.from(prev).concat(key)))
    } catch (err: any) {
      setError(err.message || 'Merge failed')
    } finally {
      setMerging(null)
    }
  }

  const toggleExpand = (idx: number) => {
    const key = String(idx)
    setExpandedClusters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const activeClusters = clusters.filter((_, idx) => !mergedClusters.has(String(idx)))

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Find Duplicates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Detect and merge similar words (e.g., run, running, runs)
          </p>
        </div>
        <button
          onClick={fetchDuplicates}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm"
        >
          <Search className="w-4 h-4" />
          Scan Again
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
          <p className="text-gray-500">Scanning for duplicates...</p>
        </div>
      ) : activeClusters.length === 0 ? (
        <div className="text-center py-20">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No duplicates found!</p>
          <p className="text-sm text-gray-400 mt-1">All words are unique</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-4">
            Found <span className="font-semibold text-gray-700">{activeClusters.length}</span> potential
            duplicate groups
          </p>

          {clusters.map((cluster, idx) => {
            if (mergedClusters.has(String(idx))) return null
            const isExpanded = expandedClusters.has(String(idx))
            const isMerging = merging === String(idx)
            const totalFreq = cluster.words.reduce((sum, w) => sum + w.total_frequency, 0)

            const canonicalWord =
              cluster.words.find((w) => w.word === cluster.canonical) || cluster.words[0]
            const variants = cluster.words.filter((w) => w.id !== canonicalWord.id)

            return (
              <div key={idx} className="bg-white border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleExpand(idx)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <GitMerge className="w-5 h-5 text-orange-500" />
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        {cluster.words.map((w) => (
                          <span
                            key={w.id}
                            className={`font-mono text-sm ${
                              w.id === canonicalWord.id ? 'font-bold text-gray-900' : 'text-gray-500'
                            }`}
                          >
                            {w.word}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {cluster.words.length} words · Total frequency: {totalFreq}
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-5 pb-4 border-t bg-gray-50/50">
                    <div className="mt-4 space-y-2">
                      {cluster.words.map((w) => (
                        <div
                          key={w.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            w.id === canonicalWord.id
                              ? 'bg-blue-50 border border-blue-200'
                              : 'bg-white border'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-medium">{w.word}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getCefrColor(w.cefr_level)}`}>
                              {w.cefr_level}
                            </span>
                            {w.id === canonicalWord.id && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Keep</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            {w.vi_translation && <span className="text-gray-600">{w.vi_translation}</span>}
                            <span>{w.total_frequency}× freq</span>
                            <span>{w.num_sources} sources</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <p className="text-xs text-gray-500">
                        Merge {variants.length} word{variants.length > 1 ? 's' : ''} into{' '}
                        <span className="font-semibold">{canonicalWord.word}</span>
                      </p>
                      <button
                        onClick={() => handleMerge(idx, canonicalWord.id, variants.map((v) => v.id))}
                        disabled={isMerging}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 text-sm font-medium"
                      >
                        {isMerging ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Merging...
                          </>
                        ) : (
                          <>
                            <GitMerge className="w-4 h-4" />
                            Merge Words
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
