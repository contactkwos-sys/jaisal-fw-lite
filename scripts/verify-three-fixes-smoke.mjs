/**
 * Verify DIN Edit/Delete + Dashboard Checking Pending + PIN Management cards.
 */
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'
const URL = 'https://doitrzsyvcipugmrzykx.supabase.co'
const KEY = 'sb_publishable_OyI39Syi9VXJg34uLLuozA_yjFBSBeE'
const dir = '/tmp/cursor/artifacts/screenshots'
fs.mkdirSync(dir, { recursive: true })

const results = []
const record = (check, pass, extra = {}) => {
  results.push({ check, pass, ...extra })
  console.log(pass ? 'PASS' : 'FAIL', check, Object.keys(extra).length ? JSON.stringify(extra) : '')
}

const sb = createClient(URL, KEY)
const { data: login } = await sb.functions.invoke('pin-login', {
  body: { role_name: 'CEO', pin: '1234' },
})
await sb.auth.setSession({
  access_token: login.access_token,
  refresh_token: login.refresh_token,
})

// Create disposable draft for delete test
const { data: created, error: cErr } = await sb
  .from('design_costing')
  .insert({
    din_number: 'VERIFYDEL1',
    quality_name: 'verify-delete',
    costing_date: '2026-09-05',
    status: 'draft',
    design_length_mtr: 110,
    final_cost_per_mtr: 7.77,
  })
  .select('id')
  .single()
if (cErr) throw cErr
const delId = created.id

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const dialogs = []
page.on('dialog', async (d) => {
  dialogs.push(d.message())
  await d.accept()
})

async function loginUi() {
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

try {
  const pin = await loginUi()
  record('login', true, { pin })

  // —— 1. Dashboard Checking Pending ——
  await page.getByRole('button', { name: /Dashboard/i }).first().click().catch(() => {})
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${dir}/verify-dashboard.png`, fullPage: true })
  const dash = await page.locator('body').innerText()
  const cp = dash.match(/Checking Pending\s*\n?\s*([0-9.,]+)\s*(m)?/i)
  const cpVal = cp ? Number(String(cp[1]).replace(/,/g, '')) : null
  record('checking pending is 0 after fake-data purge', cpVal === 0, {
    raw: cp?.[0],
    value: cpVal,
  })
  record('checking pending not 14950', cpVal !== 14950, { value: cpVal })

  // —— 2. DIN Edit ——
  await page.getByRole('button', { name: /^Design$/i }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /DIN Costing/i }).first().click()
  await page.waitForTimeout(2000)
  const savedTab = page
    .getByRole('button', { name: /Saved Costings/i })
    .or(page.getByRole('tab', { name: /Saved Costings/i }))
  if (await savedTab.count()) await savedTab.first().click()
  await page.waitForTimeout(800)

  const editRow = page.locator('tr', { hasText: 'Jfg1872' }).first()
  record('Jfg1872 row present', (await editRow.count()) > 0)
  await editRow.locator('.record-actions').getByRole('button', { name: /^Edit$/i }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${dir}/verify-din-edit.png`, fullPage: true })

  const inputs = await page
    .locator('.dwc-screen input:not([type=file]):not([type=checkbox]):not([type=hidden])')
    .evaluateAll((els) =>
      els.slice(0, 20).map((e) => ({
        ph: e.placeholder || e.getAttribute('aria-label') || e.type,
        v: e.value,
      })),
    )
  const dinOk = inputs.some((i) => /Jfg1872/i.test(i.v))
  const qualityOk = inputs.some((i) => /80roto/i.test(i.v))
  const baseOk = inputs.some((i) => i.v === '300')
  const denierOk = inputs.some((i) => i.v === '310')
  record('edit prefills Design No', dinOk, { inputs: inputs.filter((i) => i.v) })
  record('edit prefills Quality', qualityOk)
  record('edit backfills Base Denier 300 from legacy 310', baseOk)
  record('edit shows Costing Denier 310', denierOk)
  const saveDisabled = await page
    .getByRole('button', { name: /^Save Draft$/i })
    .isDisabled()
  record('edit mode unlocks Save Draft', saveDisabled === false)

  // View then Edit must clear view-only
  await page
    .locator('tr', { hasText: 'Jfg1558' })
    .first()
    .locator('.record-actions')
    .getByRole('button', { name: /^View$/i })
    .click()
  await page.waitForTimeout(800)
  await page
    .locator('tr', { hasText: 'Jfg1558' })
    .first()
    .locator('.record-actions')
    .getByRole('button', { name: /^Edit$/i })
    .click()
  await page.waitForTimeout(1000)
  const saveAfterViewEdit = await page
    .getByRole('button', { name: /^Save Draft$/i })
    .isDisabled()
  record('View then Edit clears read-only', saveAfterViewEdit === false)

  // —— 3. DIN Delete + DB verify ——
  await page.getByRole('button', { name: /Saved Costings/i }).first().click().catch(() => {})
  await page.waitForTimeout(600)
  // Refresh list
  const refreshBtn = page.getByRole('button', { name: /^Refresh$/i }).first()
  if (await refreshBtn.count()) await refreshBtn.click()
  await page.waitForTimeout(1200)

  const delRow = page.locator('tr', { hasText: 'VERIFYDEL1' }).first()
  record('VERIFYDEL1 visible before delete', (await delRow.count()) > 0)
  await delRow.locator('.record-actions').getByRole('button', { name: /^Delete$/i }).click()
  await page.waitForTimeout(2000)
  record('delete confirm dialog', dialogs.some((m) => /delete/i.test(m)), { dialogs })
  const deletedMsg = await page.getByText(/Costing deleted/i).count()
  record('UI shows Costing deleted', deletedMsg > 0)

  if (await refreshBtn.count()) await refreshBtn.click()
  await page.waitForTimeout(1200)
  const stillUi = await page.locator('tr', { hasText: 'VERIFYDEL1' }).count()
  record('VERIFYDEL1 gone from UI after refresh', stillUi === 0, { stillUi })
  await page.screenshot({ path: `${dir}/verify-din-after-delete.png`, fullPage: true })

  const { data: dbRow } = await sb.from('design_costing').select('id').eq('id', delId).maybeSingle()
  record('VERIFYDEL1 gone from database', !dbRow, { dbRow })

  // —— 4. PIN Management cards ——
  await page.getByRole('button', { name: /^Settings$/i }).first().click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /Role Login PINs/i }).first().click()
  await page.waitForSelector('.role-pin-card, .role-pin-quickref', { timeout: 20000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${dir}/verify-pin-mgmt.png`, fullPage: true })
  const body = await page.locator('body').innerText()
  record('PIN quick reference present', /Staff PIN quick reference/i.test(body))
  record('PIN cards show large digits', (await page.locator('.role-pin-digits').count()) > 0, {
    cards: await page.locator('.role-pin-card').count(),
  })
  record('PIN search present', (await page.locator('.role-pin-search').count()) > 0)
  record('WhatsApp on cards', (await page.locator('.role-pin-card .btn-wa').count()) > 0)
  record('Auto-Generate All PINs', /Auto-Generate All PINs/i.test(body))
  record('Contact Developer footer', /Contact Developer on WhatsApp/i.test(body))
  record('Dev quick tags', /New app requirement/i.test(body) && /Edit request/i.test(body))

  console.log('\n=== SUMMARY ===')
  const failed = results.filter((r) => !r.pass)
  console.log(`passed ${results.length - failed.length}/${results.length}`)
  if (failed.length) {
    console.log('FAILED:', failed.map((f) => f.check))
    process.exitCode = 1
  }
} catch (e) {
  console.error(e)
  await page.screenshot({ path: `${dir}/verify-error.png`, fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  // cleanup leftover if delete failed
  await sb.from('design_costing').delete().eq('id', delId)
  await browser.close()
  fs.writeFileSync('/tmp/cursor/artifacts/verify-results.json', JSON.stringify(results, null, 2))
}
