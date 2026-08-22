/**
 * Smoke-test matching-wise weft KG from DIN Costing formula.
 * Example: JFG-15-98 · 500 MTR · 3 matchings
 * Run: node scripts/machine-wise-production-smoke.mjs
 */

const CALC_FACTOR = 9_000_000

function round2(v) {
  if (!Number.isFinite(v)) return 0
  return Math.round((v + Number.EPSILON) * 100) / 100
}

function weftWeightKg(denier, pic, width, lengthMtr) {
  return (denier * pic * width * lengthMtr) / CALC_FACTOR
}

function colourHex(name) {
  const map = [
    [/\bred\b/i, '#DC2626'],
    [/\bwhite\b/i, '#F8FAFC'],
    [/\bblack\b/i, '#1F2937'],
    [/\bgold\b/i, '#C9A227'],
    [/\bblue\b/i, '#2563EB'],
    [/\bgreen\b/i, '#16A34A'],
  ]
  for (const [re, hex] of map) if (re.test(name)) return hex
  return '#64748b'
}

function isJari(name) {
  return /\b(jari|zari|gold)\b/i.test(name)
}

function rolesForMatching(m) {
  const out = []
  if (m.ground_colour) {
    out.push({ colour_name: m.ground_colour, role_label: 'Main Ground', is_main_ground: true, kind: 'main_ground' })
  }
  let c = 0
  for (const w of [m.weft_1, m.weft_2, m.weft_3, m.weft_4]) {
    if (!w) continue
    if (isJari(w)) out.push({ colour_name: w, role_label: 'Jari', is_main_ground: false, kind: 'jari' })
    else {
      c += 1
      out.push({ colour_name: w, role_label: `Contrast ${c}`, is_main_ground: false, kind: 'contrast' })
    }
  }
  return out
}

function findCosting(colour, wefts, used) {
  const c = colour.trim().toLowerCase()
  const unused = wefts.filter((w) => !used.has(w.id))
  let hit = unused.find((w) => w.weft_name.trim().toLowerCase() === c)
  if (hit) return hit
  hit = unused.find((w) => w.weft_name.toLowerCase().includes(c) || c.includes(w.weft_name.toLowerCase()))
  return hit || null
}

function buildGroups(matchings, wefts, meters) {
  return matchings.map((m) => {
    const used = new Set()
    const lines = rolesForMatching(m).map((r) => {
      const costing = findCosting(r.colour_name, wefts, used)
      if (costing) used.add(costing.id)
      const required = costing
        ? round2(weftWeightKg(costing.denier, costing.pic, costing.width, meters))
        : 0
      return {
        ...r,
        colour_hex: colourHex(r.colour_name),
        required_kg: required,
        issued_kg: 0,
        balance_kg: required,
      }
    })
    return {
      matching_no: m.matching_no,
      badge: `MATCHING ${String(m.matching_no).padStart(2, '0')}`,
      lines,
      total_required_kg: round2(lines.reduce((s, l) => s + l.required_kg, 0)),
    }
  })
}

// --- Demo data (JFG-15-98 style) ---
const PROGRAM_METER = 500
const matchings = [
  { matching_no: 1, ground_colour: 'Red', weft_1: 'White Jari', weft_2: 'Black' },
  { matching_no: 2, ground_colour: 'Red', weft_1: 'Gold Jari', weft_2: 'Blue' },
  { matching_no: 3, ground_colour: 'Red', weft_1: 'White Jari', weft_2: 'Green' },
]

// Typical silk weft params — same engine as Design Wise Costing
const costingWefts = [
  { id: '1', weft_name: 'Red', denier: 120, pic: 80, width: 48 },
  { id: '2', weft_name: 'White Jari', denier: 80, pic: 40, width: 48 },
  { id: '3', weft_name: 'Black', denier: 100, pic: 30, width: 48 },
  { id: '4', weft_name: 'Gold Jari', denier: 80, pic: 20, width: 48 },
  { id: '5', weft_name: 'Blue', denier: 100, pic: 25, width: 48 },
  { id: '6', weft_name: 'Green', denier: 100, pic: 25, width: 48 },
]

const groups = buildGroups(matchings, costingWefts, PROGRAM_METER)

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('OK:', msg)
  }
}

assert(groups.length === 3, 'dynamic matchings = 3')
assert(groups[0].badge === 'MATCHING 01', 'matching badge MATCHING 01')
assert(groups[0].lines[0].is_main_ground === true, 'Main Ground highlighted on first line')
assert(groups[0].lines[0].colour_name === 'Red', 'Matching 1 main ground Red')
assert(groups[0].lines[0].colour_hex === '#DC2626', 'Red colour dot')
assert(groups[0].lines[1].role_label === 'Jari', 'White Jari role')
assert(groups[0].lines[2].role_label === 'Contrast 1', 'Black contrast role')

const redKg = round2(weftWeightKg(120, 80, 48, 500))
assert(groups[0].lines[0].required_kg === redKg, `Red KG from costing formula = ${redKg}`)
assert(redKg > 0, 'required KG > 0')

const m1Total = groups[0].total_required_kg
assert(m1Total === round2(groups[0].lines.reduce((s, l) => s + l.required_kg, 0)), 'matching 1 total sums lines')

const grand = round2(groups.reduce((s, g) => s + g.total_required_kg, 0))
assert(grand > m1Total, `grand total ${grand} > matching1 ${m1Total}`)

// Over-issue guard logic
function canIssue(required, issue, allowOver) {
  if (allowOver) return true
  return issue <= required + 0.001
}
assert(canIssue(18.5, 10, false) === true, 'partial issue allowed')
assert(canIssue(18.5, 20, false) === false, 'over-issue blocked')
assert(canIssue(18.5, 20, true) === true, 'authorised over-issue allowed')

// Program status
function status(prog, produced) {
  if (produced <= 0) return 'PENDING'
  if (produced >= prog) return 'COMPLETED'
  return 'IN PROGRESS'
}
assert(status(500, 0) === 'PENDING', 'status pending')
assert(status(500, 350) === 'IN PROGRESS', 'status in progress')
assert(status(500, 500) === 'COMPLETED', 'status completed')

console.log('\n--- Matching-wise breakdown (500 MTR) ---')
for (const g of groups) {
  console.log(g.badge, 'total', g.total_required_kg, 'KG')
  for (const l of g.lines) {
    console.log(`  ${l.is_main_ground ? '●' : '○'} ${l.colour_name} (${l.role_label}) ${l.required_kg} KG`)
  }
}
console.log('GRAND TOTAL', grand, 'KG')

if (failed) {
  console.error(`\n${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('\nAll machine-wise production smoke checks passed.')
