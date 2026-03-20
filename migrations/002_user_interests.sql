-- Migration 002: Add interests column to user_settings
-- Run once against your Neon DB

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}';
