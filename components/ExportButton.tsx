'use client'

import { useState } from 'react'
import { CEFR_LEVELS } from '@/lib/cefr-lists'
import type { CefrLevel } from '@/types'

const COLUMN_OPTIONS = [
  { key: 'word', label: 'Word', default: true },
  { key: 'vi_translation', label: 'Vietnamese', default: true },
  { key: 'cefr_level', label: 'CEFR', default: true },
  { key: 'frequency', label: 'Frequency', default: true },
  { key: 'sources', label: 'Sources', default: false },
]

export function ExportButton() {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv')
  const [columns, setColumns] = useState<string[]>(
    COLUMN_OPTIONS.filter((c) => c.default).map((c) => c.key)
  )
  const [cefrFilter, setCefrFilter] = useState<CefrLevel | ''>('')
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)

    const params = new URLSearchParams()
    params.set('format', format)
    params.set('columns', columns.join(','))
    if (cefrFilter) params.set('cefr_level', cefrFilter)

    try {
      const res = await fetch(`/api/export?${params}`)
      if (!res.ok) throw new Error('Export failed')

      if (format === 'csv') {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `vocab-export-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const html = await res.text()
        const win = window.open('', '_blank')
        if (win) {
          win.document.write(html)
          win.document.close()
          win.print()
        }
      }
      setOpen(false)
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  function toggleColumn(key: string) {
    setColumns((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
      >
        <span>⬇️</span> Export
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Export Vocabulary</h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
                <div className="flex gap-2">
                  {(['csv', 'pdf'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        format === f
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {format === 'csv' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Columns</label>
                  <div className="space-y-2">
                    {COLUMN_OPTIONS.map((col) => (
                      <label key={col.key} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={columns.includes(col.key)}
                          onChange={() => toggleColumn(col.key)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter by CEFR (optional)</label>
                <select
                  value={cefrFilter}
                  onChange={(e) => setCefrFilter(e.target.value as CefrLevel | '')}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All levels</option>
                  {CEFR_LEVELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setOpen(false)} className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || (format === 'csv' && columns.length === 0)}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
