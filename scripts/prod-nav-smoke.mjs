import { chromium } from 'playwright-core'
import fs from 'fs'

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

// MOBILE
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})
const m = await mobile.newPage()
m.on('console', (msg) => console.log('MLOG', msg.type(), msg.text()))
m.on('pageerror', (err) => console.log('MERR', err.message))
await m.goto('https://jaisal-fw-lite.netlify.app', { waitUntil: 'networkidle', timeout: 60000 })
await m.waitForTimeout(1500)
await shot(m, 'prod-mobile-login')

await m.waitForSelector('.chip', { timeout: 15000 })
const chips = await m.locator('.chip').allTextContents()
record('mobile role chips', chips.includes('CEO'), { chips })

for (const d of ['1', '2', '3', '4']) {
  await m.getByRole('button', { name: d, exact: true }).click()
}
await m.waitForTimeout(300)
const loginBtn = m.getByRole('button', { name: /Login as/i })
const disabled = await loginBtn.isDisabled()
record('login enabled after PIN', !disabled, { disabled })

await loginBtn.click()
try {
  await m.waitForSelector('.app-shell, .hamburger, .app-sidebar', { timeout: 20000 })
  record('mobile login success', true)
} catch {
  const err = await m.locator('.form-error').textContent().catch(() => null)
  record('mobile login success', false, { err })
  await shot(m, 'prod-mobile-login-fail')
  console.log(JSON.stringify(results, null, 2))
  await browser.close()
  process.exit(1)
}

await shot(m, 'prod-mobile-after-login')

const ham = m.locator('.hamburger')
record('hamburger visible', await ham.isVisible())
await ham.click()
await m.waitForTimeout(400)
record('drawer opens', (await m.locator('.app-shell.drawer-is-open').count()) === 1)
await shot(m, 'prod-mobile-drawer')

const navText = await m.locator('.side-nav').innerText()
const need = [
  'Dashboard',
  'Program & Dispatch',
  'Inventory',
  'Orders',
  'Reports',
  'Maintenance',
  'Masters',
  'Security',
  'Settings',
]
const missing = need.filter((n) => !navText.includes(n))
record('nav modules present', missing.length === 0, { missing })

await m.locator('.side-nav').getByRole('button', { name: 'Program & Dispatch', exact: true }).click()
await m.waitForTimeout(500)
record('drawer closes on nav', (await m.locator('.app-shell.drawer-is-open').count()) === 0)
await shot(m, 'prod-mobile-attendance')

await mobile.close()

// DESKTOP
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const d = await desk.newPage()
d.on('console', (msg) => console.log('DLOG', msg.type(), msg.text()))
await d.goto('https://jaisal-fw-lite.netlify.app', { waitUntil: 'networkidle', timeout: 60000 })
await d.waitForSelector('.chip', { timeout: 15000 })
for (const n of ['1', '2', '3', '4']) {
  await d.getByRole('button', { name: n, exact: true }).click()
}
await d.getByRole('button', { name: /Login as/i }).click()
await d.waitForSelector('.app-shell', { timeout: 20000 })
await d.waitForTimeout(800)

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
await d.waitForTimeout(1200)
const kpiCount = await d.locator('.kpi-card').count()
record('6 KPI cards', kpiCount === 6, { kpiCount })
record('summary flow', (await d.locator('.flow-row-h').count()) >= 1)
const tables = await d.locator('.dash-table').count()
record('inward+machines tables', tables >= 2, { tables })
await shot(d, 'prod-desktop-dashboard')

for (const name of ['Program & Dispatch', 'Orders', 'Inventory']) {
  await d.locator('.side-nav').getByRole('button', { name, exact: true }).click()
  await d.waitForTimeout(600)
  record(`open ${name}`, (await d.locator('.screen, .app-main, .hub-card, .pd-hub').count()) > 0)
}
await shot(d, 'prod-desktop-design')

await desk.close()
await browser.close()

const failed = results.filter((r) => !r.pass)
console.log('\n=== SUMMARY ===')
console.log(`passed=${results.length - failed.length} failed=${failed.length}`)
process.exit(failed.length ? 2 : 0)
