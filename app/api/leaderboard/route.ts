import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'

// GET /api/leaderboard — Top contributors and editors
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Not authenticated', 401)

  const adminClient = await createAdminClient()

  // Try RPC functions first, fall back to manual queries
  let topContributors: any[] = []
  let topEditors: any[] = []

  try {
    const { data: contributors } = await adminClient.rpc('get_top_contributors', { limit_count: 10 })
    topContributors = contributors || []
  } catch {
    // Fallback: manual query
    const { data } = await adminClient
      .from('contributions')
      .select('contributor_id, contributor:teachers!contributor_id(name, email)')
      .eq('status', 'approved')

    if (data) {
      const counts: Record<string, { name: string; email: string; count: number }> = {}
      for (const c of data) {
        const id = c.contributor_id
        const t = c.contributor as any
        if (!counts[id]) counts[id] = { name: t?.name || '', email: t?.email || '', count: 0 }
        counts[id].count++
      }
      topContributors = Object.values(counts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(c => ({ name: c.name, email: c.email, approved_words: c.count, sources_uploaded: 0 }))
    }
  }

  try {
    const { data: editors } = await adminClient.rpc('get_top_editors', { limit_count: 10 })
    topEditors = editors || []
  } catch {
    topEditors = []
  }

  return apiSuccess({ top_contributors: topContributors, top_editors: topEditors })
}
