import { createClient } from '@/lib/supabase/server'
import { formatDatetime } from '@/lib/utils'

export default async function MergesPage() {
  const supabase = await createClient()

  const { data: merges } = await supabase
    .from('word_merges')
    .select(`
      *,
      variant:words!variant_word_id (word),
      canonical:words!canonical_word_id (word),
      teacher:teachers!initiated_by (name, email)
    `)
    .eq('reverted', false)
    .order('merged_at', { ascending: false })
    .limit(100)

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Merge History</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Complete audit trail of word merges. This log is immutable.
        </p>
      </div>

      {merges && merges.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Variant → Canonical</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Freq Transferred</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Performed By</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {merges.map((merge: any) => (
                <tr key={merge.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-700">{merge.variant?.word}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-medium text-blue-700">{merge.canonical?.word}</span>
                    </div>
                    {merge.reason && (
                      <div className="text-xs text-gray-400 mt-0.5">{merge.reason}</div>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{merge.merge_type}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-sm text-gray-600">+{merge.total_frequency}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{merge.teacher?.name || merge.teacher?.email || 'Unknown'}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{formatDatetime(merge.merged_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="text-5xl mb-4">🔗</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No merges yet</h3>
          <p className="text-gray-500 text-sm">Use "Find Duplicates" to detect and merge similar words</p>
        </div>
      )}
    </div>
  )
}
