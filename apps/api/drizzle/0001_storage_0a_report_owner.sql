-- STORAGE-0A: generated analytics reports become upload assets owned by 'report'.
-- Only this statement is new. drizzle-kit also emitted changes that the
-- 0000 baseline SQL already contains (its snapshot was stale); they were
-- removed here, and the 0001 snapshot now matches schema.ts.
ALTER TYPE "public"."document_owner_type" ADD VALUE IF NOT EXISTS 'report';
