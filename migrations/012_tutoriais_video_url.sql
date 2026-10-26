-- Migration 012: Adicionar video_url na tabela tutoriais e tornar blob_pathname opcional
BEGIN;

ALTER TABLE tutoriais ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE tutoriais ALTER COLUMN blob_pathname DROP NOT NULL;

COMMIT;

