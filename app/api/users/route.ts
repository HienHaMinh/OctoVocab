import { createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

// GET /api/users — List all users (admin only)
export async function GET() {
  const auth = await requirePermission('manage_users')
  if (!auth.authorized) return auth.response

  const adminClient = await createAdminClient()

  const { data: teachers, error } = await adminClient
    .from('teachers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return apiError(error.message, 500)

  // Get aggregated stats
  const usersWithStats = await Promise.all(
    (teachers || []).map(async (t) => {
      const [{ count: sourcesCount }, { count: contributionsCount }] = await Promise.all([
        adminClient.from('sources').select('*', { count: 'exact', head: true }).eq('uploaded_by', t.id),
        adminClient.from('contributions').select('*', { count: 'exact', head: true }).eq('contributor_id', t.id),
      ])
      return {
        ...t,
        sources_count: sourcesCount || 0,
        contributions_count: contributionsCount || 0,
      }
    })
  )

  return apiSuccess({ users: usersWithStats })
}
