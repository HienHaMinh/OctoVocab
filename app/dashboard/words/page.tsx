import { createClient } from '@/lib/supabase/server'
import { WordTable } from '@/components/WordTable'
import { ExportButton } from '@/components/ExportButton'
import type { CefrLevel } from '@/types'

interface SearchParams {
  page?: string
  search?: string
  cefr?: string
  source_id?: string
  sort_by?: string
  sort_dir?: string
  untranslated?: string
  status?: string
}

export default async function WordsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const page = parseInt(params.page || '1')
  const perPage = 50
  const offset = (page - 1) * perPage

  let query = supabase
    .from('word_summary')
    .select('*', { count: 'exact' })

  // Default to active-only unless status filter is set
  if (params.status === 'archived') {
    query = query.eq('status', 'archived')
  } else if (params.status === 'all') {
    // Show all (active + archived)
  } else {
    query = query.eq('status', 'active')
  }

  if (params.search) {
    const sanitized = params.search.replace(/[,().*\\]/g, '')
    if (sanitized) {
      query = query.or(`word.ilike.%${sanitized}%,vi_translation.ilike.%${sanitized}%`)
    }
  }
  if (params.cefr) {
    query = query.eq('cefr_level', params.cefr as CefrLevel)
  }
  if (params.untranslated === '1') {
    query = query.is('vi_translation', null)
  }

  const SORTABLE_COLUMNS = ['word', 'cefr_level', 'total_frequency', 'num_sources', 'vi_translation', 'created_at']
  const sortBy = SORTABLE_COLUMNS.includes(params.sort_by || '') ? params.sort_by! : 'total_frequency'
  const sortDir = params.sort_dir !== 'asc'
  query = query.order(sortBy, { ascending: !sortDir })
  query = query.range(offset, offset + perPage - 1)

  const { data: words, count } = await query

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <div className="p-8 text-gray-500">Not authenticated</div>

  const { data: sources } = await supabase
    .from('sources')
    .select('id, name')
    .eq('teacher_id', user.id)
    .order('name')

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Words</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {count ? `${count.toLocaleString()} words in the database` : 'Loading...'}
          </p>
        </div>
        <ExportButton />
      </div>

      <WordTable
        initialWords={words || []}
        totalCount={count || 0}
        page={page}
        perPage={perPage}
        sources={sources || []}
        statusFilter={params.status || 'active'}
        currentFilters={{
          search: params.search || '',
          cefr_levels: params.cefr ? [params.cefr as CefrLevel] : [],
          source_id: params.source_id || null,
          sort_by: (params.sort_by as 'word' | 'frequency' | 'cefr_level' | 'created_at') || 'frequency',
          sort_dir: (params.sort_dir as 'asc' | 'desc') || 'desc',
        }}
      />
    </div>
  )
}
