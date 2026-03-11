# Supabase schema source of truth

Local dev database is created from:
- supabase/migrations/20240101000000_baseline_public_schema.sql

Future schema changes:
- MUST be done via new migrations in supabase/migrations (do NOT edit baseline)
- After schema changes run:
  - supabase db reset   (or supabase migration up)
  - scripts/gen-supabase-types.ps1
