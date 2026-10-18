import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { loadStore, saveStore, id, bcrypt } from './repository.js';

/*
 * The API deliberately has a small repository boundary.  DEMO_MODE uses the
 * JSON repository, while deployments can replace it with the PostgreSQL
 * adapter without changing the HTTP contract (see schema.sql and db/).
 */
const app = express();
const port = Number(process.env.PORT || 4000);
const secret = process.env.JWT_SECRET || 'teamforge-demo-secret-change-me';
const refreshSecret = process.env.JWT_REFRESH_SECRET || `${secret}:refresh`;
const store = loadStore();
const now = () => new Date().toISOString();
const ensure = (key, fallback) => { if (!store[key]) store[key] = fallback; return store[key]; };
ensure('cycles', [{ id: 'cycle-spring-2026', name: 'Spring 2026', academicYear: '2025-26', term: 'Spring', timezone: 'Asia/Kolkata', status: 'active', config: { minTeamSize: 3, maxTeamSize: 5, formationMode: 'preview_first', deadline: '2026-10-30T23:59:00+05:30' }, createdAt: now() }]);
ensure('cycleRoles', []);
ensure('rosterRows', []);
ensure('auditLog', []);
ensure('projectRevisions', []);
ensure('guides', []);
ensure('guideAllocations', []);
ensure('teamAssignments', []);
ensure('milestones', []);
ensure('submissions', []);
ensure('rubrics', []);
ensure('extensions', []);
ensure('emailQueue', []);
ensure('rateLimits', {});
ensure('formationRuns', []);
ensure('teamRequests', []);
ensure('teamExpenses', []);
ensure('notifications', []);
ensure('notificationJobs', []);
ensure('rosterImportErrors', []);
store.users.forEach((user) => { if (!user.branch) user.branch = user.department || 'Computer Science'; });
store.rosterRows.forEach((row) => { if (!row.branch) row.branch = store.users.find((u) => u.id === row.userId)?.branch || 'Computer Science'; });
store.projects.forEach((p) => { if (!p.cycleId) p.cycleId = 'cycle-spring-2026'; if (!p.abstract) p.abstract = p.description || ''; });
store.projects.forEach((p) => { if (!p.branch) p.branch = store.users.find((u) => u.id === p.ownerId)?.branch || p.department || 'Computer Science'; });
store.users.forEach((user) => {
  if (user.role === 'student' && user.email.endsWith('@student.teamforge.local') && user.mustChangePassword === undefined) {
    user.passwordHash = bcrypt.hashSync(randomBytes(48).toString('hex'), 12);
    user.mustChangePassword = true;
  }
});
saveStore(store);

app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));
const uploadRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../private-uploads');
fs.mkdirSync(uploadRoot, { recursive: true }); // intentionally not exposed via express.static
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function accessToken(user, options = {}) { return jwt.sign({ sub: user.id, role: user.role, typ: 'access', ...options }, secret, { expiresIn: process.env.JWT_ACCESS_TTL || '30m' }); }
function refreshToken(user, options = {}) { return jwt.sign({ sub: user.id, typ: 'refresh', ...options }, refreshSecret, { expiresIn: '14d' }); }
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, setupTokenHash, setupTokenExpiresAt, onboardingCompleted, ...safe } = user;
  return { ...safe, avatarColor: safe.avatarColor || safe.avatar_color };
}
function userForToken(user, options = {}) {
  const safe = publicUser(user);
  return options.demoStudent ? { ...safe, mustChangePassword: false } : safe;
}
function auth(req, res, next) {
  const value = req.headers.authorization || '';
  if (!value.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication required' });
  try {
    const decoded = jwt.verify(value.slice(7), secret);
    req.user = store.users.find((u) => u.id === decoded.sub);
    req.authClaims = decoded;
    if (!req.user || decoded.typ !== 'access') throw new Error('Unknown user');
    if (req.user.mustChangePassword && !(decoded.demoStudent && process.env.DEMO_MODE !== 'false')) return res.status(403).json({ message: 'Complete secure first-login password setup before using the portal.' });
    next();
  } catch { return res.status(401).json({ message: 'Invalid or expired session' }); }
}
function roles(...allowed) { return (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission for this action' }); }
function notify(userId, title, body, kind = 'info', metadata = {}) {
  store.notifications.unshift({ id: id('note'), userId, title, body, kind, eventType: metadata.eventType || kind, actorId: metadata.actorId || null, targetAudience: metadata.targetAudience || null, relatedEntityType: metadata.relatedEntityType || null, relatedEntityId: metadata.relatedEntityId || null, deepLink: metadata.deepLink || null, read: false, createdAt: now() });
  store.emailQueue.push({ id: id('mail'), userId, subject: title, body, status: 'queued', queuedAt: now() });
}
function queueProjectNotifications(project, actorId = project.ownerId) {
  const job = { id: id('notify-job'), type: 'project.created', projectId: project.id, status: 'queued', createdAt: now() };
  store.notificationJobs.push(job);
  saveStore(store);
  setImmediate(() => {
    const actor = store.users.find((user) => user.id === actorId);
    const recipients = new Map();
    const add = (user) => { if (user && user.id !== actorId) recipients.set(user.id, user); };
    if (actor?.role === 'student') {
      (store.teams.find((team) => team.projectId === project.id && team.memberIds?.includes(actorId))?.memberIds || []).forEach((uid) => add(store.users.find((user) => user.id === uid)));
      store.users.filter((user) => user.role === 'faculty' && user.branch === project.branch).forEach(add);
      store.users.filter((user) => user.role === 'admin' || user.role === 'coordinator').forEach(add);
    } else if (actor?.role === 'faculty') {
      store.users.filter((user) => user.role === 'admin' || (user.role === 'faculty' && user.id !== actorId && user.branch === project.branch)).forEach(add);
      store.users.filter((user) => user.role === 'student' && user.branch === project.branch && !store.teams.some((team) => team.memberIds?.includes(user.id))).forEach(add);
    } else {
      store.users.filter((user) => (user.role === 'faculty' || user.role === 'student') && user.branch === project.branch).forEach(add);
    }
    const recipientList = [...recipients.values()];
    recipientList.forEach((user) => notify(user.id, 'New project available', `${project.title} is now open for team formation.`, 'info', { eventType: 'project.created', actorId, targetAudience: user.role, relatedEntityType: 'project', relatedEntityId: project.id, deepLink: `/projects/${project.id}` }));
    job.status = 'completed'; job.completedAt = now(); job.recipientCount = recipientList.length;
    saveStore(store);
  });
}
function audit(actorId, action, entityType, entityId, details = {}) {
  store.auditLog.unshift({ id: id('audit'), actorId, actorName: store.users.find((user) => user.id === actorId)?.name || 'System', action, entityType, entityId, details, createdAt: now() });
}
function page(req, rows) {
  const pageNo = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  return { data: rows.slice((pageNo - 1) * limit, pageNo * limit), pagination: { page: pageNo, limit, total: rows.length, pages: Math.ceil(rows.length / limit) } };
}
function projectFor(idValue) { return store.projects.find((p) => p.id === idValue); }
function removePrivateUpload(filename) {
  if (typeof filename !== 'string' || !filename || path.basename(filename) !== filename) return;
  const filePath = path.join(uploadRoot, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
function removeTeamRecords(teamIds, projectId = null) {
  const removedIds = new Set(teamIds);
  const submissions = store.submissions.filter((submission) => removedIds.has(submission.teamId) || (projectId && submission.projectId === projectId));
  const submissionIds = new Set(submissions.map((submission) => submission.id));
  store.teams.filter((team) => removedIds.has(team.id)).forEach((team) => {
    removePrivateUpload(team.submission?.presentationKey);
    removePrivateUpload(team.submission?.documentationKey);
  });
  submissions.forEach((submission) => removePrivateUpload(submission.fileName));
  store.teams = store.teams.filter((team) => !removedIds.has(team.id));
  store.teamRequests = store.teamRequests.filter((request) => !removedIds.has(request.teamId));
  store.teamAssignments = store.teamAssignments.filter((assignment) => !removedIds.has(assignment.teamId));
  store.guideAllocations = store.guideAllocations.filter((allocation) => !removedIds.has(allocation.teamId) && allocation.projectId !== projectId);
  store.teamExpenses = store.teamExpenses.filter((expense) => !removedIds.has(expense.teamId));
  store.submissions = store.submissions.filter((submission) => !removedIds.has(submission.teamId) && !(projectId && submission.projectId === projectId));
  store.extensions = store.extensions.filter((extension) => !submissionIds.has(extension.submissionId));
  store.notifications = store.notifications.filter((notification) => !removedIds.has(notification.relatedEntityId));
}
function teamView(team, viewer = null) {
  const guideUserId = team.guideUserId || store.teamAssignments.find((allocation) => allocation.teamId === team.id && allocation.cycleId === team.cycleId)?.facultyId;
  const guide = store.users.find((user) => user.id === guideUserId && user.role === 'faculty');
  return {
    ...team,
    projectLink: team.projectLink || null,
    guideUserId: guide?.id || null,
    guideName: guide?.name || null,
    submission: team.submission ? {
      submittedAt: team.submission.submittedAt,
      presentationName: team.submission.presentationName,
      documentationName: team.submission.documentationName,
      reviewedAt: team.submission.reviewedAt || null,
      reviewedBy: team.submission.reviewedBy || null,
      reviewFeedback: team.submission.reviewFeedback || ''
    } : null,
    studentEvaluations: (team.studentEvaluations || []).filter((evaluation) => viewer?.role !== 'student' || evaluation.studentId === viewer.id),
    status: team.status || 'formed',
    project: projectFor(team.projectId),
    members: (team.memberIds || []).map((uid) => publicUser(store.users.find((u) => u.id === uid)))
  };
}
function assignedProjectCount(facultyId, assignments, teams) {
  const assignedTeamIds = new Set(assignments.filter((assignment) => assignment.facultyId === facultyId).map((assignment) => assignment.teamId));
  return new Set(teams
    .filter((team) => assignedTeamIds.has(team.id))
    .map((team) => team.projectId || team.project?.id || team.projectName || team.name)).size;
}
function similarity(a, b) {
  const words = (value) => new Set(String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((x) => x.length > 3));
  const left = words(a), right = words(b); if (!left.size || !right.size) return 0;
  let common = 0; left.forEach((word) => { if (right.has(word)) common += 1; });
  return Math.round((common / Math.max(left.size, right.size)) * 100);
}
function eligibleMemberIds(cycleId) {
  return new Set(store.rosterRows.filter((row) => row.cycleId === cycleId && row.status !== 'error').map((row) => row.userId).filter(Boolean));
}
function cycleFor(cycleId) { return store.cycles.find((cycle) => cycle.id === cycleId); }
function teamsInCycle(cycleId) {
  return store.teams.filter((team) => !['dissolved', 'rejected'].includes(team.status) && (team.cycleId === cycleId || projectFor(team.projectId)?.cycleId === cycleId));
}
function facultyTeams(userId, cycleId) {
  return teamsInCycle(cycleId).filter((team) => {
    const allocation = store.teamAssignments.find((entry) => entry.teamId === team.id && entry.cycleId === cycleId);
    return (team.guideUserId || allocation?.facultyId) === userId;
  });
}
function isAssignedFaculty(userId, team) {
  if (!team) return false;
  const cycleId = team.cycleId || projectFor(team.projectId)?.cycleId;
  return facultyTeams(userId, cycleId).some((assigned) => assigned.id === team.id);
}
function cycleStudentCount(cycleId) {
  return eligibleMemberIds(cycleId).size;
}
function teamSizeError(cycleId, memberCount) {
  const cycle = cycleFor(cycleId);
  const rosterSize = cycleStudentCount(cycleId);
  const teams = teamsInCycle(cycleId);
  const assigned = new Set(teams.flatMap((team) => team.memberIds || []));
  const unassignedAfter = rosterSize - assigned.size - memberCount;
  const sizeThree = Number(cycle?.config?.minTeamSize || 3);
  const exceptionSize = Number(cycle?.config?.exceptionalTeamSize || 4);
  if (memberCount === sizeThree) {
    if (unassignedAfter > 0 && unassignedAfter < sizeThree) return 'Form three-member teams while at least three students can still form a team; reserve the final four students for the one four-member team';
    return null;
  }
  if (memberCount !== exceptionSize) return `Teams must have ${sizeThree} members${exceptionSize === sizeThree + 1 ? `, except for one ${exceptionSize}-member team` : ''}`;
  if (teams.some((team) => (team.memberIds || []).length === exceptionSize)) return `Only one ${exceptionSize}-member team is allowed in this cycle`;
  if (unassignedAfter !== 0) return `The ${exceptionSize}-member team can only be formed with the final ${exceptionSize} unassigned students`;
  return null;
}
function crossBranchAllowed(cycleId) {
  const config = cycleFor(cycleId)?.config || {};
  return config.allowCrossBranch === true || config.allowCrossBranchTeams === true;
}
function userBranch(userId, cycleId) {
  const roster = store.rosterRows.find((row) => row.cycleId === cycleId && row.userId === userId);
  return roster?.branch || store.users.find((user) => user.id === userId)?.branch || null;
}
function validateTeamBranches(cycleId, memberIds, projectBranch) {
  if (crossBranchAllowed(cycleId)) return null;
  const branches = [...new Set(memberIds.map((userId) => userBranch(userId, cycleId) || projectBranch).filter(Boolean))];
  if (projectBranch && branches.some((branch) => branch !== projectBranch)) return 'All team members must be from the project branch for this cycle';
  if (branches.length > 1) return 'Cross-branch teams are disabled for this cycle';
  return null;
}
function directoryUser(user, requester, cycleId = store.cycles.find((cycle) => cycle.status === 'active')?.id) {
  const team = store.teams.find((candidate) => candidate.memberIds?.includes(user.id) && projectFor(candidate.projectId)?.cycleId === cycleId && !['dissolved', 'rejected'].includes(candidate.status));
  const roster = store.rosterRows.find((row) => row.userId === user.id && row.cycleId === cycleId);
  const safe = { id: user.id, name: user.name, department: user.department, branch: roster?.branch || user.branch || user.department, section: roster?.section || user.section || null, rollNumber: user.rollNumber || roster?.rollNumber || null, skills: user.skills || [], teamId: team?.id || null, teamName: team?.name || null, teamStatus: team ? 'in_team' : 'unassigned', teamStatusLabel: team ? 'In a team' : 'Unassigned', avatarColor: user.avatarColor };
  if (['faculty', 'admin'].includes(requester.role)) Object.assign(safe, { email: user.email, cgpa: roster?.cgpa || user.cgpa || null, guideName: null, accountStatus: user.mustChangePassword ? 'setup_required' : user.accountStatus || 'active' });
  return safe;
}
function parseRoster(buffer, originalname) {
  const extension = path.extname(originalname).toLowerCase();
  if (!['.csv', '.xlsx'].includes(extension)) throw new Error('Roster file must be CSV or XLSX');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName && workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Roster file has no worksheet');
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, mode: process.env.DEMO_MODE === 'false' ? 'postgres-ready' : 'demo', timestamp: now() }));

// Authentication: short-lived access tokens, rotating refresh tokens and a tiny
// in-memory limiter for demo mode (production should use a shared Redis limiter).
app.post('/api/auth/login', (req, res) => {
  const role = String(req.body.role || '');
  const rollNumber = String(req.body.rollNumber || '').trim().toUpperCase();
  const email = String(req.body.email || '').trim().toLowerCase();
  const identifier = role === 'student' ? `roll:${rollNumber}` : email;
  const bucket = `${req.ip}:${identifier}`; const entry = store.rateLimits[bucket] || { count: 0, resetAt: Date.now() + 15 * 60e3 };
  if (Date.now() > entry.resetAt) { entry.count = 0; entry.resetAt = Date.now() + 15 * 60e3; }
  entry.count += 1; store.rateLimits[bucket] = entry;
  if (entry.count > 10) return res.status(429).json({ message: 'Too many login attempts. Try again later.' });
  const demoStudent = role === 'student' && process.env.DEMO_MODE !== 'false';
  if (role === 'student' && !demoStudent) return res.status(403).json({ message: 'Demo roll-number credentials are disabled in production. Use your provisioned account credentials.' });
  if (demoStudent && !rollNumber) return res.status(400).json({ message: 'Enter your student roll number.' });
  const requestedCycle = String(req.body.cycleId || '');
  const user = demoStudent
    ? store.users.find((candidate) => candidate.role === 'student' && String(candidate.rollNumber || '').toUpperCase() === rollNumber && store.rosterRows.some((row) => row.userId === candidate.id && row.status !== 'error' && (!requestedCycle || row.cycleId === requestedCycle)))
    : store.users.find((candidate) => candidate.email.toLowerCase() === email);
  if (user && req.body.role && user.role !== req.body.role) return res.status(403).json({ message: `This account belongs to the ${user.role} portal.` });
  const suppliedPassword = String(req.body.password || '');
  const expectedDemoStudentPassword = process.env.DEMO_STUDENT_PASSWORD || 'password123';
  if (!user || (demoStudent ? suppliedPassword !== expectedDemoStudentPassword : !bcrypt.compareSync(suppliedPassword, user.passwordHash))) {
    return res.status(401).json({ message: demoStudent ? 'Roll number or demo password is incorrect.' : 'Email or password is incorrect' });
  }
  if (user.mustChangePassword && !demoStudent) return res.status(403).json({ message: 'Complete secure first-login password setup using the link sent by your administrator.' });
  entry.count = 0;
  const tokenOptions = demoStudent ? { demoStudent: true } : {};
  res.json({ token: accessToken(user, tokenOptions), accessToken: accessToken(user, tokenOptions), refreshToken: refreshToken(user, tokenOptions), user: userForToken(user, tokenOptions) });
});
app.post('/api/auth/first-login', (req, res) => {
  const password = String(req.body.password || '');
  const tokenHash = createHash('sha256').update(String(req.body.token || '')).digest('hex');
  const user = store.users.find((candidate) => candidate.setupTokenHash === tokenHash && candidate.setupTokenExpiresAt && Date.parse(candidate.setupTokenExpiresAt) > Date.now());
  if (!user) return res.status(400).json({ message: 'This setup link is invalid or expired. Ask your administrator for a new link.' });
  if (password.length < 12) return res.status(400).json({ message: 'Choose a password with at least 12 characters.' });
  user.passwordHash = bcrypt.hashSync(password, 12);
  user.mustChangePassword = false;
  user.onboardingCompleted = true;
  delete user.setupTokenHash;
  delete user.setupTokenExpiresAt;
  audit(user.id, 'account.password.initialized', 'user', user.id);
  saveStore(store);
  res.json({ message: 'Password set. You can now sign in.' });
});
app.post('/api/auth/refresh', (req, res) => {
  try {
    const decoded = jwt.verify(String(req.body.refreshToken || ''), refreshSecret);
    const user = store.users.find((u) => u.id === decoded.sub); if (!user) throw new Error('Unknown user');
    const tokenOptions = decoded.demoStudent && process.env.DEMO_MODE !== 'false' ? { demoStudent: true } : {};
    if (user.mustChangePassword && !tokenOptions.demoStudent) return res.status(403).json({ message: 'Complete secure first-login password setup before using the portal.' });
    res.json({ token: accessToken(user, tokenOptions), accessToken: accessToken(user, tokenOptions), refreshToken: refreshToken(user, tokenOptions), user: userForToken(user, tokenOptions) });
  } catch { res.status(401).json({ message: 'Invalid refresh token' }); }
});
app.post('/api/auth/google', (req, res) => {
  const role = ['student', 'faculty', 'admin'].includes(req.body.role) ? req.body.role : 'student';
  const email = { student: 'maya@teamforge.demo', faculty: 'professor@teamforge.demo', admin: 'admin@teamforge.demo' }[role];
  const user = store.users.find((candidate) => candidate.email === email); if (!user) return res.status(503).json({ message: 'Google sign-in is not configured' });
  if (user.mustChangePassword) return res.status(403).json({ message: 'Complete secure first-login password setup before using the portal.' });
  res.json({ token: accessToken(user), accessToken: accessToken(user), refreshToken: refreshToken(user), user: publicUser(user), provider: 'google-demo' });
});
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role = 'student', department = 'Computer Science', branch = department, skills = [], rollNumber } = req.body;
  if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: 'Name, email, and an 8 character password are required' });
  if (store.users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) return res.status(409).json({ message: 'An account with that email already exists' });
  const user = { id: id('usr'), name, email: String(email).toLowerCase(), role: role === 'faculty' ? 'faculty' : 'student', department, branch, skills, rollNumber: rollNumber || null, avatarColor: '#6d5dfc', passwordHash: bcrypt.hashSync(password, 10) };
  store.users.push(user); notify(user.id, 'Welcome to TeamForge', 'Your profile is ready.', 'success'); saveStore(store);
  res.status(201).json({ token: accessToken(user), accessToken: accessToken(user), refreshToken: refreshToken(user), user: publicUser(user) });
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: userForToken(req.user, { demoStudent: req.authClaims.demoStudent && process.env.DEMO_MODE !== 'false' }) }));

// Cycles and roster management
app.get('/api/cycles', auth, (req, res) => { const result = page(req, store.cycles.map((cycle) => ({ ...cycle, roles: store.cycleRoles.filter((r) => r.cycleId === cycle.id) }))); res.json({ ...result, cycles: result.data }); });
app.post('/api/cycles', auth, roles('admin'), (req, res) => {
  const minTeamSize = Number(req.body.config?.minTeamSize ?? 3);
  const maxTeamSize = Number(req.body.config?.maxTeamSize ?? 3);
  if (typeof req.body.name !== 'string' || !req.body.name.trim() || typeof req.body.academicYear !== 'string' || !req.body.academicYear.trim() || typeof req.body.term !== 'string' || !req.body.term.trim()) return res.status(400).json({ message: 'Cycle name, academic year, and project type/term are required' });
  if (!Number.isInteger(minTeamSize) || !Number.isInteger(maxTeamSize) || minTeamSize < 1 || maxTeamSize < minTeamSize || maxTeamSize > 8) return res.status(400).json({ message: 'Team size rules must be whole numbers between 1 and 8, with maximum >= minimum' });
  const status = ['draft', 'active', 'closed'].includes(req.body.status) ? req.body.status : 'draft';
  const cycle = { id: id('cycle'), name: req.body.name.trim(), academicYear: req.body.academicYear.trim(), term: req.body.term.trim(), projectType: req.body.projectType || '', department: req.body.department || 'Information Technology', timezone: req.body.timezone || 'Asia/Kolkata', status, config: { ...(req.body.config || {}), minTeamSize, maxTeamSize, allowCrossBranch: Boolean(req.body.config?.allowCrossBranch) }, createdAt: now() };
  store.cycles.push(cycle); audit(req.user.id, 'cycle.created', 'cycle', cycle.id); saveStore(store); res.status(201).json({ cycle });
});
app.patch('/api/cycles/:cycleId', auth, roles('admin'), (req, res) => {
  const cycle = store.cycles.find((c) => c.id === req.params.cycleId); if (!cycle) return res.status(404).json({ message: 'Cycle not found' });
  const fields = ['name', 'academicYear', 'term', 'projectType', 'department', 'timezone', 'status'];
  const nextFields = fields.reduce((out, key) => (req.body[key] !== undefined && (out[key] = req.body[key]), out), {});
  if (nextFields.status && !['draft', 'active', 'closed'].includes(nextFields.status)) return res.status(400).json({ message: 'Cycle status must be draft, active, or closed' });
  if (nextFields.name !== undefined && (typeof nextFields.name !== 'string' || !nextFields.name.trim())) return res.status(400).json({ message: 'Cycle name cannot be empty' });
  if (nextFields.academicYear !== undefined && (typeof nextFields.academicYear !== 'string' || !nextFields.academicYear.trim())) return res.status(400).json({ message: 'Academic year cannot be empty' });
  if (nextFields.term !== undefined && (typeof nextFields.term !== 'string' || !nextFields.term.trim())) return res.status(400).json({ message: 'Project type/term cannot be empty' });
  let nextConfig = cycle.config;
  if (req.body.config) {
    nextConfig = { ...cycle.config, ...req.body.config };
    const minTeamSize = Number(nextConfig.minTeamSize);
    const maxTeamSize = Number(nextConfig.maxTeamSize);
    if (!Number.isInteger(minTeamSize) || !Number.isInteger(maxTeamSize) || minTeamSize < 1 || maxTeamSize < minTeamSize || maxTeamSize > 8) return res.status(400).json({ message: 'Team size rules must be whole numbers between 1 and 8, with maximum >= minimum' });
    nextConfig = { ...nextConfig, minTeamSize, maxTeamSize };
  }
  Object.assign(cycle, nextFields);
  if (req.body.config) cycle.config = nextConfig;
  audit(req.user.id, 'cycle.updated', 'cycle', cycle.id, req.body); saveStore(store); res.json({ cycle });
});
app.post('/api/cycles/:cycleId/roles', auth, roles('admin', 'faculty'), (req, res) => {
  if (!store.cycles.some((c) => c.id === req.params.cycleId)) return res.status(404).json({ message: 'Cycle not found' });
  const role = { id: id('crole'), cycleId: req.params.cycleId, userId: req.body.userId, role: req.body.role || 'coordinator', startsAt: req.body.startsAt || now(), endsAt: req.body.endsAt || null };
  store.cycleRoles.push(role); audit(req.user.id, 'cycle.role.assigned', 'cycle_role', role.id, role); saveStore(store); res.status(201).json({ role });
});
app.post('/api/cycles/:cycleId/roster/import', auth, roles('admin'), upload.single('roster'), (req, res) => {
  if (!cycleFor(req.params.cycleId)) return res.status(404).json({ message: 'Cycle not found' });
  if (!req.file) return res.status(400).json({ message: 'Attach a CSV or XLSX roster' });
  let rows; try { rows = parseRoster(req.file.buffer, req.file.originalname); } catch { return res.status(400).json({ message: 'Could not parse roster file' }); }
  const errors = []; let imported = 0;
  rows.forEach((raw, index) => {
    const row = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), String(v ?? '').trim()]));
    const rollNumber = row.roll_number || row.rollno || row.roll || row.student_id;
    const email = row.email?.toLowerCase(); const name = row.name || row.full_name;
    const missing = ['name', 'email', 'roll_number'].filter((field) => !(field === 'roll_number' ? rollNumber : field === 'name' ? name : email));
    if (missing.length || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      const error = { id: id('roster-error'), cycleId: req.params.cycleId, row: index + 2, message: missing.length ? `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required` : 'email is not valid', data: row, createdAt: now() };
      store.rosterImportErrors.push(error); errors.push(error); return;
    }
    const duplicateRoll = store.rosterRows.find((item) => item.cycleId === req.params.cycleId && item.rollNumber === rollNumber && item.email !== email);
    const duplicateEmail = store.rosterRows.find((item) => item.cycleId === req.params.cycleId && item.email === email && item.rollNumber !== rollNumber);
    if (duplicateRoll || duplicateEmail) {
      const error = { id: id('roster-error'), cycleId: req.params.cycleId, row: index + 2, message: 'Roll number or email conflicts with another roster entry', data: row, createdAt: now() };
      store.rosterImportErrors.push(error); errors.push(error); return;
    }
    const identityConflict = store.users.find((candidate) =>
      (candidate.rollNumber === rollNumber && candidate.email !== email) ||
      (candidate.email === email && candidate.rollNumber && candidate.rollNumber !== rollNumber)
    );
    if (identityConflict) {
      const error = { id: id('roster-error'), cycleId: req.params.cycleId, row: index + 2, message: 'Roll number and email do not match the same student account', data: row, createdAt: now() };
      store.rosterImportErrors.push(error); errors.push(error); return;
    }
    let user = store.users.find((u) => u.rollNumber === rollNumber || u.email === email);
    if (user && user.role !== 'student') {
      const error = { id: id('roster-error'), cycleId: req.params.cycleId, row: index + 2, message: 'This roll number or email belongs to a non-student account', data: row, createdAt: now() };
      store.rosterImportErrors.push(error); errors.push(error); return;
    }
    if (user) {
      if (!user.onboardingCompleted && user.mustChangePassword !== true) {
        user.passwordHash = bcrypt.hashSync(randomBytes(48).toString('hex'), 12);
        user.mustChangePassword = true;
      }
      Object.assign(user, { name, email, rollNumber, department: row.department || user.department, branch: row.branch || user.branch || row.department || user.department, skills: row.skills ? row.skills.split('|').map((s) => s.trim()) : user.skills });
    }
    else { user = { id: id('usr'), name, email, rollNumber, role: 'student', department: row.department || 'Information Technology', branch: row.branch || row.department || 'IT', skills: row.skills ? row.skills.split('|') : [], avatarColor: '#6d5dfc', passwordHash: bcrypt.hashSync(randomBytes(48).toString('hex'), 12), mustChangePassword: true }; store.users.push(user); }
    const existing = store.rosterRows.find((r) => r.cycleId === req.params.cycleId && r.rollNumber === rollNumber);
    const roster = { id: existing?.id || id('roster'), cycleId: req.params.cycleId, userId: user.id, rollNumber, name, email, branch: row.branch || user.branch, section: row.section || null, cgpa: row.cgpa || null, status: 'ok', importedAt: now() };
    if (existing) Object.assign(existing, roster); else store.rosterRows.push(roster); imported += 1;
  });
  audit(req.user.id, 'roster.imported', 'cycle', req.params.cycleId, { imported, errors: errors.length }); saveStore(store);
  res.json({ imported, errors, total: rows.length, upsertKey: 'roll_number' });
});
app.get('/api/cycles/:cycleId/roster-errors', auth, roles('admin'), (req, res) => {
  if (!cycleFor(req.params.cycleId)) return res.status(404).json({ message: 'Cycle not found' });
  const errors = store.rosterImportErrors.filter((entry) => entry.cycleId === req.params.cycleId);
  res.json({ errors, total: errors.length });
});
app.get('/api/cycles/:cycleId/oversight', auth, roles('admin'), (req, res) => {
  if (!cycleFor(req.params.cycleId)) return res.status(404).json({ message: 'Cycle not found' });
  const cycleId = req.params.cycleId;
  const roster = store.rosterRows.filter((row) => row.cycleId === cycleId);
  const teams = teamsInCycle(cycleId);
  const memberships = new Map();
  teams.forEach((team) => (team.memberIds || []).forEach((userId) => {
    const list = memberships.get(userId) || [];
    list.push(team);
    memberships.set(userId, list);
  }));
  const duplicates = [...memberships.entries()].filter(([, memberTeams]) => memberTeams.length > 1).map(([userId, memberTeams]) => ({
    student: publicUser(store.users.find((user) => user.id === userId)),
    teams: memberTeams.map((team) => ({ id: team.id, name: team.name }))
  }));
  const unassigned = roster.filter((row) => row.userId && !(memberships.get(row.userId) || []).length).map((row) => ({
    ...row, student: publicUser(store.users.find((user) => user.id === row.userId))
  }));
  res.json({
    cycleId,
    counts: { roster: roster.length, formedTeams: teams.length, assignedStudents: new Set([...memberships.keys()]).size, unassignedStudents: unassigned.length, duplicateMemberships: duplicates.length, invalidRows: store.rosterImportErrors.filter((entry) => entry.cycleId === cycleId).length },
    unassigned, duplicates, teams: teams.map((team) => ({ id: team.id, name: team.name, size: team.memberIds?.length || 0, maxMembers: Number(cycleFor(cycleId).config?.maxTeamSize || 3) }))
  });
});
app.put('/api/cycles/:cycleId/students/:studentId/team', auth, roles('admin'), (req, res) => {
  const cycle = cycleFor(req.params.cycleId);
  if (!cycle) return res.status(404).json({ message: 'Cycle not found' });
  const student = store.users.find((user) => user.id === req.params.studentId && user.role === 'student');
  const rosterRow = store.rosterRows.find((row) => row.cycleId === cycle.id && row.userId === student?.id);
  if (!student || !rosterRow) return res.status(404).json({ message: 'Student is not on this cycle roster' });
  const teams = teamsInCycle(cycle.id);
  const previousTeams = teams.filter((team) => team.memberIds?.includes(student.id));
  const target = req.body.teamId ? teams.find((team) => team.id === req.body.teamId) : null;
  if (req.body.teamId && !target) return res.status(404).json({ message: 'Target team is not in this cycle' });
  if (target) {
    const maxMembers = Number(cycle.config?.maxTeamSize || 3);
    const targetMembers = (target.memberIds || []).filter((memberId) => memberId !== student.id);
    if (targetMembers.length >= maxMembers) return res.status(409).json({ message: `This cycle's maximum team size is ${maxMembers}` });
    const branchError = validateTeamBranches(cycle.id, [...targetMembers, student.id], projectFor(target.projectId)?.branch);
    if (branchError) return res.status(409).json({ message: branchError });
  }
  previousTeams.forEach((team) => {
    team.memberIds = team.memberIds.filter((memberId) => memberId !== student.id);
    if (team.leaderId === student.id) team.leaderId = team.memberIds[0] || null;
    if (!team.memberIds.length) { team.status = 'dissolved'; team.dissolvedAt = now(); }
  });
  if (target) {
    target.memberIds ||= [];
    if (!target.memberIds.includes(student.id)) target.memberIds.push(student.id);
    if (!target.leaderId) target.leaderId = student.id;
  }
  audit(req.user.id, target ? 'student.team.force_assigned' : 'student.team.unassigned', 'student', student.id, {
    cycleId: cycle.id, previousTeamIds: previousTeams.map((team) => team.id), teamId: target?.id || null, reason: String(req.body.reason || 'Administrator roster oversight').slice(0, 300)
  });
  saveStore(store);
  res.json({ student: publicUser(student), teamId: target?.id || null, previousTeamIds: previousTeams.map((team) => team.id) });
});
app.patch('/api/cycles/:cycleId/roster-errors/:errorId/resolve', auth, roles('admin'), (req, res) => {
  const error = store.rosterImportErrors.find((entry) => entry.id === req.params.errorId && entry.cycleId === req.params.cycleId);
  if (!error) return res.status(404).json({ message: 'Roster error not found' });
  const input = { ...error.data, ...req.body };
  const rollNumber = String(input.roll_number || input.rollno || input.roll || input.student_id || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const name = String(input.name || input.full_name || '').trim();
  if (!rollNumber || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid name, email, and roll number before resolving this row' });
  const duplicate = store.rosterRows.find((row) => row.cycleId === req.params.cycleId && (row.rollNumber === rollNumber || row.email === email));
  if (duplicate) return res.status(409).json({ message: 'That roll number or email already exists in this cycle' });
  const identityConflict = store.users.find((candidate) =>
    (candidate.rollNumber === rollNumber && candidate.email !== email) ||
    (candidate.email === email && candidate.rollNumber && candidate.rollNumber !== rollNumber)
  );
  if (identityConflict) return res.status(409).json({ message: 'Roll number and email do not match the same existing student account' });
  let user = store.users.find((candidate) => candidate.rollNumber === rollNumber || candidate.email === email);
  if (user && user.role !== 'student') return res.status(409).json({ message: 'That roll number or email belongs to a non-student account' });
  if (!user) {
    user = { id: id('usr'), name, email, rollNumber, role: 'student', department: input.department || 'Information Technology', branch: input.branch || input.department || 'IT', skills: [], avatarColor: '#6d5dfc', passwordHash: bcrypt.hashSync(randomBytes(48).toString('hex'), 12), mustChangePassword: true };
    store.users.push(user);
  } else {
    if (!user.onboardingCompleted && user.mustChangePassword !== true) {
      user.passwordHash = bcrypt.hashSync(randomBytes(48).toString('hex'), 12);
      user.mustChangePassword = true;
    }
    Object.assign(user, { name, email, rollNumber, role: 'student', mustChangePassword: user.mustChangePassword || false });
  }
  store.rosterRows.push({ id: id('roster'), cycleId: req.params.cycleId, userId: user.id, rollNumber, name, email, branch: input.branch || user.branch, section: input.section || null, cgpa: input.cgpa || null, status: 'ok', importedAt: now() });
  store.rosterImportErrors = store.rosterImportErrors.filter((entry) => entry.id !== error.id);
  audit(req.user.id, 'roster.row.resolved', 'cycle', req.params.cycleId, { row: error.row, rollNumber });
  saveStore(store);
  res.json({ resolved: true, user: publicUser(user) });
});
app.post('/api/users/:userId/setup-link', auth, roles('admin'), (req, res) => {
  const user = store.users.find((candidate) => candidate.id === req.params.userId && candidate.role === 'student');
  if (!user) return res.status(404).json({ message: 'Student account not found' });
  const token = randomBytes(32).toString('base64url');
  user.setupTokenHash = createHash('sha256').update(token).digest('hex');
  user.setupTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  user.mustChangePassword = true;
  audit(req.user.id, 'account.setup_link.created', 'user', user.id);
  saveStore(store);
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  const setupUrl = `${clientOrigin}/?setupToken=${encodeURIComponent(token)}`;
  store.emailQueue.push({ id: id('mail'), userId: user.id, subject: 'Set up your TeamForge account', body: `Set your password within 24 hours: ${setupUrl}`, status: 'queued', queuedAt: now() });
  saveStore(store);
  res.json({ message: 'A single-use setup link was created. Copy and share it with the student; automatic email delivery requires a configured mail service.', setupUrl, expiresAt: user.setupTokenExpiresAt });
});
app.get('/api/cycles/:cycleId/roster', auth, (req, res) => {
  let rows = store.rosterRows.filter((row) => row.cycleId === req.params.cycleId);
  if (req.user.role === 'faculty') {
    const assignedStudents = new Set(facultyTeams(req.user.id, req.params.cycleId).flatMap((team) => team.memberIds || []));
    rows = rows.filter((row) => assignedStudents.has(row.userId));
  }
  res.json(page(req, rows));
});
app.get('/api/faculty-directory', auth, roles('admin'), (req, res) => {
  const names = [...new Set((store.facultyDirectory || []).filter((name) => typeof name === 'string' && name.trim()))]
    .sort((a, b) => a.localeCompare(b));
  const result = page(req, names);
  res.json({ faculty: result.data, pagination: result.pagination });
});
app.get('/api/cycles/:cycleId/team-allocations', auth, roles('admin'), (req, res) => {
  if (!cycleFor(req.params.cycleId)) return res.status(404).json({ message: 'Cycle not found' });
  const faculty = store.users.filter((user) => user.role === 'faculty' && (!user.branch || user.branch === 'IT'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((user) => ({ id: user.id, name: user.name }));
  const teams = teamsInCycle(req.params.cycleId).map((team) => teamView(team));
  const assignments = store.teamAssignments.filter((assignment) => assignment.cycleId === req.params.cycleId);
  const workloads = faculty.map((member) => ({
    ...member,
    teamCount: assignments.filter((assignment) => assignment.facultyId === member.id && teams.some((team) => team.id === assignment.teamId)).length,
    projectCount: assignedProjectCount(member.id, assignments, teams)
  }));
  res.json({ faculty, teams, workloads });
});
app.patch('/api/cycles/:cycleId/team-allocations/:teamId', auth, roles('admin'), (req, res) => {
  const cycleId = req.params.cycleId;
  const team = teamsInCycle(cycleId).find((candidate) => candidate.id === req.params.teamId);
  const faculty = store.users.find((user) => user.id === req.body.facultyId && user.role === 'faculty' && (!user.branch || user.branch === 'IT'));
  if (!team) return res.status(404).json({ message: 'Team not found in this cycle' });
  if (!faculty) return res.status(400).json({ message: 'Choose a valid department faculty account' });
  const previous = store.teamAssignments.find((assignment) => assignment.cycleId === cycleId && assignment.teamId === team.id);
  if (previous?.facultyId === faculty.id) return res.json({ assignment: previous });
  const assignments = store.teamAssignments.filter((assignment) => assignment.cycleId === cycleId && assignment.teamId !== team.id);
  const nextAssignments = [...assignments, { id: previous?.id || id('team-assignment'), cycleId, teamId: team.id, facultyId: faculty.id, assignedBy: req.user.id, assignedAt: now() }];
  const counts = store.users.filter((user) => user.role === 'faculty' && (!user.branch || user.branch === 'IT'))
    .map((user) => nextAssignments.filter((assignment) => assignment.facultyId === user.id).length);
  if (Math.max(...counts) - Math.min(...counts) > 1) return res.status(409).json({ message: 'Keep faculty workloads balanced: team counts may differ by no more than one' });
  store.teamAssignments = store.teamAssignments.filter((assignment) => assignment !== previous).concat(nextAssignments.at(-1));
  notify(faculty.id, 'Team allocated to you', `${team.name} is now assigned to you for coordination.`, 'success', {
    eventType: 'faculty.team_allocated', actorId: req.user.id, targetAudience: 'faculty',
    relatedEntityType: 'team', relatedEntityId: team.id, deepLink: `/teams/${team.id}`
  });
  audit(req.user.id, 'team.faculty.allocated', 'team', team.id, { facultyId: faculty.id, facultyName: faculty.name, cycleId });
  saveStore(store);
  res.json({ assignment: nextAssignments.at(-1) });
});
app.post('/api/cycles/:cycleId/team-allocations/balance', auth, roles('admin'), (req, res) => {
  const cycleId = req.params.cycleId;
  if (!cycleFor(cycleId)) return res.status(404).json({ message: 'Cycle not found' });
  const faculty = store.users.filter((user) => user.role === 'faculty' && (!user.branch || user.branch === 'IT')).sort((a, b) => a.name.localeCompare(b.name));
  const teams = teamsInCycle(cycleId).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  if (!faculty.length) return res.status(409).json({ message: 'No faculty accounts are available for team allocation' });
  if (!teams.length) return res.status(409).json({ message: 'There are no teams to allocate in this cycle' });
  const allocations = teams.map((team, index) => {
    const member = faculty[index % faculty.length];
    return { id: id('team-assignment'), cycleId, teamId: team.id, facultyId: member.id, assignedBy: req.user.id, assignedAt: now() };
  });
  store.teamAssignments = store.teamAssignments.filter((assignment) => assignment.cycleId !== cycleId).concat(allocations);
  allocations.forEach((allocation) => {
    const team = teams.find((candidate) => candidate.id === allocation.teamId);
    const assignedFaculty = faculty.find((member) => member.id === allocation.facultyId);
    if (team) notify(allocation.facultyId, 'Team allocated to you', `${team.name} is now assigned to you for coordination.`, 'success', {
      eventType: 'faculty.team_allocated', actorId: req.user.id, targetAudience: 'faculty',
      relatedEntityType: 'team', relatedEntityId: team.id, deepLink: `/teams/${team.id}`
    });
    audit(req.user.id, 'team.faculty.allocated', 'team', allocation.teamId, { facultyId: allocation.facultyId, facultyName: assignedFaculty?.name, cycleId });
  });
  saveStore(store);
  res.json({
    assignments: allocations.map((allocation) => ({ ...allocation, teamName: teams.find((team) => team.id === allocation.teamId)?.name, facultyName: faculty.find((member) => member.id === allocation.facultyId)?.name })),
    workloads: faculty.map((member) => ({
      id: member.id,
      name: member.name,
      teamCount: allocations.filter((assignment) => assignment.facultyId === member.id).length,
      projectCount: assignedProjectCount(member.id, allocations, teams)
    }))
  });
});

// Dashboard and users
app.get('/api/dashboard', auth, (req, res) => {
  const cycle = cycleFor(String(req.query.cycleId || '')) || store.cycles.find((item) => item.status === 'active');
  const cycleId = cycle?.id;
  const rosterIds = eligibleMemberIds(cycleId);
  const projects = store.projects.filter((project) => !cycleId || project.cycleId === cycleId)
    .map((project) => ({ ...project, owner: publicUser(store.users.find((u) => u.id === project.ownerId)), teams: store.teams.filter((team) => team.projectId === project.id && !['dissolved', 'rejected'].includes(team.status)).length }));
  const cycleTeams = teamsInCycle(cycleId);
  const visibleTeams = req.user.role === 'student'
    ? cycleTeams.filter((team) => team.memberIds?.includes(req.user.id))
    : req.user.role === 'faculty' ? facultyTeams(req.user.id, cycleId) : cycleTeams;
  const visibleProjects = req.user.role === 'faculty'
    ? projects.filter((project) => project.ownerId === req.user.id || visibleTeams.some((team) => team.projectId === project.id))
    : projects;
  const ongoingProjects = projects.filter((project) => ['active', 'in_progress', 'ongoing'].includes(project.status)).length;
  res.json({
    stats: {
      students: rosterIds.size,
      projects: projects.length,
      ongoingProjects,
      formedTeams: cycleTeams.length,
      avgBalance: cycleTeams.length ? Math.round(cycleTeams.reduce((sum, team) => sum + (team.score || 0), 0) / cycleTeams.length) : 0
    },
    projects: visibleProjects, myTeams: visibleTeams.map((team) => teamView(team, req.user)), users: [], activeCycle: cycle || null
  });
});
app.get('/api/users', auth, (req, res) => {
  let rows = store.users.filter((u) => u.role === 'student');
  const cycleId = req.query.cycleId || store.cycles.find((cycle) => cycle.status === 'active')?.id;
  if (cycleId) {
    const eligible = eligibleMemberIds(String(cycleId));
    rows = rows.filter((user) => eligible.has(user.id));
  }
  if (req.user.role === 'faculty') {
    const assignedStudentIds = new Set(facultyTeams(req.user.id, String(cycleId || '')).flatMap((team) => team.memberIds || []));
    rows = rows.filter((user) => assignedStudentIds.has(user.id));
  }
  if (req.query.branch) rows = rows.filter((u) => userBranch(u.id, cycleId) === req.query.branch);
  if (req.query.department) rows = rows.filter((u) => u.department === req.query.department);
  if (req.query.section) rows = rows.filter((u) => store.rosterRows.some((row) => row.userId === u.id && row.cycleId === cycleId && row.section === req.query.section));
  if (req.query.skill) rows = rows.filter((u) => (u.skills || []).some((skill) => skill.toLowerCase().includes(String(req.query.skill).toLowerCase())));
  if (req.query.search) rows = rows.filter((u) => `${u.name} ${u.rollNumber || ''}`.toLowerCase().includes(String(req.query.search).toLowerCase()));
  const directory = rows.map((user) => directoryUser(user, req.user, cycleId));
  if (req.query.teamStatus) rows = rows.filter((user) => directory.find((entry) => entry.id === user.id)?.teamStatus === req.query.teamStatus);
  const sorted = rows.map((user) => directoryUser(user, req.user, cycleId)).sort((a, b) => String(a[req.query.sort === 'rollNumber' ? 'rollNumber' : 'name'] || '').localeCompare(String(b[req.query.sort === 'rollNumber' ? 'rollNumber' : 'name'] || '')));
  const result = page(req, sorted); const branches = [...new Set(store.rosterRows.filter((row) => row.cycleId === cycleId).map((row) => row.branch).filter(Boolean).concat(store.users.map((user) => user.branch).filter(Boolean)))];
  res.json({ ...result, users: result.data, branches, cycleId });
});
app.patch('/api/users/me', auth, (req, res) => { ['name', 'department', 'branch', 'skills', 'rollNumber'].forEach((key) => { if (req.body[key] !== undefined) req.user[key] = req.body[key]; }); saveStore(store); res.json({ user: publicUser(req.user) }); });
function directoryTarget(req, res) {
  const target = store.users.find((user) => user.id === req.params.userId && user.role === 'student');
  if (!target) { res.status(404).json({ message: 'Student not found' }); return null; }
  if (userBranch(target.id, store.cycles.find((cycle) => cycle.status === 'active')?.id) !== userBranch(req.user.id, store.cycles.find((cycle) => cycle.status === 'active')?.id)) { res.status(409).json({ message: 'Directory actions are limited to your branch' }); return null; }
  const key = `${req.user.id}:${new Date().toISOString().slice(0, 10)}`; const used = store.rateLimits[key] || 0;
  if (used >= 20) { res.status(429).json({ message: 'Daily directory invitation limit reached' }); return null; }
  store.rateLimits[key] = used + 1; return target;
}
app.post('/api/teams/:teamId/invitations', auth, roles('student'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId);
  if (!team || team.leaderId !== req.user.id) return res.status(403).json({ message: 'Only the team leader can send invitations' });
  const target = directoryTarget({ ...req, params: { userId: req.body.studentId } }, res); if (!target) return;
  const project = projectFor(team.projectId); const branchError = validateTeamBranches(project?.cycleId, [...team.memberIds, target.id], project?.branch);
  if (branchError) return res.status(409).json({ message: branchError });
  notify(target.id, 'Team invitation', `${req.user.name} invited you to join ${team.name}.`, 'info'); saveStore(store); res.status(201).json({ message: 'Invitation sent' });
});
app.post('/api/users/:userId/team-up', auth, roles('student'), (req, res) => {
  if (req.params.userId === req.user.id || req.user.teamId) return res.status(409).json({ message: 'You cannot request to team up from this account' });
  const target = directoryTarget(req, res); if (!target) return;
  notify(target.id, 'Request to team up', `${req.user.name} would like to form a project team with you.`, 'info'); saveStore(store); res.status(201).json({ message: 'Request to team up sent' });
});

// Projects, revisions and similarity warnings
app.get('/api/projects', auth, (req, res) => {
  let rows = store.projects.filter((p) => !req.query.cycleId || p.cycleId === req.query.cycleId).filter((p) => !req.query.status || p.status === req.query.status).map((project) => ({ ...project, owner: publicUser(store.users.find((u) => u.id === project.ownerId)), teams: store.teams.filter((t) => t.projectId === project.id && !['dissolved', 'rejected'].includes(t.status)).length }));
  if (req.user.role === 'student') rows = rows.filter((project) => project.status !== 'closed');
  if (req.user.role === 'faculty') {
    const assigned = new Set(teamsInCycle(String(req.query.cycleId || store.cycles.find((cycle) => cycle.status === 'active')?.id || '')).filter((team) => isAssignedFaculty(req.user.id, team)).map((team) => team.projectId));
    rows = rows.filter((project) => project.ownerId === req.user.id || assigned.has(project.id));
  }
  if (req.query.search) rows = rows.filter((p) => `${p.title} ${p.abstract}`.toLowerCase().includes(String(req.query.search).toLowerCase()));
  const result = page(req, rows); res.json({ ...result, projects: result.data });
});
app.post('/api/projects', auth, roles('faculty', 'admin'), (req, res) => {
  const { title, description, abstract = description, acronym, course = 'Advanced Basics 2025/2026/L', department = req.user.department, branch = req.user.branch || department, teamSize = 3, deadline, cycleId = store.cycles.find((c) => c.status === 'active')?.id } = req.body;
  if (!title || !description) return res.status(400).json({ message: 'Title and description are required' });
  if (acronym && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(acronym.trim())) return res.status(400).json({ message: 'Project acronym must start with a letter and contain only letters, numbers, dashes, or underscores' });
  if (store.projects.some((project) => project.title.toLowerCase() === title.trim().toLowerCase() || (acronym && project.acronym?.toLowerCase() === acronym.trim().toLowerCase()))) return res.status(409).json({ message: 'Project name and acronym must be unique' });
  const matches = store.projects.map((p) => ({ projectId: p.id, title: p.title, score: similarity(title, p.title) })).filter((m) => m.score >= 40).sort((a, b) => b.score - a.score);
  if (!cycleFor(cycleId)) return res.status(404).json({ message: 'Project cycle not found' });
  const project = { id: id('prj'), cycleId, title: title.trim(), acronym: acronym?.trim() || null, course, description, abstract, department, branch, status: 'active', teamSize: 3, ownerId: req.user.id, deadline: deadline || null, briefUrl: null, createdAt: now() };
  store.projects.unshift(project); audit(req.user.id, 'project.created', 'project', project.id, { similarityWarnings: matches }); saveStore(store);
  queueProjectNotifications(project);
  res.status(201).json({ project, similarityWarnings: matches, notificationStatus: 'queued' });
});
app.get('/api/projects/:projectId/similarity', auth, (req, res) => { const p = projectFor(req.params.projectId); if (!p) return res.status(404).json({ message: 'Project not found' }); res.json({ matches: store.projects.filter((other) => other.id !== p.id).map((other) => ({ projectId: other.id, title: other.title, score: similarity(p.title, other.title) })).filter((m) => m.score >= 30).sort((a, b) => b.score - a.score) }); });
app.patch('/api/projects/:projectId', auth, roles('faculty', 'admin'), (req, res) => {
  const project = projectFor(req.params.projectId);
  if (!project || (req.user.role === 'faculty' && project.ownerId !== req.user.id)) return res.status(404).json({ message: 'Project topic not found' });
  if (req.body.status !== undefined && !['active', 'closed'].includes(req.body.status)) return res.status(400).json({ message: 'Topic status must be active or closed' });
  if (req.body.title !== undefined && !String(req.body.title).trim()) return res.status(400).json({ message: 'Project title cannot be empty' });
  if (req.body.title !== undefined && store.projects.some((other) => other.id !== project.id && other.cycleId === project.cycleId && other.title.toLowerCase() === String(req.body.title).trim().toLowerCase())) return res.status(409).json({ message: 'Another project in this cycle already has that title' });
  const before = { ...project };
  ['title', 'description', 'abstract', 'deadline', 'status', 'teamSize'].forEach((key) => {
    if (req.body[key] !== undefined) project[key] = key === 'title' ? String(req.body[key]).trim() : req.body[key];
  });
  store.projectRevisions.push({ id: id('revision'), projectId: project.id, changedBy: req.user.id, before, after: { ...project }, createdAt: now() });
  audit(req.user.id, project.status !== before.status ? `project.${project.status === 'closed' ? 'closed' : 'reopened'}` : 'project.revised', 'project', project.id);
  saveStore(store);
  res.json({ project, revision: store.projectRevisions.at(-1) });
});
app.delete('/api/projects/:projectId', auth, roles('faculty', 'admin'), (req, res) => {
  const project = projectFor(req.params.projectId);
  if (!project || (req.user.role === 'faculty' && project.ownerId !== req.user.id)) return res.status(404).json({ message: 'Project topic not found' });
  const teamIds = store.teams.filter((team) => team.projectId === project.id).map((team) => team.id);
  const teamIdSet = new Set(teamIds);
  removePrivateUpload(project.briefFile);
  const memberIds = [...new Set(store.teams.filter((team) => teamIds.includes(team.id)).flatMap((team) => team.memberIds || []))];
  removeTeamRecords(teamIds, project.id);
  store.projects = store.projects.filter((candidate) => candidate.id !== project.id);
  store.projectRevisions = store.projectRevisions.filter((revision) => revision.projectId !== project.id);
  store.notifications = store.notifications.filter((notification) => notification.relatedEntityId !== project.id && !teamIdSet.has(notification.relatedEntityId));
  audit(req.user.id, 'project.deleted', 'project', project.id, { title: project.title, cycleId: project.cycleId, deletedTeamCount: teamIds.length });
  memberIds.forEach((memberId) => notify(memberId, 'Project and team registration removed', `${project.title} was deleted by faculty or an administrator. You can register again for this cycle.`, 'info'));
  saveStore(store);
  res.json({ deleted: true, projectId: project.id, deletedTeamCount: teamIds.length });
});
app.get('/api/projects/:projectId/revisions', auth, (req, res) => res.json({ revisions: store.projectRevisions.filter((r) => r.projectId === req.params.projectId) }));

// Secure upload: files are outside the web root and only streamed to authorised users.
app.post('/api/projects/:projectId/brief', auth, roles('faculty', 'admin'), upload.single('brief'), (req, res) => {
  const project = projectFor(req.params.projectId); if (!project || (req.user.role !== 'admin' && project.ownerId !== req.user.id)) return res.status(404).json({ message: 'Project not found' });
  const accepted = { '.pdf': ['application/pdf'], '.ppt': ['application/vnd.ms-powerpoint'], '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], '.txt': ['text/plain'], '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] };
  const extension = path.extname(req.file?.originalname || '').toLowerCase();
  if (!req.file || !accepted[extension] || !accepted[extension].includes(req.file.mimetype)) return res.status(400).json({ message: 'Only validated PDF, PPT, PPTX, DOCX, and TXT files are accepted' });
  const safeName = `${project.id}-${id('file')}${path.extname(req.file.originalname).toLowerCase()}`; fs.writeFileSync(path.join(uploadRoot, safeName), req.file.buffer); project.briefFile = safeName; project.briefUrl = `/api/projects/${project.id}/brief/download`; saveStore(store); res.json({ briefUrl: project.briefUrl });
});
app.get('/api/projects/:projectId/brief/download', auth, (req, res) => { const p = projectFor(req.params.projectId); if (!p || (req.user.role !== 'admin' && p.ownerId !== req.user.id && !store.teams.some((t) => t.projectId === p.id && t.memberIds.includes(req.user.id)))) return res.status(404).json({ message: 'File not found' }); if (!p.briefFile) return res.status(404).json({ message: 'No brief uploaded' }); res.download(path.join(uploadRoot, p.briefFile)); });

// Team lifecycle and deterministic preview-first formation
app.get('/api/teams', auth, (req, res) => {
  const rows = store.teams.filter((team) => {
    const project = projectFor(team.projectId);
    if (req.query.cycleId && project?.cycleId !== req.query.cycleId) return false;
    if (['dissolved', 'rejected'].includes(team.status)) return false;
    if (req.user.role === 'faculty') return isAssignedFaculty(req.user.id, team);
    return req.user.role === 'student' || req.user.role === 'admin' || team.memberIds?.includes(req.user.id);
  }).map((team) => {
    const view = teamView(team, req.user);
    if (req.user.role !== 'student' || !team.memberIds?.includes(req.user.id)) return view;
    return {
      ...view,
      expenses: store.teamExpenses
        .filter((expense) => expense.teamId === team.id)
        .map((expense) => ({
          ...expense,
          paidByName: store.users.find((user) => user.id === expense.paidById)?.name || 'Team member',
          memberShares: expense.memberShares.map((share) => ({
            ...share,
            memberName: store.users.find((user) => user.id === share.memberId)?.name || 'Team member'
          }))
        }))
    };
  });
  const result = page(req, rows); res.json({ ...result, teams: result.data });
});
app.delete('/api/teams/:teamId', auth, roles('faculty', 'admin'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId);
  if (!team || (req.user.role === 'faculty' && !isAssignedFaculty(req.user.id, team))) return res.status(404).json({ message: 'Team not found' });
  const memberIds = [...(team.memberIds || [])];
  audit(req.user.id, 'team.deleted', 'team', team.id, { name: team.name, cycleId: team.cycleId || projectFor(team.projectId)?.cycleId });
  removeTeamRecords([team.id]);
  memberIds.forEach((memberId) => notify(memberId, 'Team registration removed', `${team.name} was removed by faculty or an administrator. You can register again for this project cycle.`, 'info'));
  saveStore(store);
  res.json({ deleted: true, teamId: team.id });
});
app.get('/api/faculty/review-queue', auth, roles('faculty', 'admin'), (req, res) => {
  const cycleId = String(req.query.cycleId || store.cycles.find((cycle) => cycle.status === 'active')?.id || '');
  if (!cycleFor(cycleId)) return res.status(404).json({ message: 'Cycle not found' });
  const teams = (req.user.role === 'faculty' ? facultyTeams(req.user.id, cycleId) : teamsInCycle(cycleId))
    .map((team) => {
      const view = teamView(team, req.user);
      const evaluatedIds = new Set((team.studentEvaluations || []).filter((evaluation) => evaluation.marks !== null && evaluation.feedback?.trim()).map((evaluation) => evaluation.studentId));
      const pendingStudents = view.members.filter((member) => !evaluatedIds.has(member.id));
      return {
        ...view,
        queue: {
          projectApproval: team.status === 'proposed',
          pendingStudentAssessments: pendingStudents.length,
          pendingStudents: pendingStudents.map((student) => ({ id: student.id, name: student.name, rollNumber: student.rollNumber })),
          finalSubmission: !team.submission ? 'not_submitted' : team.submission.reviewedAt ? 'reviewed' : 'needs_review'
        }
      };
    });
  const queue = {
    projectApproval: teams.filter((team) => team.queue.projectApproval),
    studentFeedback: teams.filter((team) => team.queue.pendingStudentAssessments > 0),
    finalSubmission: teams.filter((team) => team.queue.finalSubmission === 'needs_review')
  };
  res.json({ cycleId, teams, queue, workload: { assignedTeams: teams.length, needingApproval: queue.projectApproval.length, needingStudentFeedback: queue.studentFeedback.length, submissionsToReview: queue.finalSubmission.length } });
});
app.post('/api/teams/:teamId/evaluation', auth, roles('faculty', 'admin'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId && candidate.status !== 'dissolved');
  if (!team || (req.user.role === 'faculty' && !isAssignedFaculty(req.user.id, team))) return res.status(404).json({ message: 'Team not found' });
  const marks = Number(req.body.marks);
  if (!Number.isFinite(marks) || marks < 0 || marks > 100) return res.status(400).json({ message: 'Marks must be a number between 0 and 100' });
  const feedback = String(req.body.feedback || '').trim();
  if (!feedback) return res.status(400).json({ message: 'Faculty feedback is required' });
  team.marks = marks;
  team.feedback = feedback;
  team.evaluatedBy = req.user.id;
  team.evaluatedAt = now();
  team.status = 'evaluated';
  (team.memberIds || []).forEach((memberId) => notify(memberId, 'Project feedback published', `Faculty feedback and marks are available for ${team.name}.`, 'success', {
    eventType: 'project.feedback_published', actorId: req.user.id, targetAudience: 'student',
    relatedEntityType: 'team', relatedEntityId: team.id, deepLink: `/teams/${team.id}`
  }));
  audit(req.user.id, 'team.evaluated', 'team', team.id, { marks, feedback });
  saveStore(store);
  res.json({ team: teamView(team) });
});
app.patch('/api/teams/:teamId/approval', auth, roles('faculty', 'admin'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId && candidate.status !== 'dissolved');
  if (!team || (req.user.role === 'faculty' && !isAssignedFaculty(req.user.id, team))) return res.status(404).json({ message: 'Team not found' });
  if (!['approved', 'rejected'].includes(req.body.status)) return res.status(400).json({ message: 'Approval status must be approved or rejected' });
  if (team.status !== 'proposed') return res.status(409).json({ message: 'Only proposed teams can be approved or rejected' });
  const approvalFeedback = String(req.body.feedback || '').trim();
  if (req.body.status === 'rejected' && !approvalFeedback) return res.status(400).json({ message: 'Feedback explaining why the project idea was rejected is required.' });
  team.status = req.body.status === 'approved' ? 'active' : 'rejected';
  team.approvalFeedback = approvalFeedback;
  team.approvedBy = req.user.id;
  team.approvedAt = now();
  if (req.body.status === 'rejected') {
    team.rejectedAt = team.approvedAt;
    store.teamAssignments = store.teamAssignments.filter((assignment) => assignment.teamId !== team.id);
    store.guideAllocations = store.guideAllocations.filter((allocation) => allocation.teamId !== team.id);
    store.teamRequests.filter((request) => request.teamId === team.id && request.status === 'pending').forEach((request) => {
      request.status = 'withdrawn';
      notify(request.userId, 'Join request closed', `${team.name}'s project idea was rejected, so its pending join request was closed.`, 'info');
    });
  }
  (team.memberIds || []).forEach((memberId) => notify(memberId, req.body.status === 'rejected' ? 'Project idea rejected' : 'Project team approved', team.approvalFeedback || `${team.name} was ${req.body.status}.`, req.body.status === 'approved' ? 'success' : 'info', {
    eventType: `team.${req.body.status}`, actorId: req.user.id, targetAudience: 'student',
    relatedEntityType: 'team', relatedEntityId: team.id, deepLink: `/teams/${team.id}`
  }));
  audit(req.user.id, `team.${req.body.status}`, 'team', team.id, { feedback: team.approvalFeedback });
  saveStore(store);
  res.json({ team: teamView(team) });
});
app.put('/api/teams/:teamId/students/:studentId/evaluation', auth, roles('faculty', 'admin'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId && candidate.status !== 'dissolved');
  if (!team || (req.user.role === 'faculty' && !isAssignedFaculty(req.user.id, team))) return res.status(404).json({ message: 'Team not found' });
  const studentId = req.params.studentId;
  const student = (team.memberIds || []).includes(studentId) && store.users.find((user) => user.id === studentId && user.role === 'student');
  if (!student) return res.status(404).json({ message: 'Student is not a member of this team' });
  if (req.body.marks === undefined || req.body.marks === null || req.body.marks === '') return res.status(400).json({ message: 'Marks are required' });
  const marks = Number(req.body.marks);
  const feedback = String(req.body.feedback || '').trim();
  if (!Number.isFinite(marks) || marks < 0 || marks > 100) return res.status(400).json({ message: 'Marks must be a number between 0 and 100' });
  if (!feedback) return res.status(400).json({ message: 'Feedback is required for each student assessment' });
  team.studentEvaluations ||= [];
  const evaluation = team.studentEvaluations.find((entry) => entry.studentId === studentId) || { studentId };
  Object.assign(evaluation, { marks, feedback, evaluatorId: req.user.id, updatedAt: now() });
  if (!team.studentEvaluations.includes(evaluation)) team.studentEvaluations.push(evaluation);
  notify(studentId, 'Individual project assessment published', `Your marks and feedback for ${team.name} are available.`, 'success', {
    eventType: 'student.assessment_published', actorId: req.user.id, targetAudience: 'student',
    relatedEntityType: 'team', relatedEntityId: team.id, deepLink: `/teams/${team.id}`
  });
  audit(req.user.id, 'student.assessed', 'team', team.id, { studentId, marks });
  saveStore(store);
  res.json({ evaluation, team: teamView(team) });
});
app.get('/api/teams/requests', auth, roles('student'), (req, res) => {
  const result = page(req, store.teamRequests.filter((request) => request.userId === req.user.id || store.teams.find((team) => team.id === request.teamId)?.leaderId === req.user.id));
  res.json({ ...result, requests: result.data });
});
app.post('/api/teams/:teamId/withdraw', auth, roles('student'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId && candidate.status !== 'dissolved');
  if (!team || !(team.memberIds || []).includes(req.user.id)) return res.status(404).json({ message: 'Team not found' });
  if (team.submission) return res.status(409).json({ message: 'You cannot unregister after the team has submitted its final files.' });
  const reason = String(req.body.reason || '').trim();
  const details = String(req.body.details || '').trim();
  if (!reason || reason.length > 100) return res.status(400).json({ message: 'Choose a reason for unregistering (100 characters or fewer).' });
  if (details.length > 300) return res.status(400).json({ message: 'Additional details must be 300 characters or fewer.' });

  const previousLeaderId = team.leaderId;
  team.memberIds = team.memberIds.filter((memberId) => memberId !== req.user.id);
  if (previousLeaderId === req.user.id) team.leaderId = team.memberIds[0] || null;
  if (!team.memberIds.length) {
    team.status = 'dissolved';
    team.dissolvedAt = now();
    store.teamRequests
      .filter((request) => request.teamId === team.id && request.status === 'pending')
      .forEach((request) => {
        request.status = 'withdrawn';
        notify(request.userId, 'Team registration withdrawn', `${team.name} is no longer accepting join requests.`, 'info');
      });
  } else {
    team.memberIds.forEach((memberId) => notify(
      memberId,
      'Team member unregistered',
      `${req.user.name} unregistered from ${team.name}. Your team registration remains active.`,
      'info',
      { eventType: 'team.member.withdrawn', actorId: req.user.id, targetAudience: 'student', relatedEntityType: 'team', relatedEntityId: team.id }
    ));
  }

  audit(req.user.id, 'team.member.withdrawn', 'team', team.id, {
    cycleId: team.cycleId || projectFor(team.projectId)?.cycleId,
    reason,
    details,
    previousLeaderId,
    leaderId: team.leaderId
  });
  saveStore(store);
  res.json({ team: teamView(team), withdrawn: true, dissolved: team.status === 'dissolved' });
});
app.post('/api/projects/:projectId/teams', auth, roles('student'), (req, res) => {
  let project = req.params.projectId === 'own' ? null : projectFor(req.params.projectId);
  const { cycleId, teamName, teamDescription = '', projectName, projectAcronym, course = 'Information Technology', idea, openForMembers = false, memberIds = [] } = req.body;
  const selectedCycleId = cycleId || project?.cycleId;
  if (!cycleFor(selectedCycleId)) return res.status(404).json({ message: 'Project cycle not found' });
  if (req.params.projectId !== 'own' && !project) return res.status(404).json({ message: 'Project not found' });
  if (project && project.cycleId !== selectedCycleId) return res.status(409).json({ message: 'Choose a project posted for the selected project cycle' });
  if (project?.status === 'closed') return res.status(409).json({ message: 'This project topic is closed and cannot accept new teams' });
  if (project && projectName?.trim().toLowerCase() !== project.title.toLowerCase()) return res.status(400).json({ message: 'Use the selected faculty project title for this team' });
  if (!teamName || !projectName || !idea) return res.status(400).json({ message: 'Team name, project name, and idea are required' });
  if (teamName.trim().length < 2) return res.status(400).json({ message: 'Team name must be at least 2 characters long' });
  const acronym = String(projectAcronym || projectName).trim().replace(/[^A-Za-z0-9_-]/g, '').replace(/^[^A-Za-z]+/, '').slice(0, 30) || `Project${Date.now()}`;
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(acronym)) return res.status(400).json({ message: 'Project acronym must start with a letter and contain only letters, numbers, dashes, or underscores' });
  if (store.teams.some((team) => team.name.toLowerCase() === teamName.trim().toLowerCase()) || store.projects.some((item) => item.id !== project?.id && item.cycleId === selectedCycleId && (item.title.toLowerCase() === projectName.trim().toLowerCase() || item.acronym?.toLowerCase() === acronym.toLowerCase()))) return res.status(409).json({ message: 'Team name and project name must be unique in this cycle' });
  const ids = [...new Set([req.user.id, ...memberIds])];
  if (ids.length !== memberIds.length + 1) return res.status(400).json({ message: 'A student cannot be added to their own team more than once' });
  const eligible = eligibleMemberIds(selectedCycleId);
  if (ids.some((uid) => !eligible.has(uid))) return res.status(400).json({ message: 'All members must be on the selected cycle roster' });
  const currentTeams = teamsInCycle(selectedCycleId);
  const alreadyAssigned = new Set(currentTeams.flatMap((team) => team.memberIds || []));
  if (ids.some((uid) => alreadyAssigned.has(uid))) return res.status(409).json({ message: 'One or more selected students already belong to a team in this project cycle' });
  if (openForMembers) {
    if (ids.length >= 3) return res.status(400).json({ message: 'An open team must leave at least one of its three places available for requests' });
    const remaining = eligible.size - alreadyAssigned.size - ids.length;
    if (remaining > 0 && remaining < 3) return res.status(400).json({ message: 'Keep enough unassigned students to form another team before opening this team to requests' });
  } else {
    const sizeError = teamSizeError(selectedCycleId, ids.length);
    if (sizeError) return res.status(400).json({ message: sizeError });
  }
  const projectBranch = project?.branch || 'IT';
  const branchError = validateTeamBranches(selectedCycleId, ids, projectBranch);
  if (branchError) return res.status(409).json({ message: branchError });
  if (!project) {
    project = { id: id('prj'), cycleId: selectedCycleId, title: projectName.trim(), acronym, course, description: idea.trim(), abstract: idea.trim(), department: 'Information Technology', branch: projectBranch, status: 'active', teamSize: 3, ownerId: req.user.id, deadline: null, briefUrl: null, createdAt: now() };
    store.projects.unshift(project);
  }
  const team = { id: id('team'), projectId: project.id, cycleId: selectedCycleId, name: teamName.trim(), description: String(teamDescription || idea).trim(), openForMembers: Boolean(openForMembers), maxMembers: openForMembers ? 3 : ids.length, projectName: projectName.trim(), projectAcronym: acronym, course, idea: idea.trim(), leaderId: req.user.id, memberIds: ids, score: 0, status: 'proposed', createdAt: now() };
  store.teams.push(team); ids.forEach((uid) => notify(uid, `You joined ${team.name}`, `Your idea was submitted for faculty review.`, 'success')); if (project.ownerId) notify(project.ownerId, 'New student team submitted', `${team.name} submitted an idea.`, 'info'); queueProjectNotifications(project, req.user.id); saveStore(store); res.status(201).json({ team: teamView(team) });
});
app.patch('/api/teams/:teamId/project-link', auth, roles('student'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId && candidate.status !== 'dissolved');
  if (!team || !(team.memberIds || []).includes(req.user.id)) return res.status(404).json({ message: 'Team not found' });
  const rawLink = String(req.body.projectLink || '').trim();
  if (rawLink.length > 500) return res.status(400).json({ message: 'Project URL must be 500 characters or fewer' });
  let projectLink = null;
  if (rawLink) {
    let parsed;
    try { parsed = new URL(rawLink); } catch { return res.status(400).json({ message: 'Enter a complete project URL beginning with https://' }); }
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname.includes('.') || parsed.username || parsed.password) {
      return res.status(400).json({ message: 'Project link must be a public HTTP or HTTPS URL without embedded credentials' });
    }
    projectLink = parsed.toString();
  }
  team.projectLink = projectLink;
  team.projectLinkUpdatedAt = projectLink ? now() : null;
  team.projectLinkUpdatedBy = projectLink ? req.user.id : null;
  audit(req.user.id, projectLink ? 'team.project_link.updated' : 'team.project_link.removed', 'team', team.id, { cycleId: team.cycleId || projectFor(team.projectId)?.cycleId, host: projectLink ? new URL(projectLink).hostname : null });
  saveStore(store);
  res.json({ team: teamView(team) });
});
app.post('/api/teams/:teamId/expenses', auth, roles('student'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId && candidate.status !== 'dissolved');
  if (!team || !(team.memberIds || []).includes(req.user.id)) return res.status(404).json({ message: 'Team not found' });
  const description = String(req.body.description || '').trim();
  const amount = Number(req.body.amount);
  const amountPaise = Math.round(amount * 100);
  if (!description || description.length > 100) return res.status(400).json({ message: 'Expense description is required and must be 100 characters or fewer' });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000 || Math.abs(amount - amountPaise / 100) > 1e-8) {
    return res.status(400).json({ message: 'Enter a valid expense amount from ₹0.01 to ₹1 crore, with up to two decimal places' });
  }
  const paidById = req.body.paidById || req.user.id;
  if (!(team.memberIds || []).includes(paidById)) return res.status(400).json({ message: 'The person who paid must be a team member' });
  const memberIds = [...team.memberIds];
  const baseShare = Math.floor(amountPaise / memberIds.length);
  const remainder = amountPaise % memberIds.length;
  const expense = {
    id: id('expense'),
    teamId: team.id,
    description,
    amountPaise,
    paidById,
    memberShares: memberIds.map((memberId, index) => ({
      memberId,
      amountPaise: baseShare + (index < remainder ? 1 : 0)
    })),
    createdById: req.user.id,
    createdAt: now()
  };
  store.teamExpenses.unshift(expense);
  saveStore(store);
  res.status(201).json({
    expense: {
      ...expense,
      paidByName: store.users.find((user) => user.id === paidById)?.name || 'Team member',
      memberShares: expense.memberShares.map((share) => ({
        ...share,
        memberName: store.users.find((user) => user.id === share.memberId)?.name || 'Team member'
      }))
    }
  });
});
app.post('/api/teams/:teamId/request', auth, roles('student'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId && candidate.status !== 'dissolved');
  const project = team && projectFor(team.projectId);
  const cycleId = team?.cycleId || project?.cycleId;
  if (!team) return res.status(404).json({ message: 'Team not found' });
  if (team.openForMembers !== true) return res.status(409).json({ message: 'This team is not accepting join requests' });
  if ((team.memberIds || []).includes(req.user.id)) return res.status(409).json({ message: 'You are already a member of this team' });
  if (teamsInCycle(cycleId).some((candidate) => candidate.memberIds?.includes(req.user.id))) return res.status(409).json({ message: 'You already belong to a team in this project cycle' });
  if (!eligibleMemberIds(cycleId).has(req.user.id)) return res.status(403).json({ message: 'You are not registered for this project cycle' });
  if ((team.memberIds || []).length >= Number(team.maxMembers || project?.teamSize || 3)) return res.status(409).json({ message: 'This team has reached its maximum size' });
  if (store.teamRequests.some((request) => request.teamId === team.id && request.userId === req.user.id && request.status === 'pending')) return res.status(409).json({ message: 'You already have a pending request for this team' });
  const branchError = validateTeamBranches(cycleId, [...(team.memberIds || []), req.user.id], project?.branch);
  if (branchError) return res.status(409).json({ message: branchError });
  const request = { id: id('request'), teamId: team.id, userId: req.user.id, status: 'pending', message: req.body.message || '', createdAt: now() };
  store.teamRequests.push(request);
  notify(team.leaderId, 'Team join request', `${req.user.name} asked to join ${team.name}.`, 'info');
  saveStore(store);
  res.status(201).json({ request });
});
app.patch('/api/teams/:teamId/requests/:requestId', auth, roles('student'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId);
  const project = team && projectFor(team.projectId);
  const cycleId = team?.cycleId || project?.cycleId;
  const request = store.teamRequests.find((candidate) => candidate.id === req.params.requestId && candidate.teamId === team?.id);
  if (!team || !request) return res.status(404).json({ message: 'Request not found' });

  const isLeader = team.leaderId === req.user.id;
  const isRequesterWithdrawing = request.userId === req.user.id && req.body.status === 'withdrawn';
  if (!isLeader && !isRequesterWithdrawing) return res.status(404).json({ message: 'Request not found' });
  if (!['approved', 'rejected', 'withdrawn'].includes(req.body.status)) return res.status(400).json({ message: 'Status must be approved, rejected, or withdrawn' });
  if (request.status !== 'pending') return res.status(409).json({ message: 'This request has already been decided' });
  if (req.body.status === 'withdrawn' && !isRequesterWithdrawing) return res.status(403).json({ message: 'Only the student who sent this request can withdraw it.' });

  if (req.body.status === 'approved') {
    if ((team.memberIds || []).length >= Number(team.maxMembers || project?.teamSize || 3)) return res.status(409).json({ message: 'This team has reached its maximum size' });
    if (teamsInCycle(cycleId).some((candidate) => candidate !== team && candidate.memberIds?.includes(request.userId))) return res.status(409).json({ message: 'Student already belongs to a team in this project cycle' });
    const branchError = validateTeamBranches(cycleId, [...(team.memberIds || []), request.userId], project?.branch);
    if (branchError) return res.status(409).json({ message: branchError });
  }

  request.status = req.body.status;
  if (request.status === 'approved') {
    team.memberIds.push(request.userId);
    store.teamRequests.filter((other) => other.userId === request.userId && other.id !== request.id && other.status === 'pending').forEach((other) => { other.status = 'withdrawn'; });
  }
  const recipientId = request.status === 'withdrawn' ? team.leaderId : request.userId;
  const title = request.status === 'withdrawn' ? 'Join request withdrawn' : `Team request ${request.status}`;
  const message = request.status === 'withdrawn'
    ? `${req.user.name} withdrew their request to join ${team.name}.`
    : `Your request for ${team.name} was ${request.status}.`;
  notify(recipientId, title, message, 'info');
  audit(req.user.id, `team.request.${request.status}`, 'team', team.id);
  saveStore(store);
  res.json({ request, team: teamView(team) });
});
app.patch('/api/teams/:teamId/leader', auth, (req, res) => { const team = store.teams.find((t) => t.id === req.params.teamId); if (!team || (!team.memberIds.includes(req.user.id) && req.user.role !== 'admin')) return res.status(404).json({ message: 'Team not found' }); if (!team.memberIds.includes(req.body.leaderId)) return res.status(400).json({ message: 'Leader must be a team member' }); team.leaderId = req.body.leaderId; audit(req.user.id, 'team.leader.changed', 'team', team.id, { leaderId: team.leaderId }); saveStore(store); res.json({ team: teamView(team) }); });
app.post('/api/teams/:teamId/dissolve', auth, (req, res) => { const team = store.teams.find((t) => t.id === req.params.teamId); if (!team || (!team.memberIds.includes(req.user.id) && req.user.role !== 'admin')) return res.status(404).json({ message: 'Team not found' }); team.status = 'dissolved'; team.dissolvedAt = now(); audit(req.user.id, 'team.dissolved', 'team', team.id, { reason: req.body.reason }); team.memberIds.filter((memberId) => memberId !== req.user.id).forEach((memberId) => notify(memberId, 'Team registration withdrawn', `${team.name} was unregistered for all team members.`, 'info', { eventType: 'team.dissolved', actorId: req.user.id, targetAudience: 'student', relatedEntityType: 'team', relatedEntityId: team.id })); saveStore(store); res.json({ team: teamView(team) }); });
function formationPreview(cycleId, projectId, includeAll = false) {
  const cycle = store.cycles.find((c) => c.id === cycleId); const project = projectId ? projectFor(projectId) : null;
  const existing = new Set(teamsInCycle(cycleId).flatMap((team) => team.memberIds || [])); const roster = eligibleMemberIds(cycleId);
  let candidates = store.users.filter((u) => u.role === 'student' && (!project || includeAll || u.department === project.department) && !existing.has(u.id) && (roster.size === 0 || roster.has(u.id)));
  if (!crossBranchAllowed(cycleId) && project?.branch) candidates = candidates.filter((user) => userBranch(user.id, cycleId) === project.branch);
  const minSize = Number(cycle?.config?.minTeamSize || project?.teamSize || cycle?.config?.maxTeamSize || 5);
  const exceptionSize = Number(cycle?.config?.exceptionalTeamSize || 0);
  const teamSizes = [];
  if (exceptionSize === minSize + 1) {
    const groups = Math.floor(candidates.length / minSize);
    teamSizes.push(...Array(groups).fill(minSize));
    if (groups && candidates.length % minSize === 1) teamSizes[groups - 1] = exceptionSize;
  } else {
    const size = Number(project?.teamSize || cycle?.config?.maxTeamSize || 5);
    const count = candidates.length ? Math.ceil(candidates.length / size) : 0;
    teamSizes.push(...Array(count).fill(size));
  }
  const buckets = teamSizes.map((capacity, index) => ({ name: `Auto team ${index + 1}`, memberIds: [], skillScore: 0, branch: null, capacity }));
  const unassignedMemberIds = [];
  [...candidates].sort((a, b) => (b.skills?.length || 0) - (a.skills?.length || 0) || a.id.localeCompare(b.id)).forEach((student) => {
    const branch = userBranch(student.id, cycleId); const available = buckets.filter((bucket) => bucket.memberIds.length < bucket.capacity && (!bucket.branch || bucket.branch === branch));
    const bucket = [...available].sort((a, b) => a.skillScore - b.skillScore || a.memberIds.length - b.memberIds.length)[0];
    if (bucket) { bucket.branch = bucket.branch || branch; bucket.memberIds.push(student.id); bucket.skillScore += student.skills?.length || 0; }
    else unassignedMemberIds.push(student.id);
  });
  return { cycleId, projectId, algorithm: 'deterministic-greedy-v1', teams: buckets, candidateCount: candidates.length, unassignedMemberIds };
}
app.post('/api/cycles/:cycleId/formation/preview', auth, roles('admin', 'faculty'), (req, res) => {
  if (!cycleFor(req.params.cycleId)) return res.status(404).json({ message: 'Cycle not found' });
  const project = req.body.projectId ? projectFor(req.body.projectId) : null;
  if (req.body.projectId && !project) return res.status(404).json({ message: 'Project not found' });
  if (project && project.cycleId !== req.params.cycleId) return res.status(409).json({ message: 'Project does not belong to this cycle' });
  const preview = formationPreview(req.params.cycleId, req.body.projectId, req.body.includeAll === true);
  const run = { id: id('formation'), ...preview, status: 'preview', idempotencyKey: req.body.idempotencyKey || null, createdBy: req.user.id, createdAt: now() };
  store.formationRuns.push(run);
  audit(req.user.id, 'formation.previewed', 'formation', run.id, { candidateCount: preview.candidateCount, unassignedMemberIds: preview.unassignedMemberIds });
  saveStore(store);
  res.json({ preview, runId: run.id });
});
app.post('/api/cycles/:cycleId/formation/commit', auth, roles('admin', 'faculty'), (req, res) => {
  const cycle = cycleFor(req.params.cycleId);
  if (!cycle) return res.status(404).json({ message: 'Cycle not found' });
  const key = req.body.idempotencyKey;
  const prior = key && store.formationRuns.find((run) => run.idempotencyKey === key && run.status === 'committed');
  if (prior) return res.json({ idempotent: true, teams: prior.teamIds.map((teamId) => teamView(store.teams.find((team) => team.id === teamId))) });
  const preview = req.body.preview || formationPreview(req.params.cycleId, req.body.projectId, req.body.includeAll === true);
  const project = req.body.projectId ? projectFor(req.body.projectId) : null;
  if (project && project.cycleId !== cycle.id) return res.status(409).json({ message: 'Project does not belong to this cycle' });
  if (!Array.isArray(preview.teams)) return res.status(400).json({ message: 'Formation preview has no team assignments' });
  if (preview.cycleId !== cycle.id || preview.teams.some((bucket) => !Array.isArray(bucket.memberIds))) {
    return res.status(400).json({ message: 'Formation preview does not match this cycle or contains invalid assignments' });
  }
  const existing = new Set(teamsInCycle(cycle.id).flatMap((team) => team.memberIds || []));
  const memberIds = preview.teams.flatMap((bucket) => bucket.memberIds || []);
  if (new Set(memberIds).size !== memberIds.length || memberIds.some((memberId) => existing.has(memberId))) {
    return res.status(409).json({ message: 'A student appears in more than one team or is already assigned in this cycle' });
  }
  const eligible = eligibleMemberIds(cycle.id);
  if (memberIds.some((memberId) => !eligible.has(memberId))) return res.status(400).json({ message: 'Formation includes a student outside this cycle roster' });
  const existingRosterCount = [...existing].filter((memberId) => eligible.has(memberId)).length;
  const minSize = Number(cycle.config?.minTeamSize || project?.teamSize || 3);
  const exceptionSize = Number(cycle.config?.exceptionalTeamSize || 0);
  const strictTeamSizes = exceptionSize > 0;
  if (preview.teams.some((bucket) => bucket.memberIds?.length && (strictTeamSizes
    ? bucket.memberIds.length !== minSize && bucket.memberIds.length !== exceptionSize
    : bucket.memberIds.length < minSize || bucket.memberIds.length > Number(cycle.config?.maxTeamSize || 5)))) {
    return res.status(409).json({ message: 'Formation contains a team outside the configured size rules' });
  }
  if (exceptionSize && preview.teams.filter((bucket) => bucket.memberIds?.length === exceptionSize).length > Number(cycle.config?.exceptionalTeamCount || 1)) {
    return res.status(409).json({ message: 'Formation exceeds the allowed number of exceptional-size teams' });
  }
  if (exceptionSize && preview.teams.some((bucket) => bucket.memberIds?.length === exceptionSize)
    && eligible.size - existingRosterCount - memberIds.length > 0) {
    return res.status(409).json({ message: 'The exceptional-size team must contain the final unassigned students' });
  }
  if (preview.teams.some((bucket) => validateTeamBranches(cycle.id, bucket.memberIds, project?.branch))) {
    return res.status(409).json({ message: 'Cross-branch team formation is disabled for this cycle' });
  }
  const teamIds = [];
  preview.teams.forEach((bucket) => {
    if (!bucket.memberIds.length) return;
    const team = { id: id('team'), projectId: project?.id || null, cycleId: cycle.id, name: bucket.name, memberIds: bucket.memberIds, leaderId: bucket.memberIds[0], score: 100, status: 'formed', createdAt: now(), formationRunId: id('run') };
    store.teams.push(team);
    teamIds.push(team.id);
    bucket.memberIds.forEach((userId) => notify(userId, `You joined ${team.name}`, 'Your cycle team was formed.', 'success'));
  });
  const assignedIds = new Set([...existing, ...memberIds]);
  const unassignedMemberIds = [...eligible].filter((memberId) => !assignedIds.has(memberId)).sort();
  const run = { id: id('formation'), cycleId: cycle.id, projectId: project?.id, status: 'committed', teamIds, idempotencyKey: key || null, createdBy: req.user.id, createdAt: now(), unassignedMemberIds };
  store.formationRuns.push(run);
  audit(req.user.id, 'formation.committed', 'formation', run.id, { teamIds, unassignedMemberIds });
  saveStore(store);
  res.status(201).json({ idempotent: false, runId: run.id, teams: teamIds.map((teamId) => teamView(store.teams.find((team) => team.id === teamId))), unassignedMemberIds });
});
app.post('/api/projects/:projectId/form-teams', auth, roles('admin', 'faculty'), (req, res) => {
  const project = projectFor(req.params.projectId);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  const preview = formationPreview(project.cycleId, project.id, req.body.includeAll === true);
  const run = { id: id('formation'), ...preview, status: 'preview', createdBy: req.user.id, createdAt: now() };
  store.formationRuns.push(run);
  audit(req.user.id, 'formation.previewed', 'formation', run.id, { candidateCount: preview.candidateCount, unassignedMemberIds: preview.unassignedMemberIds });
  saveStore(store);
  res.json({ preview, runId: run.id, requiresCoordinatorCommit: true });
});

// Guides, milestones, submissions, rubrics and extensions
app.get('/api/guides', auth, roles('admin', 'faculty'), (req, res) => res.json(page(req, store.guides.filter((guide) => req.user.role === 'admin' || guide.userId === req.user.id).map((g) => ({ ...g, allocations: store.guideAllocations.filter((a) => a.guideId === g.id) })))));
app.post('/api/guides', auth, roles('admin', 'faculty'), (req, res) => { const guide = { id: id('guide'), userId: req.user.role === 'admin' ? req.body.userId || req.user.id : req.user.id, capacity: Number(req.body.capacity || 5), preferences: req.body.preferences || [], createdAt: now() }; store.guides.push(guide); saveStore(store); res.status(201).json({ guide }); });
app.post('/api/cycles/:cycleId/guide-allocations/preview', auth, roles('admin'), (req, res) => { const projects = store.projects.filter((p) => p.cycleId === req.params.cycleId); const allocation = projects.map((project, index) => { const guide = [...store.guides].sort((a, b) => store.guideAllocations.filter((x) => x.guideId === a.id).length - store.guideAllocations.filter((x) => x.guideId === b.id).length || a.id.localeCompare(b.id))[index % Math.max(1, store.guides.length)]; return { projectId: project.id, guideId: guide?.id || null, preferenceMatched: Boolean(guide?.preferences?.some((p) => project.title.toLowerCase().includes(String(p).toLowerCase()))) }; }); res.json({ allocation }); });
app.post('/api/cycles/:cycleId/guide-allocations', auth, roles('admin'), (req, res) => { (req.body.allocation || []).forEach((a) => { if (a.guideId) store.guideAllocations.push({ id: id('alloc'), cycleId: req.params.cycleId, ...a, assignedBy: req.user.id, createdAt: now() }); }); audit(req.user.id, 'guides.allocated', 'cycle', req.params.cycleId); saveStore(store); res.json({ allocations: store.guideAllocations.filter((a) => a.cycleId === req.params.cycleId) }); });
app.get('/api/milestones', auth, (req, res) => res.json(page(req, store.milestones.filter((m) => !req.query.cycleId || m.cycleId === req.query.cycleId))));
app.post('/api/milestones', auth, roles('admin', 'faculty'), (req, res) => { const milestone = { id: id('mile'), cycleId: req.body.cycleId || store.cycles[0].id, title: req.body.title, dueAt: req.body.dueAt, timezone: req.body.timezone || 'UTC', maxMarks: Number(req.body.maxMarks || 100), rubricId: req.body.rubricId || null, createdBy: req.user.id, createdAt: now() }; store.milestones.push(milestone); saveStore(store); res.status(201).json({ milestone }); });
app.post('/api/milestones/:milestoneId/submissions', auth, upload.single('submission'), (req, res) => { const milestone = store.milestones.find((m) => m.id === req.params.milestoneId); if (!milestone) return res.status(404).json({ message: 'Milestone not found' }); let submission = store.submissions.find((s) => s.milestoneId === milestone.id && s.userId === req.user.id && s.teamId === req.body.teamId); if (!submission) { submission = { id: id('submission'), milestoneId: milestone.id, userId: req.user.id, teamId: req.body.teamId || null, status: 'draft', revision: 0, createdAt: now() }; store.submissions.push(submission); } if (submission.lockedAt) return res.status(409).json({ message: 'Submission is locked; request an unlock from faculty' }); submission.revision += 1; submission.content = req.body.content || submission.content || ''; submission.fileName = req.file ? `${submission.id}-${id('upload')}${path.extname(req.file.originalname)}` : submission.fileName; if (req.file) fs.writeFileSync(path.join(uploadRoot, submission.fileName), req.file.buffer); submission.updatedAt = now(); saveStore(store); res.status(201).json({ submission }); });
app.post('/api/teams/:teamId/submission', auth, roles('student'), upload.fields([{ name: 'presentation', maxCount: 1 }, { name: 'documentation', maxCount: 1 }]), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId && candidate.status !== 'dissolved');
  if (!team || !team.memberIds?.includes(req.user.id)) return res.status(404).json({ message: 'Team not found' });
  const files = req.files || {};
  const presentation = files.presentation?.[0];
  const documentation = files.documentation?.[0];
  if (!presentation || !documentation) return res.status(400).json({ message: 'Upload both the project presentation (.pptx) and documentation (.pdf)' });
  const validPresentation = path.extname(presentation.originalname).toLowerCase() === '.pptx'
    && presentation.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const validDocumentation = path.extname(documentation.originalname).toLowerCase() === '.pdf'
    && documentation.mimetype === 'application/pdf';
  if (!validPresentation || !validDocumentation) return res.status(400).json({ message: 'The presentation must be a .pptx file and the documentation must be a .pdf file' });
  const presentationKey = `${id('submission')}.pptx`;
  const documentationKey = `${id('submission')}.pdf`;
  fs.writeFileSync(path.join(uploadRoot, presentationKey), presentation.buffer);
  fs.writeFileSync(path.join(uploadRoot, documentationKey), documentation.buffer);
  team.submission = {
    presentationKey,
    documentationKey,
    presentationName: path.basename(presentation.originalname),
    documentationName: path.basename(documentation.originalname),
    submittedBy: req.user.id,
    submittedAt: now()
  };
  audit(req.user.id, 'team.final_submission.uploaded', 'team', team.id, {
    presentation: team.submission.presentationName,
    documentation: team.submission.documentationName
  });
  saveStore(store);
  res.status(201).json({ team: teamView(team) });
});
app.get('/api/teams/:teamId/submission/:kind', auth, (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId && candidate.status !== 'dissolved');
  const authorized = team && (team.memberIds?.includes(req.user.id) || req.user.role === 'admin' || (req.user.role === 'faculty' && isAssignedFaculty(req.user.id, team)));
  if (!authorized || !team.submission) return res.status(404).json({ message: 'Submission not found' });
  const file = req.params.kind === 'presentation'
    ? { key: team.submission.presentationKey, name: team.submission.presentationName }
    : req.params.kind === 'documentation'
      ? { key: team.submission.documentationKey, name: team.submission.documentationName }
      : null;
  if (!file) return res.status(404).json({ message: 'Submission file not found' });
  res.download(path.join(uploadRoot, file.key), file.name);
});
app.patch('/api/teams/:teamId/submission/review', auth, roles('faculty', 'admin'), (req, res) => {
  const team = store.teams.find((candidate) => candidate.id === req.params.teamId && candidate.status !== 'dissolved');
  if (!team || (req.user.role === 'faculty' && !isAssignedFaculty(req.user.id, team))) return res.status(404).json({ message: 'Team not found' });
  if (!team.submission?.presentationKey || !team.submission?.documentationKey) return res.status(409).json({ message: 'Both the PPTX and PDF files must be submitted before review' });
  const feedback = String(req.body.feedback || '').trim();
  team.submission.reviewedAt = now();
  team.submission.reviewedBy = req.user.id;
  team.submission.reviewFeedback = feedback;
  audit(req.user.id, 'team.final_submission.reviewed', 'team', team.id, { feedback });
  (team.memberIds || []).forEach((memberId) => notify(memberId, 'Final submission reviewed', feedback || `The final files for ${team.name} have been reviewed.`, 'success', {
    eventType: 'team.submission_reviewed', actorId: req.user.id, targetAudience: 'student',
    relatedEntityType: 'team', relatedEntityId: team.id, deepLink: `/teams/${team.id}`
  }));
  saveStore(store);
  res.json({ team: teamView(team) });
});
app.post('/api/submissions/:submissionId/lock', auth, (req, res) => { const submission = store.submissions.find((s) => s.id === req.params.submissionId); const team = submission?.teamId ? store.teams.find((item) => item.id === submission.teamId) : null; const allowed = submission && (req.user.role === 'admin' || (req.user.role === 'student' && submission.userId === req.user.id) || (req.user.role === 'faculty' && isAssignedFaculty(req.user.id, team))); if (!allowed) return res.status(404).json({ message: 'Submission not found' }); submission.lockedAt = now(); submission.status = 'submitted'; audit(req.user.id, 'submission.locked', 'submission', submission.id); saveStore(store); res.json({ submission }); });
app.post('/api/submissions/:submissionId/unlock', auth, roles('faculty', 'admin'), (req, res) => { const submission = store.submissions.find((s) => s.id === req.params.submissionId); if (!submission) return res.status(404).json({ message: 'Submission not found' }); if (req.user.role === 'faculty' && !isAssignedFaculty(req.user.id, store.teams.find((team) => team.id === submission.teamId))) return res.status(404).json({ message: 'Submission not found' }); submission.lockedAt = null; submission.status = 'draft'; submission.unlockReason = req.body.reason || 'Faculty unlock'; audit(req.user.id, 'submission.unlocked', 'submission', submission.id, { reason: submission.unlockReason }); saveStore(store); res.json({ submission }); });
app.post('/api/rubrics', auth, roles('faculty', 'admin'), (req, res) => { const rubric = { id: id('rubric'), name: req.body.name, criteria: req.body.criteria || [], createdBy: req.user.id, createdAt: now() }; store.rubrics.push(rubric); saveStore(store); res.status(201).json({ rubric }); });
app.post('/api/submissions/:submissionId/review', auth, roles('faculty', 'admin'), (req, res) => { const submission = store.submissions.find((s) => s.id === req.params.submissionId); if (!submission || (req.user.role === 'faculty' && !isAssignedFaculty(req.user.id, store.teams.find((team) => team.id === submission.teamId)))) return res.status(404).json({ message: 'Submission not found' }); submission.review = { reviewerId: req.user.id, scores: req.body.scores || {}, feedback: req.body.feedback || '', reviewedAt: now() }; audit(req.user.id, 'submission.reviewed', 'submission', submission.id, submission.review); saveStore(store); res.json({ submission }); });
app.post('/api/extensions', auth, roles('faculty', 'admin'), (req, res) => { const submission = store.submissions.find((item) => item.id === req.body.submissionId); if (!submission) return res.status(404).json({ message: 'Submission not found' }); if (req.user.role === 'faculty' && !isAssignedFaculty(req.user.id, store.teams.find((team) => team.id === submission.teamId))) return res.status(404).json({ message: 'Submission not found' }); const extension = { id: id('extension'), submissionId: submission.id, userId: req.body.userId || submission.userId, extendedDueAt: req.body.extendedDueAt, reason: req.body.reason, approvedBy: req.user.id, createdAt: now() }; store.extensions.push(extension); notify(extension.userId, 'Deadline extension approved', `Your new deadline is ${extension.extendedDueAt}.`, 'success'); saveStore(store); res.status(201).json({ extension }); });

app.get('/api/notifications', auth, (req, res) => { const result = page(req, store.notifications.filter((n) => n.userId === req.user.id)); res.json({ ...result, notifications: result.data }); });
app.patch('/api/notifications/:notificationId/read', auth, (req, res) => { const note = store.notifications.find((n) => n.id === req.params.notificationId && n.userId === req.user.id); if (!note) return res.status(404).json({ message: 'Notification not found' }); note.read = true; saveStore(store); res.json({ notification: note }); });
function reportRows(req) {
  return store.teams.filter((team) =>
    (!req.query.cycleId || (team.cycleId || projectFor(team.projectId)?.cycleId) === req.query.cycleId) &&
    (req.user.role === 'admin' || isAssignedFaculty(req.user.id, team))
  ).flatMap((team) => {
    const project = projectFor(team.projectId);
    const submission = team.submission;
    const members = (team.memberIds || []).map((userId) => store.users.find((user) => user.id === userId)).filter(Boolean);
    return members.length ? members.map((member) => {
      const assessment = (team.studentEvaluations || []).find((item) => item.studentId === member.id);
      return {
        cycle: cycleFor(team.cycleId || project?.cycleId)?.name || '',
        team: team.name,
        project: project?.title || team.projectName || '',
        teamStatus: team.status || 'formed',
        student: member.name,
        rollNumber: member.rollNumber || '',
        presentationStatus: submission?.presentationName ? 'Submitted' : 'Pending',
        documentationStatus: submission?.documentationName ? 'Submitted' : 'Pending',
        submittedAt: submission?.submittedAt || '',
        teamMarks: team.marks ?? '',
        individualMarks: assessment?.marks ?? '',
        individualFeedback: assessment?.feedback || ''
      };
    }) : [{
      cycle: cycleFor(team.cycleId || project?.cycleId)?.name || '', team: team.name,
      project: project?.title || team.projectName || '', teamStatus: team.status || 'formed',
      student: '', rollNumber: '', presentationStatus: submission?.presentationName ? 'Submitted' : 'Pending',
      documentationStatus: submission?.documentationName ? 'Submitted' : 'Pending', submittedAt: submission?.submittedAt || '',
      teamMarks: team.marks ?? '', individualMarks: '', individualFeedback: ''
    }];
  });
}
app.get('/api/reports/teams.csv', auth, roles('faculty', 'admin'), (req, res) => {
  const columns = ['cycle', 'team', 'project', 'teamStatus', 'student', 'rollNumber', 'presentationStatus', 'documentationStatus', 'submittedAt', 'teamMarks', 'individualMarks', 'individualFeedback'];
  const rows = [columns, ...reportRows(req).map((row) => columns.map((column) => row[column]))]
    .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  res.type('text/csv').attachment('teamforge-project-report.csv').send(rows);
});
app.get('/api/reports/teams.xlsx', auth, roles('faculty', 'admin'), (req, res) => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(reportRows(req));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Project report');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('teamforge-project-report.xlsx').send(buffer);
});
app.get('/api/reports/teams.pdf', auth, roles('faculty', 'admin'), (_req, res) => res.status(501).json({ message: 'PDF renderer abstraction is available; configure REPORT_PDF_PROVIDER (puppeteer or pdfkit) in production.' }));
app.get('/api/audit', auth, roles('admin', 'faculty'), (req, res) => {
  let rows = store.auditLog.filter((entry) => !req.query.entityType || entry.entityType === req.query.entityType);
  if (req.query.cycleId) rows = rows.filter((entry) => {
    if (entry.entityType === 'cycle') return entry.entityId === req.query.cycleId;
    if (entry.details?.cycleId) return entry.details.cycleId === req.query.cycleId;
    if (entry.entityType === 'team') return store.teams.some((team) => team.id === entry.entityId && (team.cycleId === req.query.cycleId || projectFor(team.projectId)?.cycleId === req.query.cycleId));
    if (entry.entityType === 'project') return projectFor(entry.entityId)?.cycleId === req.query.cycleId;
    if (entry.entityType === 'user') return store.rosterRows.some((row) => row.cycleId === req.query.cycleId && row.userId === entry.entityId);
    return false;
  });
  if (req.user.role === 'faculty') {
    const assignedTeamIds = new Set(store.teamAssignments.filter((assignment) => assignment.facultyId === req.user.id).map((assignment) => assignment.teamId));
    rows = rows.filter((entry) => entry.entityType === 'team' && assignedTeamIds.has(entry.entityId));
  }
  res.json(page(req, rows));
});
app.use((err, _req, res, _next) => { console.error(err); res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 10 MB' : 'Unexpected server error' }); });
app.listen(port, () => console.log(`TeamForge API listening on http://localhost:${port} (${process.env.DEMO_MODE === 'false' ? 'postgres-ready' : 'demo mode'})`));
