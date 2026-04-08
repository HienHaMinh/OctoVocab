import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { translateWordsToVietnamese } from '@/lib/gemini'
import { apiError, apiSuccess } from '@/lib/utils'
import { requirePermission } from '@/lib/rbac'

// POST /api/words/translate — Batch translate words (editor/admin only)
export async function POST(req: NextRequest) {
  const auth = await requirePermission('edit_words_directly')
  if (!auth.authorized) return auth.response

  const supabaseAdmin = await createAdminClient()
  const user = { id: auth.user.userId }

  let body: any
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }
  const { word_ids } = body

  if (!word_ids?.length) return apiError('word_ids is required')
  if (word_ids.length > 20) return apiError('Max 20 words per request')

  // Get word texts
  const { data: words, error } = await supabaseAdmin
    .from('words')
    .select('id, word')
    .in('id', word_ids)

  if (error || !words) return apiError('Failed to fetch words', 500)

  // Translate
  const wordTexts = words.map((w) => w.word)
  const translations = await translateWordsToVietnamese(wordTexts)

  const wordIdMap = new Map(words.map((w) => [w.word, w.id]))

  // Save translations to DB
  const inserts = translations
    .filter((t) => wordIdMap.has(t.word))
    .map((t) => ({
      word_id: wordIdMap.get(t.word)!,
      teacher_id: user.id,
      vi_translation: t.vi_translation,
      confidence: t.confidence,
      approved: false,
    }))

  if (inserts.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('word_translations')
      .upsert(inserts, { onConflict: 'word_id,teacher_id' })

    if (insertError) {
      console.error('Translation insert error:', insertError)
      // Non-fatal: return what was translated even if DB insert failed
    }
  }

  return apiSuccess({
    translations: translations.map((t) => ({
      word_id: wordIdMap.get(t.word),
      word: t.word,
      vi_translation: t.vi_translation,
      confidence: t.confidence,
    })),
  })
}
