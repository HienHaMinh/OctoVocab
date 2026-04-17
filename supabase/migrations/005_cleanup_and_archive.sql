-- ============================================================================
-- Migration 005: Archive support, lock-step conflicts, submission criteria,
--   images in contributions, synonyms, backup checkpoints
-- ============================================================================

-- ============================================================================
-- 1. Update word_summary to include archived words
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
WHERE w.status IN ('active', 'archived')
GROUP BY w.id, w.word, w.cefr_level, w.created_at, w.status;

-- ============================================================================
-- 2. Admin/org settings table (for lock-step, submission criteria, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT 'true'::jsonb,
  updated_by UUID REFERENCES teachers(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, setting_key)
);

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read org settings"
  ON org_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage org settings"
  ON org_settings FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t WHERE t.id = auth.uid() AND t.role = 'admin'
    )
  );

-- ============================================================================
-- 3. Add conflicts_reviewed flag to contribution_items
-- ============================================================================

ALTER TABLE contribution_items
  ADD COLUMN IF NOT EXISTS conflicts_reviewed BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- 4. Add proposed_image_url to contribution_items (for image in contribution flow)
-- ============================================================================

ALTER TABLE contribution_items
  ADD COLUMN IF NOT EXISTS proposed_image_url TEXT;

-- ============================================================================
-- 5. Submission requirements table (per-item + per-contribution, per-member overrides)
-- ============================================================================

CREATE TABLE IF NOT EXISTS submission_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('item', 'contribution')),
  rule_key TEXT NOT NULL,
  rule_value JSONB NOT NULL DEFAULT 'true'::jsonb,
  is_default BOOLEAN DEFAULT TRUE,
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE, -- NULL = org default, set = per-member override
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE submission_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read submission requirements"
  ON submission_requirements FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage submission requirements"
  ON submission_requirements FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t WHERE t.id = auth.uid() AND t.role = 'admin'
    )
  );

-- ============================================================================
-- 6. Synonyms table (stored as word info, like examples)
-- ============================================================================

CREATE TABLE IF NOT EXISTS word_synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  synonym_text TEXT NOT NULL,
  linked_word_id UUID REFERENCES words(id) ON DELETE SET NULL, -- if synonym exists as a word in DB
  created_by UUID REFERENCES teachers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_word_synonyms_word_id ON word_synonyms(word_id);

ALTER TABLE word_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read synonyms"
  ON word_synonyms FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Teachers can manage synonyms"
  ON word_synonyms FOR ALL TO authenticated
  USING (true);

-- ============================================================================
-- 7. Backup checkpoints table (metadata for named checkpoints)
-- ============================================================================

CREATE TABLE IF NOT EXISTS backup_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL,
  created_by UUID REFERENCES teachers(id),
  word_count INT DEFAULT 0,
  source_count INT DEFAULT 0,
  translation_count INT DEFAULT 0,
  file_size_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE backup_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage checkpoints"
  ON backup_checkpoints FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teachers t WHERE t.id = auth.uid() AND t.role = 'admin'
    )
  );
