/**
 * Global factory search — opens primary business screens.
 * Result columns: Type · Number · Name · Status
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NavTarget } from '../lib/nav'
import { friendlyFactoryStatus } from '../lib/orderToProgram'
import { supabase } from '../lib/supabase'

type Props = {
  onNavigate: (t: NavTarget) => void
}

type Hit = {
  id: string
  type: string
  number: string
  name: string
  status: string
  nav: NavTarget
}

export function GlobalSearch({ onNavigate }: Props) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const search = useCallback(async (term: string) => {
    const t = term.trim().replace(/[,.%()]/g, ' ').replace(/\s+/g, ' ').trim()
    if (t.length < 2) {
      setHits([])
      return
    }
    setBusy(true)
    try {
      const like = `%${t}%`
      const [
        orders,
        parties,
        dins,
        yarns,
        workers,
        challans,
        invoices,
        designs,
      ] = await Promise.all([
        supabase.from('order_book').select('id, order_no, party_name, status').or(`order_no.ilike.${like},party_name.ilike.${like}`).limit(8),
        supabase.from('party_master').select('id, party_name, marka').ilike('party_name', like).limit(6),
        supabase.from('dins').select('id, din_number, design_name, status').or(`din_number.ilike.${like},design_name.ilike.${like}`).limit(8),
        supabase.from('weft_yarn_stock').select('id, colour_no, colour_name, quality, supplier, stock_kg').or(`colour_no.ilike.${like},colour_name.ilike.${like},quality.ilike.${like}`).limit(8),
        supabase.from('workers').select('id, full_name, employee_code').or(`full_name.ilike.${like},employee_code.ilike.${like}`).limit(6),
        supabase.from('challans').select('id, challan_no, party, status').or(`challan_no.ilike.${like},party.ilike.${like}`).limit(6),
        supabase.from('gst_invoices').select('id, invoice_no, party_name').or(`invoice_no.ilike.${like},party_name.ilike.${like}`).limit(6),
        supabase.from('designs').select('id, dno, colour').or(`dno.ilike.${like},colour.ilike.${like}`).limit(6),
      ])

      const out: Hit[] = []
      for (const o of orders.data ?? []) {
        out.push({
          id: `ord-${o.id}`,
          type: 'Order',
          number: o.order_no || '—',
          name: o.party_name || '—',
          status: friendlyFactoryStatus(o.status),
          nav: { screen: 'order-to-program', filter: 'order-status', module: 'order-to-program' },
        })
      }
      for (const p of parties.data ?? []) {
        out.push({
          id: `pty-${p.id}`,
          type: 'Customer',
          number: p.marka || '—',
          name: p.party_name || 'Customer',
          status: 'READY',
          nav: { screen: 'parties', module: 'masters' },
        })
      }
      for (const d of dins.data ?? []) {
        out.push({
          id: `din-${d.id}`,
          type: 'DIN',
          number: d.din_number || '—',
          name: d.design_name || '—',
          status: friendlyFactoryStatus(d.status),
          nav: { screen: 'design-wise-costing', filter: d.din_number || undefined, module: 'design-to-order' },
        })
      }
      for (const d of designs.data ?? []) {
        out.push({
          id: `des-${d.id}`,
          type: 'Design',
          number: d.dno || '—',
          name: d.colour || 'Design',
          status: 'READY',
          nav: { screen: 'design', module: 'design-to-order' },
        })
      }
      for (const y of yarns.data ?? []) {
        out.push({
          id: `yrn-${y.id}`,
          type: 'Yarn',
          number: String(y.colour_no || '—'),
          name: [y.colour_name, y.quality].filter(Boolean).join(' · ') || 'Yarn',
          status: Number(y.stock_kg) > 0 ? 'READY' : 'PENDING',
          nav: { screen: 'stock', sub: 'weft', module: 'inventory' },
        })
      }
      for (const w of workers.data ?? []) {
        out.push({
          id: `emp-${w.id}`,
          type: 'Employee',
          number: w.employee_code || '—',
          name: w.full_name || 'Employee',
          status: 'READY',
          nav: { screen: 'hr-payroll', sub: 'employees', module: 'hr-payroll' },
        })
      }
      for (const c of challans.data ?? []) {
        out.push({
          id: `ch-${c.id}`,
          type: 'Challan',
          number: c.challan_no || '—',
          name: c.party || '—',
          status: friendlyFactoryStatus(c.status),
          nav: { screen: 'program-dispatch', sub: 'challan', module: 'program-dispatch' },
        })
      }
      for (const inv of invoices.data ?? []) {
        out.push({
          id: `inv-${inv.id}`,
          type: 'Invoice',
          number: inv.invoice_no || '—',
          name: inv.party_name || '—',
          status: 'READY',
          nav: { screen: 'program-dispatch', sub: 'invoice', module: 'program-dispatch' },
        })
      }

      const m = t.toUpperCase().match(/^M([1-6])$/) || t.toUpperCase().match(/^MACHINE\s*([1-6])$/)
      if (m) {
        out.unshift({
          id: `mach-${m[1]}`,
          type: 'Machine',
          number: `M${m[1]}`,
          name: `Machine ${m[1]}`,
          status: 'READY',
          nav: { screen: 'order-to-program', filter: 'program', module: 'order-to-program' },
        })
      }

      setHits(out.slice(0, 24))
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void search(q)
    }, 280)
    return () => window.clearTimeout(handle)
  }, [q, search])

  return (
    <div className="global-search" ref={wrapRef}>
      <label className="global-search-field">
        <span className="sr-only">Search factory</span>
        <input
          type="search"
          value={q}
          placeholder="Search order, customer, DIN, colour, yarn, machine…"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          autoComplete="off"
        />
      </label>
      {open && q.trim().length >= 2 ? (
        <div className="global-search-panel surface" role="listbox">
          {busy ? <p className="text-muted">Searching…</p> : null}
          {!busy && !hits.length ? <p className="text-muted">No matches</p> : null}
          {hits.length ? (
            <div className="global-search-head text-muted">
              <span>Type</span>
              <span>Number</span>
              <span>Name</span>
              <span>Status</span>
            </div>
          ) : null}
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              className="global-search-hit"
              onClick={() => {
                onNavigate(h.nav)
                setOpen(false)
                setQ('')
              }}
            >
              <span className="global-search-kind">{h.type}</span>
              <span className="global-search-title">{h.number}</span>
              <span className="text-muted global-search-sub">{h.name}</span>
              <span className="global-search-status">{h.status}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
