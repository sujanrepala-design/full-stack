-- Canonical migration for installations that run versioned migrations.
-- The idempotent schema is kept in ../schema.sql so psql users and the
-- PostgreSQL adapter share one source of truth:
\ir ../schema.sql

ALTER TABLE users DROP COLUMN IF EXISTS role;
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch VARCHAR(120) DEFAULT 'Computer Science';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS branch VARCHAR(120) DEFAULT 'Computer Science';
ALTER TABLE roster_rows ADD COLUMN IF NOT EXISTS branch VARCHAR(120);
ALTER TABLE roster_rows ADD COLUMN IF NOT EXISTS section VARCHAR(40);
ALTER TABLE roster_rows ADD COLUMN IF NOT EXISTS cgpa NUMERIC(4,2);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_type VARCHAR(80);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_audience VARCHAR(80);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_entity_type VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_entity_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deep_link TEXT;
CREATE TABLE IF NOT EXISTS notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type VARCHAR(60) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'queued',
  recipient_count INTEGER, created_at TIMESTAMPTZ DEFAULT now(), completed_at TIMESTAMPTZ
);
