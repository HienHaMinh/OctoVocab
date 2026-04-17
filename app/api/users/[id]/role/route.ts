import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

type Params = { params: Promise<{ id: string }> }

// PUT /api/users/[id]/role — Update user role (admin only)
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requirePermission('manage_users')
  if (!auth.authorized) return auth.response

  const { id } = await params
  const body = await req.json()
  const { role } = body

  if (!['admin', 'editor', 'contributor'].includes(role)) {
    return apiError('Invalid role. Must be admin, editor, or contributor.', 400)
  }

  // Cannot demote self
  if (id === auth.user.userId && role !== 'admin') {
    return apiError('Cannot demote yourself', 400)
  }

  const adminClient = await createAdminClient()

  const { data: user, error } = await adminClient
    .from('teachers')
    .update({ role })
    .eq('id', id)
    .select()
    .single()

  if (error) return apiError(error.message, 500)

  // Audit log
  await adminClient.from('audit_logs').insert({
    teacher_id: auth.user.userId,
    action: 'role_change',
    resource_id: id,
    resource_type: 'teacher',
    new_value: role,
  })

  return apiSuccess({ user })
}
