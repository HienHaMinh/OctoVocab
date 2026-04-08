import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatNumber } from '@/lib/utils'
import { CEFR_LEVELS, getCefrColor } from '@/lib/cefr-lists'
import { Leaderboard } from '@/components/Leaderboard'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Load stats in parallel
  const [
    { count: totalWords },
    { count: totalSources },
    { count: unclassified },
    { count: untranslated },
    { data: cefrBreakdown },
    { data: recentSources },
  ] = await Promise.all([
    supabase.from('words').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('sources').select('*', { count: 'exact', head: true }),
    supabase.from('words').select('*', { count: 'exact', head: true }).eq('cefr_level', 'Unclassified').eq('status', 'active'),
    // Use the words_untranslated view instead of broken nested subquery
    supabase.from('words_untranslated').select('*', { count: 'exact', head: true }),
    supabase.from('words').select('cefr_level').eq('status', 'active').limit(50000),
    supabase.from('sources').select('id, name, source_type, word_count, created_at').order('created_at', { ascending: false }).limit(5),
  ])

  // Calculate CEFR distribution
  const cefrCounts: Record<string, number> = {}
  for (const level of CEFR_LEVELS) cefrCounts[level] = 0
  for (const word of cefrBreakdown || []) {
    cefrCounts[word.cefr_level] = (cefrCounts[word.cefr_level] || 0) + 1
  }

  const stats = [
    { label: 'Total Words', value: totalWords || 0, icon: '📚', href: '/dashboard/words' },
    { label: 'Sources', value: totalSources || 0, icon: '📄', href: '/dashboard/sources' },
    { label: 'Unclassified', value: unclassified || 0, icon: '⚠️', href: '/dashboard/words?cefr=Unclassified', warn: (unclassified || 0) > 0 },
    { label: 'Untranslated', value: untranslated || 0, icon: '🌐', href: '/dashboard/words?untranslated=1', warn: (untranslated || 0) > 0 },
  ]

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-gray-500 mt-1 text-sm">Vocabulary database status</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={`bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow ${
              stat.warn ? 'border-orange-200 bg-orange-50' : 'border-gray-200'
            }`}
          >
            <div className="text-2xl mb-2">{stat.icon}</div>
            <div className={`text-2xl font-bold ${stat.warn ? 'text-orange-700' : 'text-gray-900'}`}>
              {formatNumber(stat.value)}
            </div>
            <div className={`text-xs mt-0.5 ${stat.warn ? 'text-orange-600' : 'text-gray-500'}`}>
              {stat.label}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CEFR Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">CEFR Distribution</h2>
          <div className="space-y-2.5">
            {CEFR_LEVELS.map((level) => {
              const count = cefrCounts[level] || 0
              const total = totalWords || 1
              const pct = Math.round((count / total) * 100)
              return (
                <div key={level} className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-20 text-center ${getCefrColor(level)}`}>
                    {level}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right">
                    {formatNumber(count)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent Sources */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Sources</h2>
            <Link href="/dashboard/sources" className="text-xs text-blue-600 hover:underline">
              View all
            </Link>
          </div>

          {recentSources && recentSources.length > 0 ? (
            <div className="space-y-2">
              {recentSources.map((source) => (
                <div key={source.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-lg">{source.source_type === 'pdf' ? '📄' : '📝'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{source.name}</div>
                    <div className="text-xs text-gray-400">{source.word_count} words</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">📂</div>
              <p className="text-sm">No documents yet</p>
              <Link
                href="/dashboard/sources"
                className="mt-2 inline-block text-sm text-blue-600 hover:underline"
              >
                Upload your first document →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Leaderboard</h2>
        <Leaderboard />
      </div>
    </div>
  )
}
