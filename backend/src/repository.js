import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const file = path.join(dataDir, 'store.json');

const seed = () => {
  const passwordHash = bcrypt.hashSync('password123', 10);
  const students = [
    { id: 'usr-maya', name: 'Maya Chen', email: 'maya@teamforge.demo', role: 'student', department: 'Computer Science', skills: ['React', 'UX research', 'Python'], avatarColor: '#6d5dfc' },
    { id: 'usr-theo', name: 'Theo Martins', email: 'theo@teamforge.demo', role: 'student', department: 'Data Science', skills: ['Python', 'Data visualisation', 'SQL'], avatarColor: '#27b2a5' },
    { id: 'usr-lina', name: 'Lina Okafor', email: 'lina@teamforge.demo', role: 'student', department: 'Product Design', skills: ['Figma', 'UX research', 'Prototyping'], avatarColor: '#fa8b62' },
    { id: 'usr-jon', name: 'Jon Bell', email: 'jon@teamforge.demo', role: 'student', department: 'Computer Science', skills: ['Node.js', 'DevOps', 'React'], avatarColor: '#e5a83b' },
    { id: 'usr-amara', name: 'Amara Singh', email: 'amara@teamforge.demo', role: 'student', department: 'Cybersecurity', skills: ['Security', 'Python', 'Research'], avatarColor: '#e178b7' },
    { id: 'usr-sam', name: 'Sam Rivera', email: 'sam@teamforge.demo', role: 'student', department: 'Business', skills: ['Pitching', 'Research', 'Analytics'], avatarColor: '#4e91e6' }
  ].map((user) => ({ ...user, passwordHash }));
  const faculty = { id: 'usr-professor', name: 'Dr. Evelyn Hart', email: 'professor@teamforge.demo', role: 'faculty', department: 'Computer Science', skills: ['Mentoring'], avatarColor: '#5664d2', passwordHash };
  const admin = { id: 'usr-admin', name: 'Ari Bennett', email: 'admin@teamforge.demo', role: 'admin', department: 'Academic Operations', skills: ['Operations'], avatarColor: '#263b55', passwordHash };
  return {
    users: [...students, faculty, admin],
    projects: [],
    teams: [],
    notifications: [
      { id: 'note-1', userId: 'usr-maya', title: 'Welcome to TeamForge', body: 'Complete your profile so the matching engine can find your best team.', kind: 'info', read: false, createdAt: new Date().toISOString() }
    ]
  };
};

export function loadStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(seed(), null, 2));
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
export function saveStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}
export function id(prefix) { return `${prefix}-${randomUUID().slice(0, 8)}`; }
export { bcrypt };
