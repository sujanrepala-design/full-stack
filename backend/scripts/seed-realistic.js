import { loadStore, saveStore, id, bcrypt } from '../src/repository.js';

// Generates a repeatable, useful local fixture without requiring PostgreSQL.
const store = loadStore();
const passwordHash = bcrypt.hashSync('password123', 10);
const departments = ['Computer Science', 'Data Science', 'Product Design', 'Cybersecurity', 'Business'];
const skills = ['React', 'Python', 'SQL', 'Research', 'Figma', 'Node.js', 'DevOps', 'Analytics', 'Security', 'Writing'];
const existing = new Set(store.users.map((user) => user.email));
for (let index = 1; index <= 300; index += 1) {
  const email = `student${String(index).padStart(3, '0')}@teamforge.demo`;
  if (existing.has(email)) continue;
  store.users.push({
    id: `seed-student-${index}`, name: `Student ${String(index).padStart(3, '0')}`, email, role: 'student',
    rollNumber: `TF${String(index).padStart(4, '0')}`, department: departments[index % departments.length],
    skills: [skills[index % skills.length], skills[(index + 3) % skills.length], skills[(index + 6) % skills.length]],
    avatarColor: ['#6657db', '#2ba995', '#ed8b5d', '#4f8fd8'][index % 4], passwordHash
  });
}
for (let index = 1; index <= 40; index += 1) {
  const email = `guide${String(index).padStart(2, '0')}@teamforge.demo`;
  if (!existing.has(email)) store.users.push({ id: `seed-guide-${index}`, name: `Guide ${String(index).padStart(2, '0')}`, email, role: 'faculty', department: departments[index % departments.length], skills: ['Mentoring', skills[index % skills.length]], avatarColor: '#5664d2', passwordHash });
}
const cycle = store.cycles[0] || { id: 'cycle-spring-2026', name: 'Spring 2026', status: 'active', config: { minTeamSize: 3, maxTeamSize: 5 }, timezone: 'Asia/Kolkata' };
store.cycles = [cycle];
store.rosterRows = store.users.filter((u) => u.role === 'student').map((u) => ({ id: id('roster'), cycleId: cycle.id, userId: u.id, rollNumber: u.rollNumber, name: u.name, email: u.email, status: 'ok', importedAt: new Date().toISOString() }));
store.guides = store.users.filter((u) => u.role === 'faculty').map((u) => ({ id: id('guide'), userId: u.id, capacity: 8, preferences: u.skills }));
saveStore(store);
console.log(`Seeded ${store.rosterRows.length} students and ${store.guides.length} guides for ${cycle.name}.`);
