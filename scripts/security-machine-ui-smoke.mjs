/**
 * UI smoke — Security Machine & Production Update (mobile viewport).
 * Run with preview server: SMOKE_BASE=http://127.0.0.1:4173 node scripts/security-machine-ui-smoke.mjs
 */
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'
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
  console.log(pass ? 'PASS' : 'FAIL', check, JSON.stringify(extra))
}

async function shot(page, name) {
  const p = `${dir}/${name}.png`
  await page.screenshot({ path: p, fullPage: true })
  console.log('shot', p)
}

async function enterPin(page, pins) {
  for (const d of pins) {
    await page.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
  }
}

async function tryLogin(page, role, pin) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.chip', { timeout: 20000 })
  await page.locator('.chip', { hasText: new RegExp(`^${role}$`) }).click({ force: true })
  await page.waitForTimeout(250)
  // clear any partial pin
  const clear = page.locator('.pin-key', { hasText: /C|Clear|⌫|×/i }).first()
  if (await clear.count()) {
    for (let i = 0; i < 4; i++) await clear.click().catch(() => {})
  }
  await enterPin(page, pin.split(''))
  await page.getByRole('button', { name: /Login as/i }).click()
  await page.waitForSelector('.app-shell', { timeout: 15000 })
}

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
page.on('pageerror', (err) => console.log('PAGEERR', err.message))

let roleUsed = null
for (const [role, pin] of [
  ['Security', '1234'],
  ['CEO', '1234'],
  ['CEO', '3060'],
]) {
  try {
    await tryLogin(page, role, pin)
    roleUsed = role
    record('login', true, { role, pin })
    break
  } catch (e) {
    record('login attempt', false, { role, pin, err: String(e.message || e).slice(0, 120) })
  }
}

if (!roleUsed) {
  await shot(page, 'smp-login-fail')
  console.log(JSON.stringify(results, null, 2))
  await browser.close()
  process.exit(1)
}

await page.waitForTimeout(600)

// If CEO, open Security module hub then the screen card
if (roleUsed !== 'Security') {
  await page.locator('.hamburger').click()
  await page.waitForTimeout(400)
  await page.locator('button.side-nav-item', { hasText: /^Security$/i }).click({ force: true })
  await page.waitForTimeout(700)
  // Hub card or any control with the label
  const hubCard = page.locator('.hub-card, .module-hub button, button, a').filter({ hasText: /Machine & Production Update/i }).first()
  await hubCard.waitFor({ state: 'attached', timeout: 10000 })
  await hubCard.evaluate((el) => (el).click())
  await page.waitForTimeout(600)
}

await page.waitForSelector('.smp-screen', { timeout: 15000 })
await shot(page, 'smp-mobile-initial')

const title = await page.locator('.smp-header h1').textContent()
record('screen title', /Machine/.test(title || ''), { title })
record('M1–M6 grid', (await page.locator('.smp-machine-btn').count()) === 6)
record('WhatsApp buttons', (await page.locator('.smp-btn-wa, .smp-btn-wab').count()) === 2)

// Day shift selected by default or toggle
await page.locator('.smp-shift-toggle button', { hasText: /^Day$/ }).click()

// Stop M3 and M6
await page.locator('.smp-machine-btn').filter({ has: page.locator('.smp-machine-no', { hasText: /^M3$/ }) }).click()
await page.locator('.smp-machine-btn').filter({ has: page.locator('.smp-machine-no', { hasText: /^M6$/ }) }).click()
await page.waitForTimeout(200)
record('stop reason UI', (await page.locator('.smp-stop-row').count()) >= 2)

await page.locator('.smp-stop-row', { hasText: 'M3' }).locator('.smp-reason-btn', { hasText: /Mechanical/i }).click()
await page.locator('.smp-stop-row', { hasText: 'M6' }).locator('.smp-reason-btn', { hasText: /Electronic/i }).click()

async function ensureOperator(name) {
  if ((await page.locator('.smp-op-chip', { hasText: new RegExp(`^${name}$`) }).count()) > 0) return
  // Close any open add form first
  if (await page.locator('.smp-add-op-form').count()) {
    await page.locator('.smp-btn-cancel-op').click().catch(() => {})
    await page.waitForTimeout(200)
  }
  await page.locator('button.smp-add-op').click()
  await page.locator('.smp-add-op-form input').fill(name)
  await page.locator('.smp-btn-save-op').click()
  await page.waitForTimeout(900)
  record(`operator saved ${name}`, (await page.locator('.smp-op-chip', { hasText: new RegExp(`^${name}$`) }).count()) > 0)
}

await ensureOperator('Ramesh')
await ensureOperator('Suresh')
await ensureOperator('Amit')

record('running rows', (await page.locator('.smp-prod-row').count()) === 4)

const fillRow = async (machine, op, meters) => {
  const row = page.locator('.smp-prod-row').filter({ has: page.locator('.smp-prod-machine', { hasText: machine }) })
  await row.locator('.smp-op-chip', { hasText: new RegExp(`^${op}$`) }).first().click()
  await row.locator('input[type="number"]').fill(String(meters))
}

await fillRow('M1', 'Ramesh', 1250)
await fillRow('M2', 'Ramesh', 1180)
await fillRow('M4', 'Suresh', 1320)
await fillRow('M5', 'Amit', 1100)
await page.waitForTimeout(200)

const totalText = await page.locator('.smp-total strong').textContent()
record('total 4850', /4,?850/.test(totalText || ''), { totalText })
await shot(page, 'smp-mobile-filled')

// Night shift toggle works
await page.locator('.smp-shift-toggle button', { hasText: /^Night$/ }).click()
record('night shift toggle', await page.locator('.smp-shift-toggle button.is-active', { hasText: /^Night$/ }).count() === 1)
await page.locator('.smp-shift-toggle button', { hasText: /^Day$/ }).click()

// Draft persistence — verify localStorage survives reload (core requirement)
const draftBefore = await page.evaluate(() => localStorage.getItem('jaisal_security_machine_draft_v1'))
const opsBefore = await page.evaluate(() => localStorage.getItem('jaisal_security_operators_cache_v1'))
record('draft written to localStorage', !!(draftBefore && draftBefore.includes('1250')), {
  len: draftBefore?.length || 0,
})
record('operators written to localStorage', !!(opsBefore && opsBefore.includes('Ramesh')), {
  opsBefore,
})

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const draftAfter = await page.evaluate(() => localStorage.getItem('jaisal_security_machine_draft_v1'))
const opsAfter = await page.evaluate(() => localStorage.getItem('jaisal_security_operators_cache_v1'))
record('draft preserved after refresh', !!(draftAfter && draftAfter.includes('1250') && draftAfter.includes('Ramesh')))
record('operators remain after refresh', !!(opsAfter && opsAfter.includes('Ramesh') && opsAfter.includes('Amit')))

// Re-open screen if session bounced to login
if ((await page.locator('.smp-screen').count()) === 0) {
  try {
    await tryLogin(page, 'CEO', '1234')
    await page.locator('.hamburger').click()
    await page.waitForTimeout(400)
    await page.locator('button.side-nav-item', { hasText: /^Security$/i }).click({ force: true })
    await page.waitForTimeout(700)
    const hubCard = page.locator('.hub-card, .module-hub button, button, a').filter({ hasText: /Machine & Production Update/i }).first()
    await hubCard.evaluate((el) => el.click())
    await page.waitForTimeout(600)
  } catch (e) {
    record('reopen after refresh', false, { err: String(e.message || e).slice(0, 100) })
  }
}

if (await page.locator('.smp-screen').count()) {
  const after = await page.locator('.smp-total strong').textContent()
  record('UI shows restored draft', /4,?850/.test(after || ''), { after })
} else {
  record('UI shows restored draft', false, { reason: 'screen not open; localStorage checks above still apply' })
}

await shot(page, 'smp-mobile-after-refresh')

// iPhone width already 390 — also test 360
await page.setViewportSize({ width: 360, height: 740 })
await page.waitForTimeout(300)
record('no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2))
await shot(page, 'smp-mobile-360')

const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify(results, null, 2))
await browser.close()
if (failed.length) {
  console.error(`${failed.length} failed`)
  process.exit(1)
}
console.log('UI smoke passed')
