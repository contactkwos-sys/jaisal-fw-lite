/**
 * E2E smoke: Security Machine & Production Update (mobile viewport).
 * Run with: SMOKE_BASE=http://127.0.0.1:5173 node scripts/security-mobile-ui-smoke.mjs
 */
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const dir = '/opt/cursor/artifacts/screenshots'
fs.mkdirSync(dir, { recursive: true })

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

const results = []
function record(check, pass, extra = {}) {
  results.push({ check, pass, ...extra })
  console.log(pass ? 'PASS' : 'FAIL', check, Object.keys(extra).length ? JSON.stringify(extra) : '')
}

async function shot(page, name) {
  const p = `${dir}/${name}.png`
  await page.screenshot({ path: p, fullPage: true })
  console.log('shot', p)
}

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
page.on('pageerror', (err) => console.log('PAGEERR', err.message))

// Intercept WhatsApp opens
const opened = []
page.on('popup', (p) => {
  opened.push(p.url())
})
await page.addInitScript(() => {
  window.open = (url) => {
    window.__waOpened = window.__waOpened || []
    window.__waOpened.push(String(url))
    return null
  }
})

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForSelector('.chip', { timeout: 20000 })

// Select Security role
const secChip = page.locator('.chip', { hasText: /^Security$/i })
if ((await secChip.count()) > 0) {
  await secChip.first().click()
} else {
  // fallback: click any chip containing Security
  await page.locator('.chip', { hasText: /Security/i }).first().click()
}
await page.waitForTimeout(200)

for (const d of ['1', '2', '3', '4']) {
  await page.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
}
await page.getByRole('button', { name: /Login as/i }).click()

try {
  await page.waitForSelector('.smu-screen, .app-shell', { timeout: 25000 })
  record('security login', true)
} catch {
  // try alternate PIN
  for (const d of ['3', '0', '6', '0']) {
    await page.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
  }
  await page.getByRole('button', { name: /Login as/i }).click()
  await page.waitForSelector('.smu-screen, .app-shell', { timeout: 20000 }).catch(() => null)
}

await page.waitForTimeout(800)
await shot(page, 'security-mobile-landing')

const hasScreen = (await page.locator('.smu-screen').count()) > 0
record('lands on Machine & Production Update', hasScreen, {
  title: await page.locator('.smu-header h1').textContent().catch(() => null),
})

if (!hasScreen) {
  // Maybe still on hub — navigate via Security
  const link = page.getByText(/Machine & Production Update/i)
  if ((await link.count()) > 0) await link.first().click()
  await page.waitForTimeout(500)
  record('navigated to screen', (await page.locator('.smu-screen').count()) > 0)
}

// Meta shows Date / Shift / User
record(
  'shows date/time/shift/user',
  (await page.locator('.smu-meta-card').count()) >= 4,
)

// Ensure Day shift
const dayBtn = page.locator('.smu-shift-toggle button', { hasText: /^Day$/ })
if ((await dayBtn.count()) > 0) await dayBtn.click()

// Toggle M3 and M6 to stopped
async function ensureStopped(machine) {
  const btn = page.locator('.smu-machine-btn', { hasText: machine })
  const cls = await btn.getAttribute('class')
  if (cls?.includes('is-running')) await btn.click()
}
async function ensureRunning(machine) {
  const btn = page.locator('.smu-machine-btn', { hasText: machine })
  const cls = await btn.getAttribute('class')
  if (cls?.includes('is-stopped')) await btn.click()
}

for (const m of ['M1', 'M2', 'M4', 'M5']) await ensureRunning(m)
for (const m of ['M3', 'M6']) await ensureStopped(m)
await page.waitForTimeout(200)

record('M3 stopped', (await page.locator('.smu-machine-btn.is-stopped', { hasText: 'M3' }).count()) === 1)
record('M6 stopped', (await page.locator('.smu-machine-btn.is-stopped', { hasText: 'M6' }).count()) === 1)

// Stop reasons
await page.locator('.smu-stop-box', { hasText: 'M3' }).locator('.smu-reason', { hasText: 'Mechanical Fault' }).click()
await page.locator('.smu-stop-box', { hasText: 'M6' }).locator('.smu-reason', { hasText: 'Electronic Fault' }).click()
record('stop reasons selected', true)

await shot(page, 'security-mobile-machines')

// Add operators if needed
async function ensureOperator(name) {
  const chip = page.locator('.smu-op-chip', { hasText: new RegExp(`^${name}$`) })
  if ((await chip.count()) > 0) return
  await page.locator('.smu-add-op').click()
  await page.locator('.smu-add-op-form input').fill(name)
  await page.locator('.smu-add-op-form .smu-btn-solid').click()
  await page.waitForTimeout(400)
}

for (const name of ['Ramesh', 'Suresh', 'Amit']) {
  await ensureOperator(name)
}

// Assign operators + production
async function fillMachine(machine, op, meters) {
  const row = page.locator('.smu-prod-row', { hasText: machine })
  await row.locator('.smu-op-chip', { hasText: new RegExp(`^${op}$`) }).click()
  await row.locator('input[type="number"]').fill(String(meters))
}

await fillMachine('M1', 'Ramesh', 1250)
await fillMachine('M2', 'Ramesh', 1180)
await fillMachine('M4', 'Suresh', 1320)
await fillMachine('M5', 'Amit', 1100)
await page.waitForTimeout(200)

const totalText = await page.locator('.smu-total strong').textContent()
record('total production 4,850', /4,?850/.test(totalText || ''), { totalText })

await shot(page, 'security-mobile-production')

// Draft persistence: reload
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.smu-screen', { timeout: 20000 })
const m1Meters = await page.locator('.smu-prod-row', { hasText: 'M1' }).locator('input[type="number"]').inputValue()
record('draft preserved after refresh', m1Meters === '1250', { m1Meters })

const opCount = await page.locator('.smu-op-chip', { hasText: /^Ramesh$/ }).count()
record('operator names remain', opCount > 0, { opCount })

await shot(page, 'security-mobile-after-refresh')

// WhatsApp send — wait for async submit + window.open
await page.evaluate(() => { window.__waOpened = [] })
await page.locator('.smu-send-wa').click()
await page.waitForFunction(() => (window.__waOpened || []).some((u) => u.includes('wa.me') || u.includes('whatsapp')), null, { timeout: 20000 }).catch(() => null)
let waUrls = await page.evaluate(() => window.__waOpened || [])
record('WhatsApp open', waUrls.some((u) => u.includes('wa.me') || u.includes('whatsapp')), { waUrls })

// Re-enter for WhatsApp Business (form resets cleanly after successful submit)
await page.waitForTimeout(400)
await page.locator('.smu-fresh').click().catch(() => null)
await page.waitForTimeout(200)
for (const m of ['M1', 'M2', 'M4', 'M5']) await ensureRunning(m)
for (const m of ['M3', 'M6']) await ensureStopped(m)
await page.locator('.smu-stop-box', { hasText: 'M3' }).locator('.smu-reason', { hasText: 'Mechanical Fault' }).click()
await page.locator('.smu-stop-box', { hasText: 'M6' }).locator('.smu-reason', { hasText: 'Electronic Fault' }).click()
for (const name of ['Ramesh', 'Suresh', 'Amit']) await ensureOperator(name)
await fillMachine('M1', 'Ramesh', 100)
await fillMachine('M2', 'Ramesh', 100)
await fillMachine('M4', 'Suresh', 100)
await fillMachine('M5', 'Amit', 100)

await page.evaluate(() => { window.__waOpened = [] })
await page.locator('.smu-send-wab').click()
await page.waitForFunction(() => (window.__waOpened || []).some((u) => u.includes('api.whatsapp.com') || u.includes('wa.me') || u.includes('whatsapp')), null, { timeout: 20000 }).catch(() => null)
const waUrls2 = await page.evaluate(() => window.__waOpened || [])
record(
  'WhatsApp Business open',
  waUrls2.some((u) => u.includes('api.whatsapp.com')),
  { waUrls2 },
)

// Night shift toggle
await page.locator('.smu-shift-toggle button', { hasText: /^Night$/ }).click()
record('night shift selectable', (await page.locator('.smu-shift-toggle button.is-active', { hasText: 'Night' }).count()) === 1)

await shot(page, 'security-mobile-night')

// Security must not see costing etc.
const body = await page.locator('body').innerText()
record('no costing exposed', !/Rate Master|Quality Master|DIN Costing|Customer Order/i.test(body))

const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify({ failed: failed.length, results }, null, 2))
await browser.close()
process.exit(failed.length ? 1 : 0)
