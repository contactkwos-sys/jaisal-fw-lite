/**
 * Smoke tests for Security Machine & Production Update helpers.
 * Run: node scripts/security-machine-update-smoke.mjs
 */

function detectShift(hour) {
  return hour >= 6 && hour < 18 ? 'Day' : 'Night'
}

function totalProduction(machines) {
  return machines.reduce((sum, m) => {
    if (m.status !== 'running') return sum
    const n = Number(m.production_mtr)
    return sum + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)
}

function buildWhatsAppMessage(draft) {
  const shiftLabel = draft.shift === 'Day' ? 'DAY SHIFT' : 'NIGHT SHIFT'
  const lines = [`*${draft.dateLabel}*`, `*${shiftLabel}*`, '', '*Machine Run:*']
  for (const m of draft.machines) {
    if (m.status === 'running') lines.push(`${m.machine_no} ✓`)
    else lines.push(`${m.machine_no} ✕ ${m.stop_reason || ''}`.trim())
  }
  lines.push('', '*Production:*')
  for (const m of draft.machines.filter((x) => x.status === 'running')) {
    lines.push(`${m.machine_no} - ${Number(m.production_mtr)} Mtr - ${m.operator_name}`)
  }
  lines.push('', `*Total Production: ${totalProduction(draft.machines)} Mtr*`)
  return lines.join('\n')
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// Acceptance case 1–7
const draft = {
  dateLabel: '31 Aug 2026',
  shift: 'Day',
  machines: [
    { machine_no: 'M1', status: 'running', stop_reason: null, operator_name: 'Ramesh', production_mtr: '1250' },
    { machine_no: 'M2', status: 'running', stop_reason: null, operator_name: 'Ramesh', production_mtr: '1180' },
    { machine_no: 'M3', status: 'stopped', stop_reason: 'Mechanical Fault', operator_name: '', production_mtr: '' },
    { machine_no: 'M4', status: 'running', stop_reason: null, operator_name: 'Suresh', production_mtr: '1320' },
    { machine_no: 'M5', status: 'running', stop_reason: null, operator_name: 'Amit', production_mtr: '1100' },
    { machine_no: 'M6', status: 'stopped', stop_reason: 'Electronic Fault', operator_name: '', production_mtr: '' },
  ],
}

assert(detectShift(7) === 'Day', '07:00 should be Day')
assert(detectShift(19) === 'Night', '19:00 should be Night')
assert(totalProduction(draft.machines) === 4850, `Expected total 4850 got ${totalProduction(draft.machines)}`)

const msg = buildWhatsAppMessage(draft)
assert(msg.includes('DAY SHIFT'), 'message has DAY SHIFT')
assert(msg.includes('M1 ✓'), 'M1 running')
assert(msg.includes('M3 ✕ Mechanical Fault'), 'M3 mechanical')
assert(msg.includes('M6 ✕ Electronic Fault'), 'M6 electronic')
assert(msg.includes('M1 - 1250 Mtr - Ramesh'), 'M1 production line')
assert(msg.includes('M2 - 1180 Mtr - Ramesh'), 'same operator on M2')
assert(msg.includes('M4 - 1320 Mtr - Suresh'), 'Suresh on M4')
assert(msg.includes('M5 - 1100 Mtr - Amit'), 'Amit on M5')
assert(msg.includes('Total Production: 4850 Mtr'), 'total line')
assert(!msg.includes('M3 -'), 'stopped machine has no production line')

// Night shift separate
const night = { ...draft, shift: 'Night' }
assert(buildWhatsAppMessage(night).includes('NIGHT SHIFT'), 'night shift label')

// Operator reuse
const rameshMachines = draft.machines.filter((m) => m.operator_name === 'Ramesh').map((m) => m.machine_no)
assert(rameshMachines.join(',') === 'M1,M2', 'Ramesh operates M1 and M2')

console.log('security-machine-update-smoke: OK')
console.log('--- sample WhatsApp message ---')
console.log(msg)
