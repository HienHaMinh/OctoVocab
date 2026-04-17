import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole, hasPermission } from '@/lib/rbac'

// GET /api/contributions — List contributions
export async function GET(req: Request) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const supabase = await createClient()
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const page = parseInt(url.searchParams.get('page') || '1')
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 50)
  const offset = (page - 1) * perPage

  let query = supabase
    .from('contributions')
    .select(
      '*, contributor:teachers!contributor_id(id, name, email), source:sources!source_id(id, name, source_type)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + perPage - 1)

  // Contributors only see their own; editors/admins see all
  if (!hasPermission(user.role, 'view_contributions_all')) {
    query = query.eq('contributor_id', user.userId)
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data: contributions, count, error } = await query

  if (error) return apiError(error.message, 500)

  return apiSuccess({
    contributions: contributions || [],
    total: count || 0,
    page,
    per_page: perPage,
  })
}
