-- Migration: Create user_interactions table and extend user_preferences

-- 1) Create table to store raw interaction events
CREATE TABLE IF NOT EXISTS user_interactions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT,
  topic TEXT,
  message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Ensure user_preferences exists (adjust if your schema differs) and add summary columns
-- If you already have a user_preferences table, only the ALTERs will run without dropping.

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  preferences JSONB DEFAULT '{}'::jsonb,
  source_counts JSONB DEFAULT '{}'::jsonb,
  topic_counts JSONB DEFAULT '{}'::jsonb,
  last_interaction_at TIMESTAMPTZ
);

-- 3) Optional index to speed queries by user and time
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_time ON user_interactions (user_id, created_at DESC);

-- 4) Example upsert function to increment source/topic counts (can be used in a background job)
-- This function performs a JSONB increment for a key in a JSONB object; call it in aggregation jobs.

CREATE OR REPLACE FUNCTION jsonb_increment(obj JSONB, key TEXT, delta INT)
RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
  SELECT jsonb_strip_nulls(
    COALESCE(obj, '{}'::jsonb) || jsonb_build_object(key, COALESCE((obj->>key)::int, 0) + delta)
  );
$$;

-- 5) Example aggregation/upsert statement (for background job):
-- UPDATE user_preferences
-- SET
--   source_counts = jsonb_increment(source_counts, 'elpais', 3),
--   topic_counts = jsonb_increment(topic_counts, 'politica', 5),
--   last_interaction_at = greatest(coalesce(last_interaction_at, 'epoch'::timestamptz), now())
-- WHERE user_id = 'user-123';

-- NOTES:
-- - Run this migration in Neon (psql or your migration runner).
-- - The app writes raw events into `user_interactions` and updates `last_interaction_at` in `user_preferences`.
-- - For production, consider a background worker that consumes `user_interactions` and safely increments
--   `source_counts`/`topic_counts` in `user_preferences` to avoid write hot spots.
