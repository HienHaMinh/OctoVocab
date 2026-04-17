-- Step 1: Add 'contributor' to role_type enum
-- MUST be run and committed BEFORE 004_v2_features.sql
ALTER TYPE role_type ADD VALUE IF NOT EXISTS 'contributor';
