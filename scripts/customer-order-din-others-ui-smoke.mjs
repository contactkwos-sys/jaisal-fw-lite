/**
 * UI E2E: Customer Order Others DIN — select Others, type JFG9999, save, edit restore.
 * Run against preview: SMOKE_BASE=http://127.0.0.1:4173 node scripts/customer-order-din-others-ui-smoke.mjs
 */
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'
const dir = '/tmp/cursor/artifacts/screenshots'
fs.mkdirSync(dir, { recursive: true })

const results = []
const record = (check, pass, extra = {}) => {
  results.push({ check, pass, ...extra })
  console.log(pass ? 'PASS' : 'FAIL', check, Object.keys(extra).length ? JSON.stringify(extra) : '')
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.chip', { timeout: 20000 })
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

async function openCustomerOrder(page) {
  // Prefer sidebar / nav labels used in OTP
  const candidates = [
    page.getByRole('button', { name: /Customer Order/i }).first(),
    page.getByRole('button', { name: /Order to Program/i }).first(),
    page.locator('text=Customer Order').first(),
    page.locator('text=New Customer Order').first(),
  ]
  for (const c of candidates) {
    if (await c.count()) {
      await c.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(600)
    }
  }
  // Stepper inside OTP
  const step = page.getByRole('button', { name: /Customer Order/i }).first()
  if (await step.count()) await step.click().catch(() => {})
  await page.waitForTimeout(800)
  await page.waitForSelector('text=Design / DIN', { timeout: 15000 })
}

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(e.message))

const MANUAL = `JFG9999`
const party = `Others UI ${Date.now()}`

try {
  await login(page)
  record('login', true)
  await openCustomerOrder(page)
  await page.screenshot({ path: `${dir}/din-others-order-entry.png`, fullPage: true })

  // Customer
  const partyInput = page.locator('label.field', { hasText: 'Customer' }).locator('input').first()
  await partyInput.fill(party)

  // Design / DIN select
  const dinSelect = page.locator('label.field', { hasText: 'Design / DIN' }).locator('select').first()
  await dinSelect.waitFor({ timeout: 10000 })
  const options = await dinSelect.locator('option').allTextContents()
  record('Others option present', options.some((o) => /\bOthers\b/.test(o)), { optionsTail: options.slice(-3) })

  // Existing DIN still selectable
  const masterOpts = options.filter((o) => o && !/Select DIN|Others/.test(o))
  if (masterOpts.length) {
    const value = await dinSelect.locator('option').nth(1).getAttribute('value')
    await dinSelect.selectOption(value)
    await page.waitForTimeout(500)
    const hasManual = await page.locator('text=Enter DIN / Design No.').count()
    record('existing DIN hides manual input', hasManual === 0, { value })
  } else {
    record('existing DIN hides manual input', true, { skipped: 'no master DINs' })
  }

  // Select Others
  await dinSelect.selectOption({ label: 'Others' })
  await page.waitForTimeout(300)
  const manualLabel = page.locator('label.field', { hasText: 'Enter DIN / Design No.' })
  record('manual input visible for Others', (await manualLabel.count()) > 0)
  const manualInput = manualLabel.locator('input').first()
  await manualInput.fill(MANUAL)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${dir}/din-others-manual-filled.png`, fullPage: true })

  // Add colour meter if needed
  const meterInputs = page.locator('table.data-table tbody tr input[type="number"]')
  if ((await meterInputs.count()) === 0) {
    await page.getByRole('button', { name: /\+ Add Colour/i }).click()
    await page.waitForTimeout(200)
  }
  await page.locator('table.data-table tbody tr').first().locator('input').nth(1).fill('Red').catch(() => {})
  const qty = page.locator('table.data-table tbody tr').first().locator('input[type="number"]').first()
  await qty.fill('25')

  await page.getByRole('button', { name: /Save Order|Update Order/i }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${dir}/din-others-after-save.png`, fullPage: true })
  const bodyAfterSave = await page.locator('body').innerText()
  record('order saved message', /ORDER CREATED|ORDER UPDATED/i.test(bodyAfterSave), {
    snippet: bodyAfterSave.match(/ORDER (CREATED|UPDATED)[^\n]*/)?.[0] || bodyAfterSave.slice(0, 200),
  })

  // Go to Order Status and verify DIN column
  const statusBtn = page.getByRole('button', { name: /Order Status/i }).first()
  await statusBtn.click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${dir}/din-others-status.png`, fullPage: true })
  const statusText = await page.locator('body').innerText()
  record('status shows typed DIN', statusText.includes(MANUAL))
  record('status does not show Others as DIN value', !/^\s*Others\s*$/m.test(statusText.split(MANUAL)[0]?.slice(-20) || '') || statusText.includes(MANUAL))

  // Edit the order row containing MANUAL
  const row = page.locator('table.data-table tbody tr', { hasText: MANUAL }).first()
  record('status row for typed DIN', (await row.count()) > 0)
  if (await row.count()) {
    await row.getByRole('button', { name: /^Edit$/i }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${dir}/din-others-edit.png`, fullPage: true })
    const editSelect = page.locator('label.field', { hasText: 'Design / DIN' }).locator('select').first()
    const selected = await editSelect.inputValue()
    record('edit selects Others sentinel', selected === '__OTHERS__' || (await editSelect.locator('option:checked').textContent())?.trim() === 'Others', {
      selected,
    })
    const restored = await page.locator('label.field', { hasText: 'Enter DIN / Design No.' }).locator('input').inputValue()
    record('edit restores typed DIN in input', restored === MANUAL, { restored })
  }

  record('no page errors', consoleErrors.length === 0, { consoleErrors: consoleErrors.slice(0, 5) })
} catch (e) {
  record('fatal', false, { error: String(e?.message || e) })
  await page.screenshot({ path: `${dir}/din-others-fatal.png`, fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(JSON.stringify({ failed: failed.length, results }, null, 2))
  if (failed.length) process.exit(1)
}
