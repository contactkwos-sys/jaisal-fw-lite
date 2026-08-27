-- =============================================================================
-- PROPOSED ONLY — DO NOT APPLY without explicit CEO approval
-- =============================================================================
-- Purpose: Rename empty unused stores to Historical Records (*_archive).
-- Safety: RENAME only. NO DROP. NO DELETE. NO data rewrite.
--
-- Candidates (verified empty in Phase 2 final verification, Aug 2026):
--   design_warp      → design_warp_archive
--   design_weft      → design_weft_archive
--   beam_pipe_in     → beam_pipe_in_archive
--
-- Pre-flight checks (must all pass before apply):
--   1. SELECT count(*) FROM each table = 0
--   2. No application queries in src/ (verified Aug 2026)
--   3. No active foreign-key children with rows
--   4. CEO approval recorded: WHO / WHEN / WHY
--
-- Audit record (fill before running):
--   WHO:  ________________________
--   WHEN: ________________________
--   WHY:  Empty unused historical stores; keep schema for safety
--   OLD → NEW as listed below
-- =============================================================================

BEGIN;

-- Guard: abort if any candidate has rows
DO $$
BEGIN
  IF (SELECT count(*) FROM public.design_warp) > 0 THEN
    RAISE EXCEPTION 'REFUSE: design_warp is not empty';
  END IF;
  IF (SELECT count(*) FROM public.design_weft) > 0 THEN
    RAISE EXCEPTION 'REFUSE: design_weft is not empty';
  END IF;
  IF (SELECT count(*) FROM public.beam_pipe_in) > 0 THEN
    RAISE EXCEPTION 'REFUSE: beam_pipe_in is not empty';
  END IF;
END $$;

ALTER TABLE IF EXISTS public.design_warp RENAME TO design_warp_archive;
ALTER TABLE IF EXISTS public.design_weft RENAME TO design_weft_archive;
ALTER TABLE IF EXISTS public.beam_pipe_in RENAME TO beam_pipe_in_archive;

-- Optional audit log table (create once if desired)
CREATE TABLE IF NOT EXISTS public.schema_archive_audit (
  id bigserial PRIMARY KEY,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  old_name text NOT NULL,
  new_name text NOT NULL
);

INSERT INTO public.schema_archive_audit (approved_by, reason, old_name, new_name)
VALUES
  ('CEO_APPROVAL_REQUIRED', 'Empty unused store → Historical Records', 'design_warp', 'design_warp_archive'),
  ('CEO_APPROVAL_REQUIRED', 'Empty unused store → Historical Records', 'design_weft', 'design_weft_archive'),
  ('CEO_APPROVAL_REQUIRED', 'Empty unused store → Historical Records', 'beam_pipe_in', 'beam_pipe_in_archive');

-- STOP: leave as ROLLBACK until CEO fills WHO and explicitly authorizes COMMIT
ROLLBACK;
-- COMMIT;  -- uncomment ONLY after CEO approval and WHO filled above
