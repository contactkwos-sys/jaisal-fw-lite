import { shareWhatsApp } from './share'

const COMPANY = {
  name: 'JAISAL FASHIONWEAVE INDUSTRIES',
  short: 'JAISAL FW',
  tagline: 'Fashionweave Industries',
}

function esc(s: string | number | null | undefined): string {
  return String(s ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const PRINT_CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b; font-size: 12px; margin: 0; }
  .doc { max-width: 190mm; margin: 0 auto; }
  .hdr { text-align: center; border-bottom: 2px solid #1769c2; padding-bottom: 8px; margin-bottom: 12px; }
  .hdr h1 { margin: 0; font-size: 18px; color: #1254a0; letter-spacing: 0.02em; }
  .hdr .sub { color: #64748b; font-size: 11px; margin-top: 2px; }
  .doc-title { text-align: center; font-size: 15px; font-weight: 700; margin: 10px 0; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-bottom: 12px; }
  .meta div { display: flex; gap: 6px; }
  .meta span { color: #64748b; min-width: 90px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #94a3b8; padding: 6px 8px; text-align: left; }
  th { background: #e8f1fb; font-weight: 600; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .tot { text-align: right; font-weight: 700; margin-top: 10px; }
  .foot { margin-top: 24px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
  .sign { margin-top: 36px; display: flex; justify-content: space-between; }
  .sign div { text-align: center; min-width: 120px; border-top: 1px solid #94a3b8; padding-top: 4px; }
  .page-num::after { content: counter(page); }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`

export function openPrintWindow(title: string, bodyHtml: string) {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=820,height=1000')
  if (!w) {
    window.print()
    return
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>${PRINT_CSS}</style></head><body>
<div class="doc">
  <div class="hdr">
    <h1>${esc(COMPANY.name)}</h1>
    <div class="sub">${esc(COMPANY.tagline)} · ${esc(COMPANY.short)}</div>
  </div>
  ${bodyHtml}
  <div class="foot"><span>Generated ${new Date().toLocaleString('en-IN')}</span><span>Page <span class="page-num"></span></span></div>
</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`)
  w.document.close()
}

export function printChallan(opts: {
  challanNo: string
  date: string
  party: string
  marka: string
  design: string
  quality: string
  colour: string
  lots: Array<{ lot_no: string; meter: number }>
  totalMeter: number
}) {
  const rows = opts.lots
    .map((l) => `<tr><td>${esc(l.lot_no)}</td><td>${esc(l.meter)}</td></tr>`)
    .join('')
  openPrintWindow(
    `Challan ${opts.challanNo}`,
    `<div class="doc-title">Delivery Challan</div>
    <div class="meta">
      <div><span>Challan No.</span><strong>${esc(opts.challanNo)}</strong></div>
      <div><span>Date</span><strong>${esc(opts.date)}</strong></div>
      <div><span>Party</span><strong>${esc(opts.party)}</strong></div>
      <div><span>Marka</span><strong>${esc(opts.marka)}</strong></div>
      <div><span>Design</span><strong>${esc(opts.design)}</strong></div>
      <div><span>Quality</span><strong>${esc(opts.quality)}</strong></div>
      <div><span>Colour</span><strong>${esc(opts.colour)}</strong></div>
    </div>
    <table><thead><tr><th>Lot No.</th><th>Meter</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="tot">Total Meter: ${esc(opts.totalMeter.toLocaleString('en-IN'))}</p>
    <div class="sign"><div>Prepared By</div><div>Received By</div><div>Authorised</div></div>`,
  )
}

export function printGatePass(opts: {
  gpNo: string
  challanNo: string
  date: string
  time: string
  party: string
  marka: string
  totalMeter: number
  lotsCount: number
  vehicle: string
  transporter: string
  driver: string
  remarks: string
}) {
  openPrintWindow(
    `Gate Pass ${opts.gpNo}`,
    `<div class="doc-title">Gate Pass</div>
    <div class="meta">
      <div><span>Gate Pass No.</span><strong>${esc(opts.gpNo)}</strong></div>
      <div><span>Challan No.</span><strong>${esc(opts.challanNo)}</strong></div>
      <div><span>Date</span><strong>${esc(opts.date)}</strong></div>
      <div><span>Time</span><strong>${esc(opts.time)}</strong></div>
      <div><span>Party</span><strong>${esc(opts.party)}</strong></div>
      <div><span>Marka</span><strong>${esc(opts.marka)}</strong></div>
      <div><span>Total Meter</span><strong>${esc(opts.totalMeter)}</strong></div>
      <div><span>No. of Lots</span><strong>${esc(opts.lotsCount)}</strong></div>
      <div><span>Vehicle No.</span><strong>${esc(opts.vehicle)}</strong></div>
      <div><span>Transporter</span><strong>${esc(opts.transporter)}</strong></div>
      <div><span>Driver</span><strong>${esc(opts.driver)}</strong></div>
      <div><span>Remarks</span><strong>${esc(opts.remarks)}</strong></div>
    </div>
    <div class="sign"><div>Security</div><div>Driver</div><div>Authorised</div></div>`,
  )
}

export function printGstInvoice(opts: {
  invoiceNo: string
  invoiceDate: string
  party: string
  gstin: string
  billing: string
  shipping: string
  design: string
  quality: string
  colour: string
  marka: string
  qty: number
  rate: number
  taxable: number
  gstPct: number
  cgst: number
  sgst: number
  igst: number
  grand: number
}) {
  openPrintWindow(
    `Invoice ${opts.invoiceNo}`,
    `<div class="doc-title">Tax Invoice</div>
    <div class="meta">
      <div><span>Invoice No.</span><strong>${esc(opts.invoiceNo)}</strong></div>
      <div><span>Date</span><strong>${esc(opts.invoiceDate)}</strong></div>
      <div><span>Party</span><strong>${esc(opts.party)}</strong></div>
      <div><span>GSTIN</span><strong>${esc(opts.gstin)}</strong></div>
      <div><span>Billing</span><strong>${esc(opts.billing)}</strong></div>
      <div><span>Shipping</span><strong>${esc(opts.shipping)}</strong></div>
      <div><span>Marka</span><strong>${esc(opts.marka)}</strong></div>
      <div><span>Design</span><strong>${esc(opts.design)}</strong></div>
    </div>
    <table>
      <thead><tr><th>Description</th><th>Quality</th><th>Colour</th><th>Qty (m)</th><th>Rate</th><th>Taxable</th></tr></thead>
      <tbody><tr>
        <td>${esc(opts.design)}</td><td>${esc(opts.quality)}</td><td>${esc(opts.colour)}</td>
        <td>${esc(opts.qty)}</td><td>${esc(opts.rate)}</td><td>${esc(opts.taxable.toFixed(2))}</td>
      </tr></tbody>
    </table>
    <p class="tot">
      Taxable: ₹${esc(opts.taxable.toFixed(2))} · GST ${esc(opts.gstPct)}%<br/>
      CGST: ₹${esc(opts.cgst.toFixed(2))} · SGST: ₹${esc(opts.sgst.toFixed(2))} · IGST: ₹${esc(opts.igst.toFixed(2))}<br/>
      <strong>Grand Total: ₹${esc(opts.grand.toFixed(2))}</strong>
    </p>
    <div class="sign"><div>For ${esc(COMPANY.short)}</div><div>Customer</div></div>`,
  )
}

export function printReport(title: string, headers: string[], rows: (string | number)[][]) {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('')
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  openPrintWindow(
    title,
    `<div class="doc-title">${esc(title)}</div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
  )
}

export function shareDocWhatsApp(label: string, lines: string[]) {
  const text = [`*${COMPANY.name}*`, `*${label}*`, '', ...lines].join('\n')
  shareWhatsApp(text)
}

export type WeftSlipPrintGroup = {
  badge: string
  lines: Array<{
    colour_name: string
    colour_hex: string
    role_label: string
    is_main_ground: boolean
    required_kg: number
    issued_kg: number
  }>
  total_required_kg: number
}

/** A4 Weft Yarn Issue Slip — for yarn store handoff with signature lines. */
export function printWeftYarnIssueSlip(opts: {
  issueNo: string
  date: string
  machineNo: string
  dinNumber: string
  design: string
  programNo: string
  jobCardNo: string
  party: string
  marka: string
  programMeter: number
  shift: string
  issuedBy: string
  receivedBy: string
  groups: WeftSlipPrintGroup[]
  totalRequiredKg: number
  totalIssuedKg: number
}) {
  const matchingBlocks = opts.groups
    .map((g) => {
      const rows = g.lines
        .map((l) => {
          const role = l.is_main_ground
            ? `<strong style="text-transform:uppercase">${esc(l.role_label)}</strong>`
            : esc(l.role_label)
          return `<tr class="${l.is_main_ground ? 'main-ground' : ''}">
            <td><span class="dot" style="background:${esc(l.colour_hex)}"></span> ${esc(l.colour_name)}</td>
            <td>${role}</td>
            <td>${esc(l.required_kg.toFixed(2))}</td>
            <td>${esc(l.issued_kg.toFixed(2))}</td>
          </tr>`
        })
        .join('')
      return `<div class="matching-block">
        <div class="matching-badge">${esc(g.badge)}</div>
        <table>
          <thead><tr><th>Color / Item</th><th>Role</th><th>Required KG</th><th>Issued KG</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td colspan="2"><strong>TOTAL ${esc(g.badge)}</strong></td>
            <td colspan="2"><strong>${esc(g.total_required_kg.toFixed(2))} KG</strong></td></tr></tfoot>
        </table>
      </div>`
    })
    .join('')

  openPrintWindow(
    `Weft Yarn Issue ${opts.issueNo}`,
    `<style>
      .din-badge{display:inline-block;background:#1254a0;color:#fff;font-weight:700;padding:6px 14px;border-radius:999px;font-size:14px;letter-spacing:0.04em;margin:8px 0}
      .matching-badge{display:inline-block;background:#e8f1fb;color:#1254a0;border:1px solid #1769c2;font-weight:700;padding:4px 12px;border-radius:999px;margin:12px 0 6px;font-size:12px}
      .dot{display:inline-block;width:12px;height:12px;border-radius:50%;border:1px solid #94a3b8;vertical-align:middle;margin-right:6px}
      tr.main-ground td{background:#f0f7ff;font-weight:600}
      .sign-wide{margin-top:48px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}
      .sign-wide div{text-align:center;border-top:1px solid #94a3b8;padding-top:6px;min-height:48px}
      .sign-wide .hint{font-size:10px;color:#64748b;margin-top:2px}
    </style>
    <div class="doc-title">Weft Yarn Issue Slip</div>
    <div style="text-align:center"><span class="din-badge">DIN: ${esc(opts.dinNumber)}</span></div>
    <div class="meta">
      <div><span>Issue No.</span><strong>${esc(opts.issueNo)}</strong></div>
      <div><span>Date</span><strong>${esc(opts.date)}</strong></div>
      <div><span>Machine No.</span><strong>${esc(opts.machineNo)}</strong></div>
      <div><span>Shift</span><strong>${esc(opts.shift || '—')}</strong></div>
      <div><span>Design</span><strong>${esc(opts.design)}</strong></div>
      <div><span>Program No.</span><strong>${esc(opts.programNo)}</strong></div>
      <div><span>Job Card No.</span><strong>${esc(opts.jobCardNo || '—')}</strong></div>
      <div><span>Program Meter</span><strong>${esc(opts.programMeter)} MTR</strong></div>
      <div><span>Party</span><strong>${esc(opts.party)}</strong></div>
      <div><span>Marka</span><strong>${esc(opts.marka || '—')}</strong></div>
    </div>
    <p style="font-weight:700;margin:14px 0 4px;text-transform:uppercase;letter-spacing:0.03em">Matching-wise Yarn Requirement</p>
    ${matchingBlocks}
    <p class="tot">TOTAL WEFT KG: ${esc(opts.totalRequiredKg.toFixed(2))} &nbsp;·&nbsp; Issued this slip: ${esc(opts.totalIssuedKg.toFixed(2))} KG</p>
    <div class="sign-wide">
      <div>Issued By<br/><strong>${esc(opts.issuedBy || 'Yarn Store')}</strong><div class="hint">Signature &nbsp;____________________</div><div class="hint">Date &nbsp;____________________</div></div>
      <div>Received By<br/><strong>${esc(opts.receivedBy || 'Machine / Operator')}</strong><div class="hint">Signature &nbsp;____________________</div><div class="hint">Date &nbsp;____________________</div></div>
      <div>Store Verification<div class="hint">Signature &nbsp;____________________</div><div class="hint">Date &nbsp;____________________</div></div>
    </div>`,
  )
}
