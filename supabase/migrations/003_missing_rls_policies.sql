-- ============================================================================
-- MISSING RLS POLICIES
-- ============================================================================
-- The initial migration only had SELECT policies for most tables.
-- Add INSERT/UPDATE/DELETE policies needed for the app to function.

-- ── WORDS ──────────────────────────────────────────────────────────────────
-- Teachers can insert new words (shared vocabulary)
CREATE POLICY "Teachers can insert words"
ON words FOR INSERT
WITH CHECK (true);

-- Teachers can update words (e.g., CEFR reclassification)
CREATE POLICY "Teachers can update words"
ON words FOR UPDATE
USING (true)
WITH CHECK (true);

-- ── WORD_SOURCE_FREQUENCY ──────────────────────────────────────────────────
-- Teachers can insert frequency records for their own sources
CREATE POLICY "Teachers can insert frequency"
ON word_source_frequency FOR INSERT
WITH CHECK (
  source_id IN (
    SELECT id FROM sources WHERE teacher_id = auth.uid()
  )
);

-- Teachers can update frequency for their own sources
CREATE POLICY "Teachers can update frequency"
ON word_source_frequency FOR UPDATE
USING (
  source_id IN (
    SELECT id FROM sources WHERE teacher_id = auth.uid()
  )
);

-- ── WORD_TRANSLATIONS ──────────────────────────────────────────────────────
-- Teachers can update their own translations
CREATE POLICY "Teachers can update own translations"
ON word_translations FOR UPDATE
USING (auth.uid() = teacher_id)
WITH CHECK (auth.uid() = teacher_id);

-- Teachers can delete their own translations
CREATE POLICY "Teachers can delete own translations"
ON word_translations FOR DELETE
USING (auth.uid() = teacher_id);

-- ── WORD_MERGES ────────────────────────────────────────────────────────────
-- Teachers can create merges
CREATE POLICY "Teachers can insert merges"
ON word_merges FOR INSERT
WITH CHECK (auth.uid() = initiated_by);

-- Teachers can update merges (revert)
CREATE POLICY "Teachers can update merges"
ON word_merges FOR UPDATE
USING (auth.uid() = initiated_by);

-- ── WORDS_DELETED ──────────────────────────────────────────────────────────
-- Teachers can soft-delete words
CREATE POLICY "Teachers can insert deleted words"
ON words_deleted FOR INSERT
WITH CHECK (auth.uid() = deleted_by);

-- Teachers can update (restore) deleted words
CREATE POLICY "Teachers can update deleted words"
ON words_deleted FOR UPDATE
USING (true);

-- ── SOURCES ────────────────────────────────────────────────────────────────
-- Teachers can delete their own sources
CREATE POLICY "Teachers can delete own sources"
ON sources FOR DELETE
USING (auth.uid() = teacher_id);

-- ── AUDIT_LOGS ─────────────────────────────────────────────────────────────
-- Teachers can create audit log entries
CREATE POLICY "Teachers can insert audit logs"
ON audit_logs FOR INSERT
WITH CHECK (auth.uid() = teacher_id);
