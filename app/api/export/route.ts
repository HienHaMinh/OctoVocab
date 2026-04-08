import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiError, wordsToCSV } from '@/lib/utils'
import type { CefrLevel } from '@/types'

// GET /api/export — Export to CSV or PDF
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const { searchParams } = req.nextUrl
  const format = searchParams.get('format') || 'csv'
  const columnsParam = searchParams.get('columns') || 'word,vi_translation,cefr_level,frequency'
  const columns = columnsParam.split(',')
  const cefrFilter = searchParams.get('cefr_level') as CefrLevel | null

  // Build query
  let query = supabase
    .from('word_summary')
    .select('*')
    .eq('status', 'active')

  if (cefrFilter) {
    query = query.eq('cefr_level', cefrFilter)
  }

  query = query.order('total_frequency', { ascending: false }).limit(10000)

  const { data: words, error } = await query
  if (error) return apiError(error.message, 500)

  if (format === 'csv') {
    const csv = wordsToCSV(
      (words || []).map((w) => ({
        word: w.word,
        vi_translation: w.vi_translation,
        cefr_level: w.cefr_level,
        total_frequency: w.total_frequency,
      })),
      columns
    )

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vocab-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  }

  // PDF export — return HTML that the browser can print to PDF
  if (format === 'pdf') {
    // Escape HTML to prevent XSS
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    const rows = (words || [])
      .map(
        (w) => `
      <tr>
        <td>${esc(w.word)}</td>
        <td>${esc(w.vi_translation || '')}</td>
        <td>${esc(w.cefr_level)}</td>
        <td>${w.total_frequency}</td>
        <td>${w.num_sources}</td>
      </tr>`
      )
      .join('\n')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vocabulary Export — OctoPrep</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #222; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 11px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f4f8; text-align: left; padding: 6px 10px; border-bottom: 2px solid #ddd; font-size: 11px; text-transform: uppercase; }
    td { padding: 5px 10px; border-bottom: 1px solid #eee; }
    tr:hover { background: #f9fafb; }
    @media print { @page { size: A4; margin: 15mm; } }
  </style>
</head>
<body>
  <h1>🐙 OctoPrep Vocabulary Database</h1>
  <p class="meta">Exported: ${new Date().toLocaleDateString('vi-VN')} · ${words?.length || 0} words</p>
  <table>
    <thead>
      <tr>
        <th>Word</th>
        <th>Vietnamese</th>
        <th>CEFR</th>
        <th>Frequency</th>
        <th>Sources</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return apiError('Invalid format. Use csv or pdf.')
}
