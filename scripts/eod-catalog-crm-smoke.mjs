/**
 * EOD smoke: Design Catalog theme + bulk, CRM, WhatsApp CRM, KMOS sync.
 * Usage: node scripts/eod-catalog-crm-smoke.mjs
 */
import { chromium } from 'playwright-core'
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173'
const ANON = 'sb_publishable_OyI39Syi9VXJg34uLLuozA_yjFBSBeE'
const SUPA = 'https://doitrzsyvcipugmrzykx.supabase.co'
const ART = '/opt/cursor/artifacts'
mkdirSync(ART, { recursive: true })

const results = []
function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`PASS  ${name}${detail ? ' — ' + detail : ''}`)
}
function fail(name, detail = '') {
  results.push({ name, ok: false, detail })
  console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`)
}

function pngBuffer(r, g, b, size = 80) {
  function crc32(buf) {
    let c = ~0
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i]
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    }
    return ~c >>> 0
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([len, typeBuf, data, crcBuf])
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      row[1 + x * 3] = r
      row[2 + x * 3] = g
      row[3 + x * 3] = b
    }
    rows.push(row)
  }
  const idat = deflateSync(Buffer.concat(rows))
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

async function pinLogin() {
  const res = await fetch(`${SUPA}/functions/v1/pin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ role_name: 'CEO', pin: '1234' }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error('pin-login failed: ' + JSON.stringify(json))
  return json
}

async function main() {
  const auth = await pinLogin()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(String(err)))

  // Inject supabase session before app boots
  await page.addInitScript(
    ({ access_token, refresh_token, expires_in, expires_at, user }) => {
      const storageKey = 'sb-doitrzsyvcipugmrzykx-auth-token'
      const session = {
        access_token,
        refresh_token: refresh_token || access_token,
        expires_in: expires_in || 3600,
        expires_at: expires_at || Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: user || {
          id: '11111111-1111-1111-1111-111111111111',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'ceo@jaisal.local',
          user_metadata: { role_name: 'CEO', full_name: 'CEO' },
          app_metadata: { provider: 'email' },
        },
      }
      localStorage.setItem(storageKey, JSON.stringify(session))
    },
    auth,
  )

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // If still on login, fall back to UI PIN
  const onLogin =
    (await page.getByRole('button', { name: /Login as/i }).count()) > 0 ||
    (await page.locator('.pin-pad').count()) > 0
  if (onLogin) {
    const ceo = page.getByRole('button', { name: /^CEO$/i }).first()
    if (await ceo.count()) await ceo.click()
    for (const d of ['1', '2', '3', '4']) {
      await page.locator('.pin-grid button', { hasText: new RegExp(`^${d}$`) }).click()
      await page.waitForTimeout(80)
    }
    await page.getByRole('button', { name: /Login as CEO/i }).click()
    await page.waitForTimeout(1500)
  }

  // Nav: CRM next to Party Master
  const navText = await page.locator('.side-nav-list').first().innerText()
  if (/Party Master[\s\S]*CRM|CRM[\s\S]*Party Master/.test(navText)) {
    pass('CRM nav next to Party Master')
  } else {
    fail('CRM nav next to Party Master', navText.slice(0, 200))
  }

  // ---- Design Catalog theme ----
  await page.getByRole('button', { name: 'Design Catalog' }).click()
  await page.waitForSelector('.dna-screen')
  await page.waitForTimeout(400)
  const theme = await page.evaluate(() => {
    const screen = document.querySelector('.dna-screen')
    const content = document.querySelector('.app-content')
    const card = document.querySelector('.dna-card') || document.querySelector('.dna-screen')
    const cs = getComputedStyle(screen)
    const cc = getComputedStyle(content)
    return {
      screenBg: cs.backgroundColor,
      contentBg: cc.backgroundColor,
      text: cs.color,
      cardBg: card ? getComputedStyle(card).backgroundColor : null,
      dataScreen: document.querySelector('.app-shell')?.getAttribute('data-screen'),
    }
  })
  await page.screenshot({ path: join(ART, 'design-catalog-desktop.png'), fullPage: false })
  const isLight =
    theme.screenBg.includes('247, 246, 243') ||
    theme.contentBg.includes('247, 246, 243') ||
    theme.screenBg === 'rgb(247, 246, 243)'
  const textDark =
    theme.text.includes('34, 31, 28') || theme.text === 'rgb(34, 31, 28)' || theme.text.startsWith('rgb(34')
  if (isLight && textDark && theme.dataScreen === 'design-catalog') {
    pass('1 THEME light Design Catalog', JSON.stringify(theme))
  } else {
    fail('1 THEME light Design Catalog', JSON.stringify(theme))
  }

  // ---- Bulk Add ----
  const bulkBtn = page.getByRole('button', { name: 'Bulk Add Designs' })
  if (await bulkBtn.count()) pass('Bulk Add Designs button present')
  else fail('Bulk Add Designs button present')

  await bulkBtn.click()
  await page.waitForSelector('#dna-bulk-title')
  const png1 = pngBuffer(180, 40, 40)
  const png2 = pngBuffer(40, 80, 180)
  const p1 = join(ART, 'bulk-test-1.png')
  const p2 = join(ART, 'bulk-test-2.png')
  writeFileSync(p1, png1)
  writeFileSync(p2, png2)
  await page.locator('.dna-bulk-pick input[type=file]').setInputFiles([p1, p2])
  await page.waitForSelector('.dna-bulk-row')
  const rowCount = await page.locator('.dna-bulk-row').count()
  const designNos = await page.locator('.dna-bulk-no input').evaluateAll((els) =>
    els.map((e) => Number(e.value)),
  )
  const monoInc =
    designNos.length === 2 && designNos[1] === designNos[0] + 1
  if (rowCount === 2 && monoInc) {
    pass('Bulk rows auto Design No.', designNos.join(','))
  } else {
    fail('Bulk rows auto Design No.', `rows=${rowCount} nos=${designNos}`)
  }

  const jfgInputs = page.locator('.dna-bulk-jfg input')
  await jfgInputs.nth(0).fill('JFG-EOD-1')
  await jfgInputs.nth(1).fill('JFG-EOD-2')
  await page.getByRole('button', { name: /Save All/ }).click()
  // progress or success
  await page.waitForTimeout(500)
  const sawProgress = await page.locator('.dna-bulk-progress').count()
  try {
    await page.waitForSelector('.dna-bulk-panel', { state: 'detached', timeout: 60000 })
    pass('2 BULK Save All completed', sawProgress ? 'progress shown' : 'saved (progress brief)')
  } catch (e) {
    const err = await page.locator('.form-error').innerText().catch(() => '')
    fail('2 BULK Save All completed', err || String(e))
  }

  await page.waitForTimeout(800)
  const galleryHas = await page.locator('text=JFG-EOD-1').count()
  const noMatching = await page.locator('.dna-thumb-empty', { hasText: 'No matching' }).count()
  if (galleryHas > 0 && noMatching > 0) {
    pass('Bulk designs in gallery with No matching placeholder')
  } else {
    fail(
      'Bulk designs in gallery with No matching placeholder',
      `jfg=${galleryHas} empty=${noMatching}`,
    )
  }
  await page.screenshot({ path: join(ART, 'design-catalog-after-bulk.png'), fullPage: false })

  // ---- CRM ----
  await page.getByRole('button', { name: /^CRM$/ }).click()
  await page.waitForSelector('.crm-screen')
  await page.getByRole('button', { name: '+ Add Customer' }).click()
  const uniq = `EOD Buyer ${Date.now().toString().slice(-6)}`
  const phone = `+9199${String(Date.now()).slice(-8)}`
  await page.locator('#crm-form-title').waitFor()
  await page.locator('.crm-form input').nth(0).fill(uniq)
  await page.locator('.crm-form input').nth(1).fill(phone)
  await page.locator('.crm-form button.primary-save').click()
  await page.waitForTimeout(1000)
  const listed = await page.locator(`text=${uniq}`).count()
  if (listed > 0) pass('3 CRM Add customer', uniq)
  else fail('3 CRM Add customer', 'not listed after save')

  await page.locator('.crm-search input').fill(uniq)
  await page.waitForTimeout(300)
  const searchHit = await page.locator('.crm-table tbody tr').count()
  if (searchHit >= 1) pass('CRM search', `hits=${searchHit}`)
  else fail('CRM search')

  await page.locator('.crm-table tbody tr').first().getByRole('button', { name: 'Edit' }).click()
  await page.locator('.crm-form input').nth(0).fill(uniq + ' Edited')
  await page.locator('.crm-form button.primary-save').click()
  await page.waitForTimeout(800)
  if (await page.locator(`text=${uniq} Edited`).count()) pass('CRM Edit customer')
  else fail('CRM Edit customer')

  await page.screenshot({ path: join(ART, 'crm-desktop.png'), fullPage: false })

  // Clear search before delete test
  await page.locator('.crm-search input').fill('')
  await page.waitForTimeout(300)

  // Delete test: create disposable then delete
  await page.getByRole('button', { name: '+ Add Customer' }).click()
  const delName = `EOD Del ${Date.now().toString().slice(-5)}`
  await page.locator('.crm-form input').nth(0).fill(delName)
  await page.locator('.crm-form input').nth(1).fill(`+9188${String(Date.now()).slice(-8)}`)
  await page.locator('.crm-form button.primary-save').click()
  await page.waitForTimeout(1000)
  await page.locator('.crm-search input').fill(delName)
  await page.waitForTimeout(300)
  page.once('dialog', (d) => d.accept())
  await page.locator('.crm-table tbody tr').first().getByRole('button', { name: 'Delete' }).click()
  await page.waitForTimeout(800)
  await page.locator('.crm-search input').fill(delName)
  await page.waitForTimeout(300)
  const stillInTable = await page.locator('.crm-table tbody tr').count()
  if (stillInTable === 0) pass('CRM Delete customer')
  else fail('CRM Delete customer', `rows left=${stillInTable}`)

  // ---- WhatsApp CRM wiring ----
  await page.getByRole('button', { name: 'Design Catalog', exact: true }).click({ force: true })
  await page.waitForSelector('.dna-screen')
  await page.locator('.dna-share-btn').first().click()
  await page.waitForSelector('#dna-share-title')
  // ensure "one" mode
  await page.locator('input[name="dna-share-mode"]').first().check()
  await page.waitForTimeout(500)
  const options = await page.locator('.dna-customer-pick select option').evaluateAll((els) =>
    els.map((e) => e.textContent || ''),
  )
  const hasReal =
    options.some((t) => /Edited|Smoke Customer|Second Buyer|Buyer/i.test(t)) &&
    options.length > 1
  if (hasReal) {
    pass('3 Catalog WhatsApp pulls crm_customers', options.slice(0, 5).join(' | '))
  } else {
    fail('3 Catalog WhatsApp pulls crm_customers', JSON.stringify(options))
  }
  await page.screenshot({ path: join(ART, 'catalog-share-crm.png'), fullPage: false })
  await page.getByRole('button', { name: 'Cancel' }).click()

  // ---- KMOS Sync ----
  await page.getByRole('button', { name: /^CRM$/ }).click({ force: true })
  await page.waitForSelector('.crm-screen')
  await page.getByRole('button', { name: 'Sync from KMOS' }).click()
  await page.waitForTimeout(4000)
  const syncMsg =
    (await page.locator('.form-ok, .form-error').first().innerText().catch(() => '')) || ''
  await page.screenshot({ path: join(ART, 'crm-kmos-sync.png'), fullPage: false })
  // Record exact message; treat as fail if not a successful sync report
  if (/KMOS sync:/i.test(syncMsg) && !/failed|error|Could not find/i.test(syncMsg)) {
    pass('4 KMOS Sync', syncMsg)
  } else {
    fail('4 KMOS Sync', syncMsg || '(no message)')
  }

  // ---- Mobile / iPad ----
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.getByRole('button', { name: 'Design Catalog', exact: true }).click({ force: true })
  await page.waitForSelector('.dna-screen')
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(ART, 'design-catalog-ipad.png'), fullPage: false })
  const ipadBulk = await page.getByRole('button', { name: 'Bulk Add Designs' }).isVisible()
  if (ipadBulk) pass('iPad Catalog layout usable')
  else fail('iPad Catalog layout usable')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  const ham = page.locator('.hamburger')
  if (await ham.isVisible()) {
    await ham.click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: /^CRM$/ }).click({ force: true })
    await page.waitForSelector('.crm-screen')
    pass('Mobile drawer nav to CRM')
  } else {
    fail('Mobile drawer nav to CRM', 'hamburger not visible')
  }
  await page.screenshot({ path: join(ART, 'crm-mobile.png'), fullPage: false })

  // Filter expected KMOS 502 and vite noise
  const realErrors = consoleErrors.filter(
    (t) =>
      !/Download the React DevTools|vite|favicon|status of 502/i.test(t),
  )
  if (realErrors.length) {
    fail('Console errors', realErrors.slice(0, 8).join(' || '))
  } else {
    pass('No console errors')
  }

  writeFileSync(
    join(ART, 'eod-smoke-results.json'),
    JSON.stringify({ results, consoleErrors, theme, syncMsg }, null, 2),
  )
  await browser.close()

  const failed = results.filter((r) => !r.ok)
  console.log('\n=== SUMMARY ===')
  console.log(`passed=${results.filter((r) => r.ok).length} failed=${failed.length}`)
  if (failed.length) {
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
