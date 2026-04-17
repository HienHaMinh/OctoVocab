import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole } from '@/lib/rbac'

type Params = { params: Promise<{ id: string }> }

// POST /api/subsets/[id]/words — Add words to subset
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params
  const body = await req.json()
  const { word_ids } = body

  if (!word_ids?.length) return apiError('word_ids required', 400)

  const adminClient = await createAdminClient()

  const inserts = word_ids.map((wordId: string) => ({
    subset_id: id,
    word_id: wordId,
    added_by: user.userId,
  }))

  const { error } = await adminClient
    .from('word_subset_members')
    .upsert(inserts, { onConflict: 'subset_id,word_id', ignoreDuplicates: true })

  if (error) return apiError(error.message, 500)

  // Update word_count
  const { count } = await adminClient
    .from('word_subset_members')
    .select('*', { count: 'exact', head: true })
    .eq('subset_id', id)

  await adminClient
    .from('word_subsets')
    .update({ word_count: count || 0, updated_at: new Date().toISOString() })
    .eq('id', id)

  return apiSuccess({ added: word_ids.length })
}

// DELETE /api/subsets/[id]/words — Remove words from subset
export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params
  const body = await req.json()
  const { word_ids } = body

  if (!word_ids?.length) return apiError('word_ids required', 400)

  const adminClient = await createAdminClient()

  const { error } = await adminClient
    .from('word_subset_members')
    .delete()
    .eq('subset_id', id)
    .in('word_id', word_ids)

  if (error) return apiError(error.message, 500)

  // Update word_count
  const { count } = await adminClient
    .from('word_subset_members')
    .select('*', { count: 'exact', head: true })
    .eq('subset_id', id)

  await adminClient
    .from('word_subsets')
    .update({ word_count: count || 0, updated_at: new Date().toISOString() })
    .eq('id', id)

  return apiSuccess({ removed: word_ids.length })
}
