# OctoVocab

> **A full-stack, AI-assisted vocabulary database for English teachers — with a human-in-the-loop review pipeline.**

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ECF8E?logo=supabase)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?logo=vercel)](https://vercel.com/)

---

## The problem

OctoVocab is an internal tool I built for **OctoPrep**, an English teaching center in Vietnam. Before it existed, our teachers spent hours per week extracting vocabulary from PDF textbooks by hand — classifying each word against the **CEFR proficiency scale (A1–C2)**, translating it into Vietnamese, and curating teaching sets. The same work was repeated in parallel by different teachers on the same textbooks, producing inconsistent CEFR judgments and no shared institutional memory across the team.

## What OctoVocab does

OctoVocab turns this into a **shared, AI-assisted workflow**:

1. **Upload** a PDF, scanned image, or raw text.
2. The system **extracts words** using a three-tier OCR pipeline (`pdf-parse` → Mistral OCR → Gemini 2.5 Flash with cross-verification).
3. An AI classifies each word's **CEFR level** and generates **Vietnamese translations** in batched calls.
4. Proposed changes flow into a **peer-review pipeline** — editors approve them item-by-item before they enter the shared database.
5. Teachers browse the shared lexicon, filter by CEFR level, label words into custom subsets, and export vocabulary sets for their lessons.

## Highlights

- **Three-tier OCR pipeline** with automatic fallback and multi-provider cross-verification (free tier first, paid tiers only when needed).
- **Collaborative contribution system** — draft → pending → approved → partially-approved workflow, with AI-flagged items, per-item selection, and immutable audit trails.
- **PostgreSQL Row-Level Security** on every table, with a role-based access matrix (admin / editor / contributor / student) enforced at the database layer.
- **Security-hardened codebase** — zero known CVEs, PostgREST injection defences, sortable-column allowlist, upsert-safety guards, JSON 401s for API routes.
- **Soft-delete + recycle bin + revertable merges + backup checkpoints** for data integrity.
- **Leaderboard** (top contributors by approved words, top editors by review volume) to incentivise participation.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.5 (App Router, Turbopack) |
| UI | React 19 + Tailwind CSS + Lucide icons |
| Language | TypeScript 5 |
| Database | PostgreSQL (via Supabase) with full-text GIN indexes |
| Auth | Supabase Auth (SSR cookies) |
| Storage | Supabase Storage (for uploaded PDFs/images) |
| OCR & AI | `pdf-parse` + Mistral OCR + Google Gemini 2.5 Flash |
| Hosting | Vercel |

## Architecture

### AI extraction pipeline

```
           ┌─────────────────────────────────────────────┐
upload ──▶ │  Tier 1: pdf-parse  (free, digital PDFs)   │
           └────────────┬────────────────────────────────┘
                        │ quality gate fails?
                        ▼
           ┌─────────────────────────────────────────────┐
           │  Tier 2: Mistral OCR  │  Tier 3: Gemini    │
           │  (primary text)       │  (cross-verify)    │
           │          parallel via Promise.allSettled   │
           └────────────┬────────────────────────────────┘
                        ▼
           ┌─────────────────────────────────────────────┐
           │  Gemini: CEFR classify + VI translate       │
           │          (batched: 50/CEFR, 20/translation) │
           └────────────┬────────────────────────────────┘
                        ▼
                   contribution items
                        ▼
                   editor review
                        ▼
                   shared vocab DB
```

### Database design (17 tables across 5 layers)

- **Shared vocabulary:** `words`, `sources`, `word_source_frequency`, `word_translations`
- **Governance & audit:** `contributions`, `contribution_items`, `word_merges`, `words_deleted`, `audit_logs`
- **Enrichment:** `word_examples`, `word_images`, `word_synonyms`, `word_subsets`, `word_subset_members`
- **Admin & operations:** `org_settings`, `submission_requirements`, `backup_checkpoints`
- **Student layer (Phase 2):** `students`, `assignments`, `assignment_submissions`

Schema evolution is tracked in [`supabase/migrations/`](supabase/migrations/) across six migration files.

## Getting started

See [SETUP.md](SETUP.md) for step-by-step local setup (Supabase project, migrations, env vars, and Vercel deployment).

## Development log

See [DEVLOG.md](DEVLOG.md) for a chronological record of shipped features, security fixes, and architecture changes.

## Project status

Actively developed and used in production by teachers at OctoPrep. Phase 1 (vocabulary extraction + contribution workflow) is live; Phase 2 (student-facing flashcards and assignments) is in design.

## License

This repository is released for portfolio and educational purposes. Contact the author for other use.

---

Built by [Hien Ha Minh](https://github.com/HienHaMinh).
