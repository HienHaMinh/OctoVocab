import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole } from '@/lib/rbac'

// GET /api/subsets — List all subsets
export async function GET() {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const supabase = await createClient()
  const { data: subsets, error } = await supabase
    .from('word_subsets')
    .select('*, creator:teachers!created_by(name, email)')
    .order('created_at', { ascending: false })

  if (error) return apiError(error.message, 500)
  return apiSuccess({ subsets: subsets || [] })
}

// POST /api/subsets — Create subset
export async function POST(req: Request) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const body = await req.json()
  const { name, description } = body

  if (!name?.trim()) return apiError('Name is required', 400)

  const adminClient = await createAdminClient()
  const { data: subset, error } = await adminClient
    .from('word_subsets')
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      created_by: user.userId,
    })
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiSuccess({ subset }, 201)
}
