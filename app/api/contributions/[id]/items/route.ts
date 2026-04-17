import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'
import { executeApprovedItems } from '@/lib/contributions'

type Params = { params: Promise<{ id: string }> }

// PUT /api/contributions/[id]/items — Batch update items (editor approves/rejects individual items)
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requirePermission('approve_contributions')
  if (!auth.authorized) return auth.response

  const { id } = await params
  const adminClient = await createAdminClient()
  const body = await req.json()

  if (!body.items || !Array.isArray(body.items)) {
    return apiError('items array required', 400)
  }

  // Verify contribution exists
  const { data: contribution } = await adminClient
    .from('contributions')
    .select('id, source_id, contributor_id')
    .eq('id', id)
    .single()

  if (!contribution) return apiError('Contribution not found', 404)

  let updatedCount = 0
  const approvedItems = []

  for (const itemUpdate of body.items) {
    if (!['approved', 'rejected'].includes(itemUpdate.status)) continue

    const { error } = await adminClient
      .from('contribution_items')
      .update({ status: itemUpdate.status })
      .eq('id', itemUpdate.id)
      .eq('contribution_id', id)

    if (!error) {
      updatedCount++
      if (itemUpdate.status === 'approved') {
        const { data: item } = await adminClient
          .from('contribution_items')
          .select('*')
          .eq('id', itemUpdate.id)
          .single()
        if (item) approvedItems.push(item)
      }
    }
  }

  // Execute newly approved items
  if (approvedItems.length > 0) {
    await executeApprovedItems(
      id,
      contribution.source_id,
      approvedItems,
      contribution.contributor_id
    )
  }

  // Update contribution status based on item states
  const { data: allItems } = await adminClient
    .from('contribution_items')
    .select('status')
    .eq('contribution_id', id)

  if (allItems) {
    const statuses = new Set(allItems.map(i => i.status))
    let newStatus = 'partially_approved'
    if (statuses.size === 1 && statuses.has('approved')) newStatus = 'approved'
    if (statuses.size === 1 && statuses.has('rejected')) newStatus = 'rejected'

    await adminClient.from('contributions').update({
      status: newStatus,
      reviewed_by: auth.user.userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  }

  return apiSuccess({ updated: updatedCount })
}
