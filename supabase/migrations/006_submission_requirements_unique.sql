-- ============================================================================
-- Migration 006: submission_requirements uniqueness + per-user override support
-- ============================================================================
-- Fixes bugs preventing per-user submission requirement overrides from working:
--   1. No UNIQUE constraint → duplicate rows accumulate on every POST
--   2. onConflict: 'id' in API upsert was meaningless (id auto-generated)
-- Solution: two partial unique indexes (org default vs per-user override)
-- and an explicit find-then-update-or-insert flow in the API.
-- ============================================================================

-- Step 1: dedupe any duplicate rows created by the broken upsert behavior.
-- Keep the most recently updated row per (scope, rule_key, teacher_id) tuple.
-- NULL teacher_id means "org default" and must be treated as a distinct bucket.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY scope, rule_key, teacher_id
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM submission_requirements
)
DELETE FROM submission_requirements
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: partial unique index for org-wide defaults (one row per rule).
CREATE UNIQUE INDEX IF NOT EXISTS uq_submission_req_org_default
  ON submission_requirements (scope, rule_key)
  WHERE teacher_id IS NULL;

-- Step 3: partial unique index for per-user overrides (one row per rule per user).
CREATE UNIQUE INDEX IF NOT EXISTS uq_submission_req_teacher_override
  ON submission_requirements (scope, rule_key, teacher_id)
  WHERE teacher_id IS NOT NULL;

-- Step 4: lookup index for loading a specific user's overrides quickly.
CREATE INDEX IF NOT EXISTS idx_submission_req_teacher_id
  ON submission_requirements (teacher_id)
  WHERE teacher_id IS NOT NULL;
