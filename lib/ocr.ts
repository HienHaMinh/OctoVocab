import { Mistral } from '@mistralai/mistralai'
// @ts-expect-error — pdf-parse has no built-in TS types
import pdfParse from 'pdf-parse'
import { extractTextFromFileGemini } from '@/lib/gemini'

// ============================================================================
// MISTRAL CLIENT (singleton)
// ============================================================================

let _mistral: Mistral | null = null

function getMistralClient(): Mistral {
  if (!_mistral) {
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) throw new Error('MISTRAL_API_KEY not configured')
    _mistral = new Mistral({ apiKey })
  }
  return _mistral
}

// ============================================================================
// LAYER 1: pdf-parse (free, instant, digital PDFs)
// ============================================================================

interface PdfParseResult {
  text: string
  pageCount: number
}

async function extractWithPdfParse(buffer: Buffer): Promise<PdfParseResult> {
  const data = await pdfParse(buffer)
  return {
    text: data.text || '',
    pageCount: data.numpages || 0,
  }
}

// ============================================================================
// QUALITY GATE: Is pdf-parse output usable?
// ============================================================================

function isExtractionUsable(text: string, pageCount: number): boolean {
  const trimmed = text.trim()

  // Empty or whitespace-only → scanned PDF
  if (!trimmed) return false

  // Less than 50 chars per page on average → likely garbled/scanned
  if (pageCount > 0 && trimmed.length / pageCount < 50) return false

  // High ratio of non-printable characters (control chars, not Unicode letters)
  // Allow Vietnamese/UTF-8 text — only flag actual garbled output
  const garbageCount = (trimmed.match(/[\x00-\x08\x0E-\x1F\x7F\uFFFD]/g) || []).length
  if (trimmed.length > 0 && garbageCount / trimmed.length > 0.1) return false

  return true
}

// ============================================================================
// LAYER 2: Mistral OCR (scanned PDFs + images)
// ============================================================================

export async function extractWithMistralOcr(
  base64Data: string,
  mimeType: string = 'application/pdf'
): Promise<{
  text: string
  estimated_accuracy: number
}> {
  const client = getMistralClient()
  const isImage = mimeType.startsWith('image/')

  const result = await client.ocr.process({
    model: 'mistral-ocr-latest',
    document: isImage
      ? { type: 'image_url', imageUrl: `data:${mimeType};base64,${base64Data}` }
      : { type: 'document_url', documentUrl: `data:application/pdf;base64,${base64Data}` },
  })

  // Concatenate markdown from all pages
  const text = result.pages
    .map((page) => page.markdown)
    .join('\n\n')

  return {
    text,
    estimated_accuracy: isImage ? 0.90 : 0.95,
  }
}

// ============================================================================
// MAIN ORCHESTRATOR: 3-tier extraction
// When pdf-parse fails → Mistral + Gemini run in parallel
// Mistral = primary text, Gemini = cross-verification text
// ============================================================================

export interface ExtractionResult {
  text: string
  method: 'pdf-parse' | 'mistral-ocr'
  estimated_accuracy: number
  /** Gemini extraction for cross-verification (only when Mistral was used) */
  geminiText?: string
}

export async function extractTextFromPdf(base64Pdf: string): Promise<ExtractionResult> {
  // Layer 1: Try pdf-parse first (free, instant)
  const buffer = Buffer.from(base64Pdf, 'base64')
  console.log(`[ocr] Starting extraction, PDF size: ${buffer.length} bytes`)

  try {
    const parseResult = await extractWithPdfParse(buffer)
    console.log(`[ocr] pdf-parse result: ${parseResult.text.length} chars, ${parseResult.pageCount} pages`)

    if (isExtractionUsable(parseResult.text, parseResult.pageCount)) {
      console.log('[ocr] pdf-parse output usable — using Layer 1 (free)')
      return {
        text: parseResult.text,
        method: 'pdf-parse',
        estimated_accuracy: 0.9,
      }
    }

    // Log why it failed the quality gate
    const trimmed = parseResult.text.trim()
    const charsPerPage = parseResult.pageCount > 0 ? trimmed.length / parseResult.pageCount : 0
    const garbageCount = (trimmed.match(/[\x00-\x08\x0E-\x1F\x7F\uFFFD]/g) || []).length
    const garbageRatio = trimmed.length > 0 ? garbageCount / trimmed.length : 0
    console.log(`[ocr] pdf-parse quality FAILED: chars/page=${charsPerPage.toFixed(0)}, garbageRatio=${garbageRatio.toFixed(2)}, textLen=${trimmed.length}`)
    console.log('[ocr] Falling back to Mistral + Gemini (parallel)')
  } catch (err: any) {
    console.error('[ocr] pdf-parse threw error:', err?.message || err)
    console.log('[ocr] Falling back to Mistral + Gemini (parallel)')
  }

  // Layer 2: Mistral OCR + Gemini OCR in parallel
  // Mistral = primary text, Gemini = cross-verification
  const [mistralResult, geminiResult] = await Promise.allSettled([
    extractWithMistralOcr(base64Pdf),
    extractTextFromFileGemini(base64Pdf, 'application/pdf'),
  ])

  if (mistralResult.status === 'rejected') {
    // Mistral failed — use Gemini as fallback for primary text
    if (geminiResult.status === 'fulfilled') {
      console.log('[ocr] Mistral failed, using Gemini as primary')
      return {
        text: geminiResult.value.text,
        method: 'mistral-ocr', // still tag as OCR path
        estimated_accuracy: geminiResult.value.estimated_accuracy,
      }
    }
    throw new Error('Both Mistral and Gemini OCR failed')
  }

  return {
    text: mistralResult.value.text,
    method: 'mistral-ocr',
    estimated_accuracy: mistralResult.value.estimated_accuracy,
    geminiText: geminiResult.status === 'fulfilled' ? geminiResult.value.text : undefined,
  }
}

// ============================================================================
// IMAGE EXTRACTION: Mistral + Gemini in parallel (images always need OCR)
// ============================================================================

export async function extractTextFromImage(
  base64Image: string,
  mimeType: string
): Promise<ExtractionResult> {
  console.log(`[ocr] Starting image extraction, mimeType: ${mimeType}`)

  const [mistralResult, geminiResult] = await Promise.allSettled([
    extractWithMistralOcr(base64Image, mimeType),
    extractTextFromFileGemini(base64Image, mimeType),
  ])

  if (mistralResult.status === 'rejected') {
    if (geminiResult.status === 'fulfilled') {
      console.log('[ocr] Mistral image OCR failed, using Gemini as primary')
      return {
        text: geminiResult.value.text,
        method: 'mistral-ocr',
        estimated_accuracy: geminiResult.value.estimated_accuracy,
      }
    }
    throw new Error('Both Mistral and Gemini image OCR failed')
  }

  console.log(`[ocr] Image extraction done: ${mistralResult.value.text.length} chars from Mistral`)

  return {
    text: mistralResult.value.text,
    method: 'mistral-ocr',
    estimated_accuracy: mistralResult.value.estimated_accuracy,
    geminiText: geminiResult.status === 'fulfilled' ? geminiResult.value.text : undefined,
  }
}
