-- TeamForge PostgreSQL migration (safe to run repeatedly).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  setup_token_hash TEXT UNIQUE, setup_token_expires_at TIMESTAMPTZ,
  roll_number VARCHAR(40), department VARCHAR(120) DEFAULT 'Computer Science',
  branch VARCHAR(120) DEFAULT 'Computer Science',
  skills TEXT[] DEFAULT '{}', avatar_color VARCHAR(20) DEFAULT '#6d5dfc',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_roll_number_unique ON users(roll_number) WHERE roll_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(160) NOT NULL,
  academic_year VARCHAR(30) NOT NULL, project_type VARCHAR(40), department VARCHAR(120) NOT NULL DEFAULT 'Information Technology', term VARCHAR(40) NOT NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'UTC', status VARCHAR(20) NOT NULL DEFAULT 'draft',
  config JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cycle_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL CHECK (role IN ('coordinator','reviewer','guide','moderator')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(), ends_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS cycle_roles_active_unique ON cycle_roles(cycle_id,user_id,role) WHERE ends_at IS NULL;
CREATE TABLE IF NOT EXISTS roster_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL, roll_number VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL, email VARCHAR(255) NOT NULL, branch VARCHAR(120),
  section VARCHAR(40), cgpa NUMERIC(4,2), status VARCHAR(20) DEFAULT 'ok',
  row_errors JSONB DEFAULT '[]', imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, roll_number)
);
CREATE TABLE IF NOT EXISTS roster_import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  source_row INTEGER NOT NULL,
  message TEXT NOT NULL,
  row_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id UUID REFERENCES cycles(id),
  title VARCHAR(180) NOT NULL, description TEXT NOT NULL, abstract TEXT NOT NULL DEFAULT '',
  department VARCHAR(120) NOT NULL, branch VARCHAR(120) NOT NULL DEFAULT 'Computer Science',
  team_size INTEGER NOT NULL DEFAULT 4 CHECK (team_size BETWEEN 2 AND 8),
  owner_id UUID NOT NULL REFERENCES users(id), deadline TIMESTAMPTZ, timezone VARCHAR(80) DEFAULT 'UTC',
  brief_file_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS project_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES users(id), before_data JSONB NOT NULL, after_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id UUID REFERENCES cycles(id),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE, name VARCHAR(120) NOT NULL,
  score NUMERIC(5,2) DEFAULT 0, idea TEXT, leader_id UUID REFERENCES users(id),
  project_link TEXT, project_link_updated_at TIMESTAMPTZ, project_link_updated_by UUID REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'pending_review', marks NUMERIC(5,2) CHECK (marks BETWEEN 0 AND 100),
  feedback TEXT, formation_run_id UUID, dissolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE, user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES cycles(id), contribution VARCHAR(80) DEFAULT 'Contributor',
  PRIMARY KEY(team_id,user_id), UNIQUE(user_id,cycle_id)
);
CREATE TABLE IF NOT EXISTS student_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES users(id),
  marks NUMERIC(5,2) NOT NULL CHECK (marks BETWEEN 0 AND 100),
  feedback TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, student_id)
);
-- A student can have only one non-dissolved team in a cycle.
CREATE TABLE IF NOT EXISTS team_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, status VARCHAR(20) DEFAULT 'pending',
  message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(team_id,user_id)
);
CREATE TABLE IF NOT EXISTS formation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id UUID REFERENCES cycles(id),
  project_id UUID REFERENCES projects(id), algorithm VARCHAR(80) NOT NULL,
  preview JSONB NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'preview',
  idempotency_key VARCHAR(160) UNIQUE, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id),
  capacity INTEGER NOT NULL DEFAULT 5, preferences TEXT[] DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS guide_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id UUID REFERENCES cycles(id),
  guide_id UUID REFERENCES guides(id), project_id UUID REFERENCES projects(id),
  preference_matched BOOLEAN DEFAULT false, assigned_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cycle_id,project_id)
);
CREATE TABLE IF NOT EXISTS team_faculty_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  faculty_id UUID NOT NULL REFERENCES users(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, team_id)
);
CREATE INDEX IF NOT EXISTS team_faculty_assignments_faculty_idx
  ON team_faculty_assignments(cycle_id, faculty_id);
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), cycle_id UUID REFERENCES cycles(id),
  title VARCHAR(180) NOT NULL, due_at TIMESTAMPTZ NOT NULL, timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
  max_marks NUMERIC(6,2) DEFAULT 100, rubric_id UUID, created_by UUID REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(180) NOT NULL, criteria JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), milestone_id UUID REFERENCES milestones(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id), user_id UUID REFERENCES users(id), content TEXT DEFAULT '',
  file_id UUID, revision INTEGER NOT NULL DEFAULT 0, status VARCHAR(20) DEFAULT 'draft',
  locked_at TIMESTAMPTZ, unlock_reason TEXT, review JSONB, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deadline_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id), extended_due_at TIMESTAMPTZ NOT NULL, reason TEXT,
  approved_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL, byte_size BIGINT NOT NULL,
  uploaded_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS project_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  presentation_file_id UUID REFERENCES files(id),
  documentation_file_id UUID REFERENCES files(id),
  submitted_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_feedback TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(80), actor_id UUID REFERENCES users(id), target_audience VARCHAR(80), related_entity_type VARCHAR(50), related_entity_id UUID,
  deep_link TEXT, title VARCHAR(180) NOT NULL, body TEXT NOT NULL, kind VARCHAR(30) DEFAULT 'info',
  read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id),
  subject TEXT NOT NULL, body TEXT NOT NULL, status VARCHAR(20) DEFAULT 'queued',
  attempts INTEGER DEFAULT 0, queued_at TIMESTAMPTZ DEFAULT now(), sent_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type VARCHAR(60) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'queued',
  recipient_count INTEGER, created_at TIMESTAMPTZ DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_id UUID REFERENCES users(id),
  action VARCHAR(120) NOT NULL, entity_type VARCHAR(50) NOT NULL, entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_cycle_idx ON projects(cycle_id);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log(entity_type,entity_id,created_at DESC);
