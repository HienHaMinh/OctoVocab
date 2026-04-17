# DEVLOG

## 2026-04-17 — OCR Migration + Image Support

### What shipped
- **3-tier OCR architecture**: pdf-parse (free, digital) → Mistral OCR (scanned) → Gemini 2.5 Flash (verify + CEFR + translate)
- **Claude API removed entirely** — replaced by Gemini + Mistral, deleted @anthropic-ai/sdk
- **Image source support** — upload PNG/JPG/WEBP, OCR via Mistral + Gemini parallel
- **Show in text** — text snippet highlight + embedded PDF/image viewer
- **SQL migration 005** — org_settings, submission_requirements, word_synonyms, backup_checkpoints
- **Parallel OCR** — Mistral + Gemini run simultaneously when pdf-parse fails

### Architecture
- `lib/ocr.ts` — pdf-parse → Mistral fallback (parallel with Gemini)
- `lib/gemini.ts` — Gemini 2.5 Flash for OCR verify + CEFR classify + Vietnamese translate
- Digital PDFs → pdf-parse (free, 100% accurate, skip verify)
- Scanned PDFs / Images → Mistral (primary) + Gemini (verify), parallel

### Env vars
- Removed: `ANTHROPIC_API_KEY`
- Added: `GOOGLE_AI_API_KEY`, `MISTRAL_API_KEY`

## 2026-04-08 — Security Hardening, Bug Fixes & Vercel Deployment

### What shipped
- Full code review of OctoPrep Vocab DB (Next.js 15 + Supabase + Claude API)
- Fixed 19 issues across 15+ files (CRITICAL/HIGH/MEDIUM/LOW)
- Updated Next.js 15.1.3 → 15.5.14 (patched 14 CVEs, 0 remaining vulnerabilities)
- Successfully deployed to Vercel (Production)

### Security fixes (CRITICAL/HIGH)
- **PostgREST filter injection** — sanitized search params in `api/words` and `dashboard/words` to strip `[,().*\\]`
- **Upsert overwriting existing data** — changed to `ignoreDuplicates: true` in `api/sources`, added separate query for existing word IDs
- **Unvalidated sortBy column** — added allowlist of sortable columns in `api/words`
- **Trash not scoped to teacher** — added `.eq('deleted_by', user.id)` on trash listing and restore
- **Middleware returning HTML redirect for API routes** — now returns 401 JSON for `/api/*`

### Bug fixes (MEDIUM/LOW)
- Null user crash guards on `dashboard/words` and `dashboard/sources`
- CEFR distribution query limit raised to 50000 (was silently wrong >1000 words)
- Stale data in `WordDetailModal` — reset to null on wordId change
- Stale edit inputs in `WordTable` — added `key` prop to force re-render
- Search desync on browser back/forward — `useEffect` syncs state with URL
- `mergedClusters` not reset on re-scan in duplicates page
- Missing `req.json()` try/catch on 5 API routes (classify, translate, merge, word detail, sources)
- Silent word truncation in `lib/claude.ts` — added recursive batching for CEFR classification (50/batch) and translation (20/batch)
- Case-insensitive `.pdf` extension stripping in `UploadPDF`
- Variable shadowing in login/signup pages (`error` → `authError`)

### Deployment
- Platform: Vercel (Hobby plan)
- Domain: `octoprep-vocab-db.vercel.app`
- Had to rewrite git history (author emails + remove Co-Authored-By trailers) to satisfy Vercel Hobby restrictions
- Set 5 environment variables via Vercel CLI: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`
- Migrated `next.config.ts` for Next.js 15.5 compatibility (`serverExternalPackages` moved out of `experimental`)

### Config
- Created `.claude/launch.json` with dev (Turbopack) and production server configs
- Set up Claude Code full auto-permissions (`Bash(*)`, `Edit(*)`, `Write(*)`, `WebFetch(*)`, `mcp__*`)
- Local git email updated to `hienhaminh30@gmail.com` to match GitHub account
