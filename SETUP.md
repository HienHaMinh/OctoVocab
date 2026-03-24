# Setup Guide — OctoVocab

## 1. Clone & install

```bash
git clone https://github.com/HienHaMinh/OctoVocab.git
cd OctoVocab
npm install
```

## 2. Create a Supabase project

1. Go to https://app.supabase.com → **New project**
2. Name: `octovocab` (or anything)
3. Region: **Singapore** recommended (lowest latency for Southeast Asia)
4. Save the database password

## 3. Run the database migrations

Open the Supabase dashboard → **SQL Editor** and run the files in `supabase/migrations/` in order:

```
001_initial.sql
002_auto_create_teacher.sql
003_missing_rls_policies.sql
004a_v2_enum.sql            # MUST run before 004 (ALTER TYPE in separate tx)
004_v2_features.sql
005_cleanup_and_archive.sql
006_submission_requirements_unique.sql
```

## 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

| Variable | Where to get it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key *(server-only, never expose)* |
| `GOOGLE_AI_API_KEY` | https://aistudio.google.com/apikey |
| `MISTRAL_API_KEY` | https://console.mistral.ai/api-keys |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for dev, your domain for prod |

## 5. Run locally

```bash
npm run dev
```

Open http://localhost:3000 → sign up → upload your first PDF.

## 6. Deploy to Vercel

1. https://vercel.com → **New Project** → Import from GitHub
2. Add the same environment variables as in `.env.local`
3. Deploy

---

## Security notes

- **Never** commit `.env.local` — it's already in `.gitignore`
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and bypasses Row-Level Security — keep it out of the client bundle
- By default, Supabase Email auth requires confirmation — disable in Auth settings during development if needed
