/**
 * Browser smoke: Design Wise Costing DIN visibility + save/edit/delete.
 * Run against local preview or production:
 *   BASE_URL=http://127.0.0.1:4173 node scripts/design-wise-costing-visibility-smoke.mjs
 */
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'
const TEST_DIN = `JFG-SMOKE-${Date.now().toString().slice(-6)}`
const dir = '/opt/cursor/artifacts/screenshots'
fs.mkdirSync(dir, { recursive: true })

const results = []
function record(check, pass, extra = {}) {
  results.push({ check, pass, ...extra })
  console.log(pass ? 'PASS' : 'FAIL', check, Object.keys(extra).length ? JSON.stringify(extra) : '')
}

async function shot(page, name) {
  const p = `${dir}/${name}.png`
  await page.screenshot({ path: p, fullPage: true })
  console.log('shot', p)
  return p
}

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const consoleErrors = []
page.on('pageerror', (err) => consoleErrors.push(err.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})

try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.chip', { timeout: 20000 })
  record('app loads', true, { base: BASE })

  const ceo = page.locator('.chip', { hasText: 'CEO' }).first()
  await ceo.click()
  for (const d of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: d, exact: true }).click()
  }
  await page.getByRole('button', { name: /Login as CEO/i }).click()
  await page.waitForSelector('.app-shell, .app-sidebar', { timeout: 25000 })
  record('CEO login', true)
  await shot(page, 'dwc-01-after-login')

  // Open Reports hub then Design Wise Costing
  const reportsNav = page.locator('.side-nav button, .side-nav a, .nav-item, .module-btn').filter({ hasText: /^Reports$/i }).first()
  if (await reportsNav.count()) {
    await reportsNav.click()
    await page.waitForTimeout(500)
  } else {
    // fallback: click any sidebar item containing Reports
    await page.getByText('Reports', { exact: true }).first().click()
    await page.waitForTimeout(500)
  }

  // Module hub card or direct link
  const dwcCard = page.getByRole('button', { name: /Design Wise Costing/i }).first()
  if (await dwcCard.count()) {
    await dwcCard.click()
  } else {
    await page.getByText('Design Wise Costing', { exact: true }).first().click()
  }
  await page.waitForSelector('.dwc-screen', { timeout: 15000 })
  record('opened Design Wise Costing', true)
  await shot(page, 'dwc-02-screen')

  const heading = await page.locator('.dwc-screen h1').first().textContent()
  record('light UI heading', /Design Wise Costing/i.test(heading || ''), { heading })

  // Saved list must show existing DIN
  await page.locator('.dwc-history').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  const historyText = await page.locator('.dwc-history').innerText()
  record('Saved Design Costings section', /Saved Design Costings/i.test(historyText))
  record('filters present', /Search DIN/i.test(historyText) && /Clear Filters/i.test(historyText))
  record('GST column present', /GST ₹/i.test(historyText) || /GST %/i.test(historyText))
  const hasJfg = /Jfg1558/i.test(historyText)
  record('existing DIN Jfg1558 visible', hasJfg, { snippet: historyText.slice(0, 400) })
  await shot(page, 'dwc-03-saved-list')

  if (hasJfg) {
    await page.locator('.dwc-din-link', { hasText: /Jfg1558/i }).first().click()
    await page.waitForTimeout(1200)
    const dinValue = await page.locator('.dwc-details-row input').first().inputValue()
    record('click DIN loads form', /Jfg1558/i.test(dinValue), { dinValue })
    const buildup = await page.locator('.dwc-buildup').innerText()
    record('GST Amount separate in buildup', /GST Amount/i.test(buildup))
    record('Final Cost present', /Final Design Cost/i.test(buildup) || /Final/i.test(buildup))
    const picBadge = await page.locator('.dwc-pic-total').innerText().catch(() => '')
    record('Total PIC shown', /111|PIC/i.test(picBadge + buildup), { picBadge })
    await shot(page, 'dwc-04-loaded-jfg1558')
  }

  // New costing — clear identity then overwrite rows (avoid readonly weight/amount inputs)
  await page.getByRole('button', { name: /Save As New/i }).click().catch(() => {})
  await page.waitForTimeout(200)

  const dinInput = page.locator('.dwc-details-row input').nth(0)
  await dinInput.fill(TEST_DIN)
  await page.locator('.dwc-details-row input').nth(2).fill('Audit Test Quality')
  await page.locator('.dwc-details-row input').nth(3).fill('110')

  async function fillEditable(row, values) {
    const inputs = row.locator('input:not([readonly])')
    const count = await inputs.count()
    for (let i = 0; i < values.length && i < count; i++) {
      await inputs.nth(i).fill(String(values[i]))
    }
  }

  // Warp: yarn, denier, tar, length, rate
  const warpRow = page.locator('.dwc-panel', { hasText: 'Warp Details' }).locator('tbody tr').first()
  await fillEditable(warpRow, ['150 ROTO', '155', '8900', '110', '137.50'])

  // Weft — three rows of PIC 37 = 111 (name, denier, pic, width, length, rate)
  async function fillWeft(idx, values) {
    const panels = page.locator('.dwc-panel', { hasText: 'Weft Details' })
    while ((await panels.locator('tbody tr').count()) <= idx) {
      await panels.getByRole('button', { name: /Add Weft/i }).click()
      await page.waitForTimeout(150)
    }
    await fillEditable(panels.locator('tbody tr').nth(idx), values)
  }
  await fillWeft(0, ['150 Lichi', '160', '37', '52', '110', '205'])
  await fillWeft(1, ['Anmol Jari', '120', '37', '52', '110', '350'])
  await fillWeft(2, ['150 Lichi', '160', '37', '52', '110', '205'])

  await page.getByRole('spinbutton', { name: /PIC Conversion Rate/i }).fill('0.45')
  await page.getByRole('spinbutton', { name: /^MU %$/i }).fill('5')
  await page.getByRole('spinbutton', { name: /^GST %$/i }).fill('5')

  await page.waitForTimeout(300)
  const picTotal = await page.locator('.dwc-pic-total').innerText()
  record('computed Total PIC 111', /111/.test(picTotal), { picTotal })

  const gstAmount = await page.getByRole('textbox', { name: /GST Amount/i }).inputValue()
  const finalCost = await page.locator('.dwc-final strong').innerText()
  record('GST amount computed', Number(gstAmount) > 0, { gstAmount })
  record('Final cost computed', /₹/.test(finalCost), { finalCost })
  await shot(page, 'dwc-05-before-save')

  // Ensure new record (not update of Jfg1558)
  await page.getByRole('button', { name: /Save As New/i }).click()
  await page.waitForTimeout(200)
  await dinInput.fill(TEST_DIN)

  await page.getByRole('button', { name: /Save Costing to DIN/i }).click()
  await page.waitForTimeout(2500)
  const flash = ((await page.locator('.form-ok, .form-error').allTextContents()) || []).join(' | ')
  const saveOk = /saved|Costing saved/i.test(flash) && !/failed|does not exist/i.test(flash)
  record('Save Costing to DIN', saveOk, { flash })
  await shot(page, 'dwc-06-after-save')

  await page.locator('.dwc-history').getByRole('button', { name: /Refresh/i }).click()
  await page.waitForTimeout(1000)
  const afterSaveList = await page.locator('.dwc-history').innerText()
  record('new DIN appears in list', afterSaveList.includes(TEST_DIN), { TEST_DIN })

  // Edit
  await page.locator('.dwc-din-link', { hasText: TEST_DIN }).first().click()
  await page.waitForTimeout(1200)
  const quality = page.locator('.dwc-details-row input').nth(2)
  await quality.fill('Audit Test Quality edited')
  await page.getByRole('button', { name: /Save Costing to DIN/i }).click()
  await page.waitForFunction(
    () => {
      const nodes = [...document.querySelectorAll('.form-ok, .form-error')]
      return nodes.some((n) => /saved|failed|error/i.test(n.textContent || ''))
    },
    { timeout: 10000 },
  ).catch(() => {})
  const editFlash = ((await page.locator('.form-ok, .form-error').allTextContents()) || []).join(' | ')
  const editOk = /Costing saved|saved to DIN/i.test(editFlash)
  record('edit + re-save', editOk, { editFlash })
  await page.locator('.dwc-history').getByRole('button', { name: /Refresh/i }).click()
  await page.waitForTimeout(800)
  const editedList = await page.locator('.dwc-history').innerText()
  record('edited quality in list', /edited/i.test(editedList), {
    hasDin: editedList.includes(TEST_DIN),
  })

  // Delete
  page.once('dialog', async (d) => {
    await d.accept()
  })
  await page.locator('.dwc-history tr', { hasText: TEST_DIN }).getByRole('button', { name: /^Delete$/i }).click()
  await page.waitForTimeout(1500)
  const afterDel = await page.locator('.dwc-history').innerText()
  record('delete removes DIN', !afterDel.includes(TEST_DIN))
  await shot(page, 'dwc-07-after-delete')

  const schemaErr = consoleErrors.some((e) => /design_costing|does not exist|column/i.test(e))
  record('no schema console errors', !schemaErr, { consoleErrors: consoleErrors.slice(0, 8) })
} catch (e) {
  record('uncaught', false, { error: e instanceof Error ? e.message : String(e) })
  await shot(page, 'dwc-fatal').catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log('\n=== SUMMARY ===')
console.log(JSON.stringify(results, null, 2))
console.log(failed.length ? `${failed.length} FAILED` : 'ALL PASSED')
process.exit(failed.length ? 1 : 0)
