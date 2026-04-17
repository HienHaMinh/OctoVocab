import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole } from '@/lib/rbac'

type Params = { params: Promise<{ id: string }> }

// GET /api/subsets/[id] — Get subset with member words
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params
  const supabase = await createClient()

  const { data: subset, error } = await supabase
    .from('word_subsets')
    .select('*, creator:teachers!created_by(name, email)')
    .eq('id', id)
    .single()

  if (error || !subset) return apiError('Subset not found', 404)

  // Get member words via word_summary view
  const { data: members } = await supabase
    .from('word_subset_members')
    .select('word_id, added_at')
    .eq('subset_id', id)

  let words: any[] = []
  if (members && members.length > 0) {
    const wordIds = members.map(m => m.word_id)
    const { data } = await supabase
      .from('word_summary')
      .select('*')
      .in('id', wordIds)
    words = data || []
  }

  return apiSuccess({ subset, words })
}

// PUT /api/subsets/[id] — Update subset
export async function PUT(req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params
  const body = await req.json()
  const adminClient = await createAdminClient()

  const { data: subset } = await adminClient
    .from('word_subsets')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!subset) return apiError('Subset not found', 404)
  if (subset.created_by !== user.userId && user.role !== 'admin') {
    return apiError('Only subset creator or admin can update', 403)
  }

  const updates: any = { updated_at: new Date().toISOString() }
  if (body.name) updates.name = body.name.trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null

  const { data: updated, error } = await adminClient
    .from('word_subsets')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiSuccess({ subset: updated })
}

// DELETE /api/subsets/[id] — Delete subset
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params
  const adminClient = await createAdminClient()

  const { data: subset } = await adminClient
    .from('word_subsets')
    .select('created_by')
    .eq('id', id)
    .single()

  if (!subset) return apiError('Subset not found', 404)
  if (subset.created_by !== user.userId && user.role !== 'admin') {
    return apiError('Only subset creator or admin can delete', 403)
  }

  const { error } = await adminClient.from('word_subsets').delete().eq('id', id)
  if (error) return apiError(error.message, 500)

  return apiSuccess({ deleted: true })
}
