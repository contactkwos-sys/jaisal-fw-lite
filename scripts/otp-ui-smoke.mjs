import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'
const dir = '/tmp/cursor/artifacts/screenshots'
fs.mkdirSync(dir, { recursive: true })

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

const results = []
const record = (check, pass, extra = {}) => {
  results.push({ check, pass, ...extra })
  console.log(pass ? 'PASS' : 'FAIL', check, JSON.stringify(extra))
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.chip', { timeout: 15000 })
  await page.locator('.chip', { hasText: 'CEO' }).click().catch(() => {})
  for (const pin of ['1234', '3060']) {
    for (const d of pin) {
      await page.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
    }
    await page.getByRole('button', { name: /Login as/i }).click()
    try {
      await page.waitForSelector('.app-shell, .app-sidebar', { timeout: 12000 })
      return pin
    } catch {
      /* retry */
    }
  }
  throw new Error('login failed')
}

async function openModule(page, label) {
  // Desktop sidebar
  const side = page.locator('.app-sidebar, aside, nav').first()
  const item = page.getByRole('button', { name: new RegExp(label, 'i') }).first()
  if (await item.count()) {
    await item.click()
    return
  }
  // Try text click
  await page.locator(`text=${label}`).first().click({ timeout: 5000 })
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(e.message))
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})

try {
  const pin = await login(page)
  record('login', true, { pin })
  await page.screenshot({ path: `${dir}/otp-desktop-home.png`, fullPage: true })

  // Open Design to Order
  await openModule(page, 'Design to Order')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${dir}/otp-dto-hub.png`, fullPage: true })
  const hubText = await page.locator('body').innerText()
  record('dto hub sections', /Section A|Design Module/i.test(hubText) && /Sales|Order to Program/i.test(hubText), {
    hasSectionA: /Section A|Design Module/i.test(hubText),
    hasSales: /Sales|Order to Program/i.test(hubText),
  })

  // Click Order to Program
  const otpBtn = page.getByRole('button', { name: /Order to Program/i }).first()
  await otpBtn.click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${dir}/otp-order-entry.png`, fullPage: true })
  const otpText = await page.locator('body').innerText()
  record('otp title', /Order to Program/i.test(otpText))
  record('otp stepper', /Order Entry/i.test(otpText) && /Program to Machine/i.test(otpText) && /Reports/i.test(otpText))
  record('matching-wise section', /Matching-wise Order/i.test(otpText))
  record('no header colour field', !/Main Colour[\s\S]{0,40}Order Date/i.test(otpText))

  // Step to Program
  await page.getByRole('button', { name: /Program to Machine/i }).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${dir}/otp-program.png`, fullPage: true })
  const progText = await page.locator('body').innerText()
  record('program machines', /Machine 1/i.test(progText) && /Machine 6/i.test(progText))
  record('matching recipe', /Matching Recipe/i.test(progText))
  record('job card preview', /Job Card Preview/i.test(progText))

  // Reports
  await page.getByRole('button', { name: /Reports & Status/i }).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${dir}/otp-reports.png`, fullPage: true })
  const repText = await page.locator('body').innerText()
  record('reports kinds', /Order Summary/i.test(repText) && /Order to Dispatch Summary/i.test(repText))

  // Mobile viewport
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: /Order Entry/i }).first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${dir}/otp-mobile-order.png`, fullPage: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)
  record('mobile no page overflow', !overflow, { scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) })

  const realErrors = consoleErrors.filter(
    (e) => !/favicon|ResizeObserver|Failed to load resource|net::ERR/i.test(e),
  )
  record('no page errors', realErrors.length === 0, { errors: realErrors.slice(0, 5), networkNoise: consoleErrors.length })
} catch (e) {
  record('fatal', false, { error: String(e) })
  await page.screenshot({ path: `${dir}/otp-fail.png`, fullPage: true }).catch(() => {})
}

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.pass)
await browser.close()
process.exit(failed.length ? 1 : 0)
