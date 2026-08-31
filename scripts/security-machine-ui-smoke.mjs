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

async function loginAs(page, role, pins) {
  await page.waitForSelector('.chip', { timeout: 20000 })
  await page.locator('.chip', { hasText: new RegExp(`^${role}$`) }).click()
  await page.waitForTimeout(200)
  for (const d of pins) {
    await page.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
  }
  await page.getByRole('button', { name: /Login as/i }).click()
  await page.waitForSelector('.app-shell', { timeout: 25000 })
}

const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
page.on('pageerror', (err) => console.log('PAGEERR', err.message))

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(800)

// Try Security role first (seed PIN often 0000 / 1234 / 152348 last4 — try common)
let logged = false
for (const pin of ['1234', '0000', '3060', '1523']) {
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
    await loginAs(page, 'Security', pin.split(''))
    logged = true
    record('security login', true, { pin })
    break
  } catch {
    /* try next */
  }
}

if (!logged) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await loginAs(page, 'CEO', ['1', '2', '3', '4'])
  record('ceo fallback login', true)
  // Navigate via sidebar to Security → Machine & Production Update
  await page.locator('.hamburger').click()
  await page.waitForTimeout(300)
  const secBtn = page.locator('.side-nav button, .side-nav a, .nav-module-btn', { hasText: /Security/i }).first()
  if (await secBtn.count()) {
    await secBtn.click()
    await page.waitForTimeout(400)
  }
  const item = page.getByText(/Machine & Production Update/i).first()
  if (await item.count()) {
    await item.click()
    await page.waitForTimeout(500)
  }
}

await page.waitForTimeout(800)
const title = await page.locator('h1', { hasText: /Machine/i }).first().textContent().catch(() => null)
record('screen title visible', !!title && /Machine/.test(title || ''), { title })

const m1 = page.locator('.smp-machine-btn', { hasText: 'M1' })
record('M1–M6 grid present', (await page.locator('.smp-machine-btn').count()) === 6)

// Stop M3 and M6
await page.locator('.smp-machine-btn', { hasText: 'M3' }).click()
await page.locator('.smp-machine-btn', { hasText: 'M6' }).click()
await page.waitForTimeout(200)

const stopRows = await page.locator('.smp-stop-row').count()
record('stop reason UI shown', stopRows >= 2, { stopRows })

// Set Mechanical for M3
const m3Block = page.locator('.smp-stop-row', { hasText: 'M3' })
await m3Block.locator('.smp-reason-btn', { hasText: /Mechanical/i }).click()

// Add operators
async function ensureOperator(name) {
  const chip = page.locator('.smp-op-chip', { hasText: new RegExp(`^${name}$`) })
  if ((await chip.count()) > 0) return
  await page.getByRole('button', { name: /\+ Add Operator/i }).click()
  await page.locator('.smp-add-op-form input').fill(name)
  await page.locator('.smp-btn-save-op').click()
  await page.waitForTimeout(500)
}

await ensureOperator('Ramesh')
await ensureOperator('Suresh')
await ensureOperator('Amit')

// Assign operators + production on running machines
const prodRows = page.locator('.smp-prod-row')
const count = await prodRows.count()
record('running production rows', count === 4, { count })

const fillRow = async (machine, op, meters) => {
  const row = page.locator('.smp-prod-row', { hasText: machine })
  await row.locator('.smp-op-chip', { hasText: new RegExp(`^${op}$`) }).click()
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

// Draft persistence: reload
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
// May need re-login if session lost — if login screen, stop draft check
if (await page.locator('.smp-screen').count()) {
  const after = await page.locator('.smp-total strong').textContent()
  record('draft preserved after refresh', /4,?850/.test(after || ''), { after })
  const ops = await page.locator('.smp-op-chip').allTextContents()
  record('operators remain after refresh', ops.includes('Ramesh') && ops.includes('Suresh') && ops.includes('Amit'), { ops })
} else {
  record('draft preserved after refresh', false, { reason: 'session lost on reload' })
}

await shot(page, 'smp-mobile-after-refresh')

const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify(results, null, 2))
await browser.close()
if (failed.length) process.exit(1)
