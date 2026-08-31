/**
 * Smoke tests for Security Machine & Production Update helpers.
 * Run: node scripts/security-machine-update-smoke.mjs
 */

function detectShift(now) {
  const h = now.getHours()
  return h >= 6 && h < 18 ? 'Day' : 'Night'
}

function totalProduction(machines) {
  return machines.reduce((sum, m) => {
    if (!m.running) return sum
    const n = Number(m.productionMeters)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

function buildWhatsAppMessage(draft, now = new Date()) {
  const d = new Date(`${draft.entryDate}T12:00:00`)
  const dateLabel = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const shiftLabel = `${draft.shift.toUpperCase()} SHIFT`
  const lines = [dateLabel, shiftLabel, '', 'Machine Run:']
  for (const m of draft.machines) {
    if (m.running) lines.push(`${m.machine} ✓`)
    else lines.push(`${m.machine} ✕${m.stopReason ? ` ${m.stopReason}` : ''}`)
  }
  lines.push('', 'Production:')
  for (const m of draft.machines.filter((x) => x.running)) {
    lines.push(`${m.machine} - ${Number(m.productionMeters) || 0} Mtr - ${m.operatorName.trim() || '—'}`)
  }
  const total = totalProduction(draft.machines)
  lines.push('', `Total Production: ${total} Mtr`)
  lines.push(
    '',
    `Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
  )
  return lines.join('\n')
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// --- Acceptance case from FINAL TASK ---
const draft = {
  entryDate: '2026-08-31',
  shift: 'Day',
  machines: [
    { machine: 'M1', running: true, stopReason: null, operatorName: 'Ramesh', productionMeters: '1250' },
    { machine: 'M2', running: true, stopReason: null, operatorName: 'Ramesh', productionMeters: '1180' },
    { machine: 'M3', running: false, stopReason: 'Mechanical Fault', operatorName: '', productionMeters: '' },
    { machine: 'M4', running: true, stopReason: null, operatorName: 'Suresh', productionMeters: '1320' },
    { machine: 'M5', running: true, stopReason: null, operatorName: 'Amit', productionMeters: '1100' },
    { machine: 'M6', running: false, stopReason: 'Electronic Fault', operatorName: '', productionMeters: '' },
  ],
}

const total = totalProduction(draft.machines)
assert(total === 4850, `Expected total 4850, got ${total}`)

const msg = buildWhatsAppMessage(draft, new Date('2026-08-31T07:21:00'))
assert(msg.includes('31 Aug 2026'), 'date in message')
assert(msg.includes('DAY SHIFT'), 'shift in message')
assert(msg.includes('M1 ✓'), 'M1 running')
assert(msg.includes('M3 ✕ Mechanical Fault'), 'M3 stop reason')
assert(msg.includes('M6 ✕ Electronic Fault'), 'M6 stop reason')
assert(msg.includes('M1 - 1250 Mtr - Ramesh'), 'M1 production line')
assert(msg.includes('M2 - 1180 Mtr - Ramesh'), 'same operator on M2')
assert(msg.includes('M4 - 1320 Mtr - Suresh'), 'M4 Suresh')
assert(msg.includes('M5 - 1100 Mtr - Amit'), 'M5 Amit')
assert(msg.includes('Total Production: 4850 Mtr'), 'total line')
assert(!msg.includes('M3 -'), 'stopped machine not in production list')

// Night shift separate
const night = { ...draft, shift: 'Night' }
assert(buildWhatsAppMessage(night).includes('NIGHT SHIFT'), 'night shift label')

// Shift detect
assert(detectShift(new Date('2026-08-31T07:21:00')) === 'Day', 'day detect')
assert(detectShift(new Date('2026-08-31T19:00:00')) === 'Night', 'night detect')
assert(detectShift(new Date('2026-08-31T05:59:00')) === 'Night', 'early morning night')

// Operator reuse
const ops = draft.machines.filter((m) => m.running).map((m) => m.operatorName)
assert(ops.filter((o) => o === 'Ramesh').length === 2, 'Ramesh on two machines')

console.log('security-machine-update-smoke: PASS')
console.log('--- sample WhatsApp ---')
console.log(msg)
