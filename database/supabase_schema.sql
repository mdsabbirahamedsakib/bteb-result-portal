-- BTEB Result & Education Portal - Supabase PostgreSQL Schema
-- Run this SQL inside your Supabase Dashboard -> SQL Editor -> New Query

CREATE TABLE IF NOT EXISTS public.bteb_results (
    roll VARCHAR(20) PRIMARY KEY,
    institute_code VARCHAR(20),
    institute_name TEXT,
    gpa1 VARCHAR(30),
    gpa2 VARCHAR(30),
    gpa3 VARCHAR(30),
    gpa4 VARCHAR(30),
    gpa5 VARCHAR(30),
    gpa6 VARCHAR(30),
    gpa7 VARCHAR(30),
    gpa8 VARCHAR(30),
    referred JSONB NOT NULL DEFAULT '[]'::jsonb,
    referred_subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
    semesters JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'Passed',
    status_bangla VARCHAR(80),
    status_type VARCHAR(20) NOT NULL DEFAULT 'success',
    latest_semester INTEGER DEFAULT 5,
    regulation VARCHAR(20) DEFAULT '2022',
    exam_year VARCHAR(16) DEFAULT '2024',
    source VARCHAR(20) DEFAULT 'pdf',
    source_priority INTEGER DEFAULT 10,
    source_label TEXT,
    sheet_id VARCHAR(80),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast filtering & cloud analytics
CREATE INDEX IF NOT EXISTS idx_bteb_results_inst_code ON public.bteb_results (institute_code);
CREATE INDEX IF NOT EXISTS idx_bteb_results_sheet_id ON public.bteb_results (sheet_id);
CREATE INDEX IF NOT EXISTS idx_bteb_results_updated_at ON public.bteb_results (updated_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.bteb_results ENABLE ROW LEVEL SECURITY;

-- Public Read Policy: Any student from any phone/laptop/browser can query results by roll
DROP POLICY IF EXISTS "Public read bteb_results" ON public.bteb_results;
CREATE POLICY "Public read bteb_results"
    ON public.bteb_results
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Write Policies for Admin Portal Batch PDF Sync
-- Note: For stricter production security after initial upload, you can restrict INSERT/UPDATE/DELETE
-- policies to authenticated Supabase users (TO authenticated) and enable Admin Auth.
DROP POLICY IF EXISTS "Public insert bteb_results" ON public.bteb_results;
CREATE POLICY "Public insert bteb_results"
    ON public.bteb_results
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public update bteb_results" ON public.bteb_results;
CREATE POLICY "Public update bteb_results"
    ON public.bteb_results
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete bteb_results" ON public.bteb_results;
CREATE POLICY "Public delete bteb_results"
    ON public.bteb_results
    FOR DELETE
    TO anon, authenticated
    USING (true);
