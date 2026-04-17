import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole } from '@/lib/rbac'

type Params = { params: Promise<{ id: string }> }

// GET /api/words/[id]/synonyms
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const { data: synonyms } = await supabase
    .from('word_synonyms')
    .select('*, linked_word:words!linked_word_id(id, word, cefr_level)')
    .eq('word_id', id)
    .order('created_at', { ascending: false })

  return apiSuccess({ synonyms: synonyms || [] })
}

// POST /api/words/[id]/synonyms — Add a synonym
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user = await getCurrentUserRole()
  if (!user) return apiError('Unauthorized', 401)

  const body = await req.json()
  const { synonym_text } = body

  if (!synonym_text?.trim()) return apiError('synonym_text required', 400)

  const adminClient = await createAdminClient()

  // Check if synonym_text matches an existing word in DB
  const { data: linkedWord } = await adminClient
    .from('words')
    .select('id')
    .eq('word', synonym_text.toLowerCase().trim())
    .eq('status', 'active')
    .single()

  const { data: synonym, error } = await adminClient
    .from('word_synonyms')
    .insert({
      word_id: id,
      synonym_text: synonym_text.toLowerCase().trim(),
      linked_word_id: linkedWord?.id || null,
      created_by: user.userId,
    })
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiSuccess({ synonym })
}

// DELETE /api/words/[id]/synonyms — Delete a synonym by synonym ID
export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Unauthorized', 401)

  const synonymId = new URL(req.url).searchParams.get('synonym_id')
  if (!synonymId) return apiError('synonym_id required', 400)

  const adminClient = await createAdminClient()
  const { error } = await adminClient
    .from('word_synonyms')
    .delete()
    .eq('id', synonymId)

  if (error) return apiError(error.message, 500)
  return apiSuccess({ deleted: true })
}
