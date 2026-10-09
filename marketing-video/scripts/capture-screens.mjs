// Captures real Studex screens for the videos, with believable sample data.
//
//   (repo root) VITE_LICENSE_BYPASS=1 npx vite --port 5173
//   node marketing-video/scripts/capture-screens.mjs [http://localhost:5173]
//   (set CHROMIUM_PATH to use a specific Chromium build)
//
// Freezes the clock at Thursday 8 Oct 2026, 8:50 in Manila, seeds a semester through the app's
// own repositories (the same SQLite code the phone runs), and saves iPhone-sized screenshots
// (393×852 at 3×) to public/screens/.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'screens')
const NOW = new Date('2026-10-08T08:50:00+08:00')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  timezoneId: 'Asia/Manila',
  locale: 'en-PH',
  colorScheme: 'light',
})
const page = await context.newPage()
page.on('pageerror', (e) => console.error('page error:', e.message))
await page.clock.setFixedTime(NOW)
await page.goto(BASE)
await page.waitForLoadState('networkidle')

const ids = await page.evaluate(async () => {
  const { openDatabase } = await import('/src/services/database.ts')
  const r = await openDatabase()
  const peso = (n) => Math.round(n * 100)
  const today = '2026-10-08'

  const { semesterId } = await r.db.transaction((tx) =>
    r.settings.completeOnboarding(tx, { studentName: 'Juan Dela Cruz', schoolName: null, currency: 'PHP' }, { name: '1st Semester', academicYear: '2026–2027' }),
  )
  await r.settings.updateProfile({ studentName: 'Juan Dela Cruz', schoolName: null, course: 'BS Chemistry', yearLevel: '2nd year' })

  const subject = (name, code, color, room, instructor, targetGrade = null) =>
    r.subjects.create(semesterId, { name, code, color, room, instructor, notes: null, targetGrade, attendanceRequired: null })
  const calc = await subject('Calculus II', 'MATH 22', '#2869a8', 'Room 304', 'Prof. Reyes', 90)
  const phys = await subject('Physics 1', 'PHYS 71', '#c0337a', 'Lab 2', 'Dr. Santos', 88)
  const chem = await subject('Organic Chemistry', 'CHEM 40', '#1d8a55', 'Lab 5', 'Dr. Garcia', 90)
  const hist = await subject('Philippine History', 'HIST 10', '#c05a16', 'Room 112', 'Prof. Mendoza')
  const comm = await subject('Purposive Communication', 'COMM 10', '#5a4dd3', 'Room 210', 'Ms. Lim')

  const slot = (subjectId, days, startTime, endTime) => r.subjects.addSlots({ subjectId, days, startTime, endTime, room: null })
  await slot(calc, [2, 4], '09:30', '11:00')
  await slot(chem, [2, 4], '13:00', '14:30')
  await slot(hist, [4], '15:00', '16:30')
  await slot(phys, [1, 3, 5], '08:00', '09:30')
  await slot(comm, [1, 3], '10:00', '11:30')

  const task = (title, subjectId, kind, dueDate, dueTime, priority, status = 'todo') =>
    r.tasks.create(crypto.randomUUID(), { title, subjectId, description: null, kind, dueDate, dueTime, priority, status })
  await task('Lab report: titration', chem, 'assignment', today, '23:59', 'high')
  await task('Read chapter 4', hist, 'homework', today, null, 'medium')
  await task('Problem set 6', calc, 'homework', today, null, 'medium', 'completed')
  await task('Problem set 7', calc, 'homework', '2026-10-09', null, 'medium')
  await task('Research paper outline', comm, 'project', '2026-10-14', null, 'high', 'in_progress')
  await task('Group presentation slides', hist, 'project', '2026-10-16', null, 'medium')

  const quiz = crypto.randomUUID()
  await r.exams.create(
    quiz,
    { title: 'Physics quiz', subjectId: phys, kind: 'quiz', date: '2026-10-11', time: '08:00', coverage: 'Chapters 1–3', notes: null, studyStatus: 'studying' },
    ['Kinematics', "Newton's laws", 'Work and energy', 'Momentum', 'Rotation', 'Gravitation'],
  )
  for (const t of (await r.exams.listTopics(quiz)).slice(0, 4)) await r.exams.setTopicDone(t.id, true)
  await r.exams.create(crypto.randomUUID(), { title: 'Lab practical', subjectId: chem, kind: 'exam', date: '2026-10-15', time: '13:00', coverage: null, notes: null, studyStatus: 'not_started' }, ['Titration', 'Recrystallization', 'Safety'])
  await r.exams.create(crypto.randomUUID(), { title: 'Midterm exam', subjectId: calc, kind: 'exam', date: '2026-10-20', time: '09:30', coverage: 'Integration techniques', notes: null, studyStatus: 'not_started' }, ['Integration by parts', 'Trig substitution', 'Partial fractions'])

  const grade = (subjectId, title, score, maxScore, weight, gradedOn) => r.academics.addGrade(subjectId, { title, score, maxScore, weight, gradedOn, categoryId: null })
  await grade(calc, 'Quiz 1', 18, 20, 10, '2026-09-03')
  await grade(calc, 'Quiz 2', 19, 20, 10, '2026-09-17')
  await grade(calc, 'Long exam 1', 46, 50, 30, '2026-09-29')
  await grade(phys, 'Quiz 1', 17, 20, 10, '2026-09-11')
  await grade(chem, 'Lab report 1', 92, 100, 20, '2026-09-22')

  for (const date of ['2026-09-29', '2026-10-01', '2026-10-06']) {
    await r.academics.markAttendance({ subjectId: calc, date, startTime: '09:30', status: 'present' })
    await r.academics.markAttendance({ subjectId: chem, date, startTime: '13:00', status: date === '2026-10-01' ? 'late' : 'present' })
  }

  const laptop = await r.savings.createGoal({ name: 'New laptop', target: peso(30000), targetDate: '2027-03-31' }, peso(19200), today)
  await r.savings.createGoal({ name: 'Christmas gifts', target: peso(3000), targetDate: '2026-12-15' }, peso(1250), today)
  await r.savings.createGoal({ name: 'Baguio trip', target: peso(5000), targetDate: '2027-04-10' }, peso(900), today)

  await r.allowance.savePlan(
    { amount: peso(2000), frequency: 'weekly', intervalDays: null, anchorDate: '2026-10-05', savingsAmount: peso(200), savingsGoalId: laptop },
    today,
  )
  const spend = (amount, categoryId, description, spentOn) => r.expenses.create(crypto.randomUUID(), { amount: peso(amount), categoryId, description, spentOn })
  await spend(85, 'cat-food', 'Lunch', '2026-10-05')
  await spend(26, 'cat-transport', 'Jeepney', '2026-10-05')
  await spend(20, 'cat-printing', 'Printing', '2026-10-05')
  await spend(90, 'cat-food', 'Lunch', '2026-10-06')
  await spend(50, 'cat-mobile', 'Load', '2026-10-06')
  await spend(26, 'cat-transport', 'Jeepney', '2026-10-06')
  await spend(75, 'cat-food', 'Lunch', '2026-10-07')
  await spend(120, 'cat-supplies', 'Lab goggles', '2026-10-07')
  await spend(26, 'cat-transport', 'Jeepney', '2026-10-07')
  await spend(45, 'cat-food', 'Breakfast', today)
  await spend(26, 'cat-transport', 'Jeepney', today)

  await r.notes.create(crypto.randomUUID(), { title: 'Titration steps', body: 'Rinse burette with titrant. Record initial volume. Add dropwise near the endpoint…', subjectId: chem, pinned: true })
  await r.notes.create(crypto.randomUUID(), { title: 'Integration by parts', body: '∫u dv = uv − ∫v du. Pick u with LIATE.', subjectId: calc, pinned: false })

  // Study files, imported through the app's own pipeline (thumbnails included). Pages are drawn
  // on a canvas to look like photographed handouts; multi-page ones become PDFs like the scanner's.
  const { prepare, saveCandidate } = await import('/src/services/studyFiles.ts')
  const { buildPdf } = await import('/src/domain/files.ts')
  const page = async (title, sub, accent, n) => {
    const c = document.createElement('canvas')
    c.width = 1240
    c.height = 1754
    const g = c.getContext('2d')
    g.fillStyle = '#fbfaf6'
    g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = accent
    g.fillRect(90, 90, 14, 120)
    g.fillStyle = '#16161a'
    g.font = 'bold 64px sans-serif'
    g.fillText(title, 130, 160)
    g.fillStyle = '#6a6a72'
    g.font = '36px sans-serif'
    g.fillText(`${sub} · page ${n}`, 130, 212)
    g.fillStyle = '#c9c7bf'
    let y = 320
    for (let i = 0; i < 26; i++) {
      if (i === 9) {
        // A figure block
        g.strokeStyle = accent
        g.lineWidth = 6
        g.strokeRect(130, y, 980, 300)
        g.beginPath()
        g.moveTo(160, y + 260)
        for (let x = 0; x <= 920; x += 20) g.lineTo(160 + x, y + 260 - Math.sin((x + n * 90) / 140) * 90 - x * 0.12)
        g.stroke()
        y += 360
      }
      const w = 980 * (0.55 + ((i * 37 + n * 13) % 45) / 100)
      g.fillRect(130, y, Math.min(980, w), 18)
      y += 46
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85))
    return { blob, width: c.width, height: c.height }
  }
  let handout = null
  const importFile = async (name, subjectId, source, pages) => {
    const rendered = await Promise.all(pages.map((p, i) => page(p[0], p[1], p[2], i + 1)))
    const blob =
      rendered.length > 1 || source === 'scan'
        ? new Blob([buildPdf(await Promise.all(rendered.map(async (r) => ({ jpeg: new Uint8Array(await r.blob.arrayBuffer()), width: r.width, height: r.height }))))], { type: 'application/pdf' })
        : rendered[0].blob
    const file = blob.type === 'application/pdf' ? `${name}.pdf` : `${name}.jpg`
    if (!handout) handout = rendered[0]
    const [candidate] = await prepare(r, [{ blob, name: file, source }])
    await saveCandidate(r, candidate, { name, subjectId, description: null, attachTo: [] })
  }
  const chemPage = ['Titration: acid–base', 'CHEM 40 · Lab 6', '#1d8a55']
  await importFile('Titration lab handout', chem, 'scan', [chemPage, chemPage, chemPage])
  await importFile('Integration formulas', calc, 'camera', [['Integration by parts', 'MATH 22 · Notes', '#2869a8']])
  await importFile('Physics quiz reviewer', phys, 'scan', [['Kinematics review', 'PHYS 71 · Ch. 1–3', '#c0337a'], ['Kinematics review', 'PHYS 71 · Ch. 1–3', '#c0337a']])
  await importFile('Rizal reading packet', hist, 'scan', [['Noli Me Tangere notes', 'HIST 10 · Week 7', '#c05a16']])
  await importFile('Essay rubric', comm, 'camera', [['Argumentative essay rubric', 'COMM 10', '#5a4dd3']])

  for (const id of ['tip.allowance', 'tip.expense', 'tip.subject', 'tip.file', 'tip.goal']) await r.guides.save(id, 1, 'seen')
  await r.guides.save('tour', 1, 'skipped')
  const handoutUrl = await new Promise((done) => {
    const reader = new FileReader()
    reader.onload = () => done(reader.result)
    reader.readAsDataURL(handout.blob)
  })
  return { calc, laptop, handoutUrl }
})
// The web build saves to IndexedDB 250 ms after the last write.
await page.waitForTimeout(2000)
writeFileSync(join(OUT, 'handout.jpg'), Buffer.from(ids.handoutUrl.split(',')[1], 'base64'))
console.log('seeded', { calc: ids.calc, laptop: ids.laptop })

const shots = [
  ['home', '/'],
  ['schedule', '/schedule'],
  ['tasks', '/tasks'],
  ['exams', '/exams'],
  ['subject', `/subjects/${ids.calc}`],
  ['grades', '/grades'],
  ['budget', '/budget'],
  ['savings', '/savings'],
  ['goal', `/savings/${ids.laptop}`],
  ['week', '/week'],
  ['focus', '/focus'],
  ['notes', '/notes'],
  ['files', '/files'],
]
for (const [name, path] of shots) {
  await page.goto(`${BASE}/#${path}`)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}
console.log('saved to', OUT)
await browser.close()
