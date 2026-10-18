import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowRight, Bell, BookOpen, CheckCircle2, Download, Layers3, LogOut, Plus, ShieldCheck, Sparkles, Users, CalendarDays, ClipboardCheck, Upload, X, Contact, ExternalLink } from 'lucide-react';
import './styles.css';
import './student-portal.css';
import './faculty-review.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const DEFAULT_IT_CYCLES = [
  { id: 'cycle-it-minor-3-2', name: 'Minor Project · 3rd Year · 2nd Semester', academicYear: '2026-27', term: '3rd Year · 2nd Semester', status: 'active', department: 'Information Technology' },
  { id: 'cycle-it-major-4-2', name: 'Major Project · 4th Year · 2nd Semester', academicYear: '2027-28', term: '4th Year · 2nd Semester', status: 'draft', department: 'Information Technology' }
];
const linkHost = (value) => { try { return new URL(value).hostname; } catch { return 'Project URL'; } };
const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);
function dateTimeInputValue(instant, timeZone) {
  if (!instant) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}
function dateTimeInputToISO(value, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Enter a valid registration deadline.');
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let candidate = target;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value: part }) => [type, part]));
    const observedAsUTC = Date.UTC(Number(observed.year), Number(observed.month) - 1, Number(observed.day), Number(observed.hour), Number(observed.minute), Number(observed.second));
    candidate += target - observedAsUTC;
  }
  return new Date(candidate).toISOString();
}
async function api(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) };
  const token = localStorage.getItem('teamforge_token'); if (token) headers.Authorization = `Bearer ${token}`;
  let response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 401 && !path.startsWith('/auth/')) {
    const refreshToken = localStorage.getItem('teamforge_refresh');
    if (refreshToken) {
      const refreshResponse = await fetch(`${API}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
      if (refreshResponse.ok) {
        const refreshed = await refreshResponse.json();
        localStorage.setItem('teamforge_token', refreshed.accessToken || refreshed.token);
        localStorage.setItem('teamforge_refresh', refreshed.refreshToken || refreshToken);
        headers.Authorization = `Bearer ${refreshed.accessToken || refreshed.token}`;
        response = await fetch(`${API}${path}`, { ...options, headers });
      }
    }
  }
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'Something went wrong'); }
  return response.headers.get('content-type')?.includes('json') ? response.json() : response.blob();
}
const initials = (name = '') => name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase();
function Avatar({ user }) { return <span className="avatar" style={{ background: user?.avatarColor || '#6657db' }}>{initials(user?.name)}</span>; }

function Login({ onLogin }) {
  const [role, setRole] = useState('student');
  const demoAccounts = {
    student: { email: '', password: 'password123', rollNumber: '24B81A1201' },
    faculty: { email: 'professor@teamforge.demo', password: 'password123', rollNumber: '' },
    admin: { email: 'admin@teamforge.demo', password: 'password123', rollNumber: '' }
  };
  const [form, setForm] = useState(demoAccounts.student);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const setupToken = new URLSearchParams(window.location.search).get('setupToken');
  const [setupComplete, setSetupComplete] = useState(false);
  const setupMode = Boolean(setupToken && !setupComplete);
  const [setupPassword, setSetupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const accounts = ['student', 'faculty', 'admin'];
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (setupMode) {
        if (setupPassword !== confirmPassword) throw new Error('Passwords do not match.');
        const result = await api('/auth/first-login', { method: 'POST', body: JSON.stringify({ token: setupToken, password: setupPassword }) });
        window.history.replaceState({}, '', window.location.pathname);
        setNotice(result.message);
        setSetupComplete(true);
      } else {
        const credentials = role === 'student'
          ? { role, rollNumber: form.rollNumber.trim().toUpperCase(), password: form.password, cycleId: localStorage.getItem('teamforge_cycle') || '' }
          : { ...form, role };
        const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
        localStorage.setItem('teamforge_token', result.accessToken || result.token);
        localStorage.setItem('teamforge_refresh', result.refreshToken || '');
        onLogin(result.user);
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <main className="login">
    <section className="login-hero">
      <div className="brand light"><Layers3 size={20}/> teamforge</div>
      <div className="hero-copy">
        <span className="eyebrow">INFORMATION TECHNOLOGY · PROJECT PORTAL</span>
        <h1>Build teams that<br/><em>build what matters.</em></h1>
        <p>Register a project team, select a topic, and submit the final presentation and documentation in one department workspace.</p>
        <div className="hero-pills"><span><Sparkles size={15}/> Teams of 3 · one team of 4</span><span><ShieldCheck size={15}/> PPTX + PDF submission</span></div>
      </div>
    </section>
    <section className="login-panel">
      <span className="badge">CAMPUS PROJECT PORTAL</span>
      <h2>{setupMode ? 'Set up your password' : 'Welcome back'}</h2>
      <p>{setupMode ? 'Choose a private password to activate your account.' : 'Sign in to your academic workspace.'}</p>
      {!setupMode && <div className="role-tabs">{accounts.map((key) => <button key={key} className={role === key ? 'active' : ''} onClick={() => { setRole(key); setForm(demoAccounts[key]); setError(''); }}>{key === 'student' ? <Users size={16}/> : key === 'faculty' ? <BookOpen size={16}/> : <ShieldCheck size={16}/>} {key}</button>)}</div>}
      <form onSubmit={submit}>
        {setupMode ? <>
          <label>New password<input type="password" minLength="12" autoComplete="new-password" required value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)}/></label>
          <label>Confirm password<input type="password" minLength="12" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}/></label>
        </> : role === 'student' ? <>
          <label>Student roll number<input autoComplete="username" autoCapitalize="characters" required value={form.rollNumber} onChange={(e) => setForm({ ...form, rollNumber: e.target.value.toUpperCase() })} placeholder="e.g. 24B81A1201"/></label>
          <label>Demo password<input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}/></label>
        </> : <>
          <label>Email<input type="email" autoComplete="username" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/></label>
          <label>Password<input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}/></label>
        </>}
        {notice && <div className="notice">{notice}</div>}
        {error && <div className="error">{error}</div>}
        <button className="primary wide" disabled={busy}>{busy ? 'Please wait…' : setupMode ? 'Set password' : `Sign in as ${role}`} <ArrowRight size={17}/></button>
      </form>
      {!setupMode && <section className="demo-credentials">
        <b>Demo portal logins</b>
        <div><span>Student</span><code>24B81A1201</code><code>password123</code></div>
        <div><span>Faculty</span><code>professor@teamforge.demo</code><code>password123</code></div>
        <div><span>Administrator</span><code>admin@teamforge.demo</code><code>password123</code></div>
        <small>Local demo accounts only.</small>
      </section>}
    </section>
  </main>;
}

function Sidebar({ user, cycle, view, setView, logout }) {
  const items = [{ id: 'overview', label: 'Overview', icon: Activity }, { id: 'projects', label: user.role === 'student' ? 'Project board' : 'Projects', icon: BookOpen }, { id: 'teams', label: 'Teams & requests', icon: Users }, { id: 'students', label: 'Students', icon: Users }, ...(user.role === 'admin' ? [{ id: 'faculty', label: 'Faculty & allocation', icon: Contact }, { id: 'cycle', label: 'Cycle operations', icon: CalendarDays }, { id: 'review', label: 'Reviews & rubrics', icon: ClipboardCheck }] : user.role === 'faculty' ? [{ id: 'review', label: 'Review queue', icon: ClipboardCheck }] : []), { id: 'notifications', label: 'Notifications', icon: Bell }];
  return <aside className="sidebar"><div className="brand"><Layers3 size={20}/> teamforge</div><div className="workspace"><span className="status-dot"/> <div><small>PROJECT CYCLE</small><strong>{cycle?.name || 'Choose a cycle'}</strong></div></div><nav>{items.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={18}/>{label}</button>)}</nav><div className="sidebar-bottom"><div className="tip"><Sparkles size={17}/><b>Make it count</b><small>Team registration and project submissions in one place.</small></div><button className="profile" onClick={logout}><Avatar user={user}/><span><b>{user.name}</b><small>{user.role}</small></span><LogOut size={16}/></button></div></aside>;
}
function Topbar({ title, user, cycles, cycleId, onCycleChange }) { return <header className="topbar"><div><small>Information Technology / {user.role}</small><h2>{title}</h2></div><div className="top-actions"><label className="cycle-selector"><small>Active project cycle</small><select aria-label="Active project cycle" value={cycleId} onChange={(event) => onCycleChange(event.target.value)}>{cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</select></label><Avatar user={user}/></div></header>; }
function Stat({ label, value, note, icon: Icon, tone = 'purple' }) { return <div className="stat"><span className={`stat-icon ${tone}`}><Icon size={18}/></span><small>{label}</small><strong>{value}</strong><em>{note}</em></div>; }
function Empty({ children }) { return <div className="empty">{children}</div>; }

function Overview({ data, user, setView, cycleId }) {
  const cycle = data?.activeCycle;
  const myTeam = data?.myTeams?.find((team) => team.memberIds?.includes(user.id));
  const submission = myTeam?.submission;
  const myAssessment = myTeam?.studentEvaluations?.find((evaluation) => evaluation.studentId === user.id);
  const isStudent = user.role === 'student';
  const isAdmin = user.role === 'admin';
  const projectTitle = myTeam?.project?.title || myTeam?.projectName || 'Not registered';
  const presentationSubmitted = Boolean(submission?.presentationName);
  const documentationSubmitted = Boolean(submission?.documentationName);
  const taskStatus = (complete) => <span className={`task-status ${complete ? 'complete' : 'pending'}`}>{complete ? 'Complete' : 'To do'}</span>;
  return <>
    <div className="welcome">
      <div>
        <span className="eyebrow">{isStudent ? 'INFORMATION TECHNOLOGY · STUDENT PORTAL' : 'INFORMATION TECHNOLOGY · PROJECT PORTAL'}</span>
        <h1>{isStudent ? 'Your project, one clear step at a time.' : 'Department project overview.'}</h1>
        <p>{cycle?.name || 'Choose a project cycle'} · {cycle?.academicYear || ''} · {cycle?.config?.timezone || 'Asia/Kolkata'}</p>
      </div>
      <button className="primary" onClick={() => setView(isStudent ? 'teams' : isAdmin ? 'cycle' : 'review')}>
        {isStudent ? (myTeam ? 'Open my team' : 'Create or join a team') : isAdmin ? 'Manage cycle' : 'Open review queue'} <ArrowRight size={16}/>
      </button>
    </div>
    {isStudent && <div className="cycle-context card">
      <span className="cycle-context-icon"><CalendarDays size={19}/></span>
      <div><b>Registration is for {cycle?.name || 'the selected project cycle'}</b><small>Minor and Major projects have separate registrations. Confirm the selected cycle above before forming your team.</small></div>
      <span className="tag">{cycleId?.includes('major') ? 'MAJOR PROJECT' : cycleId?.includes('minor') ? 'MINOR PROJECT' : 'SELECTED CYCLE'}</span>
    </div>}
    <div className="stats">
      <Stat icon={Users} label="Students in class" value={data?.stats?.students || 0} note="Selected project cycle" tone="purple"/>
      <Stat icon={BookOpen} label="Projects in progress" value={data?.stats?.ongoingProjects || 0} note={`${data?.stats?.projects || 0} registered projects`} tone="teal"/>
      <Stat icon={CheckCircle2} label="Teams formed" value={data?.stats?.formedTeams || 0} note="For this project cycle" tone="orange"/>
      <Stat icon={Activity} label="Students per team" value="3 / 4" note="One four-member team allowed" tone="blue"/>
    </div>
    {isStudent ? <div className="student-overview-grid">
      <section className="card next-steps">
        <div className="card-head"><div><span className="eyebrow">YOUR CHECKLIST</span><h3>What to do next</h3></div><span className={`status ${myTeam ? 'formed' : 'pending_review'}`}>{myTeam ? 'Team registered' : 'Looking for a team'}</span></div>
        <div className="student-task">
          {taskStatus(Boolean(myTeam))}
          <div><b>{myTeam ? 'Team formed' : 'Create or join a team'}</b><small>{myTeam ? `You are a member of ${myTeam.name}.` : 'Build a team of three; a four-member team is reserved for the final eligible group.'}</small></div>
          {!myTeam && <button className="secondary" onClick={() => setView('teams')}>Find a team <ArrowRight size={14}/></button>}
        </div>
        <div className="student-task">
          {taskStatus(Boolean(myTeam && (myTeam.project?.title || myTeam.projectName)))}
          <div><b>{myTeam ? 'Project registered' : 'Choose and register a project'}</b><small>{myTeam ? projectTitle : 'Choose a faculty-posted topic or enter your team’s own project title and idea.'}</small></div>
          <button className="secondary" onClick={() => setView(myTeam ? 'teams' : 'projects')}>{myTeam ? 'View project' : 'Explore projects'} <ArrowRight size={14}/></button>
        </div>
        <div className="student-task">
          {taskStatus(presentationSubmitted && documentationSubmitted)}
          <div><b>{presentationSubmitted && documentationSubmitted ? 'Final files submitted' : 'Submit final files'}</b><small>{presentationSubmitted && documentationSubmitted ? 'Both required files have been received.' : 'Upload your project presentation as .pptx and documentation as .pdf.'}</small></div>
          {myTeam && <button className="secondary" onClick={() => setView('teams')}>{submission ? 'View status' : 'Upload files'} <ArrowRight size={14}/></button>}
        </div>
      </section>
      {myTeam ? <section className="card student-team-workspace">
        <div className="card-head"><div><span className="eyebrow">TEAM WORKSPACE</span><h3>{myTeam.name}</h3></div><span className={`status ${myTeam.status || 'formed'}`}>{String(myTeam.status || 'formed').replaceAll('_', ' ')}</span></div>
        <div className="workspace-project"><small>PROJECT</small><b>{projectTitle}</b></div>
        <div className="workspace-members"><b>Team members</b>{(myTeam.members || []).map((member) => <div className="workspace-member" key={member.id}><Avatar user={member}/><span><b>{member.name}</b><small>{member.rollNumber || 'Roll number unavailable'}{member.id === myTeam.leaderId ? ' · Team leader' : ''}</small></span>{member.id === myTeam.leaderId && <span className="leader-tag">LEADER</span>}</div>)}</div>
        <div className="faculty-feedback"><b>Faculty feedback</b>{myTeam.feedback ? <p>{myTeam.feedback}</p> : <small>Team-level feedback will appear here after your project is reviewed.</small>}{myTeam.marks != null && <span className="marks-badge">Team: {myTeam.marks} marks</span>}</div>
        {myAssessment && <div className="faculty-feedback individual-feedback"><b>Your individual assessment</b><span className="marks-badge">{myAssessment.marks} marks</span><p>{myAssessment.feedback}</p><small>Updated {new Date(myAssessment.updatedAt).toLocaleString()}</small></div>}
      </section> : <section className="card student-team-workspace empty-team-prompt"><span className="empty-workspace-icon"><Users size={22}/></span><h3>Your workspace starts with a team</h3><p>Register with a faculty topic or create a team project idea. Your selected cycle is <b>{cycle?.name || cycleId}</b>.</p><button className="primary" onClick={() => setView('teams')}>Create or join team <ArrowRight size={15}/></button><button className="link" onClick={() => setView('projects')}>Browse faculty project topics</button></section>}
    </div> : <div className="grid two"><section className="card"><div className="card-head"><div><span className="eyebrow">PROJECT CYCLE</span><h3>What to do next</h3></div><button className="link" onClick={() => setView('review')}>View projects</button></div><div className="timeline"><div><b>Register your team</b><small>Form a team of three students; one team may have four.</small></div><div><b>Select a project</b><small>Choose a faculty-provided topic or submit your own project idea.</small></div><div><b>Submit final deliverables</b><small>Upload one .pptx presentation and one .pdf documentation file.</small></div></div></section><section className="card accent-card"><Sparkles size={22}/><h3>One workspace for your project</h3><p>Team registration, project progress, and final documents are organized by project cycle for the Information Technology department.</p><button className="secondary" onClick={() => setView(isAdmin ? 'cycle' : 'review')}>{isAdmin ? 'Open workflow' : 'Open review queue'}</button></section></div>}
  </>;
}

function Projects({ user, setView, cycleId }) {
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({ title: '', acronym: '', course: 'Information Technology', description: '', abstract: '', department: 'Information Technology', branch: 'IT', teamSize: 3 });
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState('');
  const [deletingProject, setDeletingProject] = useState('');
  const [message, setMessage] = useState('');
  const load = () => api(`/projects?cycleId=${encodeURIComponent(cycleId)}&limit=50`).then((result) => setProjects(result.projects || result.data || [])).catch((error) => setMessage(error.message));
  useEffect(() => { load(); }, [cycleId]);
  const create = async (event) => {
    event.preventDefault();
    try {
      const result = await api('/projects', { method: 'POST', body: JSON.stringify({ ...form, cycleId, abstract: form.abstract || form.description }) });
      setMessage(result.similarityWarnings?.length ? `Project posted with ${result.similarityWarnings.length} similar-title warning(s).` : 'Project posted for this cycle.');
      setShow(false);
      setForm({ ...form, title: '', acronym: '', description: '', abstract: '' });
      load();
    } catch (error) { setMessage(error.message); }
  };
  const saveTopic = async (event, project) => {
    event.preventDefault();
    try {
      await api(`/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ title: form.title, description: form.description, abstract: form.description }) });
      setEditing('');
      setMessage('Project topic updated.');
      await load();
    } catch (error) { setMessage(error.message); }
  };
  const toggleTopic = async (project) => {
    try {
      await api(`/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify({ status: project.status === 'closed' ? 'active' : 'closed' }) });
      setMessage(project.status === 'closed' ? 'Project topic reopened.' : 'Project topic closed to new teams.');
      await load();
    } catch (error) { setMessage(error.message); }
  };
  const deleteProject = async (project) => {
    const teamCount = Number(project.teams || 0);
    const impact = teamCount
      ? ` This also permanently removes ${teamCount} registered team(s) and their requests, submissions, reviews, and faculty allocations.`
      : '';
    if (!window.confirm(`Delete project "${project.title}"?${impact} Student and faculty accounts and roster roll numbers will be kept.`)) return;
    setDeletingProject(project.id);
    try {
      const result = await api(`/projects/${project.id}`, { method: 'DELETE' });
      setMessage(`Project deleted${result.deletedTeamCount ? ` with ${result.deletedTeamCount} associated team(s)` : ''}. Student and faculty roster records were kept.`);
      await load();
    } catch (error) { setMessage(error.message); }
    finally { setDeletingProject(''); }
  };
  return <section>
    <div className="section-head"><div><span className="eyebrow">INFORMATION TECHNOLOGY · {cycleId.includes('major') ? 'MAJOR PROJECT CYCLE' : cycleId.includes('minor') ? 'MINOR PROJECT CYCLE' : 'PROJECT CYCLE'}</span><h1>{user.role === 'student' ? 'Choose a project idea.' : 'Projects in this cycle.'}</h1><p className="muted">Select a topic posted by faculty, or create a team with your own project idea. Your choice is registered in the active cycle above.</p></div>{user.role !== 'student' && <button className="primary" onClick={() => setShow(true)}><Plus size={16}/> Post project</button>}</div>
    {message && <div className="notice">{message}<button onClick={() => setMessage('')}><X size={14}/></button></div>}
    {show && <div className="card form-card"><div className="card-head"><h3>Post a faculty project</h3><button className="icon-button" onClick={() => setShow(false)}><X size={17}/></button></div><form className="form-grid" onSubmit={create}>
      <label>Project name<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label>
      <label>Project acronym/code<input pattern="[A-Za-z][A-Za-z0-9_-]*" value={form.acronym} onChange={(event) => setForm({ ...form, acronym: event.target.value })}/></label>
      <label className="span-2">Project description<textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
      <button className="primary">Publish project</button>
    </form></div>}
    <div className="project-list">{projects.map((project) => <article className="card project" key={project.id}>
      <div className="project-top"><span className="project-status">{project.status}</span><small>{project.department} · team size 3 (one team may have 4)</small></div>
      {editing === project.id ? <form className="topic-edit-form" onSubmit={(event) => saveTopic(event, project)}><label>Topic title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label><label>Topic description<textarea required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label><div className="button-row"><button className="primary">Save topic</button><button className="secondary" type="button" onClick={() => setEditing('')}>Cancel</button></div></form> : <><h3>{project.title}</h3><p>{project.abstract || project.description}</p><div className="project-foot"><span>{project.teams || 0} teams · {project.owner?.name || 'Faculty project'}</span>{user.role === 'student' && <button className="link" disabled={project.status === 'closed'} onClick={() => setView('teams')}>{project.status === 'closed' ? 'Topic closed' : 'Register a team'} <ArrowRight size={14}/></button>}</div>
      {user.role !== 'student' && (user.role === 'admin' || project.owner?.id === user.id) && <div className="topic-actions"><button className="secondary" onClick={() => { setEditing(project.id); setForm({ ...form, title: project.title, description: project.abstract || project.description }); }}>Edit topic</button><button className="secondary" onClick={() => toggleTopic(project)}>{project.status === 'closed' ? 'Reopen topic' : 'Close topic'}</button><button className="secondary delete-action" disabled={deletingProject === project.id} onClick={() => deleteProject(project)}>{deletingProject === project.id ? 'Deleting…' : 'Delete project'}</button></div>}</>}
    </article>)}</div>
    {!projects.length && <Empty>No faculty topics are posted for this project cycle. Students can still register their own project idea.</Empty>}
  </section>;
}

function Teams({ user, cycleId }) {
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [marks, setMarks] = useState({});
  const [projectLinks, setProjectLinks] = useState({});
  const [savingProjectLink, setSavingProjectLink] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [submissionFiles, setSubmissionFiles] = useState({});
  const [savingSubmission, setSavingSubmission] = useState('');
  const [expenseForms, setExpenseForms] = useState({});
  const [savingExpense, setSavingExpense] = useState('');
  const [withdrawingTeam, setWithdrawingTeam] = useState('');
  const [deletingTeam, setDeletingTeam] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [withdrawalDetails, setWithdrawalDetails] = useState('');
  const [createForm, setCreateForm] = useState({ projectId: '', teamName: '', projectName: '', projectAcronym: '', idea: '', memberIds: [], openForMembers: false });
  const load = async () => {
    try {
      const [teamResult, studentResult, projectResult, requestResult] = await Promise.all([
        api(`/teams?cycleId=${encodeURIComponent(cycleId)}&limit=100`),
        api(`/users?cycleId=${encodeURIComponent(cycleId)}&limit=100`),
        api(`/projects?cycleId=${encodeURIComponent(cycleId)}&limit=100`),
        user.role === 'student' ? api('/teams/requests?limit=50') : Promise.resolve({ requests: [] })
      ]);
      setTeams(teamResult.teams || teamResult.data || []);
      setProjectLinks((previous) => Object.fromEntries((teamResult.teams || teamResult.data || []).map((team) => [team.id, previous[team.id] ?? team.projectLink ?? ''])));
      setStudents(studentResult.users || studentResult.data || []);
      setProjects(projectResult.projects || projectResult.data || []);
      setRequests(requestResult.requests || requestResult.data || []);
    } catch (loadError) { setError(loadError.message); }
  };
  useEffect(() => { load(); }, [cycleId, user.role]);
  const createTeam = async (event) => {
    event.preventDefault();
    const size = createForm.memberIds.length + 1;
    if (createForm.openForMembers ? (size < 1 || size >= 3) : (size !== teamSize && size !== 4)) {
      setError(createForm.openForMembers ? 'An open team must start with one or two members.' : `Select exactly ${teamSize} students for a team, or four for the final group.`);
      return;
    }
    try {
      await api(`/projects/${createForm.projectId}/teams`, {
        method: 'POST',
        body: JSON.stringify({ ...createForm, cycleId, course: 'Information Technology' })
      });
      setShowCreate(false);
      setCreateForm({ projectId: '', teamName: '', projectName: '', projectAcronym: '', idea: '', memberIds: [], openForMembers: false });
      setError('');
      await load();
    } catch (createError) { setError(createError.message); }
  };
  const decideRequest = async (request, status) => {
    try {
      await api(`/teams/${request.teamId}/requests/${request.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setError('');
      setSuccess(status === 'approved' ? 'Join request accepted.' : 'Join request declined.');
      await load();
    } catch (requestError) { setError(requestError.message); }
  };
  const withdrawJoinRequest = async (request) => {
    try {
      await api(`/teams/${request.teamId}/requests/${request.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'withdrawn' }) });
      setError('');
      setSuccess('Your join request was withdrawn.');
      await load();
    } catch (requestError) { setError(requestError.message); }
  };
  const requestToJoin = async (team) => {
    setError('');
    setSuccess('');
    try {
      await api(`/teams/${team.id}/request`, { method: 'POST', body: JSON.stringify({ message: 'I would like to join your project team.' }) });
      setSuccess(`Join request sent to ${team.name}'s team leader.`);
      await load();
    } catch (requestError) { setError(requestError.message); }
  };
  const evaluate = async (team) => {
    try {
      await api(`/teams/${team.id}/evaluation`, { method: 'POST', body: JSON.stringify({ marks: Number(marks[team.id] || 0), feedback: 'Reviewed in cycle workspace.' }) });
      await load();
    } catch (reviewError) { setError(reviewError.message); }
  };
  const saveProjectLink = async (team) => {
    setSavingProjectLink(team.id);
    setError('');
    try {
      const result = await api(`/teams/${team.id}/project-link`, { method: 'PATCH', body: JSON.stringify({ projectLink: projectLinks[team.id] || '' }) });
      setTeams((previous) => previous.map((item) => item.id === team.id ? result.team : item));
      setProjectLinks((previous) => ({ ...previous, [team.id]: result.team.projectLink || '' }));
      setSuccess(result.team.projectLink ? 'Project link saved and shared with your faculty guide and administrator.' : 'Project link removed.');
    } catch (linkError) { setError(linkError.message); }
    finally { setSavingProjectLink(''); }
  };
  const addExpense = async (event, team) => {
    event.preventDefault();
    const form = expenseForms[team.id] || {};
    setSavingExpense(team.id);
    setError('');
    setSuccess('');
    try {
      const result = await api(`/teams/${team.id}/expenses`, {
        method: 'POST',
        body: JSON.stringify({ description: form.description, amount: Number(form.amount), paidById: form.paidById || user.id })
      });
      setTeams((previous) => previous.map((item) => item.id === team.id
        ? { ...item, expenses: [result.expense, ...(item.expenses || [])] }
        : item));
      setExpenseForms((previous) => ({ ...previous, [team.id]: { description: '', amount: '', paidById: user.id } }));
      setSuccess('Expense added and split equally among your team members.');
    } catch (expenseError) { setError(expenseError.message); }
    finally { setSavingExpense(''); }
  };
  const submitFiles = async (event, team) => {
    event.preventDefault();
    const files = submissionFiles[team.id] || {};
    if (!files.presentation || !files.documentation) {
      setError('Choose both a .pptx presentation and a .pdf documentation file.');
      return;
    }
    const body = new FormData();
    body.append('presentation', files.presentation);
    body.append('documentation', files.documentation);
    setSavingSubmission(team.id);
    setError('');
    try {
      await api(`/teams/${team.id}/submission`, { method: 'POST', body });
      setSubmissionFiles((previous) => ({ ...previous, [team.id]: {} }));
      await load();
      setSuccess('Both files were accepted. Your final project submission is confirmed.');
    } catch (submissionError) { setError(submissionError.message); }
    finally { setSavingSubmission(''); }
  };
  const withdrawFromTeam = async (event, team) => {
    event.preventDefault();
    if (!window.confirm(`Unregister only yourself from ${team.name}? Your teammates will remain registered.`)) return;
    setWithdrawingTeam(team.id);
    setError('');
    setSuccess('');
    try {
      const result = await api(`/teams/${team.id}/withdraw`, {
        method: 'POST',
        body: JSON.stringify({ reason: withdrawalReason, details: withdrawalDetails })
      });
      await load();
      setWithdrawalReason('');
      setWithdrawalDetails('');
      setSuccess(result.dissolved
        ? `You unregistered from ${team.name}; the team is now empty and has been closed.`
        : `You unregistered from ${team.name}. Your teammates remain registered.`);
    } catch (withdrawError) { setError(withdrawError.message); }
    finally { setWithdrawingTeam(''); }
  };
  const deleteTeam = async (team) => {
    if (!window.confirm(`Delete team "${team.name}"? Its project-team registration, requests, submissions, reviews, and allocations will be removed. Student accounts and roster roll numbers will be kept.`)) return;
    setDeletingTeam(team.id);
    setError('');
    setSuccess('');
    try {
      await api(`/teams/${team.id}`, { method: 'DELETE' });
      await load();
      setSuccess(`${team.name} was deleted. Its student members remain on the roster.`);
    } catch (deleteError) { setError(deleteError.message); }
    finally { setDeletingTeam(''); }
  };
  const downloadFile = async (team, kind) => {
    try {
      const blob = await api(`/teams/${team.id}/submission/${kind}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = kind === 'presentation' ? team.submission.presentationName : team.submission.documentationName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) { setError(downloadError.message); }
  };
  const exportReport = async () => {
    try {
      const blob = await api(`/reports/teams.csv?cycleId=${encodeURIComponent(cycleId)}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'teamforge-project-report.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) { setError(downloadError.message); }
  };
  const assignedIds = new Set(teams.flatMap((team) => team.memberIds || []));
  const unassignedStudents = students.filter((student) => !assignedIds.has(student.id));
  const ownTeam = teams.find((team) => team.memberIds?.includes(user.id));
  const finalFourAllowed = unassignedStudents.length === 4 && !teams.some((team) => team.memberIds?.length === 4);
  const teamSize = finalFourAllowed ? 4 : 3;
  const selectedMemberCount = createForm.memberIds.length + 1;
  const canSubmitTeam = createForm.openForMembers
    ? selectedMemberCount < 3
    : selectedMemberCount === teamSize || selectedMemberCount === 4;
  const selectedProject = projects.find((project) => project.id === createForm.projectId);
  const incoming = requests.filter((request) => teams.some((team) => team.id === request.teamId && team.leaderId === user.id && request.status === 'pending'));
  const pendingJoinRequestTeamIds = new Set(requests.filter((request) => request.userId === user.id && request.status === 'pending').map((request) => request.teamId));
  const changeProject = (projectId) => {
    const project = projects.find((item) => item.id === projectId);
    setCreateForm((previous) => ({ ...previous, projectId, projectName: project?.title || '', memberIds: [] }));
  };
  const changeFile = (teamId, field, file) => setSubmissionFiles((previous) => ({
    ...previous,
    [teamId]: { ...previous[teamId], [field]: file }
  }));

  return <section>
    <div className="section-head"><div><span className="eyebrow">INFORMATION TECHNOLOGY · TEAM REGISTRATION</span><h1>{user.role === 'student' ? 'Register your project team.' : 'Project teams and submissions.'}</h1><p className="muted">Teams contain three students; one team of four is allowed for the 64-student cohort.</p></div><div className="button-row">{user.role === 'student' && <button className="primary" disabled={Boolean(ownTeam) || unassignedStudents.length < 3} onClick={() => setShowCreate(true)}><Plus size={16}/> Create team</button>}{user.role !== 'student' && <button className="secondary" onClick={exportReport}><Download size={15}/> Export CSV</button>}</div></div>
    {error && <div className="error">{error}</div>}
    {success && <div className="notice submission-confirmation"><CheckCircle2 size={17}/>{success}</div>}
    {user.role === 'student' && ownTeam && <div className="notice">You are already registered with {ownTeam.name} in this project cycle.</div>}
    {user.role === 'student' && incoming.length > 0 && <section className="card request-panel"><h3>Requests to join your teams</h3>{incoming.map((request) => <div className="request-row" key={request.id}><span>{request.message || 'Join request'}</span><button className="secondary" onClick={() => decideRequest(request, 'rejected')}>Decline</button><button className="primary" onClick={() => decideRequest(request, 'approved')}>Accept</button></div>)}</section>}
    <div className="team-grid">{teams.map((team) => <article className="card team" key={team.id}>
      <div className="team-head"><div className="team-symbol"><Users size={20}/></div><span className={`status ${team.status || 'formed'}`}>{String(team.status || 'formed').replace('_', ' ')}</span></div>
      <h3>{team.name}</h3><p className="muted">{team.project?.title || team.projectName || 'Project idea'}</p>
      {team.project && <p className="team-project-status">Project status: <b>{String(team.project.status || 'registered').replaceAll('_', ' ')}</b></p>}
      {user.role === 'student' && team.memberIds?.includes(user.id) && <form className="project-link-form" onSubmit={(event) => { event.preventDefault(); saveProjectLink(team); }}><label>Project link <small>GitHub repository, Vercel deployment, or another HTTPS project URL</small><input type="url" maxLength="500" placeholder="https://github.com/your-team/project" value={projectLinks[team.id] || ''} onChange={(event) => setProjectLinks((previous) => ({ ...previous, [team.id]: event.target.value }))}/></label><button className="secondary" disabled={savingProjectLink === team.id}>{savingProjectLink === team.id ? 'Saving…' : team.projectLink ? 'Update project link' : 'Share project link'}</button></form>}
      {team.projectLink && <a className="project-link-preview" href={team.projectLink} target="_blank" rel="noopener noreferrer"><span className="project-link-icon"><ExternalLink size={16}/></span><span><b>Project link preview</b><small>{linkHost(team.projectLink)}</small><em>{team.projectLink}</em></span><ExternalLink size={14}/></a>}
      {user.role === 'student' && !ownTeam && (pendingJoinRequestTeamIds.has(team.id) || (team.openForMembers && (team.memberIds || []).length < Number(team.maxMembers || 3))) && <div className="join-team-action">{(() => {
        const pendingRequest = requests.find((request) => request.teamId === team.id && request.userId === user.id && request.status === 'pending');
        return pendingRequest
          ? <><span className="task-status pending">Request pending</span><button className="secondary" onClick={() => withdrawJoinRequest(pendingRequest)}>Cancel request</button></>
          : <button className="secondary" onClick={() => requestToJoin(team)}>Request to join <ArrowRight size={14}/></button>;
      })()}<small>{Number(team.maxMembers || 3) - (team.memberIds || []).length} place(s) available · leader approval required</small></div>}
      <div className="member-stack">{(team.members || []).map((member) => <span title={`${member.name} · ${member.rollNumber || ''}`} key={member.id}><Avatar user={member}/></span>)}</div>
      <div className="team-members">{(team.members || []).map((member) => <div key={member.id}><b>{member.name}{member.id === team.leaderId && <span className="leader-inline"> · Team leader</span>}</b><small>{member.rollNumber || 'Roll number unavailable'}</small></div>)}</div>
      {user.role === 'student' && team.memberIds?.includes(user.id) && <section className="team-budget">
        <div className="team-budget-head"><div><b>Shared expenses</b><small>Each expense is split equally among the team members.</small></div></div>
        <form className="expense-form" onSubmit={(event) => addExpense(event, team)}>
          <label>What was the expense?<input required maxLength="100" placeholder="e.g. Project materials" value={expenseForms[team.id]?.description || ''} onChange={(event) => setExpenseForms((previous) => ({ ...previous, [team.id]: { ...previous[team.id], description: event.target.value } }))}/></label>
          <div className="expense-form-row">
            <label>Amount (INR)<input required type="number" min="0.01" max="10000000" step="0.01" placeholder="0.00" value={expenseForms[team.id]?.amount || ''} onChange={(event) => setExpenseForms((previous) => ({ ...previous, [team.id]: { ...previous[team.id], amount: event.target.value } }))}/></label>
            <label>Paid by<select value={expenseForms[team.id]?.paidById || user.id} onChange={(event) => setExpenseForms((previous) => ({ ...previous, [team.id]: { ...previous[team.id], paidById: event.target.value } }))}>{(team.members || []).map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
          </div>
          <button className="secondary" disabled={savingExpense === team.id}>{savingExpense === team.id ? 'Adding…' : 'Add and split expense'}</button>
        </form>
        {(team.expenses || []).length > 0 ? <div className="budget-expense-list">{team.expenses.map((expense) => <article className="budget-expense" key={expense.id}>
          <div className="budget-expense-title"><b>{expense.description}</b><strong>{formatCurrency(expense.amountPaise / 100)}</strong></div>
          <small>Paid by {expense.paidByName} · {new Date(expense.createdAt).toLocaleDateString()}</small>
          <div className="expense-splits">{expense.memberShares.map((share) => <span key={share.memberId}>{share.memberName}<b>{formatCurrency(share.amountPaise / 100)}</b></span>)}</div>
        </article>)}</div> : <p className="budget-empty">No shared expenses yet. Add one to see everyone's share.</p>}
      </section>}
      {team.idea && <p>{team.idea}</p>}
      {team.feedback && <div className="faculty-feedback team-feedback"><b>Faculty feedback</b><p>{team.feedback}</p>{team.marks != null && <small>{team.marks} marks</small>}</div>}
      {user.role === 'student' && team.studentEvaluations?.find((evaluation) => evaluation.studentId === user.id) && <div className="faculty-feedback"><b>Your individual assessment</b><span className="marks-badge">{team.studentEvaluations.find((evaluation) => evaluation.studentId === user.id).marks} marks</span><p>{team.studentEvaluations.find((evaluation) => evaluation.studentId === user.id).feedback}</p></div>}
      <div className="submission-status">
        <b>{team.submission ? 'Final submission confirmed' : 'Final files not submitted'}</b>
        <div className="submission-file-status"><span>Presentation (.pptx)<em className={team.submission?.presentationName ? 'file-accepted' : 'file-pending'}>{team.submission?.presentationName ? 'Received' : 'Pending'}</em></span><span>Documentation (.pdf)<em className={team.submission?.documentationName ? 'file-accepted' : 'file-pending'}>{team.submission?.documentationName ? 'Received' : 'Pending'}</em></span></div>
        {team.submission?.submittedAt && <small>Submitted {new Date(team.submission.submittedAt).toLocaleString()}</small>}
        {team.submission && <div className="button-row"><button className="secondary" onClick={() => downloadFile(team, 'presentation')}>Download PPTX</button><button className="secondary" onClick={() => downloadFile(team, 'documentation')}>Download PDF</button></div>}
      </div>
      {user.role === 'student' && team.memberIds?.includes(user.id) && <form className="team-submission" onSubmit={(event) => submitFiles(event, team)}>
        <label>Project presentation (.pptx)<input type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => changeFile(team.id, 'presentation', event.target.files?.[0])}/></label>
        <label>Project documentation (.pdf)<input type="file" accept=".pdf,application/pdf" onChange={(event) => changeFile(team.id, 'documentation', event.target.files?.[0])}/></label>
        <button className="primary" disabled={savingSubmission === team.id}>{savingSubmission === team.id ? 'Uploading…' : 'Submit project files'}</button>
      </form>}
      {user.role === 'student' && team.memberIds?.includes(user.id) && (team.submission
        ? <p className="muted">Unregistering is unavailable after the team submits its final files.</p>
        : <form className="withdraw-form" onSubmit={(event) => withdrawFromTeam(event, team)}>
          <b>Can’t continue with this project?</b>
          <small>Unregister only yourself; the other team members stay registered. Your reason is recorded for the cycle administrators.</small>
          <label>Reason<select required value={withdrawalReason} onChange={(event) => setWithdrawalReason(event.target.value)}>
            <option value="">Choose a reason</option>
            <option value="CRT / placement activities">CRT / placement activities</option>
            <option value="Academic workload">Academic workload</option>
            <option value="Personal reasons">Personal reasons</option>
            <option value="Other commitments">Other commitments</option>
          </select></label>
          <label>Additional details (optional)<textarea maxLength="300" rows="2" value={withdrawalDetails} onChange={(event) => setWithdrawalDetails(event.target.value)} placeholder="Optional details for the administrator"/></label>
          <button className="secondary withdraw-button" disabled={withdrawingTeam === team.id}>{withdrawingTeam === team.id ? 'Unregistering…' : 'Unregister yourself'}</button>
        </form>)}
      {user.role !== 'student' && <button className="secondary delete-action" disabled={deletingTeam === team.id} onClick={() => deleteTeam(team)}>{deletingTeam === team.id ? 'Deleting…' : 'Delete team'}</button>}
      {user.role !== 'student' && <div className="review-row"><input type="number" min="0" max="100" placeholder="Marks" value={marks[team.id] || ''} onChange={(event) => setMarks({ ...marks, [team.id]: event.target.value })}/><button className="secondary" onClick={() => evaluate(team)}>Post review</button></div>}
    </article>)}</div>
    {!teams.length && <Empty>No teams have been registered for this cycle.</Empty>}
    {showCreate && <div className="card form-card"><div className="card-head"><h3>Register a team</h3><button className="icon-button" onClick={() => setShowCreate(false)}><X size={17}/></button></div>
      <p className="muted">Select {teamSize} members including yourself. Every student may join only one team in this cycle.</p>
      <form className="form-grid" onSubmit={createTeam}>
        <div className="span-2 cycle-form-context"><b>Registration cycle: {cycleId.includes('major') ? 'Major Project · 4th Year · 2nd Semester' : cycleId.includes('minor') ? 'Minor Project · 3rd Year · 2nd Semester' : cycleId}</b><small>Projects are registered only in this selected cycle. Check the cycle selector above before continuing.</small></div>
        <label className="span-2">Choose a project option<select required value={createForm.projectId} onChange={(event) => changeProject(event.target.value)}><option value="">Choose a faculty-posted topic or your own idea</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.title} · Faculty topic</option>)}<option value="own">Create my team’s own project</option></select></label>
        {createForm.projectId === 'own' && <><label className="span-2">Your team’s project title<input required value={createForm.projectName} onChange={(event) => setCreateForm({ ...createForm, projectName: event.target.value })} placeholder="Enter a unique project title"/></label><label>Project acronym/code<input value={createForm.projectAcronym} onChange={(event) => setCreateForm({ ...createForm, projectAcronym: event.target.value })} placeholder="Letters, numbers, - or _"/></label></>}
        {selectedProject && <div className="span-2 notice"><b>Faculty topic selected: {selectedProject.title}</b><span>{selectedProject.abstract || selectedProject.description}</span></div>}
        <div className="span-2 member-picker"><div className="picker-head"><b>Select team members</b><span>{createForm.memberIds.length + 1}/{teamSize} selected including you</span></div><div className="student-options">
          {unassignedStudents.filter((student) => student.id !== user.id).map((student) => {
            const checked = createForm.memberIds.includes(student.id);
            const disabled = !checked && createForm.memberIds.length + 1 >= teamSize;
            return <label className={`student-option ${disabled ? 'disabled' : ''}`} key={student.id}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => setCreateForm({ ...createForm, memberIds: event.target.checked ? [...createForm.memberIds, student.id] : createForm.memberIds.filter((id) => id !== student.id) })}/><Avatar user={student}/><span><b>{student.name}</b><small>{student.rollNumber} · Information Technology</small></span><em>{checked ? 'Selected' : 'Available'}</em></label>;
          })}
        </div></div>
        <label className="open-team-option span-2"><input type="checkbox" checked={createForm.openForMembers} onChange={(event) => setCreateForm({ ...createForm, openForMembers: event.target.checked })}/><span><b>Open this team for join requests</b><small>Start with one or two members and let interested students request a place. The team leader approves requests; team size is capped at three.</small></span></label>
        <label>Team name<input required minLength="2" value={createForm.teamName} onChange={(event) => setCreateForm({ ...createForm, teamName: event.target.value })} placeholder="Give your team a name"/></label>
        <label className="span-2">{createForm.projectId === 'own' ? 'Your team’s project idea and goals' : 'How your team plans to approach this topic'}<textarea required rows="5" value={createForm.idea} onChange={(event) => setCreateForm({ ...createForm, idea: event.target.value })} placeholder="Describe the project purpose, goals, and what your team plans to build."/></label>
        <button className="primary" disabled={!canSubmitTeam}>Register team and project</button>
      </form>
    </div>}
  </section>;
}

function Students({ user, cycleId }) {
  const [students, setStudents] = useState([]); const [branches, setBranches] = useState([]); const [search, setSearch] = useState(''); const [branch, setBranch] = useState(''); const [section, setSection] = useState(''); const [teamStatus, setTeamStatus] = useState(''); const [page, setPage] = useState(1); const [pagination, setPagination] = useState({ pages: 1, total: 0 }); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(''); const [setupLink, setSetupLink] = useState('');
  const load = async () => { try { const query = new URLSearchParams({ cycleId, page, limit: 25, search, branch, section, teamStatus, sort: 'rollNumber' }); const result = await api(`/users?${query}`); setStudents(result.users || result.data || []); setBranches(result.branches || []); setPagination(result.pagination || { pages: 1, total: (result.users || []).length }); } catch (e) { setError(e.message); } };
  useEffect(() => { load(); }, [cycleId, page, search, branch, section, teamStatus]);
  const action = async (student, endpoint, body = {}) => { setBusy(student.id); setError(''); try { await api(endpoint, { method: 'POST', body: JSON.stringify(body) }); setMessage('Action sent successfully.'); load(); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  const createSetupLink = async (student) => { setBusy(student.id); setError(''); setSetupLink(''); try { const result = await api(`/users/${student.id}/setup-link`, { method: 'POST', body: JSON.stringify({}) }); setSetupLink(result.setupUrl); setMessage(`Secure setup link created for ${student.name}; expires ${new Date(result.expiresAt).toLocaleString()}.`); } catch (e) { setError(e.message); } finally { setBusy(''); } };
  const ownTeam = students.find((student) => student.id === user.id)?.teamId;
  const canInvite = user.role === 'student' && ownTeam;
  return <section><div className="section-head"><div><span className="eyebrow">DIRECTORY</span><h1>Students</h1><p className="muted">Find teammates by branch, section, and team status. Directory access is read-only unless an action is explicitly allowed for your role.</p></div></div>{error && <div className="error">{error}</div>}{message && <div className="notice">{message}</div>}{setupLink && <div className="card setup-link-card"><b>Single-use password setup link</b><input readOnly value={setupLink} onFocus={(event) => event.target.select()}/><button className="secondary" onClick={() => navigator.clipboard.writeText(setupLink)}>Copy setup link</button></div>}<div className="card directory-filters"><div className="filter-grid"><select value={branch} onChange={(e) => { setBranch(e.target.value); setPage(1); }}><option value="">All branches</option>{branches.map((item) => <option value={item} key={item}>{item}</option>)}</select><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name or roll number..." /><select value={section} onChange={(e) => { setSection(e.target.value); setPage(1); }}><option value="">All sections</option><option value="A">Section A</option><option value="B">Section B</option><option value="C">Section C</option><option value="D">Section D</option></select><select value={teamStatus} onChange={(e) => { setTeamStatus(e.target.value); setPage(1); }}><option value="">All team statuses</option><option value="in_team">In a team</option><option value="looking">Looking for a team</option><option value="unassigned">Unassigned</option></select></div></div><div className="student-directory">{students.map((student) => <article className="card directory-row" key={student.id}><Avatar user={student}/><div><b>{student.name}</b><small>{student.rollNumber || 'No roll number'} · {student.branch || student.department || 'Branch not set'} · Section {student.section || '—'}</small></div><span className={`status ${student.teamStatus || 'unassigned'}`}>{student.teamStatusLabel || student.teamStatus || 'Unassigned'}</span><div><small>Team</small><b>{student.teamName || 'Looking for a team'}</b></div><div className="tag-list">{(student.skills || student.interests || []).slice(0, 4).map((skill) => <em key={skill}>{skill}</em>)}</div>{user.role !== 'student' && <div className="directory-extra"><small>{student.email || '—'} {student.cgpa != null && `· CGPA ${student.cgpa}`}</small><small>{student.guideName ? `Guide: ${student.guideName}` : 'No guide allocated'} · {student.accountStatus === 'setup_required' ? 'Setup required' : 'Active'}</small></div>}{user.role === 'student' && student.id !== user.id && student.branch === user.branch && !student.teamId && <div className="directory-actions">{canInvite && <button className="secondary" disabled={busy === student.id} onClick={() => action(student, `/teams/${ownTeam}/invitations`, { studentId: student.id })}>Invite</button>}{!canInvite && !user.teamId && <button className="secondary" disabled={busy === student.id} onClick={() => action(student, `/users/${student.id}/team-up`, { message: 'Would you like to form a project team together?' })}>Request to team up</button>}</div>}{user.role === 'admin' && <div className="directory-actions"><button className="secondary" disabled={busy === student.id} onClick={() => createSetupLink(student)}>{student.accountStatus === 'setup_required' ? 'Create setup link' : 'Reset password setup'}</button></div>}</article>)}</div>{!students.length && <Empty>No students match these filters.</Empty>}<div className="pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pagination.pages || 1} · {pagination.total || 0} students</span><button className="secondary" disabled={page >= (pagination.pages || 1)} onClick={() => setPage(page + 1)}>Next</button></div></section>;
}

function FacultyDirectory() {
  const [names, setNames] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/faculty-directory?page=${page}&limit=25`)
      .then((result) => {
        setNames(result.faculty || []);
        setPagination(result.pagination || { pages: 1, total: (result.faculty || []).length });
      })
      .catch((loadError) => setError(loadError.message));
  }, [page]);
  return <section>
    <div className="section-head"><div><span className="eyebrow">ADMINISTRATOR</span><h1>Faculty names</h1><p className="muted">Department faculty roster. Personal photos and staff IDs are not displayed.</p></div></div>
    {error && <div className="error">{error}</div>}
    <div className="faculty-name-list">{names.map((name) => <div className="card faculty-name" key={name}>{name}</div>)}</div>
    {!names.length && !error && <Empty>No faculty names are available.</Empty>}
    <div className="pagination"><button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pagination.pages || 1} · {pagination.total || 0} faculty</span><button className="secondary" disabled={page >= (pagination.pages || 1)} onClick={() => setPage(page + 1)}>Next</button></div>
  </section>;
}

function CycleOps({ user }) {
  const emptyForm = { name: '', academicYear: '', projectType: 'Minor Project', term: '3rd Year · 2nd Semester', department: 'Information Technology', timezone: 'Asia/Kolkata', status: 'draft', deadline: '', minTeamSize: 3, maxTeamSize: 3 };
  const [cycles, setCycles] = useState([]); const [selected, setSelected] = useState(''); const [form, setForm] = useState(emptyForm); const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState(null); const [roster, setRoster] = useState(null); const [errors, setErrors] = useState([]); const [message, setMessage] = useState('');
  const [allocations, setAllocations] = useState(null); const [assigning, setAssigning] = useState(false); const [savingTeam, setSavingTeam] = useState('');
  const [oversight, setOversight] = useState(null); const [topics, setTopics] = useState([]); const [auditRows, setAuditRows] = useState([]); const [resolution, setResolution] = useState({}); const [selectedTeam, setSelectedTeam] = useState({}); const [teamActionBusy, setTeamActionBusy] = useState('');
  const loadCycles = async () => {
    const result = await api('/cycles?limit=100');
    const list = (result.cycles || result.data || []).filter((cycle) => cycle.department === 'Information Technology' || cycle.id.startsWith('cycle-it-'));
    setCycles(list);
    return list;
  };
  useEffect(() => {
    loadCycles().then((list) => setSelected((current) => current || list.find((cycle) => cycle.status === 'active')?.id || list[0]?.id || '')).catch((error) => setMessage(error.message));
  }, []);
  const loadCycleData = async () => {
    if (!selected) return;
    const [cycleResult, rosterResult, errorResult, allocationResult, oversightResult, projectResult, auditResult] = await Promise.all([
      api('/cycles?limit=100'), api(`/cycles/${selected}/roster?page=1&limit=100`),
      api(`/cycles/${selected}/roster-errors`), api(`/cycles/${selected}/team-allocations`),
      api(`/cycles/${selected}/oversight`), api(`/projects?cycleId=${encodeURIComponent(selected)}&limit=100`),
      api(`/audit?cycleId=${encodeURIComponent(selected)}&limit=30`)
    ]);
    const cycle = (cycleResult.cycles || cycleResult.data || []).find((item) => item.id === selected);
    if (cycle) setForm({ ...emptyForm, ...cycle, ...cycle.config, deadline: dateTimeInputValue(cycle.config?.deadline, cycle.timezone || 'Asia/Kolkata'), minTeamSize: cycle.config?.minTeamSize ?? 3, maxTeamSize: cycle.config?.maxTeamSize ?? 3 });
    setRoster(rosterResult); setErrors(errorResult.errors || []); setAllocations(allocationResult); setOversight(oversightResult);
    setTopics(projectResult.projects || projectResult.data || []); setAuditRows(auditResult.data || []);
  };
  useEffect(() => { if (user.role === 'admin' && selected) loadCycleData().catch((error) => setMessage(error.message)); }, [selected, user.role]);
  const saveCycle = async (event) => {
    event.preventDefault(); setMessage('');
    let deadline;
    try { deadline = form.deadline ? dateTimeInputToISO(form.deadline, form.timezone) : null; }
    catch (error) { setMessage(error.message); return; }
    const body = { name: form.name, academicYear: form.academicYear, projectType: form.projectType, term: form.term, department: form.department, timezone: form.timezone, status: form.status, config: { minTeamSize: Number(form.minTeamSize), maxTeamSize: Number(form.maxTeamSize), deadline } };
    try {
      const result = creating
        ? await api('/cycles', { method: 'POST', body: JSON.stringify(body) })
        : await api(`/cycles/${selected}`, { method: 'PATCH', body: JSON.stringify(body) });
      const id = result.cycle.id;
      const list = await loadCycles();
      if (!list.some((cycle) => cycle.id === id)) setCycles((current) => [...current, result.cycle]);
      window.dispatchEvent(new CustomEvent('teamforge:cycles-changed', { detail: { cycles: list, selectedCycleId: id } }));
      localStorage.setItem('teamforge_cycle', id);
      setSelected(id); setCreating(false); setMessage(creating ? 'Project cycle created.' : 'Cycle settings saved.');
    } catch (error) { setMessage(error.message); }
  };
  const startNewCycle = () => { setCreating(true); setSelected(''); setForm(emptyForm); setPreview(null); };
  const importRoster = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const body = new FormData(); body.append('roster', file);
    try {
      const result = await api(`/cycles/${selected}/roster/import`, { method: 'POST', body });
      setMessage(`Imported or updated ${result.imported} rows; ${result.errors.length} require correction.`);
      await loadCycleData();
    } catch (error) { setMessage(error.message); }
    finally { event.target.value = ''; }
  };
  const resolveRow = async (row) => {
    try {
      await api(`/cycles/${selected}/roster-errors/${row.id}/resolve`, { method: 'PATCH', body: JSON.stringify(resolution[row.id] || {}) });
      setMessage(`Roster row ${row.row} corrected and added.`);
      await loadCycleData();
    } catch (error) { setMessage(error.message); }
  };
  const saveTeamAssignment = async (studentId) => {
    setTeamActionBusy(studentId);
    try {
      await api(`/cycles/${selected}/students/${studentId}/team`, { method: 'PUT', body: JSON.stringify({ teamId: selectedTeam[studentId] || null, reason: 'Resolved from administrator cycle oversight' }) });
      setMessage('Student team membership updated and recorded in the audit history.');
      await loadCycleData();
    } catch (error) { setMessage(error.message); }
    finally { setTeamActionBusy(''); }
  };
  const formTeams = async (commit = false) => {
    try {
      const result = await api(`/cycles/${selected}/formation/${commit ? 'commit' : 'preview'}`, { method: 'POST', body: JSON.stringify(commit ? { preview, idempotencyKey: `ui-${selected}` } : {}) });
      if (commit) { setMessage(`Committed ${result.teams.length} teams; ${result.unassignedMemberIds?.length || 0} students need manual resolution.`); setPreview(null); await loadCycleData(); }
      else setPreview(result.preview);
    } catch (error) { setMessage(error.message); }
  };
  const balanceFaculty = async () => {
    setAssigning(true); setMessage('');
    try { await api(`/cycles/${selected}/team-allocations/balance`, { method: 'POST', body: JSON.stringify({}) }); await loadCycleData(); setMessage('Faculty coordinators assigned as evenly as possible.'); }
    catch (error) { setMessage(error.message); } finally { setAssigning(false); }
  };
  const assignFaculty = async (teamId, facultyId) => {
    setSavingTeam(teamId); setMessage('');
    try { await api(`/cycles/${selected}/team-allocations/${teamId}`, { method: 'PATCH', body: JSON.stringify({ facultyId }) }); await loadCycleData(); }
    catch (error) { setMessage(error.message); } finally { setSavingTeam(''); }
  };
  const toggleTopic = async (topic) => {
    try { await api(`/projects/${topic.id}`, { method: 'PATCH', body: JSON.stringify({ status: topic.status === 'closed' ? 'active' : 'closed' }) }); await loadCycleData(); setMessage(`Topic ${topic.status === 'closed' ? 'reopened' : 'closed'}.`); }
    catch (error) { setMessage(error.message); }
  };
  const deleteTopic = async (topic) => {
    const teamCount = Number(topic.teams || 0);
    const impact = teamCount ? ` This also deletes ${teamCount} team(s) and their related records.` : '';
    if (!window.confirm(`Delete "${topic.title}"?${impact} Student accounts and roster roll numbers will be preserved.`)) return;
    try {
      const result = await api(`/projects/${topic.id}`, { method: 'DELETE' });
      await loadCycleData();
      setMessage(`Project deleted${result.deletedTeamCount ? ` with ${result.deletedTeamCount} team(s)` : ''}. Student roster records were preserved.`);
    } catch (error) { setMessage(error.message); }
  };
  const downloadReport = async (format) => {
    try {
      const blob = await api(`/reports/teams.${format}?cycleId=${encodeURIComponent(selected)}`);
      const link = document.createElement('a'); const url = URL.createObjectURL(blob); link.href = url; link.download = `teamforge-${form.projectType.toLowerCase().replaceAll(' ', '-')}-report.${format}`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setMessage(error.message); }
  };
  return <section className="admin-cycle-page">
    <div className="section-head"><div><span className="eyebrow">ADMINISTRATOR CONSOLE</span><h1>Configure and oversee project cycles.</h1><p className="muted">Cycle setup, roster quality, team exceptions, department exports, and an attributable audit trail.</p></div><div className="button-row"><select value={creating ? '' : selected} onChange={(event) => { setCreating(false); setSelected(event.target.value); setPreview(null); }}><option value="">Select cycle</option>{cycles.map((cycle) => <option value={cycle.id} key={cycle.id}>{cycle.name}</option>)}</select><button className="primary" onClick={startNewCycle}><Plus size={15}/> New cycle</button></div></div>
    {message && <div className="notice">{message}</div>}
    <section className="card workflow">
      <div className="card-head"><div><span className="eyebrow">CYCLE SETUP</span><h3>{creating ? 'Create a project cycle' : 'Academic cycle settings'}</h3></div></div>
      <form className="form-grid admin-cycle-form" onSubmit={saveCycle}>
        <label>Cycle name<input required value={form.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Minor Project · 3rd Year · 2nd Semester"/></label>
        <label>Academic year<input required value={form.academicYear || ''} onChange={(event) => setForm({ ...form, academicYear: event.target.value })} placeholder="2026-27"/></label>
        <label>Project type<select value={form.projectType || 'Minor Project'} onChange={(event) => setForm({ ...form, projectType: event.target.value })}><option>Minor Project</option><option>Major Project</option><option>Other</option></select></label>
        <label>Year / semester<input required value={form.term || ''} onChange={(event) => setForm({ ...form, term: event.target.value })} placeholder="3rd Year · 2nd Semester"/></label>
        <label>Minimum team size<input type="number" min="1" max="8" required value={form.minTeamSize ?? 3} onChange={(event) => setForm({ ...form, minTeamSize: event.target.value })}/></label>
        <label>Maximum team size<input type="number" min="1" max="8" required value={form.maxTeamSize ?? 3} onChange={(event) => setForm({ ...form, maxTeamSize: event.target.value })}/></label>
        <label>Registration deadline<input type="datetime-local" value={form.deadline || ''} onChange={(event) => setForm({ ...form, deadline: event.target.value })}/><small className="muted">Deadline is interpreted in {form.timezone || 'the selected cycle timezone'}.</small></label>
        <label>Cycle status<select value={form.status || 'draft'} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Draft</option><option value="active">Active</option><option value="closed">Closed</option></select></label>
        <label>Timezone<input required value={form.timezone || ''} onChange={(event) => setForm({ ...form, timezone: event.target.value })}/></label>
        <button className="primary span-2">{creating ? 'Create cycle' : 'Save cycle settings'}</button>
      </form>
    </section>
    {!creating && selected && <div className="admin-cycle-stats">{[['Roster students', oversight?.counts.roster], ['Teams formed', oversight?.counts.formedTeams], ['Unassigned', oversight?.counts.unassignedStudents], ['Duplicate memberships', oversight?.counts.duplicateMemberships], ['Roster errors', oversight?.counts.invalidRows]].map(([label, value]) => <div className="card" key={label}><small>{label}</small><b>{value ?? '—'}</b></div>)}</div>}
    {!creating && selected && <div className="grid two admin-setup-grid">
      <section className="card"><div className="card-head"><div><span className="eyebrow">ROSTER & ACCOUNT ONBOARDING</span><h3>Import or update students</h3></div><span className="tag">upsert by roll number</span></div><p className="muted">New accounts receive a cryptographically random initial credential and must set a private password from a single-use, 24-hour setup link. Shared passwords are not assigned.</p><label className="upload"><Upload size={20}/> Choose roster CSV or XLSX<input type="file" accept=".csv,.xlsx" onChange={importRoster}/></label>{roster && <div className="import-result"><b>{roster.pagination?.total ?? roster.data?.length ?? 0} roster rows</b><span>{errors.length} unresolved rows</span></div>}</section>
      <section className="card"><div className="card-head"><div><span className="eyebrow">AVAILABLE FACULTY TOPICS</span><h3>Manage cycle topics</h3></div><button className="secondary" onClick={() => downloadReport('csv')}><Download size={14}/> Export CSV</button></div><p className="muted">Topics posted for this cycle are selectable by student teams while open.</p><div className="admin-topic-list">{topics.map((topic) => <div key={topic.id}><span><b>{topic.title}</b><small>{topic.owner?.name || 'Faculty topic'} · {topic.status || 'open'}</small></span><div className="topic-actions"><button className="secondary" onClick={() => toggleTopic(topic)}>{topic.status === 'closed' ? 'Reopen' : 'Close'}</button><button className="secondary delete-action" onClick={() => deleteTopic(topic)}>Delete</button></div></div>)}</div>{!topics.length && <Empty>No faculty topics have been posted for this cycle.</Empty>}</section>
    </div>}
    {!creating && selected && errors.length > 0 && <section className="card workflow"><div className="card-head"><div><span className="eyebrow">ROSTER QUALITY</span><h3>Resolve invalid import rows</h3></div><span className="status pending_review">{errors.length} need attention</span></div><div className="roster-errors">{errors.map((row) => <div className="roster-error-row" key={row.id}><div><b>File row {row.row}</b><small>{row.message}</small></div><input aria-label={`Name for file row ${row.row}`} placeholder="Student name" value={resolution[row.id]?.name ?? row.data.name ?? row.data.full_name ?? ''} onChange={(event) => setResolution({ ...resolution, [row.id]: { ...resolution[row.id], name: event.target.value } })}/><input aria-label={`Email for file row ${row.row}`} placeholder="Email" value={resolution[row.id]?.email ?? row.data.email ?? ''} onChange={(event) => setResolution({ ...resolution, [row.id]: { ...resolution[row.id], email: event.target.value } })}/><input aria-label={`Roll number for file row ${row.row}`} placeholder="Roll number" value={resolution[row.id]?.roll_number ?? row.data.roll_number ?? row.data.rollno ?? row.data.roll ?? ''} onChange={(event) => setResolution({ ...resolution, [row.id]: { ...resolution[row.id], roll_number: event.target.value } })}/><button className="primary" onClick={() => resolveRow(row)}>Resolve</button></div>)}</div></section>}
    {!creating && selected && <div className="grid two">
      <section className="card"><div className="card-head"><div><span className="eyebrow">TEAM OVERSIGHT</span><h3>Unassigned students</h3></div><button className="secondary" onClick={() => formTeams(false)}>Preview auto-formation</button></div><div className="admin-people-list">{(oversight?.unassigned || []).slice(0, 20).map((row) => <div className="admin-oversight-row" key={row.id}><span><b>{row.student?.name || row.name}</b><small>{row.rollNumber} · {row.branch || 'Branch not set'} · Section {row.section || '—'}</small></span><select aria-label={`Assign ${row.student?.name || row.name} to a team`} value={selectedTeam[row.userId] || ''} onChange={(event) => setSelectedTeam({ ...selectedTeam, [row.userId]: event.target.value })}><option value="">Choose a team</option>{(oversight?.teams || []).map((team) => <option key={team.id} value={team.id} disabled={team.size >= team.maxMembers}>{team.name} ({team.size}/{team.maxMembers})</option>)}</select><button className="secondary" disabled={!selectedTeam[row.userId] || teamActionBusy === row.userId} onClick={() => saveTeamAssignment(row.userId)}>Assign</button></div>)}</div>{oversight?.counts.unassignedStudents > 20 && <small className="muted">Showing 20; export the roster report for the full list.</small>}{!oversight?.counts.unassignedStudents && <p className="muted">All rostered students are assigned to a team.</p>}{preview && <div className="preview"><b>{preview.candidateCount} candidates · {preview.teams.length} suggested teams</b>{preview.unassignedMemberIds?.length > 0 && <p className="error">{preview.unassignedMemberIds.length} will remain unassigned and need manual resolution.</p>}<button className="primary" disabled={!preview.teams.length} onClick={() => formTeams(true)}>Commit preview</button></div>}</section>
      <section className="card"><div className="card-head"><div><span className="eyebrow">EXCEPTIONS</span><h3>Duplicate team memberships</h3></div></div>{(oversight?.duplicates || []).map((duplicate) => { const studentId = duplicate.student?.id; const current = selectedTeam[studentId] ?? duplicate.teams[0]?.id ?? ''; return <div className="admin-oversight-row duplicate-row" key={studentId}><span><b>{duplicate.student?.name || 'Student'}</b><small>{duplicate.teams.map((team) => team.name).join(' · ')}</small></span><select aria-label={`Resolve teams for ${duplicate.student?.name}`} value={current} onChange={(event) => setSelectedTeam({ ...selectedTeam, [studentId]: event.target.value })}><option value="">Unassign from all teams</option>{duplicate.teams.map((team) => <option key={team.id} value={team.id}>Keep in {team.name}</option>)}</select><button className="secondary" disabled={teamActionBusy === studentId} onClick={() => saveTeamAssignment(studentId)}>Resolve</button></div>; })}{!oversight?.duplicates?.length && <p className="muted">No duplicate memberships detected for this cycle.</p>}</section>
    </div>}
    {!creating && selected && <section className="card workflow"><div className="card-head"><div><span className="eyebrow">FACULTY ALLOCATION</span><h3>Assign team coordinators</h3></div><div className="button-row"><button className="secondary" onClick={() => downloadReport('xlsx')}><Download size={14}/> Export XLSX</button><button className="primary" disabled={!allocations?.teams?.length || !allocations?.faculty?.length || assigning} onClick={balanceFaculty}>{assigning ? 'Assigning…' : 'Balance assignments'}</button></div></div><p className="muted">The balancing algorithm distributes teams so faculty workloads differ by at most one where possible.</p><div className="faculty-name-list">{(allocations?.workloads || []).map((faculty) => <div className="card faculty-name" key={faculty.id}><b>{faculty.name}</b><small>{faculty.projectCount} assigned projects · {faculty.teamCount} teams</small></div>)}</div><div className="directory-list">{(allocations?.teams || []).map((team) => <div className="directory-row" key={team.id}><div><b>{team.name}</b><small>{team.project?.title || team.projectName || 'Project idea'}</small></div><select aria-label={`Assign faculty to ${team.name}`} value={team.guideUserId || ''} disabled={savingTeam === team.id} onChange={(event) => assignFaculty(team.id, event.target.value)}><option value="">Select faculty coordinator</option>{(allocations?.faculty || []).map((faculty) => <option value={faculty.id} key={faculty.id}>{faculty.name}</option>)}</select></div>)}</div></section>}
    {!creating && selected && <section className="card workflow"><div className="card-head"><div><span className="eyebrow">AUDIT HISTORY</span><h3>Recent cycle changes</h3></div></div><div className="admin-audit-list">{auditRows.map((entry) => <div key={entry.id}><b>{entry.action}</b><span>{entry.entityType} · {entry.details?.name || entry.details?.rollNumber || entry.entityId}</span><small>{entry.actorName || entry.actorId} · {new Date(entry.createdAt).toLocaleString()}</small></div>)}</div>{!auditRows.length && <p className="muted">No changes have been recorded for this cycle yet.</p>}</section>}
  </section>;
}

function FacultyReviewQueue({ cycleId }) {
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [feedback, setFeedback] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const load = async () => {
    try { setData(await api(`/faculty/review-queue?cycleId=${encodeURIComponent(cycleId)}`)); setError(''); }
    catch (loadError) { setError(loadError.message); }
  };
  useEffect(() => { load(); }, [cycleId]);
  const updateDraft = (teamId, studentId, field, value) => setDrafts((previous) => ({
    ...previous,
    [teamId]: { ...previous[teamId], [studentId]: { ...previous[teamId]?.[studentId], [field]: value } }
  }));
  const assessStudent = async (team, student) => {
    const current = drafts[team.id]?.[student.id] || team.studentEvaluations?.find((evaluation) => evaluation.studentId === student.id) || {};
    setBusy(`${team.id}:${student.id}`); setError(''); setNotice('');
    try {
      await api(`/teams/${team.id}/students/${student.id}/evaluation`, { method: 'PUT', body: JSON.stringify({ marks: Number(current.marks), feedback: current.feedback || '' }) });
      setNotice(`Assessment saved for ${student.name}.`);
      await load();
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(''); }
  };
  const approveTeam = async (team, status) => {
    if (status === 'rejected' && !feedback[team.id]?.trim()) {
      setError('Enter feedback explaining why the project idea is being rejected.');
      return;
    }
    setBusy(team.id); setError(''); setNotice('');
    try {
      await api(`/teams/${team.id}/approval`, { method: 'PATCH', body: JSON.stringify({ status, feedback: feedback[team.id] || '' }) });
      setNotice(status === 'rejected' ? `${team.name}'s project idea was rejected with feedback.` : `${team.name} approved.`);
      await load();
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(''); }
  };
  const reviewSubmission = async (team) => {
    setBusy(team.id); setError(''); setNotice('');
    try {
      await api(`/teams/${team.id}/submission/review`, { method: 'PATCH', body: JSON.stringify({ feedback: feedback[team.id] || '' }) });
      setNotice(`Final submission for ${team.name} marked as reviewed.`);
      await load();
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(''); }
  };
  const download = async (team, kind) => {
    try {
      const blob = await api(`/teams/${team.id}/submission/${kind}`);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = kind === 'presentation' ? team.submission.presentationName : team.submission.documentationName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) { setError(downloadError.message); }
  };
  return <section className="faculty-review-page">
    <div className="section-head"><div><span className="eyebrow">FACULTY WORKSPACE · {cycleId.includes('major') ? 'MAJOR PROJECT' : cycleId.includes('minor') ? 'MINOR PROJECT' : 'PROJECT CYCLE'}</span><h1>Review queue</h1><p className="muted">Only teams allocated to you are shown. Review team approval, individual student performance, and final files.</p></div><button className="secondary" onClick={load}>Refresh queue</button></div>
    {error && <div className="error">{error}</div>}{notice && <div className="notice">{notice}</div>}
    <div className="stats faculty-queue-stats"><Stat icon={Users} label="Assigned teams" value={data?.workload?.assignedTeams || 0} note="Your cycle workload" tone="purple"/><Stat icon={ClipboardCheck} label="Need approval" value={data?.workload?.needingApproval || 0} note="Proposed teams" tone="orange"/><Stat icon={Activity} label="Need feedback" value={data?.workload?.needingStudentFeedback || 0} note="Individual assessments" tone="blue"/><Stat icon={Download} label="Submissions to review" value={data?.workload?.submissionsToReview || 0} note="PPTX + PDF received" tone="teal"/></div>
    <div className="faculty-review-list">{(data?.teams || []).map((team) => <article className="card faculty-review-card" key={team.id}>
      <div className="card-head"><div><span className="eyebrow">{team.guideName || 'Assigned team'}</span><h3>{team.name}</h3><small>{team.project?.title || team.projectName || 'Project idea'} · {team.project?.status || 'proposed'}</small></div><span className={`status ${team.status || 'proposed'}`}>{String(team.status || 'proposed').replaceAll('_', ' ')}</span></div>
      {team.projectLink && <a className="project-link-preview" href={team.projectLink} target="_blank" rel="noopener noreferrer"><span className="project-link-icon"><ExternalLink size={16}/></span><span><b>Student project link</b><small>{linkHost(team.projectLink)}</small><em>{team.projectLink}</em></span><ExternalLink size={14}/></a>}
      {team.queue.projectApproval && <section className="review-section"><h4>Project idea approval needed</h4><label>Feedback for the team<textarea value={feedback[team.id] || ''} onChange={(event) => setFeedback({ ...feedback, [team.id]: event.target.value })} placeholder="Add feedback; required when rejecting an idea."/></label><div className="button-row"><button className="primary" disabled={busy === team.id} onClick={() => approveTeam(team, 'approved')}>Approve project idea</button><button className="secondary" disabled={busy === team.id} onClick={() => approveTeam(team, 'rejected')}>Reject project idea</button></div></section>}
      <section className="review-section"><div className="card-head"><h4>Individual student assessment</h4><span>{team.members?.length - team.queue.pendingStudentAssessments}/{team.members?.length} reviewed</span></div>{(team.members || []).map((student) => { const saved = team.studentEvaluations?.find((evaluation) => evaluation.studentId === student.id) || {}; const draft = drafts[team.id]?.[student.id] || saved; return <div className="student-assessment-row" key={student.id}><div className="assessment-student"><b>{student.name}</b><small>{student.rollNumber || 'Roll number unavailable'}</small></div><input type="number" min="0" max="100" aria-label={`Marks for ${student.name}`} placeholder="Marks / 100" value={draft.marks ?? ''} onChange={(event) => updateDraft(team.id, student.id, 'marks', event.target.value)}/><textarea aria-label={`Feedback for ${student.name}`} placeholder="Individual feedback" value={draft.feedback || ''} onChange={(event) => updateDraft(team.id, student.id, 'feedback', event.target.value)}/><button className="secondary" disabled={busy === `${team.id}:${student.id}`} onClick={() => assessStudent(team, student)}>{saved.updatedAt ? 'Update' : 'Save marks'}</button></div>; })}</section>
      <section className="review-section"><div className="card-head"><h4>Final submission</h4><span className={`task-status ${team.queue.finalSubmission === 'reviewed' ? 'complete' : team.queue.finalSubmission === 'needs_review' ? 'pending' : 'pending'}`}>{team.queue.finalSubmission === 'reviewed' ? 'Reviewed' : team.queue.finalSubmission === 'needs_review' ? 'Needs review' : 'Not submitted'}</span></div>{team.submission ? <><div className="submission-file-status"><span>{team.submission.presentationName || 'PPTX'}<em className="file-accepted">Received</em><button className="link" onClick={() => download(team, 'presentation')}>Download PPTX</button></span><span>{team.submission.documentationName || 'PDF'}<em className="file-accepted">Received</em><button className="link" onClick={() => download(team, 'documentation')}>Download PDF</button></span></div><small>Submitted {new Date(team.submission.submittedAt).toLocaleString()}</small>{team.submission.reviewedAt ? <p className="muted">Reviewed {new Date(team.submission.reviewedAt).toLocaleString()}{team.submission.reviewFeedback ? ` · ${team.submission.reviewFeedback}` : ''}</p> : <><label>Submission review feedback<textarea value={feedback[team.id] || ''} onChange={(event) => setFeedback({ ...feedback, [team.id]: event.target.value })} placeholder="Notes for the team about the submitted files"/></label><button className="primary" disabled={busy === team.id} onClick={() => reviewSubmission(team)}>Mark submission reviewed</button></>}</> : <p className="muted">Waiting for the team to upload both the PPTX presentation and PDF documentation.</p>}</section>
    </article>)}</div>
    {!data?.teams?.length && !error && <Empty>No teams are assigned to you in this project cycle.</Empty>}
  </section>;
}

function Review() { return <section><div className="section-head"><div><span className="eyebrow">ASSESSMENT</span><h1>Milestones, rubrics and audit.</h1></div><button className="secondary" onClick={() => window.open(`${API}/reports/teams.xlsx`, '_blank')}><Download size={15}/> Download XLSX</button></div><div className="grid three"><div className="card mini-card"><ClipboardCheck size={22}/><h3>Draft-lock submissions</h3><p>Students can revise drafts until they lock. Faculty unlocks require a reason.</p></div><div className="card mini-card"><ShieldCheck size={22}/><h3>Per-student rubric</h3><p>Scores and feedback are stored independently, with reviewer and timestamp.</p></div><div className="card mini-card"><Activity size={22}/><h3>Audit everything</h3><p>Formation, revisions, role changes and unlocks are queryable by coordinators.</p></div></div><div className="card"><h3>Server-side deadline policy</h3><p className="muted">Deadlines are evaluated in the cycle timezone. Approved extensions create explicit notification and audit events; browser clocks are never trusted.</p></div></section>; }
function Notifications({ setView }) { const [items, setItems] = useState([]); const [error, setError] = useState(''); useEffect(() => { api('/notifications?limit=25').then((r) => setItems(r.notifications || r.data || [])).catch((e) => setError(e.message)); }, []); const open = (link) => { if (link?.includes('/projects/')) setView('projects'); else if (link?.includes('/teams/')) setView('teams'); else if (link?.includes('/users/')) setView('students'); }; return <section><div className="section-head"><div><span className="eyebrow">SHARED INBOX</span><h1>Notifications</h1><p className="muted">Updates are scoped to your branch and role, with project links into the right workflow.</p></div></div>{error && <div className="error">{error}</div>}<div className="notice-list">{items.map((item) => <article className={`card notification ${item.read ? '' : 'unread'}`} key={item.id}><Bell size={17}/><div><b>{item.title}</b><p>{item.body}</p><small>{item.eventType || 'Update'} · {new Date(item.createdAt).toLocaleString()}</small>{(item.deepLink || item.link) && <button className="link" onClick={() => open(item.deepLink || item.link)}>{item.read ? 'Open' : 'Open and review'} <ArrowRight size={13}/></button>}</div></article>)}</div>{!items.length && <Empty>You're all caught up.</Empty>}</section>; }

function App() {
  const [user, setUser] = useState(null); const [view, setView] = useState('overview'); const [data, setData] = useState(null);
  const [cycles, setCycles] = useState(DEFAULT_IT_CYCLES);
  const savedCycle = localStorage.getItem('teamforge_cycle');
  const [cycleId, setCycleId] = useState(DEFAULT_IT_CYCLES.some((cycle) => cycle.id === savedCycle) ? savedCycle : DEFAULT_IT_CYCLES[0].id);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('setupToken')) {
      localStorage.removeItem('teamforge_token');
      localStorage.removeItem('teamforge_refresh');
      return;
    }
    if (localStorage.getItem('teamforge_token')) api('/auth/me').then((r) => setUser(r.user)).catch(() => localStorage.removeItem('teamforge_token'));
  }, []);
  useEffect(() => {
    if (!user) return;
    api('/cycles?limit=50').then((result) => {
      const items = (result.cycles || result.data || []).filter((cycle) => cycle.department === 'Information Technology' || cycle.id.startsWith('cycle-it-'));
      setCycles(items);
      const saved = items.some((cycle) => cycle.id === cycleId) ? cycleId : items.find((cycle) => cycle.status === 'active')?.id || items[0]?.id || '';
      setCycleId(saved);
      if (saved) localStorage.setItem('teamforge_cycle', saved);
    }).catch(() => setCycles(DEFAULT_IT_CYCLES));
  }, [user]);
  useEffect(() => {
    const refreshCycles = (event) => {
      setCycles(event.detail.cycles);
      setCycleId(event.detail.selectedCycleId);
    };
    window.addEventListener('teamforge:cycles-changed', refreshCycles);
    return () => window.removeEventListener('teamforge:cycles-changed', refreshCycles);
  }, []);
  useEffect(() => { if (user && cycleId) api(`/dashboard?cycleId=${encodeURIComponent(cycleId)}`).then(setData).catch(() => setData(null)); }, [user, cycleId, view]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('setupToken')) { setUser(null); return; }
    const token = localStorage.getItem('teamforge_token');
    if (!token || user?.mustChangePassword) { setUser(null); localStorage.removeItem('teamforge_token'); localStorage.removeItem('teamforge_refresh'); }
  }, [user]);
  if (!user) return <Login onLogin={(next) => { setUser(next); setData(null); }}/>;
  const titles = { overview: 'Overview', projects: 'Projects', teams: 'Teams & requests', students: 'Students', faculty: 'Faculty & allocation', cycle: 'Cycle operations', review: user.role === 'faculty' ? 'Review queue' : 'Reviews & rubrics', notifications: 'Notifications' };
  const logout = () => { localStorage.removeItem('teamforge_token'); localStorage.removeItem('teamforge_refresh'); setUser(null); };
  const selectedCycle = cycles.find((cycle) => cycle.id === cycleId) || DEFAULT_IT_CYCLES[0];
  const changeCycle = (nextCycleId) => { setCycleId(nextCycleId); localStorage.setItem('teamforge_cycle', nextCycleId); };
  return <div className="app"><Sidebar user={user} cycle={selectedCycle} view={view} setView={setView} logout={logout}/><main className="main"><Topbar title={titles[view]} user={user} cycles={cycles} cycleId={cycleId} onCycleChange={changeCycle}/><div className="content">{view === 'overview' && <Overview data={data} user={user} setView={setView} cycleId={cycleId}/>} {view === 'projects' && <Projects user={user} setView={setView} cycleId={cycleId}/>} {view === 'teams' && <Teams user={user} cycleId={cycleId}/>} {view === 'students' && <Students user={user} cycleId={cycleId}/>} {view === 'faculty' && user.role === 'admin' && <FacultyDirectory/>} {view === 'cycle' && <CycleOps user={user}/>} {view === 'review' && (user.role === 'faculty' ? <FacultyReviewQueue cycleId={cycleId}/> : <Review/>)} {view === 'notifications' && <Notifications setView={setView}/>}</div></main></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
