import { loadStore, saveStore, id, bcrypt } from '../src/repository.js';
import { randomBytes } from 'node:crypto';

const students = [
  ['PATTIRI AISHWARYA', '24B81A1201'], ['PALLAPU AJAY KUMAR', '24B81A1202'],
  ['NAGULA AKSHATH', '24B81A1203'], ['MACHARLA AMRUTHA REDDY', '24B81A1204'],
  ['RAMAVATH ANKITHA', '24B81A1205'], ['GADPALE ANUP', '24B81A1206'],
  ['SHAINI ARUN KUMAR REDDY', '24B81A1207'], ['JAYANI ASHISH', '24B81A1208'],
  ['PANDALA ASHOK', '24B81A1209'], ['DARA BALAJI', '24B81A1210'],
  ['DARAHAS SIMON BAPURAM', '24B81A1211'], ['SRIPURAM DEEPTHI', '24B81A1212'],
  ['GURLA DHANANJAY', '24B81A1213'], ['MURAHARISHETTI ESHWAR', '24B81A1214'],
  ['KAMLAY GAYATRI', '24B81A1215'], ['DONDADI HANSIKA', '24B81A1216'],
  ['SHAIK HARSHATH', '24B81A1217'], ['MOHAMMAD IMRAN AHMAD', '24B81A1218'],
  ['S JASHWANTH REDDY', '24B81A1219'], ['ALLENKI JEEVANA', '24B81A1220'],
  ['THANGELLA KAVYA', '24B81A1221'], ['AKKI KEERTHI', '24B81A1222'],
  ['BHAGAVATULA KOUNTEYA', '24B81A1223'], ['GATTUPALLI KOUSTUB', '24B81A1224'],
  ['THIRUGUDU KOWSHIK YADAV', '24B81A1225'], ['SANGI REDDY LAHARI', '24B81A1226'],
  ['VANAM LIKHITHA', '24B81A1227'], ['RAPAKA LOHITH', '24B81A1228'],
  ['MADARI MANASWIKA', '24B81A1229'], ['CHITTIMALLA MYTHILI', '24B81A1230'],
  ['T NANDHINI', '24B81A1231'], ['NUKALA NITHEESH REDDY', '24B81A1232'],
  ['SOMPONGU NOEL TONY', '24B81A1233'], ['PADMA SRAVANI', '24B81A1234'],
  ['BHEEMPAKA PALLAVI', '24B81A1235'], ['BUJALA PARTHA SARATHI REDDY', '24B81A1236'],
  ['GAJJALA POOJITH KUMAR', '24B81A1237'], ['AVURESHI PRAMIDA', '24B81A1238'],
  ['MINNAM RAHUL REDDY', '24B81A1239'], ['PARASAGONI SAI RAM', '24B81A1240'],
  ['THATIKONDA SAI VENKATA MANIKANTA', '24B81A1241'], ['MOHAMMAD SAMEER ALI', '24B81A1242'],
  ['SHASHWAT GILDA', '24B81A1243'], ['BOLLEPALLY SHIVA PRASAD REDDY', '24B81A1244'],
  ['HATKAR SINDHU', '24B81A1245'], ['MADUPATHI SRI CHANDANA', '24B81A1246'],
  ['SRI VAISHNAV NEELA', '24B81A1247'], ['BANDELA SRI VARSHINI', '24B81A1248'],
  ['KARNATI SRIJA', '24B81A1249'], ['ARZA SRINITYA', '24B81A1250'],
  ['NENAVATH SRIRAM', '24B81A1251'], ['GOBBURI SRIVEDA', '24B81A1252'],
  ['REPALA SUJAN', '24B81A1253'], ['SURABHI SUMITH RAO', '24B81A1254'],
  ['GONUGUNTLA TEJA', '24B81A1255'], ['VAITLA TEJA SRI', '24B81A1256'],
  ['ADEPU VAISHNAVI SREE', '24B81A1257'], ['GUNUGANTI VAMSHI', '24B81A1258'],
  ['KONGARA VAMSHI', '24B81A1259'], ['VITTALOLLA VARSHINI', '24B81A1260'],
  ['P VENNEELA GOPAL', '24B81A1261'], ['MANCHANA VINAY', '24B81A1262'],
  ['M ANU', '24B81A1263'], ['K YANVEE', '24B81A1264']
];
const facultyNames = [
  'Dr. Bipin Bihari Jayasingh',
  'Dr. J Sengathir',
  'Dr. A. Malla Reddy',
  'Dr. A Seetharam Nagesh',
  'Dr. C V S Satya Murty',
  'Dr. Sarangam Kodati',
  'Mr. K Brahmanand',
  'Mr. S Anupkanth',
  'Mrs. Swathi Agarwal',
  'Mr. B Satheesh Kumar',
  'Mr. B.Kiran Kumar',
  'Mrs. S.Swetha',
  'Mrs. Jannam Sadana',
  'Mrs. G. Shailaja',
  'Mr. Gundeti Srinivas',
  'Mr. M.Bhagavanthu',
  'Ms. Shaik Jaheda',
  'Mr. B. Mallaiah',
  'Ms. T. Aruna Reddy',
  'Ms. S. Suhasini'
];

const store = loadStore();
store.cycles ||= [];
store.rosterRows ||= [];
store.projects ||= [];
store.teams ||= [];
store.users ||= [];
const passwordHash = bcrypt.hashSync('password123', 10);
const cycleDefinitions = [
  {
    id: 'cycle-it-minor-3-2',
    name: 'Minor Project · 3rd Year · 2nd Semester',
    academicYear: '2026-27',
    projectType: 'Minor Project',
    term: '3rd Year · 2nd Semester',
    status: 'active'
  },
  {
    id: 'cycle-it-major-4-2',
    name: 'Major Project · 4th Year · 2nd Semester',
    academicYear: '2027-28',
    projectType: 'Major Project',
    term: '4th Year · 2nd Semester',
    status: 'draft'
  }
];
const cycles = cycleDefinitions.map((definition) => {
  const existing = store.cycles.find((cycle) => cycle.id === definition.id);
  const defaults = {
    minTeamSize: 3,
    maxTeamSize: 3,
    deadline: null,
    exceptionalTeamSize: 4,
    exceptionalTeamCount: 1,
    allowCrossBranch: false,
    formationMode: 'student-registration'
  };
  if (existing) {
    existing.projectType ||= definition.projectType;
    existing.department ||= 'Information Technology';
    existing.branch ||= 'IT';
    existing.timezone ||= 'Asia/Kolkata';
    existing.config = { ...defaults, ...existing.config };
    return existing;
  }
  const cycle = {
    ...definition,
    timezone: 'Asia/Kolkata',
    department: 'Information Technology',
    branch: 'IT',
    config: defaults,
    createdAt: new Date().toISOString()
  };
  store.cycles.push(cycle);
  return cycle;
});

const facultyUsers = facultyNames.map((name, index) => {
  const email = index === 0
    ? 'professor@teamforge.demo'
    : `faculty-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}@faculty.teamforge.local`;
  const existing = store.users.find((user) => user.email === email)
    || store.users.find((user) => user.role === 'faculty' && user.name === name);
  if (existing) {
    Object.assign(existing, { name, email, role: 'faculty', department: 'Information Technology', branch: 'IT' });
    existing.passwordHash ||= passwordHash;
    return existing;
  }
  const user = {
    id: `usr-faculty-it-${String(index + 1).padStart(2, '0')}`,
    name,
    email,
    role: 'faculty',
    department: 'Information Technology',
    branch: 'IT',
    skills: ['Mentoring'],
    avatarColor: '#5664d2',
    passwordHash
  };
  store.users.push(user);
  return user;
});
const normalizeRollNumber = (value) => String(value || '').trim().toUpperCase();
const usersByRoll = new Map(store.users.filter((user) => user.rollNumber).map((user) => [normalizeRollNumber(user.rollNumber), user]));
for (const [name, rollNumber] of students) {
  const email = `${rollNumber.toLowerCase()}@student.teamforge.local`;
  const user = usersByRoll.get(normalizeRollNumber(rollNumber))
    || store.users.find((candidate) => candidate.role === 'student' && candidate.email?.toLowerCase() === email);
  if (user) {
    Object.assign(user, { name, email, rollNumber, role: 'student', department: 'Information Technology', branch: 'IT' });
    if (user.mustChangePassword === undefined) {
      user.passwordHash = bcrypt.hashSync(randomBytes(48).toString('hex'), 12);
      user.mustChangePassword = true;
    } else if (!user.passwordHash) {
      user.passwordHash = bcrypt.hashSync(randomBytes(48).toString('hex'), 12);
      user.mustChangePassword = true;
    }
    usersByRoll.set(normalizeRollNumber(rollNumber), user);
  } else {
    const newUser = {
      id: `usr-${rollNumber.toLowerCase()}`,
      name,
      email,
      rollNumber,
      role: 'student',
      department: 'Information Technology',
      branch: 'IT',
      section: null,
      skills: [],
      avatarColor: '#6657db',
      passwordHash: bcrypt.hashSync(randomBytes(48).toString('hex'), 12),
      mustChangePassword: true
    };
    store.users.push(newUser);
    usersByRoll.set(normalizeRollNumber(rollNumber), newUser);
  }
}

for (const cycle of cycles) {
  for (const [name, rollNumber] of students) {
    const user = usersByRoll.get(normalizeRollNumber(rollNumber));
    const matchingRows = store.rosterRows.filter((candidate) =>
      candidate.cycleId === cycle.id
      && (normalizeRollNumber(candidate.rollNumber) === normalizeRollNumber(rollNumber) || candidate.userId === user.id)
    );
    const row = matchingRows[0];
    const record = {
      id: row?.id || id('roster'),
      cycleId: cycle.id,
      userId: user.id,
      rollNumber,
      name,
      email: user.email,
      branch: 'IT',
      section: null,
      cgpa: null,
      status: 'ok',
      importedAt: new Date().toISOString()
    };
    if (row) Object.assign(row, record);
    else store.rosterRows.push(record);
    matchingRows.slice(1).forEach((duplicate) => {
      store.rosterRows.splice(store.rosterRows.indexOf(duplicate), 1);
    });
  }
}

store.notifications ||= [];
store.facultyDirectory = [...new Set(facultyNames)];
saveStore(store);
console.log(`Seeded ${students.length} IT students, ${facultyNames.length} faculty names, and ${cycles.length} project cycles. No project topics or teams were created.`);
