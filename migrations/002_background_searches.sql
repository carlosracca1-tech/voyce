-- Migration: background_searches table for async external searches

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS background_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_searches_status_created ON background_searches (status, created_at DESC);

-- Helper to mark updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_updated_at ON background_searches;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON background_searches FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
