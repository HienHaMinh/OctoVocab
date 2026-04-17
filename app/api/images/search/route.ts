import { NextRequest } from 'next/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole } from '@/lib/rbac'
import { searchWordImage } from '@/lib/images'

// GET /api/images/search?q=word — Search for a stock image by keyword
export async function GET(req: NextRequest) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const query = req.nextUrl.searchParams.get('q')
  if (!query) return apiError('q parameter required', 400)

  const result = await searchWordImage(query)
  if (!result) return apiSuccess({ image: null })

  return apiSuccess({ image: result })
}
