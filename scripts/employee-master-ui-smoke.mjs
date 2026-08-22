/**
 * Employee Master UI smoke — iPad + desktop viewports.
 * Run: SMOKE_BASE=http://127.0.0.1:4173 node scripts/employee-master-ui-smoke.mjs
 */
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'
const OUT = '/opt/cursor/artifacts/screenshots'
fs.mkdirSync(OUT, { recursive: true })

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

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.chip', { timeout: 20000 })
  const ceo = page.locator('.chip', { hasText: /^CEO$/i }).first()
  if (await ceo.count()) await ceo.click()
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

async function clickNavText(page, selector, textRe) {
  return page.evaluate(
    ({ selector, source }) => {
      const re = new RegExp(source, 'i')
      const el = Array.from(document.querySelectorAll(selector)).find((n) => re.test(n.textContent || ''))
      if (!el) return false
      el.scrollIntoView({ block: 'nearest' })
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return true
    },
    { selector, source: textRe.source },
  )
}

async function openEmployeeMaster(page) {
  const ham = page.locator('.hamburger')
  if (await ham.isVisible().catch(() => false)) {
    if (!(await page.locator('.app-shell.drawer-is-open').count())) {
      await ham.click()
      await page.waitForTimeout(400)
    }
  }

  const hrOk = await clickNavText(page, '.side-nav-item', /HR\s*&\s*Payroll/)
  if (!hrOk) throw new Error('HR & Payroll nav not found')
  await page.waitForTimeout(500)

  const empOk = await clickNavText(page, '.side-sub-item', /Employee Master/)
  if (!empOk) {
    const tabOk = await clickNavText(page, '.hr-subnav button', /^Employees$/)
    if (!tabOk) throw new Error('Employee Master link not found')
  }
  await page.waitForSelector('.hr-emp-master', { timeout: 20000 })
}

async function runViewport(name, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (err) => console.log('PAGEERR', name, err.message))
  await login(page)
  await openEmployeeMaster(page)
  await page.waitForTimeout(700)

  const bodyOverflow = await page.evaluate(() => {
    const el = document.documentElement
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
  })
  record(`${name} no page-level overflow`, bodyOverflow.scrollWidth <= bodyOverflow.clientWidth + 2, bodyOverflow)

  const wrap = page.locator('.hr-emp-table-wrap')
  record(`${name} table visible`, await wrap.isVisible())

  const tableBox = await wrap.boundingBox()
  record(`${name} table uses width`, !!tableBox && tableBox.width > viewport.width * 0.5, {
    width: tableBox?.width,
    viewport: viewport.width,
  })

  const thFont = await page.locator('.hr-emp-table th').first().evaluate((el) => {
    const s = getComputedStyle(el)
    return { size: parseFloat(s.fontSize), weight: s.fontWeight }
  })
  record(`${name} header readable`, thFont.size >= 14 && Number(thFont.weight) >= 700, thFont)

  await page.screenshot({ path: `${OUT}/emp-master-${name}.png`, fullPage: true })
  console.log('shot', `${OUT}/emp-master-${name}.png`)

  await page.getByRole('button', { name: /^Add Employee$/i }).click()
  await page.waitForSelector('.hr-emp-form', { timeout: 8000 })
  record(`${name} add form open`, await page.locator('.hr-emp-form').isVisible())

  const desig = page.locator('.hr-emp-form label').filter({ hasText: /^Designation/ }).locator('select')
  const desigOpts = await desig.locator('option').allTextContents()
  record(`${name} designation has Operator`, desigOpts.some((o) => /Operator/i.test(o)), {
    sample: desigOpts.slice(0, 10),
  })
  record(`${name} designation has Other`, desigOpts.some((o) => /^Other$/i.test(o.trim())))

  await desig.selectOption({ label: 'Other' })
  await page.waitForTimeout(200)
  record(`${name} Other shows custom designation`, await page.getByText(/Enter Designation/i).isVisible())

  const deptSelect = page.locator('.hr-emp-form label').filter({ hasText: /^Department \*/ }).locator('select')
  const deptOpts = await deptSelect.locator('option').allTextContents()
  record(`${name} department has Weaving`, deptOpts.some((o) => /Weaving/i.test(o)))

  const shiftSelect = page.locator('.hr-emp-form label').filter({ hasText: /^Shift \*/ }).locator('select')
  const shiftOpts = await shiftSelect.locator('option').allTextContents()
  record(`${name} shift dropdown`, shiftOpts.some((o) => /Day/i.test(o)) && shiftOpts.some((o) => /Other/i.test(o)))

  await page.screenshot({ path: `${OUT}/emp-master-${name}-add.png`, fullPage: true })
  console.log('shot', `${OUT}/emp-master-${name}-add.png`)

  await ctx.close()
}

try {
  await runViewport('desktop', { width: 1440, height: 900 })
  await runViewport('ipad-landscape', { width: 1024, height: 768 })
  await runViewport('ipad-portrait', { width: 768, height: 1024 })
} catch (e) {
  console.error(e)
  record('suite', false, { error: e instanceof Error ? e.message : String(e) })
}

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify({ failed: failed.length, results }, null, 2))
process.exit(failed.length ? 1 : 0)
