import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole } from '@/lib/rbac'

type Params = { params: Promise<{ id: string }> }

// GET /api/sources/[id]/pdf-url — Get signed URL for the stored PDF
export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id: sourceId } = await params
  const adminClient = await createAdminClient()

  const { data: source } = await adminClient
    .from('sources')
    .select('storage_path, source_type')
    .eq('id', sourceId)
    .single()

  if (!source) return apiError('Source not found', 404)
  if (source.source_type === 'text' || !source.storage_path) {
    return apiError('No file available for this source', 400)
  }

  const { data: signedUrl, error } = await adminClient.storage
    .from('source-pdfs')
    .createSignedUrl(source.storage_path, 3600) // 1 hour

  if (error || !signedUrl) {
    return apiError('Failed to generate PDF URL', 500)
  }

  return apiSuccess({ url: signedUrl.signedUrl })
}
