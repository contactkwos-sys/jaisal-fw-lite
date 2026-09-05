/**
 * E2E: Recent DINs Edit + Delete on Design Master (dto-hub).
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
const { data: login, error: loginErr } = await sb.functions.invoke('pin-login', {
  body: { role_name: 'CEO', pin: '1234' },
})
if (loginErr || !login?.access_token) throw new Error('pin-login failed: ' + JSON.stringify(loginErr || login))
await sb.auth.setSession({
  access_token: login.access_token,
  refresh_token: login.refresh_token,
})

const stamp = Date.now().toString(36).toUpperCase()
const dinNumber = `DIN-E2E-${stamp}`
const { data: created, error: cErr } = await sb
  .from('dins')
  .insert({
    din_number: dinNumber,
    received_date: new Date().toISOString().slice(0, 10),
    design_name: 'E2E Recent DINs Delete',
    party_name: 'E2E Party',
    common_warp: 'E2E-Warp',
    status: 'DIN Received',
    costing_status: 'Pending',
    source: 'upload',
    matching_count: 0,
  })
  .select('id, din_number, created_at')
  .single()
if (cErr) throw new Error('create DIN failed: ' + cErr.message)
const dinId = created.id
console.log('created DIN', created)

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

async function openDesignMaster() {
  await page.getByRole('button', { name: /^Design$/i }).first().click()
  await page.waitForTimeout(800)
  // Hub may already be the landing screen for Design module
  const heading = page.getByRole('heading', { name: /Recent DINs/i })
  if (!(await heading.count())) {
    await page.getByRole('button', { name: /Design Master|Overview|Hub/i }).first().click().catch(() => {})
    await page.waitForTimeout(800)
  }
  await heading.waitFor({ timeout: 15000 })
}

try {
  const pin = await loginUi()
  record('login', true, { pin })

  await openDesignMaster()
  await page.screenshot({ path: `${dir}/recent-dins-hub.png`, fullPage: true })

  // Search for our disposable DIN
  const search = page.locator('input[placeholder*="Search"], input[type="search"]').first()
  if (await search.count()) {
    await search.fill(dinNumber)
    await page.waitForTimeout(500)
  }

  const row = page.locator('tr', { hasText: dinNumber }).first()
  await row.waitFor({ timeout: 15000 })
  record('disposable DIN visible in Recent DINs', true, { dinNumber })

  const editBtn = row.getByRole('button', { name: /^Edit$/i })
  const deleteBtn = row.getByRole('button', { name: /^Delete$/i })
  const viewBtn = row.getByRole('button', { name: /^View$/i })
  record('row has View', (await viewBtn.count()) > 0)
  record('row has Edit', (await editBtn.count()) > 0)
  record('row has Delete', (await deleteBtn.count()) > 0)

  // —— Edit ——
  await editBtn.click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${dir}/recent-dins-after-edit.png`, fullPage: true })
  const bodyAfterEdit = await page.locator('body').innerText()
  const onCosting =
    /Design.?Wise.?Costing|DIN Costing|Saved Costings|Yarn|Final Cost/i.test(bodyAfterEdit) &&
    bodyAfterEdit.includes(dinNumber)
  record('Edit opens DIN Costing with DIN prefilled', onCosting, {
    hasDin: bodyAfterEdit.includes(dinNumber),
    snippet: bodyAfterEdit.slice(0, 400),
  })

  // Back to Design Master
  await openDesignMaster()
  if (await search.count()) {
    await search.fill(dinNumber)
    await page.waitForTimeout(500)
  }
  const row2 = page.locator('tr', { hasText: dinNumber }).first()
  await row2.waitFor({ timeout: 15000 })

  // —— Delete ——
  dialogs.length = 0
  await row2.getByRole('button', { name: /^Delete$/i }).click()
  await page.waitForTimeout(1500)
  record('confirm dialog shown', dialogs.some((m) => /Delete this DIN/i.test(m)), {
    dialogs,
  })
  await page.screenshot({ path: `${dir}/recent-dins-after-delete.png`, fullPage: true })

  // UI refresh: row should disappear
  await page.waitForTimeout(1000)
  if (await search.count()) {
    await search.fill(dinNumber)
    await page.waitForTimeout(400)
  }
  const stillInUi = (await page.locator('tr', { hasText: dinNumber }).count()) > 0
  record('row gone from UI after delete', !stillInUi)

  // Hard reload list from DB perspective
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await openDesignMaster()
  if (await search.count()) {
    await search.fill(dinNumber)
    await page.waitForTimeout(500)
  }
  const afterReload = (await page.locator('tr', { hasText: dinNumber }).count()) > 0
  record('row still gone after full page reload', !afterReload)

  const { data: dbRow, error: dbErr } = await sb.from('dins').select('id').eq('id', dinId).maybeSingle()
  if (dbErr) throw dbErr
  record('DIN deleted from database', !dbRow, { dinId, dbRow })
} catch (e) {
  record('uncaught', false, { error: String(e?.stack || e) })
  await page.screenshot({ path: `${dir}/recent-dins-error.png`, fullPage: true }).catch(() => {})
} finally {
  // Cleanup if delete failed
  await sb.from('dins').delete().eq('id', dinId)
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log('\n=== SUMMARY ===')
console.log(JSON.stringify({ passed: results.filter((r) => r.pass).length, failed: failed.length, results }, null, 2))
process.exit(failed.length ? 1 : 0)
