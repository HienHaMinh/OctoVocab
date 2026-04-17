import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission, getCurrentUserRole } from '@/lib/rbac'

// GET /api/submission-requirements — defaults + per-user overrides
// Query: ?user_id=<uuid> (admin only) → list overrides for that user
//        otherwise → overrides for current user
export async function GET(req: NextRequest) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Unauthorized', 401)

  const supabase = await createClient()
  const targetUserId = req.nextUrl.searchParams.get('user_id') || user.userId

  // Non-admins can only query their own overrides
  if (targetUserId !== user.userId && user.role !== 'admin') {
    return apiError('Forbidden: only admin can view other users’ overrides', 403)
  }

  const [{ data: defaults }, { data: overrides }] = await Promise.all([
    supabase.from('submission_requirements').select('*').is('teacher_id', null),
    supabase.from('submission_requirements').select('*').eq('teacher_id', targetUserId),
  ])

  // Merge: per-user overrides take precedence over org defaults
  const merged: Record<string, any> = {}
  for (const rule of defaults || []) {
    merged[`${rule.scope}:${rule.rule_key}`] = rule
  }
  for (const rule of overrides || []) {
    merged[`${rule.scope}:${rule.rule_key}`] = rule
  }

  return apiSuccess({
    defaults: defaults || [],
    overrides: overrides || [],
    effective: Object.values(merged),
  })
}

// POST /api/submission-requirements — create or toggle a requirement (admin only)
// Body: { scope: 'item' | 'contribution', rule_key: string, rule_value?: any, teacher_id?: string }
// teacher_id omitted → org default | teacher_id set → per-user override
export async function POST(req: NextRequest) {
  const auth = await requirePermission('manage_users')
  if (!auth.authorized) return auth.response

  let body: {
    scope?: string
    rule_key?: string
    rule_value?: unknown
    teacher_id?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const { scope, rule_key, rule_value, teacher_id } = body

  if (!scope || !rule_key) return apiError('scope and rule_key required', 400)
  if (!['item', 'contribution'].includes(scope)) {
    return apiError('scope must be item or contribution', 400)
  }

  const adminClient = await createAdminClient()

  // Find existing row for this (scope, rule_key, teacher_id) bucket.
  // .is('teacher_id', null) for org default, .eq('teacher_id', X) for override.
  const existingQuery = adminClient
    .from('submission_requirements')
    .select('id')
    .eq('scope', scope)
    .eq('rule_key', rule_key)

  const { data: existing } = teacher_id
    ? await existingQuery.eq('teacher_id', teacher_id).maybeSingle()
    : await existingQuery.is('teacher_id', null).maybeSingle()

  const payload = {
    organization_id: null,
    scope,
    rule_key,
    rule_value: rule_value ?? true,
    is_default: !teacher_id,
    teacher_id: teacher_id || null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { data, error } = await adminClient
      .from('submission_requirements')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return apiError(error.message, 500)
    return apiSuccess({ requirement: data })
  }

  const { data, error } = await adminClient
    .from('submission_requirements')
    .insert(payload)
    .select()
    .single()
  if (error) return apiError(error.message, 500)
  return apiSuccess({ requirement: data })
}

// DELETE /api/submission-requirements — remove a requirement (admin only)
// Either ?id=<uuid> OR ?scope=...&rule_key=...[&teacher_id=...]
export async function DELETE(req: NextRequest) {
  const auth = await requirePermission('manage_users')
  if (!auth.authorized) return auth.response

  const id = req.nextUrl.searchParams.get('id')
  const scope = req.nextUrl.searchParams.get('scope')
  const ruleKey = req.nextUrl.searchParams.get('rule_key')
  const teacherId = req.nextUrl.searchParams.get('teacher_id')

  const adminClient = await createAdminClient()

  if (id) {
    const { error } = await adminClient
      .from('submission_requirements')
      .delete()
      .eq('id', id)
    if (error) return apiError(error.message, 500)
    return apiSuccess({ deleted: true })
  }

  if (!scope || !ruleKey) {
    return apiError('id OR (scope + rule_key) required', 400)
  }

  const query = adminClient
    .from('submission_requirements')
    .delete()
    .eq('scope', scope)
    .eq('rule_key', ruleKey)

  const { error } = teacherId
    ? await query.eq('teacher_id', teacherId)
    : await query.is('teacher_id', null)

  if (error) return apiError(error.message, 500)
  return apiSuccess({ deleted: true })
}
