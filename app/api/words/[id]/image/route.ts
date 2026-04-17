import { NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'
import { getCurrentUserRole } from '@/lib/rbac'
import { searchWordImage } from '@/lib/images'

type Params = { params: Promise<{ id: string }> }

// GET /api/words/[id]/image — Get image for a word
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params
  const supabase = await createClient()

  const { data: image } = await supabase
    .from('word_images')
    .select('*')
    .eq('word_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return apiSuccess({ image: image || null })
}

// POST /api/words/[id]/image — Add or auto-search image
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params
  const body = await req.json()
  const { image_url, auto_search } = body

  const adminClient = await createAdminClient()

  let url = image_url
  let source = 'manual'
  let caption = ''

  if (auto_search) {
    // Get word text
    const { data: word } = await adminClient
      .from('words')
      .select('word')
      .eq('id', id)
      .single()

    if (!word) return apiError('Word not found', 404)

    const result = await searchWordImage(word.word)
    if (!result) return apiSuccess({ image: null, message: 'No image found' })

    url = result.url
    source = result.source
    caption = result.caption
  }

  if (!url) return apiError('image_url or auto_search required', 400)

  const { data: image, error } = await adminClient
    .from('word_images')
    .insert({
      word_id: id,
      image_url: url,
      image_source: source,
      caption: caption || null,
      added_by: user.userId,
    })
    .select()
    .single()

  if (error) return apiError(error.message, 500)
  return apiSuccess({ image }, 201)
}

// DELETE /api/words/[id]/image — Remove image
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUserRole()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params
  const adminClient = await createAdminClient()

  const { error } = await adminClient
    .from('word_images')
    .delete()
    .eq('word_id', id)

  if (error) return apiError(error.message, 500)
  return apiSuccess({ deleted: true })
}
