import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import type { CefrLevel } from '@/types'

// GET /api/words — List words with filters, sorting, pagination
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const { searchParams } = req.nextUrl
  const page = parseInt(searchParams.get('page') || '1')
  const perPage = Math.min(parseInt(searchParams.get('per_page') || '50'), 200)
  const offset = (page - 1) * perPage
  const search = searchParams.get('search') || ''
  const cefrLevel = searchParams.get('cefr_level') as CefrLevel | null
  const sourceId = searchParams.get('source_id')
  const SORTABLE_COLUMNS = ['word', 'cefr_level', 'total_frequency', 'num_sources', 'vi_translation', 'created_at']
  const sortBy = SORTABLE_COLUMNS.includes(searchParams.get('sort_by') || '') ? searchParams.get('sort_by')! : 'total_frequency'
  const sortDir = searchParams.get('sort_dir') === 'asc'
  const untranslated = searchParams.get('untranslated') === '1'

  let query = supabase
    .from('word_summary')
    .select('*', { count: 'exact' })

  if (search) {
    // Escape special PostgREST characters to prevent filter injection
    const sanitized = search.replace(/[,().*\\]/g, '')
    if (sanitized) {
      query = query.or(`word.ilike.%${sanitized}%,vi_translation.ilike.%${sanitized}%`)
    }
  }
  if (cefrLevel) {
    query = query.eq('cefr_level', cefrLevel)
  }
  if (untranslated) {
    query = query.is('vi_translation', null)
  }

  // Source filter requires joining through word_source_frequency
  if (sourceId) {
    const { data: wordIds } = await supabase
      .from('word_source_frequency')
      .select('word_id')
      .eq('source_id', sourceId)

    if (wordIds && wordIds.length > 0) {
      query = query.in('id', wordIds.map((w) => w.word_id))
    } else {
      return apiSuccess({ words: [], total: 0, page, per_page: perPage })
    }
  }

  query = query.order(sortBy, { ascending: sortDir }).range(offset, offset + perPage - 1)

  const { data: words, count, error } = await query

  if (error) return apiError(error.message, 500)

  return apiSuccess({
    words: words || [],
    total: count || 0,
    page,
    per_page: perPage,
  })
}
