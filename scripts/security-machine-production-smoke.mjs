/**
 * Smoke test — Security Machine & Production WhatsApp message + totals.
 * Run: node scripts/security-machine-production-smoke.mjs
 */

function totalProduction(machines) {
  return machines.reduce((sum, m) => {
    if (m.run_status !== 'Running') return sum
    const n = Number(m.production_meter)
    return sum + (Number.isFinite(n) ? Math.max(0, n) : 0)
  }, 0)
}

function formatDisplayDate(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function buildWhatsAppMessage(draft) {
  const lines = []
  lines.push(formatDisplayDate(draft.entry_date))
  lines.push(`${draft.shift.toUpperCase()} SHIFT`)
  lines.push('')
  lines.push('Machine Run:')
  for (const m of draft.machines) {
    if (m.run_status === 'Running') lines.push(`${m.machine_no} ✓`)
    else lines.push(`${m.machine_no} ✕${m.stop_reason ? ` ${m.stop_reason}` : ''}`)
  }
  lines.push('')
  lines.push('Production:')
  for (const m of draft.machines) {
    if (m.run_status !== 'Running') continue
    lines.push(`${m.machine_no} - ${Number(m.production_meter) || 0} Mtr - ${m.operator_name || '—'}`)
  }
  lines.push('')
  lines.push(`Total Production: ${totalProduction(draft.machines)} Mtr`)
  return lines.join('\n')
}

function validateDraft(draft) {
  for (const m of draft.machines) {
    if (m.run_status === 'Stopped' && !m.stop_reason) return `Select stop reason for ${m.machine_no}`
    if (m.run_status === 'Running') {
      const meters = Number(m.production_meter)
      if (!String(m.production_meter).trim() || !Number.isFinite(meters) || meters < 0) {
        return `Enter production meters for ${m.machine_no}`
      }
      if (!(m.operator_name || '').trim()) return `Select operator for ${m.machine_no}`
    }
  }
  return null
}

const acceptance = {
  entry_date: '2026-08-31',
  shift: 'Day',
  machines: [
    { machine_no: 'M1', run_status: 'Running', stop_reason: '', operator_name: 'Ramesh', production_meter: '1250' },
    { machine_no: 'M2', run_status: 'Running', stop_reason: '', operator_name: 'Ramesh', production_meter: '1180' },
    { machine_no: 'M3', run_status: 'Stopped', stop_reason: 'Mechanical Fault', operator_name: '', production_meter: '' },
    { machine_no: 'M4', run_status: 'Running', stop_reason: '', operator_name: 'Suresh', production_meter: '1320' },
    { machine_no: 'M5', run_status: 'Running', stop_reason: '', operator_name: 'Amit', production_meter: '1100' },
    { machine_no: 'M6', run_status: 'Stopped', stop_reason: 'Electronic Fault', operator_name: '', production_meter: '' },
  ],
}

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL:', msg)
  } else {
    console.log('OK:', msg)
  }
}

const total = totalProduction(acceptance.machines)
assert(total === 4850, `Total production is 4850 (got ${total})`)

const v = validateDraft(acceptance)
assert(v === null, `Draft validates (got ${v})`)

const msg = buildWhatsAppMessage(acceptance)
assert(msg.includes('DAY SHIFT'), 'Message has DAY SHIFT')
assert(msg.includes('M1 ✓'), 'M1 running')
assert(msg.includes('M3 ✕ Mechanical Fault'), 'M3 mechanical fault')
assert(msg.includes('M6 ✕ Electronic Fault'), 'M6 electronic fault')
assert(msg.includes('M1 - 1250 Mtr - Ramesh'), 'M1 Ramesh production')
assert(msg.includes('M2 - 1180 Mtr - Ramesh'), 'M2 Ramesh production')
assert(msg.includes('M4 - 1320 Mtr - Suresh'), 'M4 Suresh production')
assert(msg.includes('M5 - 1100 Mtr - Amit'), 'M5 Amit production')
assert(msg.includes('Total Production: 4850 Mtr'), 'Total line present')
assert(!msg.includes('M3 -'), 'Stopped M3 omitted from production list')
assert(!msg.includes('M6 -'), 'Stopped M6 omitted from production list')

const night = { ...acceptance, shift: 'Night' }
assert(buildWhatsAppMessage(night).includes('NIGHT SHIFT'), 'Night shift label')

const missingOp = {
  ...acceptance,
  machines: acceptance.machines.map((m) =>
    m.machine_no === 'M1' ? { ...m, operator_name: '' } : m,
  ),
}
assert(validateDraft(missingOp)?.includes('M1'), 'Requires operator on running machine')

const sameOpMulti = acceptance.machines.filter((m) => m.operator_name === 'Ramesh')
assert(sameOpMulti.length === 2, 'Same operator on M1 and M2')

console.log('\n--- Sample WhatsApp message ---\n')
console.log(msg)
console.log('\n-------------------------------\n')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('All security machine production smoke checks passed.')
