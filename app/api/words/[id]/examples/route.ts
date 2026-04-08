import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole } from '@/lib/rbac'

type Params = { params: Promise<{ id: string }> }

// GET /api/words/[id]/examples — Get examples for a word
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params
  const supabase = await createClient()

  const { data: examples, error } = await supabase
    .from('word_examples')
    .select('*')
    .eq('word_id', id)
    .order('auto_extracted', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) return apiError(error.message, 500)
  return apiSuccess({ examples: examples || [] })
}

// POST /api/words/[id]/examples — Add manual example
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params
  const body = await req.json()
  const { example_sentence, source_url, source_name } = body

  if (!example_sentence?.trim()) return apiError('example_sentence required', 400)

  const adminClient = await createAdminClient()
  const { data: example, error } = await adminClient
    .from('word_examples')
    .insert({
      word_id: id,
      example_sentence: example_sentence.trim(),
      source_url: source_url || null,
      source_name: source_name || null,
      added_by: user.userId,
      auto_extracted: false,
    })
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiSuccess({ example }, 201)
}
