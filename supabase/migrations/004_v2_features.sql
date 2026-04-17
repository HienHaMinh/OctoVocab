-- ============================================================================
-- V2 MIGRATION: Role changes, Contributions, Source pool, Subsets, Enrichment
-- ============================================================================

-- ============================================================================
-- 1. ROLE ENUM UPDATE
-- ============================================================================

-- NOTE: ALTER TYPE ADD VALUE cannot be used in a transaction with the new value.
-- Run 004a_v2_enum.sql FIRST (just the ALTER TYPE), then run this file.
-- The ALTER TYPE has been moved to 004a_v2_enum.sql.

-- Rename existing 'teacher' users to 'contributor' (safe default)
UPDATE teachers SET role = 'contributor' WHERE role = 'teacher';

-- ============================================================================
-- 2. SOURCE TABLE ADDITIONS
-- ============================================================================

ALTER TABLE sources ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES teachers(id);
ALTER TABLE sources ADD COLUMN IF NOT EXISTS origin_url TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS origin_name TEXT;

-- Multi-provider extraction fields
ALTER TABLE sources ADD COLUMN IF NOT EXISTS extraction_provider TEXT DEFAULT 'claude';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS secondary_raw_text TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS extraction_verified BOOLEAN DEFAULT false;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS extraction_diff_json JSONB;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS extraction_flagged BOOLEAN DEFAULT false;

-- PDF storage for Gemini verification
ALTER TABLE sources ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Backfill uploaded_by from teacher_id for existing sources
UPDATE sources SET uploaded_by = teacher_id WHERE uploaded_by IS NULL;

-- Index for shared pool queries
CREATE INDEX IF NOT EXISTS idx_sources_uploaded_by ON sources(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_sources_extraction_flagged ON sources(extraction_flagged) WHERE extraction_flagged = true;

-- ============================================================================
-- 3. CONTRIBUTION SYSTEM
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE contribution_status AS ENUM (
    'draft',
    'pending',
    'approved',
    'rejected',
    'partially_approved'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE change_type AS ENUM (
    'add_word',
    'update_frequency',
    'cefr_conflict',
    'add_translation'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contributor_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  status contribution_status DEFAULT 'draft',
  title TEXT,

  -- Summary stats (denormalized for list view performance)
  new_words_count INT DEFAULT 0,
  frequency_updates_count INT DEFAULT 0,
  conflicts_count INT DEFAULT 0,

  -- Review
  reviewed_by UUID REFERENCES teachers(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_comment TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contribution_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contribution_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  change_type change_type NOT NULL,

  -- Word identification
  word TEXT NOT NULL,
  word_id UUID REFERENCES words(id) ON DELETE SET NULL,

  -- Proposed values
  proposed_cefr cefr_level,
  proposed_translation TEXT,
  proposed_frequency INT DEFAULT 0,

  -- Current values (snapshot at time of contribution creation, for diff display)
  current_cefr cefr_level,
  current_translation TEXT,
  current_frequency INT,

  -- Per-item review
  status contribution_status DEFAULT 'pending',
  selected BOOLEAN DEFAULT true,

  -- AI flagging
  ai_flagged BOOLEAN DEFAULT false,
  ai_flag_reason TEXT,

  -- Example sentence (auto-extracted from source text)
  example_sentence TEXT,
  example_source_url TEXT,
  example_source_name TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status);
CREATE INDEX IF NOT EXISTS idx_contributions_contributor ON contributions(contributor_id);
CREATE INDEX IF NOT EXISTS idx_contributions_source ON contributions(source_id);
CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contribution_items_contribution ON contribution_items(contribution_id);
CREATE INDEX IF NOT EXISTS idx_contribution_items_status ON contribution_items(status);
CREATE INDEX IF NOT EXISTS idx_contribution_items_change_type ON contribution_items(change_type);
CREATE INDEX IF NOT EXISTS idx_contribution_items_word ON contribution_items(word);

-- ============================================================================
-- 4. SUBSET / LABEL SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS word_subsets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  word_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS word_subset_members (
  subset_id UUID NOT NULL REFERENCES word_subsets(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (subset_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_word_subsets_created_by ON word_subsets(created_by);
CREATE INDEX IF NOT EXISTS idx_word_subset_members_word ON word_subset_members(word_id);
CREATE INDEX IF NOT EXISTS idx_word_subset_members_subset ON word_subset_members(subset_id);

-- ============================================================================
-- 5. WORD ENRICHMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS word_examples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  example_sentence TEXT NOT NULL,
  source_url TEXT,
  source_name TEXT,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  added_by UUID REFERENCES teachers(id) ON DELETE SET NULL,
  auto_extracted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS word_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_source TEXT,
  caption TEXT,
  added_by UUID REFERENCES teachers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_word_examples_word ON word_examples(word_id);
CREATE INDEX IF NOT EXISTS idx_word_images_word ON word_images(word_id);

-- ============================================================================
-- 6. RLS POLICY UPDATES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_subsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_subset_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_images ENABLE ROW LEVEL SECURITY;

-- Sources: shared pool (all authenticated users can read)
DROP POLICY IF EXISTS "Teachers see own sources" ON sources;
CREATE POLICY "All users see all sources"
  ON sources FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Sources: insert (any authenticated user)
DROP POLICY IF EXISTS "Teachers can insert sources" ON sources;
CREATE POLICY "Any user can insert sources"
  ON sources FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Sources: delete (uploader or admin/editor)
DROP POLICY IF EXISTS "Source delete by uploader or admin/editor" ON sources;
CREATE POLICY "Source delete by uploader or admin/editor"
  ON sources FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM teachers
      WHERE id = auth.uid() AND role IN ('admin', 'editor')
    )
  );

-- Word source frequency: all authenticated users can read (shared pool)
DROP POLICY IF EXISTS "Teachers see frequency for own sources" ON word_source_frequency;
CREATE POLICY "All users see all frequency data"
  ON word_source_frequency FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Contributions: contributor sees own, editor/admin sees all
CREATE POLICY "Users see own contributions"
  ON contributions FOR SELECT
  USING (
    contributor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM teachers
      WHERE id = auth.uid() AND role IN ('admin', 'editor')
    )
  );

CREATE POLICY "Users can create contributions"
  ON contributions FOR INSERT
  WITH CHECK (auth.uid() = contributor_id);

CREATE POLICY "Contributor can update own draft"
  ON contributions FOR UPDATE
  USING (
    contributor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM teachers
      WHERE id = auth.uid() AND role IN ('admin', 'editor')
    )
  );

-- Contribution items: same visibility as parent contribution
CREATE POLICY "Users see contribution items"
  ON contribution_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contributions c
      WHERE c.id = contribution_id
      AND (
        c.contributor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM teachers
          WHERE id = auth.uid() AND role IN ('admin', 'editor')
        )
      )
    )
  );

CREATE POLICY "Users can insert contribution items"
  ON contribution_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contributions c
      WHERE c.id = contribution_id AND c.contributor_id = auth.uid()
    )
  );

CREATE POLICY "Users can update contribution items"
  ON contribution_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM contributions c
      WHERE c.id = contribution_id
      AND (
        c.contributor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM teachers t
          WHERE t.id = auth.uid() AND t.role IN ('admin', 'editor')
        )
      )
    )
  );

-- Subsets: all authenticated users can CRUD
CREATE POLICY "All users see subsets"
  ON word_subsets FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "All users can create subsets"
  ON word_subsets FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Subset creator or admin can update"
  ON word_subsets FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM teachers WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Subset creator or admin can delete"
  ON word_subsets FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM teachers WHERE id = auth.uid() AND role = 'admin')
  );

-- Subset members: all authenticated users
CREATE POLICY "All users see subset members"
  ON word_subset_members FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "All users can add to subsets"
  ON word_subset_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "All users can remove from subsets"
  ON word_subset_members FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Word examples & images: all can read, authenticated can create
CREATE POLICY "All users see word examples"
  ON word_examples FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "All users can add examples"
  ON word_examples FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "All users see word images"
  ON word_images FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "All users can add images"
  ON word_images FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Words: admin/editor can insert/update directly
DROP POLICY IF EXISTS "Admin/editor can insert words" ON words;
CREATE POLICY "Admin/editor can insert words"
  ON words FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE id = auth.uid() AND role IN ('admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "Admin/editor can update words" ON words;
CREATE POLICY "Admin/editor can update words"
  ON words FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE id = auth.uid() AND role IN ('admin', 'editor')
    )
  );

-- Words: admin can delete (only freq=0, enforced in application layer)
DROP POLICY IF EXISTS "Admin can delete words" ON words;
CREATE POLICY "Admin can delete words"
  ON words FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Teachers: all authenticated users can read (needed for role checks, leaderboard, etc.)
DROP POLICY IF EXISTS "Teachers see own profile" ON teachers;
DROP POLICY IF EXISTS "Admin sees all teachers" ON teachers;
DROP POLICY IF EXISTS "Authenticated users can read teachers" ON teachers;
CREATE POLICY "Authenticated users can read teachers"
  ON teachers FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin can update teacher roles" ON teachers;
CREATE POLICY "Admin can update teacher roles"
  ON teachers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM teachers
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- 7. UPDATE word_summary VIEW
-- ============================================================================

DROP VIEW IF EXISTS word_summary;
CREATE VIEW word_summary AS
SELECT
  w.id,
  w.word,
  w.cefr_level,
  COALESCE(SUM(wsf.frequency), 0) as total_frequency,
  COUNT(DISTINCT wsf.source_id) as num_sources,
  MAX(wt.vi_translation) as vi_translation,
  w.created_at,
  w.status,
  ARRAY(
    SELECT ws.name FROM word_subsets ws
    JOIN word_subset_members wsm ON ws.id = wsm.subset_id
    WHERE wsm.word_id = w.id
  ) as subset_names
FROM words w
LEFT JOIN word_source_frequency wsf ON w.id = wsf.word_id
LEFT JOIN word_translations wt ON w.id = wt.word_id
WHERE w.status = 'active'
GROUP BY w.id, w.word, w.cefr_level, w.created_at, w.status;

-- ============================================================================
-- 8. UPDATE handle_new_user TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO teachers (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'contributor'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. LEADERBOARD FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_top_contributors(limit_count INT DEFAULT 10)
RETURNS TABLE(
  name TEXT,
  email TEXT,
  approved_words BIGINT,
  sources_uploaded BIGINT
) AS $$
  SELECT
    t.name,
    t.email,
    COUNT(DISTINCT ci.id) FILTER (WHERE ci.status = 'approved') as approved_words,
    COUNT(DISTINCT s.id) as sources_uploaded
  FROM teachers t
  LEFT JOIN contributions c ON c.contributor_id = t.id
  LEFT JOIN contribution_items ci ON ci.contribution_id = c.id
  LEFT JOIN sources s ON s.uploaded_by = t.id
  GROUP BY t.id, t.name, t.email
  HAVING COUNT(DISTINCT ci.id) FILTER (WHERE ci.status = 'approved') > 0
  ORDER BY approved_words DESC
  LIMIT limit_count;
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_top_editors(limit_count INT DEFAULT 10)
RETURNS TABLE(
  name TEXT,
  email TEXT,
  reviews_count BIGINT,
  approval_rate NUMERIC
) AS $$
  SELECT
    t.name,
    t.email,
    COUNT(DISTINCT c.id) as reviews_count,
    ROUND(
      AVG(CASE WHEN c.status = 'approved' THEN 1.0 ELSE 0.0 END) * 100
    ) as approval_rate
  FROM teachers t
  JOIN contributions c ON c.reviewed_by = t.id
  WHERE c.status IN ('approved', 'rejected', 'partially_approved')
  GROUP BY t.id, t.name, t.email
  ORDER BY reviews_count DESC
  LIMIT limit_count;
$$ LANGUAGE SQL SECURITY DEFINER;
