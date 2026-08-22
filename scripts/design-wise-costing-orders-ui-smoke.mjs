/**
 * UI smoke: Orders module Design Wise Costing visibility.
 * BASE_URL=http://127.0.0.1:4173 node scripts/design-wise-costing-orders-ui-smoke.mjs
 */
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'
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
  return p
}

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.chip', { timeout: 20000 })
  await page.locator('.chip', { hasText: 'CEO' }).first().click()
  for (const d of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: d, exact: true }).click()
  }
  await page.getByRole('button', { name: /Login as CEO/i }).click()
  await page.waitForSelector('.app-shell, .app-sidebar', { timeout: 25000 })
  record('CEO login', true)
  await shot(page, 'dwc-orders-01-login')

  // Orders hub
  const ordersNav = page
    .locator('.side-nav button, .side-nav a, .nav-item, .module-btn, button')
    .filter({ hasText: /^Orders/i })
    .first()
  await ordersNav.click()
  await page.waitForTimeout(600)
  record('opened Orders hub', true)
  await shot(page, 'dwc-orders-02-hub')

  const dwcCard = page.getByRole('button', { name: /Design Wise Costing/i }).first()
  record('Design Wise Costing card in Orders', (await dwcCard.count()) > 0)
  await dwcCard.click()
  await page.waitForSelector('.dwc-screen', { timeout: 15000 })
  record('opened DWC from Orders', true)
  await shot(page, 'dwc-orders-03-dwc')

  await page.locator('.dwc-history').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  const historyText = await page.locator('.dwc-history').innerText()
  record('Saved Design Costings section', /Saved Design Costings/i.test(historyText))
  record('Jfg1558 visible in list', /Jfg1558/i.test(historyText), {
    snippet: historyText.slice(0, 500),
  })
  await shot(page, 'dwc-orders-04-list')

  // Design Master recent costings
  await ordersNav.click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Design & Job Card/i }).first().click()
  await page.waitForTimeout(1200)
  const body = await page.locator('.design-register-screen').innerText()
  record('Design Master shows Saved Design Costings', /Saved Design Costings/i.test(body))
  record('Design Master shows Jfg1558 costing', /Jfg1558/i.test(body), {
    snippet: body.slice(0, 600),
  })
  await shot(page, 'dwc-orders-05-design-master')
} catch (e) {
  record('uncaught', false, { error: e instanceof Error ? e.message : String(e) })
  await shot(page, 'dwc-orders-fatal').catch(() => {})
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log('\n=== SUMMARY ===')
console.log(JSON.stringify(results, null, 2))
console.log(failed.length ? `${failed.length} FAILED` : 'ALL PASSED')
process.exit(failed.length ? 1 : 0)
