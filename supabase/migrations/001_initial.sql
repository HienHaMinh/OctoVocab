-- Vocabulary Database Schema for Supabase
-- Generated: 2026-03-23
-- Target: Next.js + Supabase + Vercel MVP

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE role_type AS ENUM ('admin', 'teacher', 'editor', 'student');
CREATE TYPE cefr_level AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Unclassified');
CREATE TYPE source_type AS ENUM ('pdf', 'text');
CREATE TYPE word_status AS ENUM ('active', 'archived', 'pending_merge');
CREATE TYPE merge_type AS ENUM ('find_duplicates', 'manual', 'automated');
CREATE TYPE response_type AS ENUM ('flashcard_recall', 'quiz_choice', 'fill_blank');
CREATE TYPE assignment_type AS ENUM ('flashcard', 'quiz', 'reading_comprehension');

-- ============================================================================
-- ORGANIZATIONS (OctoPrep)
-- ============================================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_organizations_owner_id ON organizations(owner_id);

-- ============================================================================
-- TEACHERS (Auth users)
-- ============================================================================

CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  role role_type DEFAULT 'teacher',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_teachers_organization_id ON teachers(organization_id);
CREATE INDEX idx_teachers_role ON teachers(role);

-- ============================================================================
-- SHARED VOCABULARY DATABASE
-- ============================================================================

CREATE TABLE words (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  word TEXT NOT NULL UNIQUE COLLATE "C",
  canonical_form UUID REFERENCES words(id) ON DELETE SET NULL,
  cefr_level cefr_level DEFAULT 'Unclassified',
  cefr_confidence FLOAT DEFAULT 0.0,
  cefr_assigned_by UUID REFERENCES teachers(id) ON DELETE SET NULL,
  cefr_assigned_at TIMESTAMP WITH TIME ZONE,
  first_seen_at TIMESTAMP WITH TIME ZONE,
  status word_status DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_words_status ON words(status);
CREATE INDEX idx_words_cefr_level ON words(cefr_level);
CREATE INDEX idx_words_canonical_form ON words(canonical_form);
CREATE INDEX idx_words_created_at ON words(created_at DESC);
-- Full-text search index for English words
CREATE INDEX idx_words_word_gin ON words USING GIN (to_tsvector('english', word));

-- ============================================================================
-- SOURCES (PDF / Text imports)
-- ============================================================================

CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type source_type NOT NULL,
  content_hash TEXT, -- SHA256 of extracted text, for dedup
  extracted_text TEXT, -- Store extracted text for re-processing
  word_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sources_teacher_id ON sources(teacher_id);
CREATE INDEX idx_sources_created_at ON sources(created_at DESC);
CREATE INDEX idx_sources_content_hash ON sources(content_hash);

-- ============================================================================
-- WORD-SOURCE FREQUENCY
-- ============================================================================
-- Tracks how many times a word appeared in each source
-- This replaces the flat "freq" field in the artifact

CREATE TABLE word_source_frequency (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  frequency INT NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(word_id, source_id)
);

CREATE INDEX idx_word_source_frequency_word_id ON word_source_frequency(word_id);
CREATE INDEX idx_word_source_frequency_source_id ON word_source_frequency(source_id);

-- ============================================================================
-- WORD TRANSLATIONS (Per teacher, per word)
-- ============================================================================

CREATE TABLE word_translations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  vi_translation TEXT NOT NULL,
  context_example TEXT, -- Example sentence showing the word
  confidence FLOAT DEFAULT 0.0, -- For AI translations: 0-1
  approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(word_id, teacher_id)
);

CREATE INDEX idx_word_translations_word_id ON word_translations(word_id);
CREATE INDEX idx_word_translations_teacher_id ON word_translations(teacher_id);
CREATE INDEX idx_word_translations_approved ON word_translations(approved);
-- Full-text search for Vietnamese text
CREATE INDEX idx_word_translations_vi_gin ON word_translations USING GIN (to_tsvector('english', vi_translation));

-- ============================================================================
-- WORD MERGES (Audit trail)
-- ============================================================================
-- Tracks all merge operations for history and conflict detection

CREATE TABLE word_merges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_word_id UUID NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
  canonical_word_id UUID NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
  total_frequency INT DEFAULT 0, -- How much frequency was transferred
  initiated_by UUID NOT NULL REFERENCES teachers(id) ON DELETE SET NULL,
  merge_type merge_type NOT NULL,
  reason TEXT,
  merged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reverted BOOLEAN DEFAULT false,
  reverted_at TIMESTAMP WITH TIME ZONE,
  reverted_by UUID REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX idx_word_merges_variant_word_id ON word_merges(variant_word_id);
CREATE INDEX idx_word_merges_canonical_word_id ON word_merges(canonical_word_id);
CREATE INDEX idx_word_merges_initiated_by ON word_merges(initiated_by);
CREATE INDEX idx_word_merges_merged_at ON word_merges(merged_at DESC);
CREATE INDEX idx_word_merges_merge_type ON word_merges(merge_type);

-- ============================================================================
-- WORDS DELETED (Soft delete / Recycle bin)
-- ============================================================================

CREATE TABLE words_deleted (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  word_id UUID NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
  deleted_by UUID NOT NULL REFERENCES teachers(id) ON DELETE SET NULL,
  reason TEXT, -- e.g., "duplicate", "too common", "not relevant"
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  restored_at TIMESTAMP WITH TIME ZONE,
  restored_by UUID REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX idx_words_deleted_word_id ON words_deleted(word_id);
CREATE INDEX idx_words_deleted_deleted_by ON words_deleted(deleted_by);
CREATE INDEX idx_words_deleted_deleted_at ON words_deleted(deleted_at DESC);
CREATE INDEX idx_words_deleted_restored_at ON words_deleted(restored_at);

-- ============================================================================
-- AUDIT LOG (All significant actions)
-- ============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- e.g., cefr_override, merge, delete, translate
  resource_id TEXT, -- word_id or source_id
  resource_type TEXT, -- word, source, translation
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_teacher_id ON audit_logs(teacher_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- STUDENTS (Phase 2)
-- ============================================================================

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_students_organization_id ON students(organization_id);

-- ============================================================================
-- ASSIGNMENTS (Phase 2)
-- ============================================================================

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  word_ids UUID[] NOT NULL DEFAULT '{}', -- Array of word IDs
  assignment_type assignment_type NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_assignments_teacher_id ON assignments(teacher_id);
CREATE INDEX idx_assignments_created_at ON assignments(created_at DESC);

-- ============================================================================
-- ASSIGNMENT SUBMISSIONS (Phase 2)
-- ============================================================================

CREATE TABLE assignment_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
  response_type response_type NOT NULL,
  correct BOOLEAN,
  attempt_count INT DEFAULT 1,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_assignment_submissions_assignment_id ON assignment_submissions(assignment_id);
CREATE INDEX idx_assignment_submissions_student_id ON assignment_submissions(student_id);
CREATE INDEX idx_assignment_submissions_word_id ON assignment_submissions(word_id);

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Enable RLS

ALTER TABLE words ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_source_frequency ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_merges ENABLE ROW LEVEL SECURITY;
ALTER TABLE words_deleted ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Teachers see words in the shared database (all active words)
CREATE POLICY "Teachers see active words"
ON words FOR SELECT
USING (status = 'active');

-- Teachers see only their own sources
CREATE POLICY "Teachers see own sources"
ON sources FOR SELECT
USING (auth.uid() = teacher_id);

-- Teachers can create sources
CREATE POLICY "Teachers can insert sources"
ON sources FOR INSERT
WITH CHECK (auth.uid() = teacher_id);

-- Teachers can see word-source frequency for their own sources
CREATE POLICY "Teachers see frequency for own sources"
ON word_source_frequency FOR SELECT
USING (
  source_id IN (
    SELECT id FROM sources WHERE teacher_id = auth.uid()
  )
);

-- Teachers can see and create translations for words
CREATE POLICY "Teachers see all translations"
ON word_translations FOR SELECT
USING (true);

CREATE POLICY "Teachers can insert own translations"
ON word_translations FOR INSERT
WITH CHECK (auth.uid() = teacher_id);

-- Teachers can see word merges
CREATE POLICY "Teachers see all word merges"
ON word_merges FOR SELECT
USING (true);

-- Teachers can see deleted words
CREATE POLICY "Teachers see deleted words"
ON words_deleted FOR SELECT
USING (true);

-- Teachers can see audit logs (maybe limit to own actions in future)
CREATE POLICY "Teachers see own audit logs"
ON audit_logs FOR SELECT
USING (auth.uid() = teacher_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get total frequency for a word across all sources
CREATE OR REPLACE FUNCTION get_word_frequency(word_id UUID)
RETURNS INT AS $$
  SELECT COALESCE(SUM(frequency), 0)
  FROM word_source_frequency
  WHERE word_source_frequency.word_id = $1;
$$ LANGUAGE SQL;

-- Function to get sources for a word
CREATE OR REPLACE FUNCTION get_word_sources(word_id UUID)
RETURNS TABLE(source_id UUID, source_name TEXT, frequency INT) AS $$
  SELECT
    wsf.source_id,
    s.name,
    wsf.frequency
  FROM word_source_frequency wsf
  JOIN sources s ON wsf.source_id = s.id
  WHERE wsf.word_id = $1
  ORDER BY wsf.frequency DESC;
$$ LANGUAGE SQL;

-- ============================================================================
-- VIEWS (Useful for querying)
-- ============================================================================

-- View: All words with their total frequency and primary translation
CREATE VIEW word_summary AS
SELECT
  w.id,
  w.word,
  w.cefr_level,
  COALESCE(SUM(wsf.frequency), 0) as total_frequency,
  COUNT(DISTINCT wsf.source_id) as num_sources,
  MAX(wt.vi_translation) as vi_translation, -- Most recent translation
  w.created_at,
  w.status
FROM words w
LEFT JOIN word_source_frequency wsf ON w.id = wsf.word_id
LEFT JOIN word_translations wt ON w.id = wt.word_id
WHERE w.status = 'active'
GROUP BY w.id, w.word, w.cefr_level, w.created_at, w.status;

-- View: Words needing classification
CREATE VIEW words_unclassified AS
SELECT
  w.id,
  w.word,
  COUNT(DISTINCT wsf.source_id) as num_sources,
  COALESCE(SUM(wsf.frequency), 0) as total_frequency
FROM words w
LEFT JOIN word_source_frequency wsf ON w.id = wsf.word_id
WHERE w.status = 'active' AND w.cefr_level = 'Unclassified'
GROUP BY w.id, w.word
ORDER BY total_frequency DESC;

-- View: Words needing translation
CREATE VIEW words_untranslated AS
SELECT
  w.id,
  w.word,
  w.cefr_level,
  COUNT(DISTINCT wsf.source_id) as num_sources,
  COALESCE(SUM(wsf.frequency), 0) as total_frequency
FROM words w
LEFT JOIN word_source_frequency wsf ON w.id = wsf.word_id
WHERE w.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM word_translations wt WHERE wt.word_id = w.id
  )
GROUP BY w.id, w.word, w.cefr_level
ORDER BY total_frequency DESC;

-- ============================================================================
-- INDEXES FOR COMMON QUERIES
-- ============================================================================

-- Search words by CEFR level + status
CREATE INDEX idx_words_status_cefr ON words(status, cefr_level);

-- Find sources by teacher and date
CREATE INDEX idx_sources_teacher_created ON sources(teacher_id, created_at DESC);

-- Query words added in a date range
CREATE INDEX idx_words_created_at_status ON words(created_at DESC, status);

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

-- Ensure a word's canonical form is not circular
-- (Would need a function to enforce this, not a simple constraint)

-- Ensure translated word isn't empty
ALTER TABLE word_translations
ADD CONSTRAINT check_vi_translation_not_empty
CHECK (vi_translation IS NOT NULL AND vi_translation != '');

-- Ensure word isn't empty
ALTER TABLE words
ADD CONSTRAINT check_word_not_empty
CHECK (word IS NOT NULL AND word != '');

-- Ensure frequency is positive
ALTER TABLE word_source_frequency
ADD CONSTRAINT check_frequency_positive
CHECK (frequency > 0);
