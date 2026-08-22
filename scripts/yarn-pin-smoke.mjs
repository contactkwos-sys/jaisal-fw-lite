/**
 * Smoke: Yarn Stock + PIN Management (CEO PIN 3060)
 */
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'
const PIN = process.env.SMOKE_PIN || '3060'
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

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(600)
  const ceoBtn = page.getByRole('button', { name: /^CEO$/i }).first()
  if (await ceoBtn.count()) await ceoBtn.click()
  for (const d of PIN.split('')) {
    const key = page.getByRole('button', { name: d, exact: true }).first()
    if (await key.count()) await key.click()
    else await page.keyboard.type(d)
  }
  const loginBtn = page.getByRole('button', { name: /login|sign in|enter|unlock/i }).first()
  if (await loginBtn.count()) await loginBtn.click()
  await page.waitForSelector('.app-shell', { timeout: 15000 })
  record('login', true)
  await shot(page, 'yarn-01-after-login')

  await page.getByRole('button', { name: /^Inventory$/i }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Yarn Stock/i }).first().click({ force: true })
  await page.waitForSelector('.yarn-kpi', { timeout: 10000 })
  record('yarn_kpi_cards', (await page.locator('.yarn-kpi').count()) >= 6)
  record('yarn_table', (await page.locator('.yarn-table').count()) > 0)
  await shot(page, 'yarn-02-list')

  // Prefer Red blue row if present
  const red = page.getByRole('button', { name: /Red blue/i }).first()
  if (await red.count()) await red.click()
  else await page.locator('.yarn-table tbody tr').nth(1).click()
  await page.waitForSelector('.yarn-detail-page', { timeout: 8000 })
  record('yarn_detail', true)
  record('yarn_detail_tabs', (await page.locator('.yarn-tabs button').count()) >= 6)
  await shot(page, 'yarn-03-detail')

  await page.getByRole('button', { name: /^Edit$/i }).first().click()
  await page.waitForSelector('.yarn-form-section', { timeout: 8000 })
  const sections = await page.locator('.yarn-form-section h2').allTextContents()
  record('yarn_edit_form_sections', sections.length >= 4, { sections })
  await shot(page, 'yarn-04-edit-form')
  await page.getByRole('button', { name: /^Cancel$/i }).first().click()
  await page.waitForTimeout(400)
  if (await page.getByRole('button', { name: /^Back$/i }).count()) {
    await page.getByRole('button', { name: /^Back$/i }).first().click()
  }
  await page.waitForSelector('.yarn-screen', { timeout: 8000 })

  await page.getByRole('button', { name: /\+?\s*Add Yarn/i }).first().click()
  await page.waitForSelector('.yarn-form-section', { timeout: 8000 })
  const addSections = await page.locator('.yarn-form-section h2').allTextContents()
  record('yarn_add_one_page', addSections.length >= 4, { addSections })
  await shot(page, 'yarn-05-add-form')
  await page.getByRole('button', { name: /^Cancel$/i }).first().click()
  await page.waitForSelector('.yarn-screen', { timeout: 8000 })

  await page.getByRole('button', { name: /^Security$/i }).first().click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /PIN Management/i }).first().click()
  await page.waitForSelector('.pin-table', { timeout: 10000 })
  await page.waitForFunction(() => document.querySelectorAll('.pin-table tbody tr').length >= 5, null, { timeout: 20000 })
  const pinRows = await page.locator('.pin-table tbody tr').count()
  record('pin_table_all_roles', pinRows >= 7, { pinRows })
  record('pin_confirm_fields', (await page.locator('.pin-table input.num').count()) >= 2)
  record('pin_auto_generate_btn', (await page.getByRole('button', { name: /Auto-Generate All PINs/i }).count()) > 0)
  await shot(page, 'yarn-06-pin-mgmt')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const ham = page.locator('.hamburger')
  if (await ham.isVisible()) {
    await ham.click()
    await page.waitForTimeout(250)
  }
  await page.getByRole('button', { name: /^Inventory$/i }).first().click()
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: /Yarn Stock/i }).first().click({ force: true })
  await page.waitForTimeout(1000)
  // close drawer if open
  if (await page.locator('.drawer-backdrop').isVisible().catch(() => false)) {
    await page.locator('.drawer-backdrop').click({ force: true }).catch(() => {})
  }
  const cardsVisible = await page.locator('.yarn-mobile-card').count()
  record('mobile_yarn_cards', cardsVisible > 0, { cardsVisible })
  await shot(page, 'yarn-07-mobile')
} catch (e) {
  record('fatal', false, { error: String(e) })
  try { await shot(page, 'yarn-fatal') } catch {}
}

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log('\nSUMMARY', JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2))
process.exit(failed.length ? 1 : 0)
