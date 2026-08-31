/**
 * Security Machine & Production Update — mobile acceptance UI smoke.
 * Covers FINAL TASK cases 1–9, 12–14 (UI + draft + operators + WhatsApp message).
 * Run: node scripts/security-machine-update-ui-smoke.mjs
 * Requires: vite preview on SMOKE_BASE (default http://127.0.0.1:4179) built with VITE_SMOKE_BYPASS=1
 */
import { chromium } from 'playwright-core'
import fs from 'fs'
import { spawn } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'

const PORT = process.env.SMOKE_PORT || '4179'
const BASE = process.env.SMOKE_BASE || `http://127.0.0.1:${PORT}`
const SHOT_DIR = '/tmp/cursor/artifacts/screenshots'
fs.mkdirSync(SHOT_DIR, { recursive: true })

const results = []
function record(check, pass, extra = {}) {
  results.push({ check, pass, ...extra })
  console.log(pass ? 'PASS' : 'FAIL', check, Object.keys(extra).length ? JSON.stringify(extra) : '')
}

async function shot(page, name) {
  const p = `${SHOT_DIR}/security-mwp-${name}.png`
  await page.screenshot({ path: p, fullPage: true })
  console.log('shot', p)
}

// Build with smoke bypass so Security PIN login works without live Supabase
console.log('Building with VITE_SMOKE_BYPASS=1 …')
await new Promise((resolve, reject) => {
  const b = spawn('npm', ['run', 'build'], {
    cwd: '/workspace',
    env: { ...process.env, VITE_SMOKE_BYPASS: '1' },
    stdio: 'inherit',
  })
  b.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build ${code}`))))
})

const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', PORT], {
  cwd: '/workspace',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VITE_SMOKE_BYPASS: '1' },
})
let ready = false
const onData = (d) => {
  const s = String(d)
  if (s.includes(PORT) || s.includes('Local:')) ready = true
}
server.stdout.on('data', onData)
server.stderr.on('data', onData)
for (let i = 0; i < 60 && !ready; i++) await sleep(250)
if (!ready) {
  console.error('preview server failed to start')
  server.kill()
  process.exit(1)
}

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  // Capture window.open targets for WhatsApp
})
const page = await ctx.newPage()
page.on('pageerror', (err) => console.log('PAGEERR', err.message))

const openedUrls = []
page.on('popup', async (p) => {
  openedUrls.push(p.url())
  await p.close().catch(() => {})
})
// Also intercept window.open
await page.addInitScript(() => {
  window.__opened = []
  const orig = window.open
  window.open = function (url, ...rest) {
    window.__opened.push(String(url || ''))
    return orig?.call(window, url, ...rest)
  }
})

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(800)
await shot(page, '01-login')

// Select Security role
await page.waitForSelector('.chip', { timeout: 15000 })
const chips = await page.locator('.chip').allTextContents()
record('Security role chip present', chips.some((c) => /security/i.test(c)), { chips })
await page.locator('.chip', { hasText: /^Security$/i }).first().click()
for (const d of ['1', '2', '3', '4']) {
  await page.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
}
await page.getByRole('button', { name: /Login as/i }).click()
await page.waitForSelector('.smu-screen, .app-shell', { timeout: 20000 })
await page.waitForTimeout(600)
await shot(page, '02-after-login')

const hasScreen = (await page.locator('.smu-screen').count()) >= 1
record('lands on Machine & Production Update', hasScreen)
const h1 = await page.locator('.smu-header h1, .smu-screen h1').first().textContent().catch(() => '')
record('screen title correct', /Machine\s*&\s*Production\s*Update/i.test(h1 || ''), { h1 })

// Meta: Date, Time, Shift, User
const metaText = await page.locator('.smu-meta').innerText()
record('shows Date', /Date/i.test(metaText))
record('shows Time', /Time/i.test(metaText))
record('shows User Security', /Security/i.test(metaText))
record('Day/Night shift toggle', (await page.locator('.smu-shift-toggle button').count()) === 2)

// Ensure Day shift
await page.locator('.smu-shift-toggle button', { hasText: /^Day$/ }).click()

// Case 1: M1,M2,M4,M5 running; M3 mechanical; M6 electronic
// Default is all running — stop M3 and M6
async function machineBtn(no) {
  return page.locator('.smu-machine-btn', { hasText: no }).first()
}

await (await machineBtn('M3')).click()
await page.waitForTimeout(200)
await page
  .locator('.smu-reason-box', { hasText: 'M3' })
  .locator('.smu-reason-btn', { hasText: /Mechanical Fault/i })
  .click()

await (await machineBtn('M6')).click()
await page.waitForTimeout(200)
await page
  .locator('.smu-reason-box', { hasText: 'M6' })
  .locator('.smu-reason-btn', { hasText: /Electronic Fault/i })
  .click()

record('M3 stopped', await (await machineBtn('M3')).evaluate((el) => el.classList.contains('is-stop')))
record('M6 stopped', await (await machineBtn('M6')).evaluate((el) => el.classList.contains('is-stop')))
record('M1 running', await (await machineBtn('M1')).evaluate((el) => el.classList.contains('is-run')))
await shot(page, '03-machine-status')

// No product/quality/remarks fields
const body = await page.locator('.smu-screen').innerText()
record('no product/quality/yarn/customer fields', !/product name|quality|yarn|customer|remarks/i.test(body))
record('no costing/rate master on screen', !/costing|rate master|admin/i.test(body))

// Add operators if needed
async function ensureOperator(name) {
  const exists = await page.locator('.smu-op-chip', { hasText: name }).count()
  if (exists) return
  await page.locator('.smu-add-op').click()
  await page.locator('.smu-add-op-row input').fill(name)
  await page.locator('.smu-save-op').click()
  await page.waitForTimeout(400)
}

for (const name of ['Ramesh', 'Suresh', 'Amit']) {
  await ensureOperator(name)
}
record('operators available as chips', (await page.locator('.smu-op-chip').count()) >= 3)
await shot(page, '04-operators')

// Assign operators + production (cases 2–5)
async function fillMachine(no, op, mtr) {
  const row = page.locator('.smu-prod-row', { hasText: no }).first()
  await row.locator('.smu-op-chip', { hasText: op }).click()
  await row.locator('input[type="number"]').fill(String(mtr))
}

await fillMachine('M1', 'Ramesh', 1250)
await fillMachine('M2', 'Ramesh', 1180)
await fillMachine('M4', 'Suresh', 1320)
await fillMachine('M5', 'Amit', 1100)
await page.waitForTimeout(300)

const totalText = await page.locator('.smu-total').innerText()
record('total production 4850', /4,?850/.test(totalText), { totalText })
await shot(page, '05-production-filled')

// Case 14: refresh before submit preserves draft
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.smu-screen', { timeout: 15000 })
await page.waitForTimeout(500)
const m1Val = await page
  .locator('.smu-prod-row', { hasText: 'M1' })
  .locator('input[type="number"]')
  .inputValue()
record('draft preserved after refresh', m1Val === '1250', { m1Val })
const m3Stop = await page.locator('.smu-machine-btn', { hasText: 'M3' }).evaluate((el) =>
  el.classList.contains('is-stop'),
)
record('stopped status preserved after refresh', m3Stop)
await shot(page, '06-after-refresh')

// Case 7–8: WhatsApp buttons open share URLs
async function clickSendAndWait(sel) {
  await page.evaluate(() => {
    window.__opened = []
  })
  await page.locator(sel).click()
  // Wait until buttons re-enable (busy cleared) or a share URL appears
  for (let i = 0; i < 40; i++) {
    const opened = await page.evaluate(() => window.__opened.slice())
    if (opened.length) return opened
    const disabled = await page.locator(sel).isDisabled().catch(() => false)
    if (!disabled && i > 2) {
      const again = await page.evaluate(() => window.__opened.slice())
      if (again.length) return again
    }
    await page.waitForTimeout(250)
  }
  return page.evaluate(() => window.__opened.slice())
}

const opened1 = await clickSendAndWait('.smu-btn-wa')
const waOk = opened1.some((u) => /wa\.me|whatsapp/i.test(u))
record('WhatsApp button opens share link', waOk, { opened1: opened1.slice(-2) })

// Re-fill if submit cleared form (DB may have succeeded)
async function refillAcceptance() {
  await page.locator('.smu-shift-toggle button', { hasText: /^Day$/ }).click()
  for (const no of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']) {
    const btn = await machineBtn(no)
    const isRun = await btn.evaluate((el) => el.classList.contains('is-run'))
    if (!isRun && ['M1', 'M2', 'M4', 'M5'].includes(no)) await btn.click()
    if (isRun && ['M3', 'M6'].includes(no)) await btn.click()
  }
  await page.waitForTimeout(200)
  if ((await page.locator('.smu-reason-box', { hasText: 'M3' }).count()) > 0) {
    await page
      .locator('.smu-reason-box', { hasText: 'M3' })
      .locator('.smu-reason-btn', { hasText: /Mechanical Fault/i })
      .click()
  }
  if ((await page.locator('.smu-reason-box', { hasText: 'M6' }).count()) > 0) {
    await page
      .locator('.smu-reason-box', { hasText: 'M6' })
      .locator('.smu-reason-btn', { hasText: /Electronic Fault/i })
      .click()
  }
  for (const name of ['Ramesh', 'Suresh', 'Amit']) await ensureOperator(name)
  // Ensure rows exist
  if ((await page.locator('.smu-prod-row').count()) === 0) return
  await fillMachine('M1', 'Ramesh', 1250)
  await fillMachine('M2', 'Ramesh', 1180)
  await fillMachine('M4', 'Suresh', 1320)
  await fillMachine('M5', 'Amit', 1100)
}

const m1After = await page
  .locator('.smu-prod-row', { hasText: 'M1' })
  .locator('input[type="number"]')
  .inputValue()
  .catch(() => '')
if (m1After !== '1250') await refillAcceptance()

const opened2 = await clickSendAndWait('.smu-btn-wab')
record('WhatsApp Business button opens share link', opened2.length > 0, { opened2: opened2.slice(-2) })

// Decode last message and verify format
const lastUrl = [...opened1, ...opened2].filter(Boolean).pop() || ''
let decoded = ''
try {
  const u = new URL(lastUrl)
  decoded = u.searchParams.get('text') || ''
} catch {
  decoded = decodeURIComponent(lastUrl)
}
record('WA message has DAY SHIFT', /DAY SHIFT/i.test(decoded), { sample: decoded.slice(0, 120) })
record('WA message has M3 Mechanical Fault', /M3.*Mechanical Fault/i.test(decoded))
record('WA message has M1 Ramesh 1250', /M1 - 1250 Mtr - Ramesh/i.test(decoded), {
  prodLine: decoded.split('\n').find((l) => l.startsWith('M1 -')),
})
record('WA message has total 4850', /Total Production: 4850 Mtr/i.test(decoded))
await shot(page, '07-after-wa')

// Case 9: reopen — operators remain
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.smu-screen', { timeout: 15000 })
await page.waitForTimeout(500)
// Need at least one running machine to show chips — defaults are all running
const opCount = await page.locator('.smu-op-chip').count()
record('operators remain after reopen', opCount >= 3, { opCount })
await shot(page, '08-operators-persist')

// Case 12: Night shift
await page.locator('.smu-shift-toggle button', { hasText: /^Night$/ }).click()
record(
  'Night shift selectable',
  await page.locator('.smu-shift-toggle button', { hasText: /^Night$/ }).evaluate((el) => el.classList.contains('is-on')),
)
await shot(page, '09-night-shift')

// Case 13: mobile width — no horizontal scroll on screen
const scrollWidth = await page.evaluate(() => {
  const el = document.querySelector('.smu-screen')
  return { sw: el?.scrollWidth || 0, cw: el?.clientWidth || 0, docSw: document.documentElement.scrollWidth, iw: window.innerWidth }
})
record('no horizontal scroll on mobile', scrollWidth.docSw <= scrollWidth.iw + 2, scrollWidth)

// Security must NOT see bottom nav with ERP modules
const bottomNav = await page.locator('.bottom-nav').count()
record('bottom nav hidden for Security', bottomNav === 0)

// Security drawer should not expose costing etc.
const ham = page.locator('.hamburger')
if (await ham.isVisible()) {
  await ham.click()
  await page.waitForTimeout(300)
  const nav = await page.locator('.side-nav').innerText().catch(() => '')
  record('nav does not expose Costing', !/Costing|Rate Master|Quality Master|Sales/i.test(nav), {
    navPreview: nav.slice(0, 300),
  })
  await shot(page, '10-security-nav')
}

await browser.close()
server.kill('SIGTERM')

const failed = results.filter((r) => !r.pass)
console.log('\n=== SUMMARY ===')
console.log(`passed ${results.length - failed.length}/${results.length}`)
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.check))
  process.exit(1)
}
console.log('security-machine-update-ui-smoke: OK')
