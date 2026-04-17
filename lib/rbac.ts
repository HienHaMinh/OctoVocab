import { createClient } from '@/lib/supabase/server'
import type { RoleType } from '@/types'

export type Permission =
  | 'upload_source'
  | 'submit_contribution'
  | 'edit_words_directly'
  | 'approve_contributions'
  | 'delete_words'
  | 'manage_users'
  | 'create_subsets'
  | 'view_contributions_all'

const ROLE_PERMISSIONS: Record<RoleType, Permission[]> = {
  admin: [
    'upload_source',
    'submit_contribution',
    'edit_words_directly',
    'approve_contributions',
    'delete_words',
    'manage_users',
    'create_subsets',
    'view_contributions_all',
  ],
  editor: [
    'upload_source',
    'submit_contribution',
    'edit_words_directly',
    'approve_contributions',
    'create_subsets',
    'view_contributions_all',
  ],
  contributor: [
    'upload_source',
    'submit_contribution',
    'create_subsets',
  ],
  student: [],
}

export function hasPermission(role: RoleType, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function hasAnyPermission(role: RoleType, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

export async function getCurrentUserRole(): Promise<{
  userId: string
  role: RoleType
  email: string
  name: string | null
} | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: teacher } = await supabase
    .from('teachers')
    .select('id, role, email, name')
    .eq('id', user.id)
    .single()

  if (!teacher) return null

  return {
    userId: teacher.id,
    role: teacher.role as RoleType,
    email: teacher.email,
    name: teacher.name,
  }
}

export async function requirePermission(permission: Permission): Promise<
  | { authorized: true; user: { userId: string; role: RoleType; email: string; name: string | null } }
  | { authorized: false; response: Response }
> {
  const user = await getCurrentUserRole()
  if (!user) {
    return {
      authorized: false,
      response: Response.json({ error: 'Not authenticated' }, { status: 401 }),
    }
  }
  if (!hasPermission(user.role, permission)) {
    return {
      authorized: false,
      response: Response.json(
        { error: `Forbidden: requires '${permission}' permission` },
        { status: 403 }
      ),
    }
  }
  return { authorized: true, user }
}
