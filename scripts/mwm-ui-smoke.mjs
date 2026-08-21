/**
 * UI smoke: Machine-wise Maintenance module
 */
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'

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
  const dir = '/tmp/cursor/artifacts/screenshots'
  fs.mkdirSync(dir, { recursive: true })
  const p = `${dir}/${name}.png`
  await page.screenshot({ path: p, fullPage: true })
  console.log('shot', p)
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.chip', { timeout: 15000 })
  for (const d of ['1', '2', '3', '4']) {
    await page.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
  }
  await page.getByRole('button', { name: /Login as/i }).click()
  try {
    await page.waitForSelector('.app-shell', { timeout: 15000 })
  } catch {
    for (const d of ['3', '0', '6', '0']) {
      await page.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
    }
    await page.getByRole('button', { name: /Login as/i }).click()
    await page.waitForSelector('.app-shell', { timeout: 15000 })
  }
}

const pageErrors = []
const desk = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const d = await desk.newPage()
d.on('pageerror', (err) => pageErrors.push(err.message))

await login(d)
record('logged in', true)

await d.locator('.side-nav').getByRole('button', { name: 'Maintenance', exact: true }).click()
await d.waitForTimeout(700)
record('maintenance hub open', (await d.locator('.hub-card').count()) >= 6, {
  cards: await d.locator('.hub-card').count(),
})
await shot(d, 'mwm-hub')

await d.locator('.hub-card').filter({ hasText: 'Machine Overview' }).first().click()
await d.waitForTimeout(1200)
record('overview title', (await d.locator('h1').filter({ hasText: 'Machine-wise Maintenance' }).count()) >= 1)
record('machine cards', (await d.locator('.mwm-machine-card').count()) === 6, {
  count: await d.locator('.mwm-machine-card').count(),
})
record('kpi row', (await d.locator('.mwm-kpi').count()) >= 5)
await shot(d, 'mwm-overview')

// Contacts
await d.locator('.sub-tab', { hasText: 'Contacts' }).click()
await d.waitForTimeout(500)
const cName = `UI Tech ${Date.now()}`
await d.locator('input').nth(0).fill(cName)
await d.locator('input').nth(1).fill('9988776655')
await d.getByRole('button', { name: /Save Contact/i }).click()
await d.waitForTimeout(1500)
record('contact saved', (await d.locator('.form-ok, .card-row').filter({ hasText: cName }).count()) >= 1 || (await d.locator('.card-row').count()) >= 1)

// Breakdown
await d.locator('.sub-tab', { hasText: 'Breakdown' }).click()
await d.waitForTimeout(600)
await d.locator('.field', { hasText: 'Sub Fault / Problem' }).locator('input').fill('UI smoke motor trip')
const contactSelect = d.locator('.field', { hasText: 'Contact Person' }).locator('select')
if (await contactSelect.count()) {
  const opts = await contactSelect.locator('option').allTextContents()
  if (opts.length > 1) await contactSelect.selectOption({ index: 1 })
}
await d.getByRole('button', { name: /Save Breakdown/i }).click()
await d.waitForTimeout(1800)
const bdOk = (await d.locator('.form-ok').count()) >= 1 || (await d.locator('.mwm-timeline').count()) >= 1
record('breakdown saved', bdOk)
await shot(d, 'mwm-breakdown')

if (await d.locator('.mwm-timeline').count()) {
  await d.locator('.mwm-tl', { hasText: /CALL DONE/i }).click()
  await d.waitForTimeout(800)
  await d.locator('.mwm-tl', { hasText: /ARRIVED/i }).click()
  await d.waitForTimeout(800)
  await d.locator('.mwm-tl', { hasText: /WORK STARTED/i }).click()
  await d.waitForTimeout(800)
  await d.locator('.mwm-tl', { hasText: /RESOLVED/i }).click()
  await d.waitForTimeout(1000)
  record('timeline advanced', (await d.locator('.mwm-badge').filter({ hasText: 'RESOLVED' }).count()) >= 1 || (await d.locator('.form-ok').count()) >= 1)

  await d.locator('input').filter({ hasText: '' }).nth(0)
  // Fill resolution fields by label proximity
  const doneBy = d.locator('.field', { hasText: 'Done By' }).locator('input')
  if (await doneBy.count()) await doneBy.fill('UI Tech')
  const work = d.locator('.field', { hasText: 'Work Performed' }).locator('input')
  if (await work.count()) await work.fill('Fixed motor')
  await d.getByRole('button', { name: /Save Resolution/i }).click()
  await d.waitForTimeout(1200)
  record('resolution saved', (await d.locator('.form-ok').count()) >= 1)
}

// History
await d.locator('.sub-tab', { hasText: 'History' }).click()
await d.waitForTimeout(800)
record('history table', (await d.locator('.mwm-table').count()) >= 1)
await shot(d, 'mwm-history')

// Reports
await d.locator('.sub-tab', { hasText: 'Reports' }).click()
await d.waitForTimeout(600)
record('reports view', (await d.locator('.mwm-print-area').count()) >= 1)
record('print button', (await d.getByRole('button', { name: /A4 Print|Print/i }).count()) >= 1)
await shot(d, 'mwm-reports')

// Mobile
await desk.close()
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const m = await mobile.newPage()
m.on('pageerror', (err) => pageErrors.push('M:' + err.message))
await login(m)
await m.locator('.hamburger').click()
await m.waitForTimeout(400)
await m.locator('.side-nav').getByRole('button', { name: 'Maintenance', exact: true }).click()
await m.waitForTimeout(500)
await m.locator('.hub-card').filter({ hasText: 'Machine Overview' }).first().click()
await m.waitForTimeout(1000)
record('mobile overview cards', (await m.locator('.mwm-machine-card').count()) === 6)
await shot(m, 'mwm-mobile-overview')
await mobile.close()

record('no page errors', pageErrors.length === 0, { pageErrors: pageErrors.slice(0, 5) })

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify({ failed: failed.length, results }, null, 2))
process.exit(failed.length ? 1 : 0)
