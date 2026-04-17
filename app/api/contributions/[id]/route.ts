import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole, hasPermission } from '@/lib/rbac'
import { executeApprovedItems } from '@/lib/contributions'

type Params = { params: Promise<{ id: string }> }

// GET /api/contributions/[id] — Get contribution with all items
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const supabase = await createClient()

  const { data: contribution, error } = await supabase
    .from('contributions')
    .select(
      '*, contributor:teachers!contributor_id(id, name, email), reviewer:teachers!reviewed_by(id, name, email), source:sources!source_id(id, name, source_type, origin_url, origin_name, file_size_bytes, extracted_text, secondary_raw_text, extraction_provider, extraction_verified, extraction_flagged, extraction_diff_json)'
    )
    .eq('id', id)
    .single()

  if (error || !contribution) return apiError('Contribution not found', 404)

  // Fetch all items
  const { data: items } = await supabase
    .from('contribution_items')
    .select('*')
    .eq('contribution_id', id)
    .order('change_type', { ascending: true })
    .order('word', { ascending: true })

  return apiSuccess({
    contribution: { ...contribution, items: items || [] },
  })
}

// PUT /api/contributions/[id] — Update contribution (save items, submit, review)
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const adminClient = await createAdminClient()
  const body = await req.json()

  const { data: contribution } = await adminClient
    .from('contributions')
    .select('*')
    .eq('id', id)
    .single()

  if (!contribution) return apiError('Contribution not found', 404)

  const canReview = hasPermission(user.role, 'approve_contributions')
  const isContributor = contribution.contributor_id === user.userId
  const now = new Date().toISOString()

  // Determine action type
  const isReviewAction = ['approved', 'rejected', 'partially_approved'].includes(body.status)
  const isReturnAction = body.status === 'draft' && canReview && contribution.status === 'pending'
  const isEditorAction = isReviewAction || isReturnAction

  // Authorization
  if (!isContributor && !canReview) {
    return apiError('Forbidden', 403)
  }
  if (isContributor && !canReview && contribution.status !== 'draft') {
    return apiError('Can only modify draft contributions', 400)
  }
  if (isEditorAction && !canReview) {
    return apiError('Forbidden: requires approve_contributions permission', 403)
  }

  // --- Update items if provided (works for both contributor and editor) ---
  if (body.items && Array.isArray(body.items)) {
    for (const itemUpdate of body.items) {
      const updateFields: Record<string, any> = {}
      if (itemUpdate.selected !== undefined) updateFields.selected = itemUpdate.selected
      if (itemUpdate.proposed_cefr !== undefined) updateFields.proposed_cefr = itemUpdate.proposed_cefr
      if (itemUpdate.proposed_frequency !== undefined) updateFields.proposed_frequency = itemUpdate.proposed_frequency
      if (itemUpdate.proposed_translation !== undefined) updateFields.proposed_translation = itemUpdate.proposed_translation
      if (itemUpdate.word !== undefined) updateFields.word = itemUpdate.word
      if (itemUpdate.conflicts_reviewed !== undefined) updateFields.conflicts_reviewed = itemUpdate.conflicts_reviewed
      if (itemUpdate.proposed_image_url !== undefined) updateFields.proposed_image_url = itemUpdate.proposed_image_url

      if (Object.keys(updateFields).length > 0) {
        await adminClient
          .from('contribution_items')
          .update(updateFields)
          .eq('id', itemUpdate.id)
          .eq('contribution_id', id)
      }
    }
  }

  // --- No status change → just save items ---
  if (!body.status) {
    const { data: updated } = await adminClient
      .from('contributions')
      .select('*')
      .eq('id', id)
      .single()
    return apiSuccess({ contribution: updated })
  }

  // --- Contributor submits for review ---
  if (body.status === 'pending' && contribution.status === 'draft' && isContributor) {
    await adminClient
      .from('contributions')
      .update({ status: 'pending', updated_at: now })
      .eq('id', id)

    const { data: updated } = await adminClient
      .from('contributions')
      .select('*')
      .eq('id', id)
      .single()
    return apiSuccess({ contribution: updated })
  }

  // --- Editor returns to contributor (request changes) ---
  if (isReturnAction) {
    if (!body.review_comment?.trim()) {
      return apiError('Comment required when requesting changes', 400)
    }

    await adminClient.from('contributions').update({
      status: 'draft',
      reviewed_by: user.userId,
      reviewed_at: now,
      review_comment: body.review_comment,
      updated_at: now,
    }).eq('id', id)

    await adminClient
      .from('contribution_items')
      .update({ status: 'draft' })
      .eq('contribution_id', id)

    const { data: updated } = await adminClient
      .from('contributions')
      .select('*')
      .eq('id', id)
      .single()
    return apiSuccess({ contribution: updated })
  }

  // --- Editor approves/rejects ---
  if (!['approved', 'rejected', 'partially_approved'].includes(body.status)) {
    return apiError('Invalid status', 400)
  }

  if (body.status === 'rejected' && !body.review_comment) {
    return apiError('Comment required when rejecting', 400)
  }

  await adminClient.from('contributions').update({
    status: body.status,
    reviewed_by: user.userId,
    reviewed_at: now,
    review_comment: body.review_comment || null,
    updated_at: now,
  }).eq('id', id)

  if (body.status === 'approved') {
    await adminClient
      .from('contribution_items')
      .update({ status: 'approved' })
      .eq('contribution_id', id)
      .eq('selected', true)

    await adminClient
      .from('contribution_items')
      .update({ status: 'rejected' })
      .eq('contribution_id', id)
      .eq('selected', false)

    // Fetch approved items with latest values (including editor edits)
    const { data: approvedItems } = await adminClient
      .from('contribution_items')
      .select('*')
      .eq('contribution_id', id)
      .eq('status', 'approved')

    await executeApprovedItems(
      id,
      contribution.source_id,
      approvedItems || [],
      contribution.contributor_id
    )
  } else if (body.status === 'rejected') {
    await adminClient
      .from('contribution_items')
      .update({ status: 'rejected' })
      .eq('contribution_id', id)
  }

  const { data: updated } = await adminClient
    .from('contributions')
    .select('*')
    .eq('id', id)
    .single()

  return apiSuccess({ contribution: updated })
}

// DELETE /api/contributions/[id] — Delete draft contribution
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const adminClient = await createAdminClient()

  const { data: contribution } = await adminClient
    .from('contributions')
    .select('contributor_id, status')
    .eq('id', id)
    .single()

  if (!contribution) return apiError('Contribution not found', 404)

  if (contribution.contributor_id !== user.userId && user.role !== 'admin') {
    return apiError('Can only delete your own contributions', 403)
  }

  if (contribution.status !== 'draft') {
    return apiError('Can only delete draft contributions', 400)
  }

  // contribution_items have ON DELETE CASCADE, so just delete the contribution
  const { error } = await adminClient
    .from('contributions')
    .delete()
    .eq('id', id)

  if (error) return apiError(error.message, 500)

  return apiSuccess({ success: true })
}
