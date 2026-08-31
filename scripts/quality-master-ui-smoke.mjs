/**
 * Quality Master UI smoke — table ready, Add form, no migration error.
 * Run: SMOKE_BASE=http://127.0.0.1:4173 node scripts/quality-master-ui-smoke.mjs
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

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

const QUALITY = `150 ROTO B&W UI ${Date.now()}`

try {
  await login(page)
  record('login', true)

  // Open Design module, then Quality Master
  await page.getByRole('button', { name: /^Design$/i }).first().click()
  await page.waitForTimeout(600)
  const qmBtn = page.getByRole('button', { name: /Quality Master/i }).first()
  await qmBtn.click()
  await page.waitForTimeout(1200)
  await page.waitForSelector('h1:has-text("Quality Master")', { timeout: 15000 })
  await page.screenshot({ path: `${dir}/quality-master-home.png`, fullPage: true })

  const body = await page.locator('body').innerText()
  record(
    'no migration missing error',
    !/Quality Master table missing/i.test(body),
    { hasError: /Quality Master table missing/i.test(body) },
  )
  record('table headers present', /Quality Name/i.test(body) && /Warp Recipe/i.test(body) && /Action/i.test(body))

  await page.getByRole('button', { name: /\+ Add Quality/i }).click()
  await page.waitForSelector('text=Add Quality', { timeout: 8000 })
  record('Add Quality form opens', true)

  await page.locator('.modal-card label.field', { hasText: 'Quality Name' }).locator('input').fill(QUALITY)

  // Warp yarn from Rate Master
  const warpYarn = page.locator('.modal-card label.field', { hasText: 'Warp Yarn' }).locator('input').first()
  await warpYarn.fill('150 Roto Black & White')
  await page.waitForTimeout(500)
  const baseDenier = await page
    .locator('.modal-card h3:has-text("WARP RECIPE")')
    .locator('xpath=following-sibling::div[1]//label[contains(.,"Base Denier")]//input')
    .inputValue()
    .catch(async () =>
      page.locator('.modal-card label.field', { hasText: 'Base Denier' }).locator('input').first().inputValue(),
    )
  const costingDenier = await page
    .locator('.modal-card label.field', { hasText: 'Costing Denier' })
    .locator('input')
    .first()
    .inputValue()
  record('warp base denier loaded', baseDenier === '150' || Number(baseDenier) > 0, { baseDenier })
  record(
    'warp costing denier = base+10',
    Number(costingDenier) === Number(baseDenier) + 10,
    { baseDenier, costingDenier },
  )

  // Weft
  const feeder = page.locator('.modal-card label.field', { hasText: 'Feeder No.' }).locator('select').first()
  await feeder.selectOption('1')
  await page.locator('.modal-card label.field', { hasText: /^Colour$/ }).locator('input').first().fill('White')
  const weftYarn = page.locator('.modal-card label.field', { hasText: 'Weft Yarn' }).locator('input').first()
  await weftYarn.fill('300 Tex')
  await page.waitForTimeout(500)
  const weftBase = await page
    .locator('.modal-card label.field', { hasText: 'Base Denier' })
    .locator('input')
    .nth(1)
    .inputValue()
  record('weft base denier loaded', Number(weftBase) === 300 || Number(weftBase) > 0, { weftBase })

  await page.locator('.modal-card label.field', { hasText: /^PIC$/ }).locator('input').first().fill('48')
  await page.getByRole('button', { name: /Save Quality/i }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${dir}/quality-master-after-save.png`, fullPage: true })

  const after = await page.locator('body').innerText()
  record('saved quality appears in table', after.includes(QUALITY))

  // Edit
  const row = page.locator('table.dwc-table tbody tr', { hasText: QUALITY }).first()
  record('row found', (await row.count()) > 0)
  if (await row.count()) {
    await row.getByRole('button', { name: /^Edit$/i }).click()
    await page.waitForTimeout(600)
    const nameVal = await page
      .locator('.modal-card label.field', { hasText: 'Quality Name' })
      .locator('input')
      .inputValue()
    record('edit loads quality name', nameVal === QUALITY, { nameVal })
    const warpLoaded = await page
      .locator('.modal-card label.field', { hasText: 'Warp Yarn' })
      .locator('input')
      .first()
      .inputValue()
    record('edit loads warp recipe', /150 Roto/i.test(warpLoaded), { warpLoaded })
    await page.locator('.modal-card').getByRole('button', { name: /Cancel|Close/i }).first().click()
    await page.waitForTimeout(400)
  }

  // DIN Costing — draft persist + recipe apply
  await page.getByRole('button', { name: /DIN Costing/i }).first().click()
  await page.waitForTimeout(1200)

  const dinInput = page.locator('label.field', { hasText: /Design No/i }).locator('input').first()
  if (!(await dinInput.count())) {
    // try Design No. combobox
  }
  const dinField = page.locator('input[placeholder*="JFG"], input[placeholder*="Design"], label.field:has-text("Design No") input').first()
  await dinField.waitFor({ timeout: 10000 })
  const draftDin = `DRAFT-QM-${Date.now().toString(36).slice(-4).toUpperCase()}`
  await dinField.fill(draftDin)
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: /Quality Master/i }).first().click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /DIN Costing/i }).first().click()
  await page.waitForTimeout(1200)
  const restored = await page
    .locator('input[placeholder*="JFG"], input[placeholder*="Design"], label.field:has-text("Design No") input')
    .first()
    .inputValue()
  record('DIN draft persists across Quality Master nav', restored === draftDin, { restored, draftDin })

  const qInput = page.locator('label.field', { hasText: 'Quality Name' }).locator('input').first()
  await qInput.fill(QUALITY)
  await qInput.blur()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${dir}/quality-master-din-apply.png`, fullPage: true })
  const qVal = await qInput.inputValue()
  record('DIN Costing received quality name', qVal === QUALITY, { qVal })
  const dinBody = await page.locator('body').innerText()
  record(
    'DIN warp/weft seeded from quality',
    /150 Roto|300 Tex|White/i.test(dinBody),
  )
} catch (e) {
  record('fatal', false, { error: String(e?.message || e) })
  await page.screenshot({ path: `${dir}/quality-master-fatal.png`, fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(JSON.stringify({ failed: failed.length, results }, null, 2))
  if (failed.length) process.exit(1)
}
