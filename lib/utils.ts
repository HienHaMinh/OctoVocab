import { isStopWord, isRealWord } from './stopwords'
import { stem } from './stemmer'
import { classifyWordBuiltin } from './cefr-lists'
import type { CefrLevel } from '@/types'
import crypto from 'crypto'

// ============================================================================
// TEXT PROCESSING
// ============================================================================

// Tokenize and clean text into vocabulary words
export function extractVocabulary(text: string): Map<string, number> {
  const wordFreq = new Map<string, number>()

  // Tokenize: split on whitespace and punctuation, lowercase
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)

  for (const token of tokens) {
    const word = token.trim().replace(/^'+|'+$/g, '') // strip leading/trailing apostrophes

    if (!isRealWord(word)) continue
    if (isStopWord(word)) continue

    wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
  }

  return wordFreq
}

// Extract vocabulary with character positions in the original text (for conflict source display)
export function extractVocabularyWithPositions(text: string): Map<string, { freq: number; positions: number[] }> {
  const result = new Map<string, { freq: number; positions: number[] }>()
  const lowerText = text.toLowerCase()

  // Find word boundaries using regex to preserve positions
  const wordRegex = /[a-z'-]+/gi
  let match: RegExpExecArray | null

  while ((match = wordRegex.exec(lowerText)) !== null) {
    const raw = match[0].replace(/^'+|'+$/g, '')
    if (!isRealWord(raw)) continue
    if (isStopWord(raw)) continue

    const existing = result.get(raw)
    if (existing) {
      existing.freq++
      // Store up to 5 positions (enough for human verification, saves space)
      if (existing.positions.length < 5) {
        existing.positions.push(match.index)
      }
    } else {
      result.set(raw, { freq: 1, positions: [match.index] })
    }
  }

  return result
}

// ============================================================================
// CONTENT HASH (for deduplication)
// ============================================================================

export function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex')
}

// ============================================================================
// CEFR CLASSIFICATION (built-in first, AI fallback)
// ============================================================================

export function classifyWordsFast(words: string[]): {
  classified: Array<{ word: string; cefr_level: CefrLevel; source: 'builtin' }>
  needsAI: string[]
} {
  const classified: Array<{ word: string; cefr_level: CefrLevel; source: 'builtin' }> = []
  const needsAI: string[] = []

  for (const word of words) {
    const level = classifyWordBuiltin(word)
    if (level) {
      classified.push({ word, cefr_level: level, source: 'builtin' })
    } else {
      // Try the stem (e.g., "running" → "run" → B1)
      const stemmed = stem(word)
      const stemLevel = classifyWordBuiltin(stemmed)
      if (stemLevel) {
        classified.push({ word, cefr_level: stemLevel, source: 'builtin' })
      } else {
        needsAI.push(word)
      }
    }
  }

  return { classified, needsAI }
}

// ============================================================================
// FORMATTING
// ============================================================================

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDatetime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}

// ============================================================================
// EXPORT
// ============================================================================

export function wordsToCSV(
  words: Array<{
    word: string
    vi_translation?: string | null
    cefr_level?: string
    total_frequency?: number
  }>,
  columns: string[]
): string {
  const header = columns.join(',')

  const rows = words.map((w) => {
    return columns
      .map((col) => {
        let val = ''
        if (col === 'word') val = w.word
        else if (col === 'vi_translation') val = w.vi_translation || ''
        else if (col === 'cefr_level') val = w.cefr_level || ''
        else if (col === 'frequency') val = String(w.total_frequency || 0)
        // Escape commas and quotes in CSV
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = `"${val.replace(/"/g, '""')}"`
        }
        return val
      })
      .join(',')
  })

  return [header, ...rows].join('\n')
}

// ============================================================================
// API HELPERS
// ============================================================================

export function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status })
}

export function apiSuccess<T>(data: T, status = 200) {
  return Response.json(data, { status })
}

// Chunk array into batches
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// ============================================================================
// CONTRIBUTION HELPERS
// ============================================================================

/**
 * Check if a word is likely a proper noun by checking if it appears
 * capitalized (not at sentence start) in the source text.
 */
export function isLikelyProperNoun(word: string, sourceText: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
  const matches = sourceText.match(regex)
  if (!matches || matches.length === 0) return false

  const capitalizedCount = matches.filter(m => m[0] === m[0].toUpperCase()).length
  const ratio = capitalizedCount / matches.length

  // Check it's not just at sentence starts
  const sentenceStartRegex = new RegExp(`[.!?]\\s+${escaped}\\b`, 'gi')
  const sentenceStartCount = (sourceText.match(sentenceStartRegex) || []).length

  const nonSentenceStartCapitalized = capitalizedCount - sentenceStartCount
  return nonSentenceStartCapitalized > 0 && ratio > 0.8
}

/**
 * Extract the sentence containing a specific word from text.
 * Returns the first matching sentence, or null.
 */
export function extractSentenceForWord(word: string, text: string): string | null {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\b${escaped}\\b`, 'i')

  for (const sentence of sentences) {
    if (regex.test(sentence)) {
      const trimmed = sentence.trim()
      if (trimmed.length > 300) continue
      if (trimmed.length < 10) continue
      return trimmed
    }
  }
  return null
}
