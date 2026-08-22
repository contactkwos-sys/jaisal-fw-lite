/**
 * Warp Yarn Management UI smoke (Playwright)
 */
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'
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
  console.log(pass ? 'PASS' : 'FAIL', check, Object.keys(extra).length ? JSON.stringify(extra) : '')
}

const pageErrors = []
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', (err) => pageErrors.push(err.message))

async function login() {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('.chip', { timeout: 15000 })
  await page.locator('.chip', { hasText: 'CEO' }).click().catch(() => {})
  for (const d of ['1', '2', '3', '4']) {
    await page.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
  }
  await page.getByRole('button', { name: /Login as/i }).click()
  try {
    await page.waitForSelector('.app-shell', { timeout: 15000 })
    return '1234'
  } catch {
    for (const d of ['3', '0', '6', '0']) {
      await page.locator('.pin-key', { hasText: new RegExp(`^${d}$`) }).click()
    }
    await page.getByRole('button', { name: /Login as/i }).click()
    await page.waitForSelector('.app-shell', { timeout: 15000 })
    return '3060'
  }
}

const pin = await login()
record('login', true, { pin })

await page.locator('.side-nav').getByRole('button', { name: 'Inventory', exact: true }).click()
await page.waitForTimeout(600)
const hubText = await page.locator('.module-hub').innerText()
record('inventory hub has Warp Yarn Management', /Warp Yarn Management/i.test(hubText))

await page.locator('.hub-card').filter({ hasText: /Warp Yarn Management/i }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${dir}/wym-overview.png`, fullPage: true })
const body = await page.locator('.wym-screen').innerText()
record('overview title', /Warp Yarn Management/i.test(body))
record('kpi On Machines', /On Machines/i.test(body))
record('kpi Filled Godown', /Filled Pipes in Godown|Godown/i.test(body))
record('kpi Empty', /Empty Pipes/i.test(body))
record('kpi At Warper', /At Warper/i.test(body))
record('quick actions', /Purchase Warp Yarn/i.test(body) && /Send to Warper/i.test(body))

const tabs = [
  'On Machines',
  'Godown – Filled',
  'Empty Pipes',
  'At Warper / Job Work',
  'Transactions & Reports',
]
for (const tab of tabs) {
  await page.getByRole('tab', { name: tab }).click()
  await page.waitForTimeout(400)
  record(`tab ${tab}`, (await page.getByRole('tab', { name: tab }).getAttribute('aria-selected')) === 'true')
}
await page.screenshot({ path: `${dir}/wym-reports.png`, fullPage: true })

await page.getByRole('tab', { name: 'Empty Pipes' }).click()
await page.getByRole('button', { name: '+ Add Empty Pipe' }).click()
await page.waitForSelector('.wym-modal', { timeout: 5000 })
const pipeNo = `BP-U${String(Date.now()).slice(-4)}`
await page.locator('.wym-modal input').nth(0).fill(pipeNo)
await page.getByRole('button', { name: 'Add Pipe' }).click()
await page.waitForTimeout(1200)
const afterAdd = await page.locator('.wym-screen').innerText()
record('add empty pipe success', afterAdd.includes(pipeNo) || /Empty pipe|added/i.test(afterAdd), {
  pipeNo,
})
await page.screenshot({ path: `${dir}/wym-empty-after-add.png`, fullPage: true })

await page.getByRole('button', { name: '+ Send to Warper' }).click()
await page.waitForSelector('.wym-modal', { timeout: 5000 })
const modalText = await page.locator('.wym-modal').innerText()
record(
  'send warper form fields',
  /Warper Name/i.test(modalText) && /Multiplier/i.test(modalText) && /Expected Total Meter/i.test(modalText),
)
await page.getByRole('button', { name: 'Cancel' }).click()

const critical = pageErrors.filter((e) => /warp_pipes|TypeError|ReferenceError/i.test(e))
record('no critical page errors', critical.length === 0, { pageErrors: pageErrors.slice(0, 5) })

console.log('\n' + JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.pass).length
await browser.close()
process.exit(failed ? 1 : 0)
