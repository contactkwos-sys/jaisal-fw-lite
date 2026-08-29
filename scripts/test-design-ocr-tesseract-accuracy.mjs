/**
 * Accuracy smoke: run Tesseract.js on sample diner DIN photos (no Anthropic).
 * Mirrors browser rotation preference (270 → 0 → 90) + parser from designOcr.
 *
 * Run: node scripts/test-design-ocr-tesseract-accuracy.mjs
 */
import { createWorker } from 'tesseract.js'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ASSETS = '/home/ubuntu/.cursor/projects/workspace/assets'
const SAMPLES = [
  {
    file: '01a04b49-ba28-77f4-a758-88c8a7faf111.jpg',
    expectDin: 'JFG1738',
    expectLoom: '48',
    label: 'jfg1738-wxb Colour sheet',
  },
  {
    file: '01a04b49-bb34-7d35-9fa2-eee3e93d74bc.jpg',
    expectDin: 'JFG1674',
    expectLoom: '112',
    label: 'JFG-1674-wxb Colour sheet',
  },
  {
    file: '01a04b49-baa7-7f39-9599-a9f180ea3bde.jpg',
    expectDin: 'JFG2247',
    expectLoom: '50',
    label: 'Aditya diner DESIGNE-NUMBER JFG2247 BRT',
  },
]

const DESIGN_NUMBER_LABEL_RE =
  /(?:design[e]?[\s\-]*(?:number|no\.?|num)?|desi[\s\-]*(?:no\.?|number)?)\s*[-:=]?\s*\[?\s*([A-Za-z]{2,5}[\s\-]?\d{3,6}|\d{3,6})(?:[\s\-]+([A-Za-z]{2,8}))?\s*\]?/i
const DESIGN_NO_QUALITY_RE =
  /\b([A-Z]{2,5})[\s\-]*(\d{3,6})(?:[\s\-]+([A-Za-z]{2,8}))\b/gi
const TOTAL_FUZZY_RE = /\btota[l1]?\b\D{0,24}(\d+(?:\.\d+)?)\D{1,6}(\d{2,5}(?:\.\d+)?)/i
const ON_LOOM_PICK_RE = /on[\s\-]*l?o+m[\w]*[\s\-:=]*(\d+(?:\.\d+)?)/i
const N_PICK_RE = /\b(\d{2,4})\s*[-–]?\s*pick\b/gi

function normalizeDin(raw) {
  let t = (raw || '').trim().toUpperCase().replace(/[\[\]]/g, '')
  t = t.replace(/^9(FG[\s\-]?\d{3,6})/, 'J$1')
  const m = t.match(/^([A-Z]{2,5})[\s\-]*(\d{3,6})(?:[\s\-]+([A-Z0-9]{1,8}))?$/)
  let design = ''
  if (m) design = `${m[1]}${m[2]}`
  else {
    const loose = t.match(/([A-Z]{2,5})[\s\-]*(\d{3,6})/)
    if (loose) design = `${loose[1]}${loose[2]}`
  }
  if (/^[I19]FG\d{3,6}$/.test(design)) design = `J${design.slice(1)}`
  return { design, quality: m?.[3] || '' }
}

function extractDin(text, filename) {
  const candidates = []
  if (filename) {
    const n = normalizeDin(filename.replace(/\.[^.]+$/, ''))
    if (n.design) candidates.push({ v: n.design, score: 12 })
  }
  const labeled = text.match(DESIGN_NUMBER_LABEL_RE)
  if (labeled?.[1]) {
    const n = normalizeDin(`${labeled[1]}${labeled[2] ? ` ${labeled[2]}` : ''}`)
    if (n.design) candidates.push({ v: n.design, score: 25 })
  }
  for (const m of text.matchAll(new RegExp(DESIGN_NO_QUALITY_RE.source, 'gi'))) {
    const n = normalizeDin(`${m[1]}${m[2]}${m[3] ? ` ${m[3]}` : ''}`)
    if (n.design) candidates.push({ v: n.design, score: 8 })
  }
  const compact = text.toUpperCase().match(/\b([A-Z]{2,5}\d{3,6})\b/g) || []
  for (const c of compact) {
    const n = normalizeDin(c)
    if (n.design) candidates.push({ v: n.design, score: 5 })
  }
  for (const m of text.matchAll(/\b9(FG\d{3,6})\b/gi)) {
    candidates.push({ v: `J${m[1].toUpperCase()}`, score: 9 })
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]?.v || ''
}

function extractLoom(text) {
  const onLoom = text.match(ON_LOOM_PICK_RE)
  if (onLoom?.[1]) return onLoom[1]
  const fuzzy = text.match(TOTAL_FUZZY_RE)
  if (fuzzy?.[1]) return fuzzy[1]
  const nPick = [...text.matchAll(N_PICK_RE)].map((m) => m[1])
  if (nPick.length) return nPick.reduce((a, b) => (Number(b) > Number(a) ? b : a))
  return ''
}

function rotateWithPython(src, deg, dest) {
  const py = `
from PIL import Image, ImageOps, ImageEnhance
im = ImageOps.exif_transpose(Image.open(${JSON.stringify(src)})).convert('RGB')
im = im.rotate(-${deg}, expand=True)
im = ImageEnhance.Contrast(im).enhance(1.4)
w,h = im.size
m = max(w,h)
if m > 1800:
    s = 1800/m
    im = im.resize((int(w*s), int(h*s)))
im.save(${JSON.stringify(dest)}, quality=90)
print('ok')
`
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' })
  return r.status === 0
}

async function bestOcr(worker, srcPath, filename) {
  let best = { text: '', din: '', loom: '', score: -1, deg: null }
  for (const deg of [270, 0, 90]) {
    const dest = `/tmp/din-acc-${deg}.jpg`
    if (!rotateWithPython(srcPath, deg, dest)) continue
    const { data } = await worker.recognize(dest)
    const text = (data.text || '').trim()
    const din = extractDin(text, filename)
    const loom = extractLoom(text)
    let score = 0
    if (din) score += 10
    if (loom) score += 5
    score += Math.min(3, Math.floor(text.length / 200))
    if (score > best.score) best = { text, din, loom, score, deg }
    if (din && loom) break
  }
  return best
}

async function main() {
  // Ensure Pillow
  spawnSync('pip', ['install', '--user', 'pillow', '-q'], { encoding: 'utf8' })
  const worker = await createWorker('eng')
  const rows = []
  for (const sample of SAMPLES) {
    const src = path.join(ASSETS, sample.file)
    if (!fs.existsSync(src)) {
      rows.push({ ...sample, ok: false, note: 'missing file' })
      continue
    }
    const got = await bestOcr(worker, src, sample.file)
    const dinOk = got.din === sample.expectDin
    const loomOk = String(got.loom) === String(sample.expectLoom)
    rows.push({
      label: sample.label,
      expectDin: sample.expectDin,
      gotDin: got.din || '(none)',
      expectLoom: sample.expectLoom,
      gotLoom: got.loom || '(none)',
      rotation: got.deg,
      dinOk,
      loomOk,
      ok: dinOk,
    })
    console.log(
      `${dinOk ? '✓' : '✗'} ${sample.label}: DIN ${got.din || '—'} (expect ${sample.expectDin}), loom ${got.loom || '—'} (expect ${sample.expectLoom}), rot=${got.deg}`,
    )
  }
  await worker.terminate()
  const dinHits = rows.filter((r) => r.dinOk).length
  const loomHits = rows.filter((r) => r.loomOk).length
  console.log('\n--- Accuracy summary (Tesseract.js, no Anthropic) ---')
  console.log(`DIN number: ${dinHits}/${rows.length} correct`)
  console.log(`Loom pick:  ${loomHits}/${rows.length} correct`)
  console.log('Fields remain manually editable when OCR misses.')
  if (dinHits < 1) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
