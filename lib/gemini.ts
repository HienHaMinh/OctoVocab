import { GoogleGenerativeAI } from '@google/generative-ai'
import type { CefrLevel } from '@/types'

let _genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured')
    _genAI = new GoogleGenerativeAI(apiKey)
  }
  return _genAI
}

// ============================================================================
// FILE EXTRACTION (PDF or image, for cross-verification)
// ============================================================================

export async function extractTextFromFileGemini(
  base64Data: string,
  mimeType: string = 'application/pdf'
): Promise<{
  text: string
  estimated_accuracy: number
}> {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash' })
  const isImage = mimeType.startsWith('image/')

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    },
    {
      text: isImage
        ? `Extract ALL text from this image.
Return only the raw text content, preserving paragraph structure.
Do not add any commentary, formatting, or summaries.
Just the text as it appears in the image.`
        : `Extract ALL text from this PDF document.
Return only the raw text content, preserving paragraph structure.
Do not add any commentary, formatting, or summaries.
Just the text as it appears in the document.`,
    },
  ])

  const text = result.response.text()

  return {
    text,
    estimated_accuracy: isImage ? 0.90 : 0.95,
  }
}

/** @deprecated Use extractTextFromFileGemini instead */
export const extractTextFromPdfGemini = (base64Pdf: string) =>
  extractTextFromFileGemini(base64Pdf, 'application/pdf')

// ============================================================================
// CEFR CLASSIFICATION
// ============================================================================

export async function classifyWordsCefr(words: string[]): Promise<
  Array<{
    word: string
    cefr_level: CefrLevel
    confidence: number
  }>
> {
  if (words.length === 0) return []

  // Process in batches of 50
  if (words.length > 50) {
    const results: Array<{ word: string; cefr_level: CefrLevel; confidence: number }> = []
    for (let i = 0; i < words.length; i += 50) {
      const batch = words.slice(i, i + 50)
      const batchResults = await classifyWordsCefr(batch)
      results.push(...batchResults)
    }
    return results
  }

  const wordList = words.join(', ')
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })

  const result = await model.generateContent(
    `Classify each English word by CEFR level (A1, A2, B1, B2, C1, C2).

Words to classify: ${wordList}

Rules:
- A1: Basic survival vocabulary (house, eat, go, big)
- A2: Elementary everyday words (journey, prepare, probably)
- B1: Intermediate vocabulary (consequence, environment, negotiate)
- B2: Upper-intermediate (ambiguous, fluctuate, pragmatic)
- C1: Advanced academic/professional (ameliorate, paradigm, ostensibly)
- C2: Near-native mastery (perspicacious, recondite, tendentious)

Respond ONLY with valid JSON array:
[{"word":"example","cefr":"B1","confidence":0.9}, ...]`
  )

  const text = result.response.text()

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      word: string
      cefr: string
      confidence: number
    }>

    return parsed.map((item) => ({
      word: item.word.toLowerCase(),
      cefr_level: (item.cefr as CefrLevel) || 'Unclassified',
      confidence: item.confidence || 0.7,
    }))
  } catch (err) {
    console.error('Failed to parse CEFR classification response:', err)
    return words.map((word) => ({
      word,
      cefr_level: 'Unclassified' as CefrLevel,
      confidence: 0,
    }))
  }
}

// ============================================================================
// VIETNAMESE TRANSLATION
// ============================================================================

export async function translateWordsToVietnamese(words: string[]): Promise<
  Array<{
    word: string
    vi_translation: string
    confidence: number
  }>
> {
  if (words.length === 0) return []

  // Process in parallel batches of 20
  if (words.length > 20) {
    const batches: string[][] = []
    for (let i = 0; i < words.length; i += 20) {
      batches.push(words.slice(i, i + 20))
    }
    const results = await Promise.allSettled(
      batches.map((batch) => translateWordsToVietnamese(batch))
    )
    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  }

  const wordList = words.join(', ')
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })

  const result = await model.generateContent(
    `Translate these English words to Vietnamese.
Provide the most common/natural Vietnamese equivalent for each.
Context: These are vocabulary words from English learning materials.

Words: ${wordList}

Respond ONLY with valid JSON array:
[{"word":"example","vi":"ví dụ","confidence":0.95}, ...]`
  )

  const text = result.response.text()

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      word: string
      vi: string
      confidence: number
    }>

    return parsed.map((item) => ({
      word: item.word.toLowerCase(),
      vi_translation: item.vi,
      confidence: item.confidence || 0.8,
    }))
  } catch (err) {
    console.error('Failed to parse translation response:', err)
    return []
  }
}
