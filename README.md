# TeamForge

TeamForge is a cycle-aware academic project management workspace. It includes
a React/Vite coordinator, faculty and student interface, an Express API with
JWT access/refresh authentication, roster import, deterministic team
formation, guide allocation, milestone review, notifications, reports,
authenticated uploads, and a PostgreSQL migration. It runs without a database
by default using a file-backed demo repository.

## Quick start (demo mode)

Requirements: Node.js 18+.

```bash
npm install
npm run seed:it --workspace backend
npm run dev
```

Open <http://localhost:5173>. Select a role and use its demo credentials:

| Portal | Login |
| --- | --- |
| Student | Roll number `24B81A1201` |
| Faculty | `professor@teamforge.demo` |
| Admin | `admin@teamforge.demo` |

The demo password is `password123` for all three portals. For students, enter
the roll number instead of an email address.

## Information Technology department demo cohort

Seed the provided 64-student IT roster and the two project cycles with:

```bash
npm run seed:it --workspace backend
```

The seed is safe to rerun; it upserts students by roll number. It creates a
Minor Project cycle for 3rd Year / 2nd Semester and a Major Project cycle for
4th Year / 2nd Semester. It does not create sample project topics or teams.
The student accounts use their roll numbers as the
demo login identifier (for example `24B81A1201`) and `password123` as the
shared demo password. The shared student demo credential is accepted only
when `DEMO_MODE` is not `false`. Faculty and administrators use their demo
email addresses and the same demo password.

The cohort is configured for teams of three, with exactly one permitted
four-member team. The server reserves the four-member exception for the final
four unassigned students. Newly imported accounts use a cryptographically
random initial credential and cannot sign in until an administrator creates a
single-use password setup link. The link is valid for 24 hours; students
choose a private password of at least 12 characters. This onboarding process
is for imported/non-demo accounts; the seeded cohort uses the demo password.
Students may select a faculty-posted project or register their own title and
idea. Team members can attach a public GitHub, Vercel, or other HTTP(S) project
URL in the team workspace. The link is visible to assigned faculty and
administrators as a project-link preview card and opens in a separate tab.
Final team submissions require both a `.pptx` presentation and a `.pdf`
documentation file; files are stored outside the web root and downloaded
through authenticated endpoints.
Students can also mark a proposed team open, start it with one or two members,
and receive join requests for the remaining place(s), subject to team-leader
approval. Team leaders can accept or decline requests; students can cancel
their own pending request. Before final files are submitted, a student can
unregister themselves with a recorded reason (including CRT/placement
activities) without unregistering their teammates. If the team leader leaves,
leadership passes to a remaining member. This does not remove the student from
the project-cycle roster. The overview shows cycle-specific next steps, team
membership and leadership, project status, faculty feedback, and separate
PPTX/PDF submission statuses.

The same seed adds the 20 supplied faculty names as faculty accounts, and the
names-only directory is available in the Administrator portal. It deliberately
does not import profile photos, phone numbers, or AICTE IDs. The first faculty
account is `professor@teamforge.demo`; the others use
`faculty-<name-slug>@faculty.teamforge.local`. Seeded faculty accounts use the
demo password `password123` (change these credentials before production use).

Administrators can create or update project cycle settings, team-size rules,
deadlines and cycle status in **Cycle operations**. The same screen imports
rosters, presents correctable invalid rows, displays unassigned and duplicate
team-membership exceptions, and supports audited team reassignment. Exports
include project/team membership, separate PPTX/PDF submission status and team
and individual marks. The cycle audit panel attributes changes to an actor
and timestamp.

Administrators can open **Cycle operations → Team allocations** to distribute
all teams in the selected cycle across the faculty accounts. The deterministic
allocation balances workloads so faculty counts differ by at most one team.
Faculty team, student, submission, review, and report access is filtered by
their own assignments on the server; Administrators retain cycle-wide access.
Faculty and administrators can reject a proposed student project idea with
required feedback, delete eligible project topics, and remove teams. Deleting a
project also removes its registered teams and dependent request, submission,
review, and allocation records; student/faculty accounts and roster roll
numbers are retained.
Faculty can use the **Review queue** to see assigned teams awaiting project
approval, individual student marks and feedback, or final PPTX/PDF review.
Reviewing a final submission requires both files to be present; the review
result and feedback are then visible to the team. Faculty can also edit or
close their own posted project topics from the Projects page.

The API is at `http://localhost:4000/api`; demo data is persisted to
`backend/data/store.json`.

## Production/PostgreSQL

Copy `.env.example` to `.env`, set strong access and refresh secrets, set
`DEMO_MODE=false`, and provide `DATABASE_URL`. Apply `backend/schema.sql` with
`psql` (or call `createPostgresRepository().migrate()`), then run the backend.
`backend/src/db/postgres.js` provides parameterized queries and transaction and
migration helpers. The HTTP demo repository remains available for local
development.

## Included workflows

- Cycle configuration stores timezone, server-side deadlines, team-size policy
  and per-cycle coordinator/reviewer/guide roles.
- Roster CSV/XLSX import validates rows, returns row-level errors and upserts
  by roll number.
- Team requests, approval, leadership changes, dissolution, one-active-team
  per-cycle database uniqueness, and audit events.
- Auto-formation is deterministic and preview-first; commit accepts an
  idempotency key and records the algorithm/run.
- Project title/abstract similarity warnings and immutable revision history.
- Guide allocation previews capacity/preferences; milestones, per-student
  submissions, rubrics and draft lock/unlock audit.
- Notification plus email-queue abstraction, pagination/filtering on
  collection endpoints, CSV/XLSX report adapters and a documented PDF
  provider seam.
- Authenticated uploads are stored in `backend/private-uploads` outside the web
  root and streamed only after authorization.
- `npm run seed:realistic --workspace backend` creates a 300-student/40-faculty
  fixture (password `password123`).

Important endpoints include `/api/cycles`, `/api/cycles/:id/roster/import`,
`/api/cycles/:id/formation/preview`, `/api/cycles/:id/formation/commit`,
`/api/projects/:id/similarity`, `/api/milestones`,
`/api/submissions/:id/lock`, `/api/submissions/:id/unlock`, `/api/guides`,
`/api/audit`, and `/api/reports/teams.csv|xlsx|pdf`.

## Useful commands

```bash
npm run build
npm run start --workspace backend
npm run seed:realistic --workspace backend
```
# full-stack
