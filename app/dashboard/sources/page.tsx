import { createClient } from '@/lib/supabase/server'
import { formatDate, formatNumber } from '@/lib/utils'
import { UploadSource } from '@/components/UploadSource'
import { PasteText } from '@/components/PasteText'
import { DeleteSourceButton } from '@/components/DeleteSourceButton'
import { EditOrigin } from '@/components/EditOrigin'

export default async function SourcesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <div className="p-8 text-gray-500">Not authenticated</div>

  // Get user role
  const { data: teacher } = await supabase
    .from('teachers')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = teacher?.role === 'admin'

  // Fetch all sources (shared pool) with uploader name and contribution status
  const { data: sources } = await supabase
    .from('sources')
    .select('*, uploaded_by_teacher:teachers!uploaded_by(name), contributions!source_id(id, status)')
    .order('created_at', { ascending: false })

  function canDeleteSource(source: any): boolean {
    if (isAdmin) return true
    const isOwner = source.uploaded_by === user!.id || source.teacher_id === user!.id
    if (!isOwner) return false
    // Contributor can only delete if contribution is still draft or doesn't exist
    const contributions = source.contributions || []
    return !contributions.some((c: any) => c.status !== 'draft')
  }

  function isSourceLocked(source: any): boolean {
    const isOwner = source.uploaded_by === user!.id || source.teacher_id === user!.id
    if (!isOwner) return false
    const contributions = source.contributions || []
    return contributions.some((c: any) => c.status !== 'draft')
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sources</h1>
          <p className="text-gray-500 mt-1 text-sm">Shared source pool — upload PDFs or paste text to extract vocabulary</p>
        </div>
        <div className="flex gap-2">
          <PasteText />
          <UploadSource />
        </div>
      </div>

      {sources && sources.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Document Name</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Origin</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Uploaded By</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Words</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sources.map((source) => (
                <tr key={source.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{source.source_type === 'pdf' ? '📄' : source.source_type === 'image' ? '🖼️' : '📝'}</span>
                      <span className="text-sm font-medium text-gray-900">{source.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <EditOrigin sourceId={source.id} currentOrigin={source.origin_name} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-gray-500">{(source as any).uploaded_by_teacher?.name || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-sm text-gray-700 font-medium">{formatNumber(source.word_count)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-gray-500">{formatDate(source.created_at)}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {canDeleteSource(source) ? (
                      <DeleteSourceButton sourceId={source.id} sourceName={source.name} />
                    ) : isSourceLocked(source) ? (
                      <span className="text-xs text-gray-400" title="Contribution submitted — source locked">🔒</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="text-5xl mb-4">📂</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No documents yet</h3>
          <p className="text-gray-500 text-sm mb-6">Upload a PDF or paste text to start building your vocabulary database</p>
          <div className="flex justify-center gap-3">
            <PasteText />
            <UploadSource />
          </div>
        </div>
      )}
    </div>
  )
}
