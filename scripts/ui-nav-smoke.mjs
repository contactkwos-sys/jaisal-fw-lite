import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

async function shot(page, name) {
  const dir = '/tmp/cursor/artifacts/screenshots'
  fs.mkdirSync(dir, { recursive: true })
  const p = `${dir}/${name}.png`
  await page.screenshot({ path: p, fullPage: true })
  console.log('shot', p)
}

const results = []

function record(check, pass, extra = {}) {
  results.push({ check, pass, ...extra })
  console.log(pass ? 'PASS' : 'FAIL', check, JSON.stringify(extra))
}

const MAIN_MODULES_EXPECTED = [
  'Dashboard',
  'Design',
  'Sales & Order',
  'Production & Dispatch',
  'Inventory',
  'Reports',
  'Machine Maintenance',
  'Masters',
  'Security',
  'Settings',
]

// MOBILE
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})
const m = await mobile.newPage()
m.on('pageerror', (err) => console.log('MERR', err.message))
await m.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
await m.waitForTimeout(1200)
await shot(m, 'ui-mobile-login')

await m.waitForSelector('.chip', { timeout: 15000 })
const chips = await m.locator('.chip').allTextContents()
record('mobile role chips', chips.includes('CEO'), { chips })

for (const d of ['1', '2', '3', '4']) {
  await m.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
}
await m.waitForTimeout(300)
const loginBtn = m.getByRole('button', { name: /Login as/i })
record('login enabled after PIN', !(await loginBtn.isDisabled()))
await loginBtn.click()

try {
  await m.waitForSelector('.app-shell, .hamburger, .app-sidebar', { timeout: 20000 })
  record('mobile login success', true)
} catch {
  // Retry with CEO auto-gen PIN 3060
  for (const d of ['3', '0', '6', '0']) {
    await m.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
  }
  await m.getByRole('button', { name: /Login as/i }).click()
  try {
    await m.waitForSelector('.app-shell', { timeout: 15000 })
    record('mobile login success', true, { pin: '3060' })
  } catch {
    const err = await m.locator('.form-error').textContent().catch(() => null)
    record('mobile login success', false, { err })
    await shot(m, 'ui-mobile-login-fail')
    console.log(JSON.stringify(results, null, 2))
    await browser.close()
    process.exit(1)
  }
}

await shot(m, 'ui-mobile-after-login')

const ham = m.locator('.hamburger')
record('hamburger visible', await ham.isVisible())
record('bottom nav visible', await m.locator('.bottom-nav').isVisible())
await ham.click()
await m.waitForTimeout(400)
record('drawer opens', (await m.locator('.app-shell.drawer-is-open').count()) === 1)
await shot(m, 'ui-mobile-drawer')

const navText = await m.locator('.side-nav').innerText()
const missing = MAIN_MODULES_EXPECTED.filter((n) => !navText.includes(n))
record('main modules present', missing.length === 0, { missing, navPreview: navText.slice(0, 400) })

// Should NOT show flat old top-level items as main tabs
const forbidden = ['Yarn Management', 'Admin Master', 'Dispatch & Gate Pass', 'Order to Program']
const leaked = forbidden.filter((n) => navText.split('\n').map((s) => s.trim()).includes(n))
record('old flat tabs not main-level', leaked.length === 0, { leaked })

await m.locator('.side-nav').getByRole('button', { name: 'Machine Production', exact: true }).click()
await m.waitForTimeout(500)
record('drawer closes on nav', (await m.locator('.app-shell.drawer-is-open').count()) === 0)
record('module hub cards', (await m.locator('.hub-card').count()) >= 1)
await shot(m, 'ui-mobile-production-hub')

await ham.click()
await m.waitForTimeout(300)
record('Production & Dispatch in nav', (await m.locator('.side-nav').innerText()).includes('Production & Dispatch'))
await m.locator('.side-nav').locator('.side-nav-item', { hasText: 'Production & Dispatch' }).first().click()
await m.waitForTimeout(500)
record('program dispatch screen', (await m.locator('.pd-hub, .pd-screen, .screen').count()) >= 1)
await shot(m, 'ui-mobile-program-dispatch')

await mobile.close()

// TABLET
const tab = await browser.newContext({ viewport: { width: 1024, height: 768 } })
const t = await tab.newPage()
await t.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
await t.waitForSelector('.chip', { timeout: 15000 })
for (const n of ['1', '2', '3', '4']) {
  await t.locator('.pin-key', { hasText: new RegExp(`^${n}$`) }).click()
}
await t.getByRole('button', { name: /Login as/i }).click()
await t.waitForTimeout(1000)
try {
  await t.waitForSelector('.app-shell', { timeout: 12000 })
} catch {
  for (const n of ['3', '0', '6', '0']) {
    await t.locator('.pin-key', { hasText: new RegExp(`^${n}$`) }).click()
  }
  await t.getByRole('button', { name: /Login as/i }).click()
  await t.waitForSelector('.app-shell', { timeout: 15000 })
}
record('tablet sidebar visible', await t.locator('.app-sidebar').isVisible())
record('tablet no bottom nav', !(await t.locator('.bottom-nav').isVisible()))
await shot(t, 'ui-tablet-shell')
await tab.close()

// DESKTOP
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const d = await desk.newPage()
await d.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
await d.waitForSelector('.chip', { timeout: 15000 })
for (const n of ['1', '2', '3', '4']) {
  await d.locator('.pin-key', { hasText: new RegExp(`^${n}$`) }).click()
}
await d.getByRole('button', { name: /Login as/i }).click()
await d.waitForTimeout(1000)
try {
  await d.waitForSelector('.app-shell', { timeout: 12000 })
} catch {
  for (const n of ['3', '0', '6', '0']) {
    await d.locator('.pin-key', { hasText: new RegExp(`^${n}$`) }).click()
  }
  await d.getByRole('button', { name: /Login as/i }).click()
  await d.waitForSelector('.app-shell', { timeout: 15000 })
}

const hamDesk = await d.locator('.hamburger').isVisible().catch(() => false)
record('desktop no hamburger', !hamDesk)

const brand = await d.locator('.sidebar-brand-name').textContent()
const sub = await d.locator('.sidebar-brand-sub').textContent()
record(
  'desktop brand',
  Boolean(brand?.includes('JAISAL FW') && sub?.includes('Fashionweave')),
  { brand, sub },
)
record('desktop sidebar visible', await d.locator('.app-sidebar').isVisible())

await d.locator('.side-nav').getByRole('button', { name: 'Dashboard', exact: true }).click()
await d.waitForTimeout(1400)
const kpiCount = await d.locator('.kpi-card').count()
record('KPI cards present', kpiCount >= 6, { kpiCount })
record('summary flow', (await d.locator('.flow-row-h').count()) >= 1)
const tables = await d.locator('.dash-table').count()
record('inward+machines tables', tables >= 2, { tables })
record('dash hero present', (await d.locator('.dash-hero').count()) >= 1)
await shot(d, 'ui-desktop-dashboard')

// Light theme check (not dark black)
const bg = await d.evaluate(() => getComputedStyle(document.body).backgroundColor)
record('light theme body', !bg.includes('20,') && !bg.includes('rgb(20'), { bg })

for (const name of ['Supply & Historical', 'Inventory', 'Security']) {
  await d.locator('.side-nav .side-nav-item', { hasText: name }).first().click()
  await d.waitForTimeout(500)
  record(`open ${name} hub`, (await d.locator('.hub-card, .screen').count()) > 0)
}
await shot(d, 'ui-desktop-orders-hub')

// Program & Dispatch module
await d.locator('.side-nav .side-nav-item', { hasText: 'Production & Dispatch' }).first().click()
await d.waitForTimeout(700)
record('program dispatch form', (await d.locator('.pd-hub, .pd-workflow, .pd-kpi, .screen').count()) > 0)
await shot(d, 'ui-desktop-program')

await desk.close()
await browser.close()

const failed = results.filter((r) => !r.pass)
console.log('\n=== SUMMARY ===')
console.log(`passed=${results.length - failed.length} failed=${failed.length}`)
process.exit(failed.length ? 2 : 0)
