// ============================================================================
// ENUMS (mirror DB enums)
// ============================================================================

export type RoleType = 'admin' | 'editor' | 'contributor' | 'student'
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'Unclassified'
export type SourceType = 'pdf' | 'text' | 'image'
export type WordStatus = 'active' | 'archived' | 'pending_merge'
export type MergeType = 'find_duplicates' | 'manual' | 'automated'
export type ContributionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'partially_approved'
export type ChangeType = 'add_word' | 'update_frequency' | 'cefr_conflict' | 'add_translation'

// ============================================================================
// DATABASE TYPES (from Supabase)
// ============================================================================

export interface Organization {
  id: string
  name: string
  owner_id: string | null
  created_at: string
  updated_at: string
}

export interface Teacher {
  id: string
  email: string
  name: string | null
  organization_id: string | null
  role: RoleType
  created_at: string
  updated_at: string
}

export interface Word {
  id: string
  word: string
  canonical_form: string | null
  cefr_level: CefrLevel
  cefr_confidence: number
  cefr_assigned_by: string | null
  cefr_assigned_at: string | null
  first_seen_at: string | null
  status: WordStatus
  created_at: string
  updated_at: string
}

export interface Source {
  id: string
  teacher_id: string
  name: string
  source_type: SourceType
  content_hash: string | null
  extracted_text: string | null
  word_count: number
  file_size_bytes: number | null
  uploaded_by: string | null
  origin_url: string | null
  origin_name: string | null
  extraction_provider: string
  mime_type: string | null
  secondary_raw_text: string | null
  extraction_verified: boolean
  extraction_diff_json: unknown
  extraction_flagged: boolean
  storage_path: string | null
  created_at: string
  updated_at: string
}

export interface WordSourceFrequency {
  id: string
  word_id: string
  source_id: string
  frequency: number
  first_seen_at: string
  last_seen_at: string
  created_at: string
}

export interface WordTranslation {
  id: string
  word_id: string
  teacher_id: string
  vi_translation: string
  context_example: string | null
  confidence: number
  approved: boolean
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface WordMerge {
  id: string
  variant_word_id: string
  canonical_word_id: string
  total_frequency: number
  initiated_by: string
  merge_type: MergeType
  reason: string | null
  merged_at: string
  reverted: boolean
  reverted_at: string | null
  reverted_by: string | null
}

export interface WordDeleted {
  id: string
  word_id: string
  deleted_by: string
  reason: string | null
  deleted_at: string
  restored_at: string | null
  restored_by: string | null
}

export interface AuditLog {
  id: string
  teacher_id: string
  action: string
  resource_id: string | null
  resource_type: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

export interface Contribution {
  id: string
  contributor_id: string
  source_id: string | null
  status: ContributionStatus
  title: string | null
  new_words_count: number
  frequency_updates_count: number
  conflicts_count: number
  reviewed_by: string | null
  reviewed_at: string | null
  review_comment: string | null
  created_at: string
  updated_at: string
  // Joined fields
  contributor?: Teacher
  reviewer?: Teacher
  source?: Source
  items?: ContributionItem[]
}

export interface ContributionItem {
  id: string
  contribution_id: string
  change_type: ChangeType
  word: string
  word_id: string | null
  proposed_cefr: CefrLevel | null
  proposed_translation: string | null
  proposed_frequency: number
  current_cefr: CefrLevel | null
  current_translation: string | null
  current_frequency: number | null
  status: ContributionStatus
  selected: boolean
  ai_flagged: boolean
  ai_flag_reason: string | null
  example_sentence: string | null
  example_source_url: string | null
  example_source_name: string | null
  conflicts_reviewed: boolean
  proposed_image_url: string | null
  created_at: string
}

export interface WordSubset {
  id: string
  name: string
  description: string | null
  created_by: string
  word_count: number
  created_at: string
  updated_at: string
  creator?: Teacher
}

export interface WordExample {
  id: string
  word_id: string
  example_sentence: string
  source_url: string | null
  source_name: string | null
  source_id: string | null
  added_by: string | null
  auto_extracted: boolean
  created_at: string
}

export interface WordImage {
  id: string
  word_id: string
  image_url: string
  image_source: string | null
  caption: string | null
  added_by: string | null
  created_at: string
}

// ============================================================================
// VIEW TYPES (from DB views)
// ============================================================================

export interface WordSummary {
  id: string
  word: string
  cefr_level: CefrLevel
  total_frequency: number
  num_sources: number
  vi_translation: string | null
  created_at: string
  status: WordStatus
  subset_names: string[]
}

// ============================================================================
// API REQUEST / RESPONSE TYPES
// ============================================================================

export interface CreateSourceRequest {
  name: string
  source_type: SourceType
  content?: string          // For text imports
  file_base64?: string      // For PDF/image imports
  file_name?: string
  mime_type?: string        // e.g. 'application/pdf', 'image/png'
  origin_url?: string
  origin_name?: string
  auto_approve?: boolean    // Admin/editor can skip PR flow
}

export interface CreateSourceResponse {
  source: Source
  contribution: Contribution
  words_extracted: number
  words_new: number
  words_existing: number
  needs_ai: number
  duplicate?: boolean
}

export interface GetWordsRequest {
  page?: number
  per_page?: number
  search?: string
  cefr_level?: CefrLevel | CefrLevel[]
  source_id?: string
  status?: WordStatus
  sort_by?: 'word' | 'frequency' | 'cefr_level' | 'created_at'
  sort_dir?: 'asc' | 'desc'
}

export interface GetWordsResponse {
  words: WordSummary[]
  total: number
  page: number
  per_page: number
}

export interface MergeWordsRequest {
  variant_word_ids: string[]     // Words to merge INTO canonical
  canonical_word_id: string      // Target canonical word
  merge_type: MergeType
  reason?: string
}

export interface MergeWordsResponse {
  merged_count: number
  frequency_transferred: number
  canonical_word: Word
}

export interface TranslateWordsRequest {
  word_ids: string[]             // Max 20 per request
}

export interface TranslateWordsResponse {
  translations: Array<{
    word_id: string
    word: string
    vi_translation: string
    confidence: number
  }>
}

export interface ClassifyCefrRequest {
  word_ids: string[]             // Words to classify via AI
}

export interface ClassifyCefrResponse {
  classifications: Array<{
    word_id: string
    word: string
    cefr_level: CefrLevel
    confidence: number
    source: 'builtin' | 'ai'
  }>
}

export interface ExportRequest {
  format: 'csv' | 'pdf'
  columns: Array<'word' | 'vi_translation' | 'cefr_level' | 'frequency' | 'sources'>
  filters?: {
    cefr_level?: CefrLevel[]
    source_id?: string
  }
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export interface WordTableFilter {
  search: string
  cefr_levels: CefrLevel[]
  source_id: string | null
  sort_by: 'word' | 'frequency' | 'cefr_level' | 'created_at'
  sort_dir: 'asc' | 'desc'
}

export interface UploadState {
  status: 'idle' | 'uploading' | 'processing' | 'done' | 'error'
  progress: number
  message: string
  result?: CreateSourceResponse
  error?: string
}
