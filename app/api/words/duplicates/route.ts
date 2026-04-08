import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { findDuplicateClusters, suggestCanonical } from '@/lib/stemmer'
import { apiError, apiSuccess } from '@/lib/utils'

export interface DuplicateCluster {
  stem: string
  canonical: string
  words: {
    id: string
    word: string
    cefr_level: string
    total_frequency: number
    num_sources: number
    vi_translation: string | null
  }[]
}

// GET /api/words/duplicates — Find duplicate word clusters using stemmer
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  // Get all active words with their summary data
  const { data: words, error: wordsError } = await supabase
    .from('word_summary')
    .select('*')
    .eq('status', 'active')
    .order('word', { ascending: true })

  if (wordsError) {
    return apiError('Failed to fetch words: ' + wordsError.message, 500)
  }

  if (!words || words.length === 0) {
    return apiSuccess({ clusters: [], total_clusters: 0 })
  }

  // Extract word strings for stemmer
  const wordStrings = words.map((w) => w.word)

  // Find duplicate clusters using Porter stemmer
  const rawClusters = findDuplicateClusters(wordStrings)

  // Build enriched clusters with word metadata
  const wordMap = new Map(words.map((w) => [w.word.toLowerCase(), w]))

  const clusters: DuplicateCluster[] = rawClusters
    .map((cluster) => {
      const canonical = suggestCanonical(cluster.words)
      const enrichedWords = cluster.words
        .map((word) => {
          const w = wordMap.get(word.toLowerCase())
          if (!w) return null
          return {
            id: w.id,
            word: w.word,
            cefr_level: w.cefr_level,
            total_frequency: w.total_frequency || 0,
            num_sources: w.num_sources || 0,
            vi_translation: w.vi_translation,
          }
        })
        .filter(Boolean) as DuplicateCluster['words']

      if (enrichedWords.length < 2) return null

      return {
        stem: cluster.stem,
        canonical,
        words: enrichedWords.sort(
          (a, b) => b.total_frequency - a.total_frequency,
        ),
      }
    })
    .filter(Boolean) as DuplicateCluster[]

  // Sort clusters by total combined frequency (most impactful first)
  clusters.sort((a, b) => {
    const aFreq = a.words.reduce((sum, w) => sum + w.total_frequency, 0)
    const bFreq = b.words.reduce((sum, w) => sum + w.total_frequency, 0)
    return bFreq - aFreq
  })

  return apiSuccess({
    clusters,
    total_clusters: clusters.length,
  })
}
