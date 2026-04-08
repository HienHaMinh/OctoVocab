import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole } from '@/lib/rbac'

// GET /api/sources/[id] — Get source details + words
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const currentUser = await getCurrentUserRole()
  const isAdmin = currentUser?.role === 'admin'

  // Admin can view any source; others see only their own
  let sourceQuery = supabase
    .from('sources')
    .select('*')
    .eq('id', id)

  if (!isAdmin) {
    sourceQuery = sourceQuery.eq('teacher_id', user.id)
  }

  const { data: source, error } = await sourceQuery.single()
  if (error || !source) return apiError('Source not found', 404)

  // Get words in this source
  const { data: words } = await supabase
    .from('word_source_frequency')
    .select(`
      frequency,
      words (id, word, cefr_level, status)
    `)
    .eq('source_id', id)
    .order('frequency', { ascending: false })

  return apiSuccess({ source, words: words || [] })
}

// PATCH /api/sources/[id] — Update source metadata (origin_name, name)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const currentUser = await getCurrentUserRole()
  if (!currentUser) return apiError('Unauthorized', 401)
  const isAdmin = currentUser.role === 'admin'

  // Verify ownership (admin can edit any)
  const { data: source } = await supabase
    .from('sources')
    .select('id, teacher_id, uploaded_by')
    .eq('id', id)
    .single()

  if (!source) return apiError('Source not found', 404)
  if (!isAdmin && source.teacher_id !== user.id && source.uploaded_by !== user.id) {
    return apiError('Forbidden', 403)
  }

  const body = await req.json()
  // Only allow safe fields to be updated
  const allowedFields: Record<string, any> = {}
  if (body.origin_name !== undefined) allowedFields.origin_name = body.origin_name
  if (body.origin_url !== undefined) allowedFields.origin_url = body.origin_url
  if (body.name !== undefined) allowedFields.name = body.name

  if (Object.keys(allowedFields).length === 0) {
    return apiError('No valid fields to update', 400)
  }

  const updateClient = isAdmin ? await createAdminClient() : supabase
  const { error } = await updateClient.from('sources').update(allowedFields).eq('id', id)
  if (error) return apiError(error.message, 500)

  return apiSuccess({ message: 'Source updated' })
}

// DELETE /api/sources/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const currentUser = await getCurrentUserRole()
  if (!currentUser) return apiError('Unauthorized', 401)

  const isAdmin = currentUser.role === 'admin'

  // Fetch source — admin can see any, non-admin must own it
  let sourceQuery = supabase
    .from('sources')
    .select('id, teacher_id')
    .eq('id', id)

  if (!isAdmin) {
    sourceQuery = sourceQuery.or(`teacher_id.eq.${user.id},uploaded_by.eq.${user.id}`)
  }

  const { data: source } = await sourceQuery.single()
  if (!source) return apiError('Source not found', 404)

  // Check for associated contributions
  const adminClient = await createAdminClient()
  const { data: contributions } = await adminClient
    .from('contributions')
    .select('id, status')
    .eq('source_id', id)

  // Non-admin: block if any contribution has been submitted
  if (!isAdmin && contributions?.some(c => c.status !== 'draft')) {
    return apiError('Cannot delete source: contribution has been submitted', 403)
  }

  // Clean up draft contributions (they're useless without the source)
  const draftIds = (contributions || [])
    .filter(c => c.status === 'draft')
    .map(c => c.id)

  if (draftIds.length > 0) {
    await adminClient
      .from('contributions')
      .delete()
      .in('id', draftIds)
  }

  // Delete the source (admin client to bypass RLS)
  const { error } = await adminClient.from('sources').delete().eq('id', id)
  if (error) return apiError(error.message, 500)

  return apiSuccess({ message: 'Source deleted' })
}
