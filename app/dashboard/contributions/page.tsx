'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { Contribution } from '@/types'

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  pending: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  partially_approved: { label: 'Partial', color: 'bg-blue-100 text-blue-700' },
}

export default function ContributionsPage() {
  const [contributions, setContributions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')
  const searchParams = useSearchParams()

  const fetchContributions = useCallback(() => {
    setLoading(true)
    const url = filter ? `/api/contributions?status=${filter}` : '/api/contributions'
    fetch(url)
      .then(r => r.json())
      .then(data => {
        setContributions(data.contributions || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [filter])

  // Refetch on filter change or when navigating back (searchParams change triggers re-render)
  useEffect(() => {
    fetchContributions()
  }, [fetchContributions, searchParams])

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Contributions</h1>

        {/* Filter */}
        <div className="flex gap-2">
          {['', 'draft', 'pending', 'approved', 'rejected'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filter === status
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {status || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : contributions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No contributions yet. Upload a source to create your first contribution.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Contributor</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">New</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Updates</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Conflicts</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contributions.map((c: any) => {
                const isReturned = c.status === 'draft' && c.review_comment
                const badge = isReturned
                  ? { label: 'Changes Requested', color: 'bg-orange-100 text-orange-700' }
                  : STATUS_BADGES[c.status] || STATUS_BADGES.draft
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.title || 'Untitled'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.contributor?.name || c.contributor?.email || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-green-600 font-medium">{c.new_words_count}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-blue-600 font-medium">{c.frequency_updates_count}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-yellow-600 font-medium">{c.conflicts_count}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.status === 'draft' ? (
                        <Link
                          href={`/dashboard/contributions/${c.id}/review`}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {isReturned ? 'Edit →' : 'Review →'}
                        </Link>
                      ) : c.status === 'pending' ? (
                        <Link
                          href={`/dashboard/contributions/${c.id}`}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Review
                        </Link>
                      ) : (
                        <Link
                          href={`/dashboard/contributions/${c.id}`}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
