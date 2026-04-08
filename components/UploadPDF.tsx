'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { UploadState } from '@/types'

export function UploadPDF() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [originName, setOriginName] = useState('')
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    message: '',
  })
  const [enriching, setEnriching] = useState(false)

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Only PDF files are supported')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('File too large. Maximum 20MB.')
      return
    }

    setUploadState({ status: 'uploading', progress: 20, message: 'Reading file...' })

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    setUploadState({ status: 'processing', progress: 40, message: 'Extracting text from PDF...' })

    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name.replace(/\.pdf$/i, ''),
          source_type: 'pdf',
          file_base64: base64,
          file_name: file.name,
          origin_name: originName || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setUploadState({ status: 'error', progress: 0, message: data.error || 'Upload failed' })
        return
      }

      if (data.duplicate) {
        setUploadState({
          status: 'done',
          progress: 100,
          message: `This document was already imported: "${data.source?.name}"`,
          result: data,
        })
      } else {
        setUploadState({
          status: 'done',
          progress: 100,
          message: `Added ${data.words_extracted} words to the database`,
          result: data,
        })

        // Fire AI enrichment BEFORE router.refresh() to avoid re-render interruption
        const sourceId = data.source?.id
        console.log('[UploadPDF] Response data:', JSON.stringify({ sourceId, needs_ai: data.needs_ai, has_source: !!data.source }))

        if (sourceId) {
          console.log('[UploadPDF] Triggering enrich + verify for source:', sourceId)
          setEnriching(true)
          // Run enrichment and Gemini verification in parallel
          ;(async () => {
            try {
              await Promise.all([
                // Enrichment loop
                (async () => {
                  let remaining = 1
                  while (remaining > 0) {
                    const enrichRes = await fetch(`/api/sources/${sourceId}/enrich`, { method: 'POST' })
                    const enrichData = await enrichRes.json().catch(() => null)
                    console.log('[UploadPDF] Enrich result:', enrichData)
                    remaining = enrichData?.data?.remaining || 0
                    router.refresh()
                  }
                })(),
                // Auto-verify with Gemini (PDF only)
                (async () => {
                  console.log('[UploadPDF] Auto-triggering Gemini verification')
                  const verifyRes = await fetch(`/api/sources/${sourceId}/verify`, { method: 'POST' })
                  const verifyData = await verifyRes.json().catch(() => null)
                  console.log('[UploadPDF] Verify result:', verifyData)
                })(),
              ])
            } catch (err) {
              console.error('[UploadPDF] Enrich/verify failed:', err)
            } finally {
              setEnriching(false)
              router.refresh()
            }
          })()
        } else {
          console.warn('[UploadPDF] No source.id in response:', JSON.stringify(data))
        }

        router.refresh()
      }
    } catch {
      setUploadState({
        status: 'error',
        progress: 0,
        message: 'Connection error. Please try again.',
      })
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleClose() {
    setOpen(false)
    setOriginName('')
    setUploadState({ status: 'idle', progress: 0, message: '' })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        <span>📄</span> Upload PDF
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-900">Upload PDF</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>

            {uploadState.status === 'idle' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Origin (optional)</label>
                  <input
                    type="text"
                    value={originName}
                    onChange={(e) => setOriginName(e.target.value)}
                    placeholder="e.g., CNN, BBC News, Oxford Textbook"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:border-blue-400 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="text-4xl mb-3">📄</div>
                  <p className="text-gray-600 font-medium mb-1">Drag & drop a PDF here</p>
                  <p className="text-gray-400 text-sm">or click to browse · Max 20MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                </div>
              </div>
            )}

            {(uploadState.status === 'uploading' || uploadState.status === 'processing') && (
              <div className="text-center py-6">
                <div className="text-3xl mb-4 animate-pulse">🐙</div>
                <p className="text-gray-700 font-medium mb-3">{uploadState.message}</p>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${uploadState.progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">This may take 10-30 seconds for long PDFs...</p>
              </div>
            )}

            {uploadState.status === 'done' && (
              <div className="text-center py-6">
                <div className="text-3xl mb-3">✅</div>
                <p className="text-gray-700 font-medium">{uploadState.message}</p>
                {uploadState.result && !uploadState.result.duplicate && (
                  <div className="mt-4 bg-green-50 rounded-lg p-3 text-sm text-left space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Words extracted</span>
                      <span className="font-medium">{uploadState.result.words_extracted}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">New words</span>
                      <span className="font-medium text-green-700">{uploadState.result.words_new}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Frequency updates</span>
                      <span className="font-medium text-blue-700">{uploadState.result.words_existing || 0}</span>
                    </div>
                  </div>
                )}
                {enriching && (
                  <div className="mt-3 bg-blue-50 rounded-lg p-3 text-sm text-blue-700 flex items-center justify-center gap-2">
                    <span className="animate-spin">🐙</span>
                    AI classifying & translating...
                  </div>
                )}
                <div className="mt-5 flex gap-3 justify-center">
                  <button
                    onClick={handleClose}
                    className="px-6 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                  >
                    {enriching ? 'Close (AI continues)' : 'Close'}
                  </button>
                  {uploadState.result?.contribution && !uploadState.result.duplicate && (
                    <button
                      onClick={() => {
                        handleClose()
                        router.push(`/dashboard/contributions/${uploadState.result!.contribution.id}/review`)
                      }}
                      className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                    >
                      Review & Submit →
                    </button>
                  )}
                </div>
              </div>
            )}

            {uploadState.status === 'error' && (
              <div className="text-center py-6">
                <div className="text-3xl mb-3">❌</div>
                <p className="text-red-600 font-medium">{uploadState.message}</p>
                <button
                  onClick={() => setUploadState({ status: 'idle', progress: 0, message: '' })}
                  className="mt-5 px-6 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
