'use client'

import { useEffect, useState } from 'react'

interface Contributor {
  name: string
  email: string
  approved_words: number
  sources_uploaded: number
}

interface Editor {
  name: string
  email: string
  reviews_count: number
  approval_rate: number
}

export function Leaderboard() {
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [editors, setEditors] = useState<Editor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => {
        setContributors(data.top_contributors || [])
        setEditors(data.top_editors || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-xs text-gray-400">Loading leaderboard...</div>
  if (contributors.length === 0 && editors.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Top Contributors */}
      {contributors.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Contributors</h3>
          <div className="space-y-2">
            {contributors.map((c, i) => (
              <div key={c.email} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-center text-xs text-gray-400 font-medium">{i + 1}</span>
                  <span className="text-gray-900">{c.name || c.email}</span>
                </div>
                <span className="text-green-600 font-medium text-xs">{c.approved_words} words</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Editors */}
      {editors.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Editors</h3>
          <div className="space-y-2">
            {editors.map((e, i) => (
              <div key={e.email} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-center text-xs text-gray-400 font-medium">{i + 1}</span>
                  <span className="text-gray-900">{e.name || e.email}</span>
                </div>
                <span className="text-blue-600 font-medium text-xs">
                  {e.reviews_count} reviews ({e.approval_rate}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
