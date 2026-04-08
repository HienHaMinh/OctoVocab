'use client'

import { useState, useEffect, useCallback } from 'react'
import { getCefrColor } from '@/lib/cefr-lists'
import { X, BookOpen, GitMerge, Languages, History, Loader2, MessageSquareQuote, ImageIcon, Link2 } from 'lucide-react'

interface WordDetailModalProps {
  wordId: string | null
  onClose: () => void
  onUpdate?: () => void
}

export default function WordDetailModal({
  wordId,
  onClose,
  onUpdate,
}: WordDetailModalProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'info' | 'examples' | 'synonyms' | 'image' | 'sources' | 'translations' | 'merges'>('info')
  const [editingTranslation, setEditingTranslation] = useState(false)
  const [translationInput, setTranslationInput] = useState('')
  const [editingCefr, setEditingCefr] = useState(false)
  const [cefrInput, setCefrInput] = useState('')
  const [saving, setSaving] = useState(false)
  // Examples state
  const [vocabExamples, setVocabExamples] = useState<any[]>([])
  const [internalExamples, setInternalExamples] = useState<any[]>([])
  const [examplesLoading, setExamplesLoading] = useState(false)
  const [newExample, setNewExample] = useState('')
  // Image state
  const [wordImage, setWordImage] = useState<any>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [imageLoading, setImageLoading] = useState(false)
  // Synonyms state
  const [synonyms, setSynonyms] = useState<any[]>([])
  const [synonymsLoading, setSynonymsLoading] = useState(false)
  const [newSynonym, setNewSynonym] = useState('')

  useEffect(() => {
    if (wordId) {
      setData(null)
      setLoading(true)
      fetchWordDetail()
      setActiveTab('info')
    }
  }, [wordId])

  const fetchWordDetail = async () => {
    if (!wordId) return
    setLoading(true)

    try {
      const res = await fetch(`/api/words/${wordId}`)
      const json = await res.json()

      if (json.word) {
        setData(json)
        setTranslationInput(json.translations?.[0]?.vi_translation || '')
        setCefrInput(json.word.cefr_level)
      }
    } catch (error) {
      console.error('Failed to fetch word detail:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!data?.word) return
    setSaving(true)

    try {
      const res = await fetch(`/api/words/${data.word.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cefr_level: cefrInput,
          vi_translation: translationInput,
        }),
      })

      if (res.ok) {
        setEditingTranslation(false)
        setEditingCefr(false)
        await fetchWordDetail()
        onUpdate?.()
      }
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setSaving(false)
    }
  }

  const fetchExamples = useCallback(async () => {
    if (!wordId) return
    setExamplesLoading(true)
    try {
      const [vocabRes, internalRes] = await Promise.all([
        fetch(`/api/words/${wordId}/vocabulary-examples`),
        fetch(`/api/words/${wordId}/examples`),
      ])
      const vocabData = await vocabRes.json()
      const internalData = await internalRes.json()
      setVocabExamples(vocabData.examples || [])
      setInternalExamples(internalData.examples || [])
    } catch { /* silent */ }
    setExamplesLoading(false)
  }, [wordId])

  const fetchImage = useCallback(async () => {
    if (!wordId) return
    try {
      const res = await fetch(`/api/words/${wordId}/image`)
      const data = await res.json()
      setWordImage(data.image || null)
    } catch { /* silent */ }
  }, [wordId])

  const fetchSynonyms = useCallback(async () => {
    if (!wordId) return
    setSynonymsLoading(true)
    try {
      const res = await fetch(`/api/words/${wordId}/synonyms`)
      const data = await res.json()
      setSynonyms(data.synonyms || [])
    } catch { /* silent */ }
    setSynonymsLoading(false)
  }, [wordId])

  useEffect(() => {
    if (activeTab === 'examples') fetchExamples()
    if (activeTab === 'image') fetchImage()
    if (activeTab === 'synonyms') fetchSynonyms()
  }, [activeTab, fetchExamples, fetchImage, fetchSynonyms])

  const addExample = async () => {
    if (!newExample.trim() || !wordId) return
    await fetch(`/api/words/${wordId}/examples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ example_sentence: newExample }),
    })
    setNewExample('')
    fetchExamples()
  }

  const addSynonym = async () => {
    if (!newSynonym.trim() || !wordId) return
    await fetch(`/api/words/${wordId}/synonyms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ synonym_text: newSynonym }),
    })
    setNewSynonym('')
    fetchSynonyms()
  }

  const deleteSynonym = async (synonymId: string) => {
    if (!wordId) return
    await fetch(`/api/words/${wordId}/synonyms?synonym_id=${synonymId}`, { method: 'DELETE' })
    fetchSynonyms()
  }

  const saveImage = async () => {
    if (!imageUrl.trim() || !wordId) return
    setImageLoading(true)
    await fetch(`/api/words/${wordId}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl }),
    })
    setImageUrl('')
    fetchImage()
    setImageLoading(false)
  }

  const searchImage = async () => {
    if (!wordId) return
    setImageLoading(true)
    await fetch(`/api/words/${wordId}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_search: true }),
    })
    fetchImage()
    setImageLoading(false)
  }

  const handleArchive = async () => {
    if (!data?.word) return
    const reason = prompt('Reason for archiving (optional):') || ''
    try {
      const res = await fetch(`/api/words/${data.word.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) {
        await fetchWordDetail()
        onUpdate?.()
      } else {
        alert('Archive failed')
      }
    } catch {
      alert('Network error')
    }
  }

  const handleRestore = async () => {
    if (!data?.word) return
    try {
      const res = await fetch(`/api/words/${data.word.id}/restore`, { method: 'POST' })
      if (res.ok) {
        await fetchWordDetail()
        onUpdate?.()
      } else {
        alert('Restore failed')
      }
    } catch {
      alert('Network error')
    }
  }

  const handleRemoveFromSource = async (sourceId: string, sourceName: string) => {
    if (!data?.word) return
    if (!confirm(`Remove "${data.word.word}" from "${sourceName}"? This only removes the frequency link — the word and its content are preserved.`)) return
    try {
      const res = await fetch(`/api/words/${data.word.id}/remove-source?source_id=${sourceId}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchWordDetail()
        onUpdate?.()
      } else {
        alert('Remove failed')
      }
    } catch {
      alert('Network error')
    }
  }

  if (!wordId) return null

  const word = data?.word
  const sources = data?.sources || []
  const translations = data?.translations || []
  const merges = data?.merges || []

  const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Unclassified']

  const tabs = [
    { key: 'info' as const, label: 'Info', icon: BookOpen },
    { key: 'examples' as const, label: 'Examples', icon: MessageSquareQuote },
    { key: 'synonyms' as const, label: 'Synonyms', icon: Link2 },
    { key: 'image' as const, label: 'Image', icon: ImageIcon },
    { key: 'sources' as const, label: 'Sources', icon: History },
    { key: 'translations' as const, label: 'Translations', icon: Languages },
    { key: 'merges' as const, label: 'Merges', icon: GitMerge },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">
              {loading ? '...' : word?.word || 'Word Detail'}
            </h2>
            {word && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getCefrColor(word.cefr_level)}`}>
                {word.cefr_level}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {word?.status === 'archived' ? (
              <button
                onClick={handleRestore}
                className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition"
              >
                Restore
              </button>
            ) : word?.status === 'active' ? (
              <button
                onClick={handleArchive}
                className="text-xs px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 transition"
              >
                Archive
              </button>
            ) : null}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : !word ? (
            <p className="text-center text-gray-500 py-12">Word not found</p>
          ) : (
            <>
              {/* Info Tab */}
              {activeTab === 'info' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Word</p>
                      <p className="text-lg font-semibold">{word.word}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Status</p>
                      <p className="text-lg font-semibold capitalize">{word.status}</p>
                    </div>
                  </div>

                  {/* CEFR Level */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-gray-500">CEFR Level</p>
                      {!editingCefr && (
                        <button onClick={() => setEditingCefr(true)} className="text-xs text-blue-500 hover:underline">
                          Edit
                        </button>
                      )}
                    </div>
                    {editingCefr ? (
                      <div className="flex items-center gap-2">
                        <select value={cefrInput} onChange={(e) => setCefrInput(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
                          {cefrLevels.map((level) => (
                            <option key={level} value={level}>{level}</option>
                          ))}
                        </select>
                        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50">
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingCefr(false); setCefrInput(word.cefr_level) }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-sm font-semibold ${getCefrColor(word.cefr_level)}`}>
                          {word.cefr_level}
                        </span>
                        {word.cefr_confidence && (
                          <span className="text-xs text-gray-400">
                            ({Math.round(word.cefr_confidence * 100)}% confidence · {word.cefr_assigned_by === 'ai' ? 'AI' : word.cefr_assigned_by === 'builtin' ? 'Built-in list' : 'Manual'})
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Translation */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-gray-500">Vietnamese Translation</p>
                      {!editingTranslation && (
                        <button onClick={() => setEditingTranslation(true)} className="text-xs text-blue-500 hover:underline">
                          Edit
                        </button>
                      )}
                    </div>
                    {editingTranslation ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={translationInput}
                          onChange={(e) => setTranslationInput(e.target.value)}
                          className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                          placeholder="Enter Vietnamese translation..."
                        />
                        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50">
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingTranslation(false); setTranslationInput(translations?.[0]?.vi_translation || '') }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="text-lg">
                        {translations?.[0]?.vi_translation || (
                          <span className="text-gray-400 italic">Not translated</span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Added on</p>
                    <p className="text-sm">
                      {new Date(word.created_at).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'long', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              )}

              {/* Examples Tab */}
              {activeTab === 'examples' && (
                <div className="space-y-4">
                  {examplesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    </div>
                  ) : (
                    <>
                      {/* Vocabulary.com examples */}
                      {vocabExamples.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From Literature & News</h3>
                            <span className="text-xs text-gray-400">vocabulary.com</span>
                          </div>
                          <div className="space-y-2">
                            {vocabExamples.map((ex: any, i: number) => (
                              <div key={i} className="bg-gray-50 rounded-lg p-3">
                                <p className="text-sm text-gray-800 leading-relaxed">
                                  &ldquo;{ex.sentence}&rdquo;
                                </p>
                                <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                                    ex.domain === 'news' ? 'bg-blue-50 text-blue-600' :
                                    ex.domain === 'non-fiction' ? 'bg-green-50 text-green-600' :
                                    ex.domain === 'technology' ? 'bg-cyan-50 text-cyan-600' :
                                    ex.domain === 'science' ? 'bg-emerald-50 text-emerald-600' :
                                    ex.domain === 'general' ? 'bg-orange-50 text-orange-600' :
                                    'bg-purple-50 text-purple-600'
                                  }`}>
                                    {ex.domain}
                                  </span>
                                  {ex.author && <span>{ex.author}</span>}
                                  {ex.title && <span>— <em>{ex.title}</em></span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Internal examples */}
                      {internalExamples.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">From Your Sources</h3>
                          <div className="space-y-2">
                            {internalExamples.map((ex: any) => (
                              <div key={ex.id} className="bg-gray-50 rounded-lg p-3">
                                <p className="text-sm text-gray-800 leading-relaxed">
                                  &ldquo;{ex.example_sentence}&rdquo;
                                </p>
                                <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                                  {ex.auto_extracted && <span className="bg-yellow-50 text-yellow-600 px-1.5 py-0.5 rounded">auto-extracted</span>}
                                  {ex.source_name && <span>{ex.source_name}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {vocabExamples.length === 0 && internalExamples.length === 0 && (
                        <p className="text-center text-gray-400 py-6">No examples found</p>
                      )}

                      {/* Add manual example */}
                      <div className="border-t pt-3">
                        <p className="text-xs text-gray-500 mb-2">Add your own example</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newExample}
                            onChange={(e) => setNewExample(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addExample()}
                            placeholder="Type an example sentence..."
                            className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                          />
                          <button
                            onClick={addExample}
                            disabled={!newExample.trim()}
                            className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Synonyms Tab */}
              {activeTab === 'synonyms' && (
                <div className="space-y-4">
                  {synonymsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    </div>
                  ) : (
                    <>
                      {synonyms.length > 0 ? (
                        <div className="space-y-2">
                          {synonyms.map((syn: any) => (
                            <div key={syn.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 group">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">{syn.synonym_text}</span>
                                {syn.linked_word && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600`}>
                                    in DB
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => deleteSynonym(syn.id)}
                                className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-gray-400 py-6">No synonyms added</p>
                      )}

                      <div className="border-t pt-3">
                        <p className="text-xs text-gray-500 mb-2">Add synonym</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newSynonym}
                            onChange={(e) => setNewSynonym(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addSynonym()}
                            placeholder="Type a synonym..."
                            className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                          />
                          <button
                            onClick={addSynonym}
                            disabled={!newSynonym.trim()}
                            className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Image Tab */}
              {activeTab === 'image' && (
                <div className="space-y-4">
                  {wordImage ? (
                    <div className="text-center">
                      <img
                        src={wordImage.image_url}
                        alt={wordImage.caption || word.word}
                        className="max-w-full max-h-64 mx-auto rounded-lg shadow-sm"
                      />
                      {wordImage.caption && (
                        <p className="text-xs text-gray-500 mt-2">{wordImage.caption}</p>
                      )}
                      {wordImage.image_source && (
                        <p className="text-xs text-gray-400 mt-1">Source: {wordImage.image_source}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-gray-400 py-6">No image yet</p>
                  )}

                  <div className="border-t pt-3">
                    <p className="text-xs text-gray-500 mb-2">Add image URL</p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                      />
                      <button
                        onClick={saveImage}
                        disabled={!imageUrl.trim() || imageLoading}
                        className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                    <button
                      onClick={searchImage}
                      disabled={imageLoading}
                      className="mt-2 text-xs text-blue-500 hover:underline disabled:opacity-50"
                    >
                      {imageLoading ? 'Searching...' : 'Auto-search from Unsplash'}
                    </button>
                  </div>
                </div>
              )}

              {/* Sources Tab */}
              {activeTab === 'sources' && (
                <div className="space-y-3">
                  {sources.length > 0 ? (
                    sources.map((src: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg p-4 group">
                        <div>
                          <p className="font-medium text-sm">{src.sources?.name || 'Unknown source'}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {src.sources?.source_type === 'pdf' ? '📄 PDF' : '📝 Text'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-lg font-bold text-blue-600">{src.frequency}×</p>
                            <p className="text-xs text-gray-500">frequency</p>
                          </div>
                          <button
                            onClick={() => handleRemoveFromSource(src.sources?.id, src.sources?.name || 'this source')}
                            className="text-xs text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove word from this source (keeps word content)"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-gray-400 py-8">No sources found</p>
                  )}
                </div>
              )}

              {/* Translations Tab */}
              {activeTab === 'translations' && (
                <div className="space-y-3">
                  {translations.length > 0 ? (
                    translations.map((trans: any) => (
                      <div key={trans.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{trans.vi_translation}</p>
                          {trans.approved && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Approved</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                          <span>By: {trans.teachers?.name || 'AI'}</span>
                          {trans.confidence && <span>Confidence: {Math.round(trans.confidence * 100)}%</span>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-gray-400 py-8">No translations yet</p>
                  )}
                </div>
              )}

              {/* Merge History Tab */}
              {activeTab === 'merges' && (
                <div className="space-y-3">
                  {merges.length > 0 ? (
                    merges.map((merge: any) => (
                      <div key={merge.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono bg-red-50 text-red-600 px-2 py-0.5 rounded">
                            {merge.variant?.word}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="font-mono bg-green-50 text-green-600 px-2 py-0.5 rounded">
                            {word.word}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                          <span className="capitalize">{merge.merge_type}</span>
                          {merge.reason && <span>· {merge.reason}</span>}
                          <span>· {new Date(merge.merged_at).toLocaleDateString('en-US')}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-gray-400 py-8">No merge history</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
