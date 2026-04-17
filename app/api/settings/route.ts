import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission, getCurrentUserRole } from '@/lib/rbac'

// GET /api/settings — Get org settings (all authenticated users can read)
export async function GET() {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Unauthorized', 401)

  const supabase = await createClient()

  const { data: settings } = await supabase
    .from('org_settings')
    .select('setting_key, setting_value')

  // Return as a key-value map for easy consumption
  const settingsMap: Record<string, unknown> = {}
  for (const s of settings || []) {
    settingsMap[s.setting_key] = s.setting_value
  }

  return apiSuccess({ settings: settingsMap })
}

// PUT /api/settings — Update a setting (admin only)
export async function PUT(req: NextRequest) {
  const auth = await requirePermission('manage_users')
  if (!auth.authorized) return auth.response

  const body = await req.json()
  const { key, value } = body

  if (!key) return apiError('key is required', 400)

  const adminClient = await createAdminClient()

  // Upsert setting
  const { error } = await adminClient
    .from('org_settings')
    .upsert({
      organization_id: null, // Single-org for now
      setting_key: key,
      setting_value: value,
      updated_by: auth.user.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,setting_key' })

  if (error) return apiError(error.message, 500)

  return apiSuccess({ updated: true })
}
