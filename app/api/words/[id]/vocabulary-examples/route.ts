import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiError, apiSuccess } from '@/lib/utils'

type Params = { params: Promise<{ id: string }> }

interface VocabComExample {
  sentence: string
  author: string
  title: string
  domain: string
  corpus: string
}

const VOCAB_BASE = 'https://corpus.vocabulary.com/api/1.0/examples.json'

// Domain configs: code, label, maxResults
const DOMAINS = [
  { code: '',  label: 'literature',  max: 5 }, // default = literature (fiction + non-fiction)
  { code: 'N', label: 'news',        max: 3 },
  { code: 'T', label: 'technology',  max: 2 },
  { code: 'M', label: 'science',     max: 2 },
  { code: 'S', label: 'general',     max: 2 },
] as const

const DOMAIN_MAP: Record<string, string> = {
  F: 'fiction',
  A: 'non-fiction',
  N: 'news',
  T: 'technology',
  M: 'science',
  S: 'general',
}

// GET /api/words/[id]/vocabulary-examples — Fetch examples from vocabulary.com
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Not authenticated', 401)

  const { id } = await params

  const { data: word } = await supabase
    .from('words')
    .select('word')
    .eq('id', id)
    .single()

  if (!word) return apiError('Word not found', 404)

  const q = encodeURIComponent(word.word)

  try {
    // Fetch all domains in parallel
    const fetches = DOMAINS.map(({ code, max }) => {
      const domainParam = code ? `&domain=${code}` : ''
      return fetch(
        `${VOCAB_BASE}?query=${q}&maxResults=${max}&startOffset=0&filter=0${domainParam}`,
        { next: { revalidate: 86400 } }
      ).then(r => r.ok ? r.json() : { sentences: [] })
        .catch(() => ({ sentences: [] }))
    })

    const results = await Promise.all(fetches)

    const examples: VocabComExample[] = []
    const seen = new Set<string>() // deduplicate sentences across domains

    results.forEach((data, i) => {
      const domainConfig = DOMAINS[i]
      for (const s of (data.sentences || [])) {
        // Skip duplicates (same sentence can appear in multiple domain queries)
        const key = s.sentence?.slice(0, 80)
        if (seen.has(key)) continue
        seen.add(key)

        const rawDomain = s.volume?.domain || domainConfig.code || 'F'
        examples.push({
          sentence: s.sentence,
          author: s.volume?.author || '',
          title: s.volume?.title || '',
          domain: DOMAIN_MAP[rawDomain] || domainConfig.label,
          corpus: s.volume?.corpus?.name || domainConfig.label,
        })
      }
    })

    return apiSuccess({ word: word.word, examples, total: examples.length })
  } catch (err) {
    console.error('vocabulary.com fetch failed:', err)
    return apiSuccess({ word: word.word, examples: [], total: 0, error: 'Failed to fetch examples' })
  }
}
