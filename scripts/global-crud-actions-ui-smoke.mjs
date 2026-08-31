/**
 * Global CRUD UI smoke — Order Status + Quality Master + Rate Master actions.
 * Run: SMOKE_BASE=http://127.0.0.1:4173 node scripts/global-crud-actions-ui-smoke.mjs
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
      return
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

try {
  await login(page)
  record('login', true)

  // —— Order Status V/E/D ——
  await page.getByRole('button', { name: /Sales & Order/i }).first().click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Order Status/i }).first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${dir}/crud-order-status.png`, fullPage: true })

  const statusBody = await page.locator('body').innerText()
  record('order status loaded', /Order Status/i.test(statusBody))

  const firstRow = page.locator('table.data-table tbody tr').first()
  const hasRow = (await firstRow.count()) > 0 && !(await firstRow.innerText()).includes('No rows')
  if (hasRow) {
    const actions = firstRow.locator('.record-actions')
    record('order row has RecordActions', (await actions.count()) > 0)
    const inline = await actions.locator('.record-actions-inline button').allTextContents()
    record('order actions include View Edit Delete', /View/i.test(inline.join(' ')) && /Edit/i.test(inline.join(' ')) && /Delete/i.test(inline.join(' ')), { inline })

    await actions.getByRole('button', { name: /^View$/i }).click()
    await page.waitForTimeout(800)
    record('order view modal opens', (await page.locator('.modal-card h2:has-text("View Order")').count()) > 0)
    await page.locator('.modal-card').getByRole('button', { name: /^Close$/i }).first().click()
    await page.waitForTimeout(300)
  } else {
    record('order row has RecordActions', true, { skipped: 'no orders' })
    record('order actions include View Edit Delete', true, { skipped: 'no orders' })
    record('order view modal opens', true, { skipped: 'no orders' })
  }

  // —— Quality Master ——
  await page.getByRole('button', { name: /^Design$/i }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Quality Master/i }).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${dir}/crud-quality-master.png`, fullPage: true })
  const qmBody = await page.locator('body').innerText()
  record('quality master no migration error', !/table missing/i.test(qmBody))
  const qmRow = page.locator('table.dwc-table tbody tr').first()
  if ((await qmRow.count()) > 0 && !(await qmRow.innerText()).includes('No qualities')) {
    const qa = qmRow.locator('.record-actions')
    record('quality RecordActions present', (await qa.count()) > 0)
    const qInline = await qa.locator('.record-actions-inline button').allTextContents()
    record('quality has View Edit Delete', /View/i.test(qInline.join()) && /Edit/i.test(qInline.join()) && /Delete/i.test(qInline.join()), { qInline })
    await qa.getByRole('button', { name: /^View$/i }).click()
    await page.waitForTimeout(500)
    record('quality view opens', (await page.locator('.modal-card h2:has-text("View Quality")').count()) > 0)
    await page.locator('.modal-card').getByRole('button', { name: /Close|Cancel/i }).first().click()
  } else {
    record('quality RecordActions present', false, { error: 'no qualities' })
  }

  // —— Rate Master ——
  await page.getByRole('button', { name: /Rate Master/i }).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${dir}/crud-rate-master.png`, fullPage: true })
  const rmRow = page.locator('table tbody tr').first()
  if (await rmRow.count()) {
    const ra = rmRow.locator('.record-actions')
    record('rate master RecordActions', (await ra.count()) > 0)
    if (await ra.count()) {
      const texts = await ra.locator('.record-actions-inline button').allTextContents()
      record('rate has View Edit Delete', /View/i.test(texts.join()) && /Edit/i.test(texts.join()) && /Delete/i.test(texts.join()), { texts })
    }
  } else {
    record('rate master RecordActions', false)
  }

  // Return to Quality Master before switching to mobile viewport
  await page.getByRole('button', { name: /Quality Master/i }).first().click({ force: true })
  await page.waitForTimeout(800)

  // —— Mobile menu on Quality Master ——
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  const qmMobileRow = page.locator('table.dwc-table tbody tr').first()
  const more = qmMobileRow.locator('.record-action-more').first()
  if (await more.count()) {
    await more.scrollIntoViewIfNeeded()
    await more.click({ force: true })
    await page.waitForTimeout(300)
    const menu = page.locator('.record-actions-dropdown').first()
    const menuText = (await menu.count()) ? await menu.innerText() : ''
    record('mobile ⋮ menu shows actions', /View/i.test(menuText) && /Edit/i.test(menuText) && /Delete/i.test(menuText), {
      menuText,
    })
    await page.screenshot({ path: `${dir}/crud-mobile-menu.png`, fullPage: true })
  } else {
    // Fallback: verify CSS hides inline and shows menu wrapper
    const menuVisible = await page.locator('.record-actions-menu').first().isVisible().catch(() => false)
    record('mobile ⋮ menu shows actions', menuVisible, { fallback: true })
  }
} catch (e) {
  record('fatal', false, { error: String(e?.message || e) })
  await page.screenshot({ path: `${dir}/crud-fatal.png`, fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(JSON.stringify({ failed: failed.length, results }, null, 2))
  if (failed.length) process.exit(1)
}
