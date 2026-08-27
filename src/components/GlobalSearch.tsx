/**
 * Global factory search — opens primary business screens.
 * No technical IDs shown in results.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NavTarget } from '../lib/nav'
import { supabase } from '../lib/supabase'

type Props = {
  onNavigate: (t: NavTarget) => void
}

type Hit = {
  id: string
  kind: string
  title: string
  subtitle: string
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
        supabase.from('weft_yarn_stock').select('id, colour_no, colour_name, quality, supplier').or(`colour_no.ilike.${like},colour_name.ilike.${like},quality.ilike.${like}`).limit(8),
        supabase.from('workers').select('id, full_name, employee_code').or(`full_name.ilike.${like},employee_code.ilike.${like}`).limit(6),
        supabase.from('challans').select('id, challan_no, party').or(`challan_no.ilike.${like},party.ilike.${like}`).limit(6),
        supabase.from('gst_invoices').select('id, invoice_no, party_name').or(`invoice_no.ilike.${like},party_name.ilike.${like}`).limit(6),
        supabase.from('designs').select('id, dno, colour').or(`dno.ilike.${like},colour.ilike.${like}`).limit(6),
      ])

      const out: Hit[] = []
      for (const o of orders.data ?? []) {
        out.push({
          id: `ord-${o.id}`,
          kind: 'Order',
          title: o.order_no || 'Order',
          subtitle: `${o.party_name || '—'} · ${o.status || ''}`,
          nav: { screen: 'order-to-program', filter: 'order-status', module: 'order-to-program' },
        })
      }
      for (const p of parties.data ?? []) {
        out.push({
          id: `pty-${p.id}`,
          kind: 'Customer',
          title: p.party_name || 'Customer',
          subtitle: p.marka ? `Marka ${p.marka}` : 'Party master',
          nav: { screen: 'parties', module: 'masters' },
        })
      }
      for (const d of dins.data ?? []) {
        out.push({
          id: `din-${d.id}`,
          kind: 'DIN',
          title: d.din_number || 'DIN',
          subtitle: d.design_name || d.status || 'Design',
          nav: { screen: 'design-wise-costing', filter: d.din_number || undefined, module: 'design-to-order' },
        })
      }
      for (const d of designs.data ?? []) {
        out.push({
          id: `des-${d.id}`,
          kind: 'Design',
          title: d.dno || 'Design',
          subtitle: d.colour || 'Old design register',
          nav: { screen: 'design', module: 'design-to-order' },
        })
      }
      for (const y of yarns.data ?? []) {
        out.push({
          id: `yrn-${y.id}`,
          kind: 'Yarn',
          title: `Colour ${y.colour_no || y.colour_name || '—'}`,
          subtitle: [y.quality, y.supplier].filter(Boolean).join(' · ') || 'Yarn stock',
          nav: { screen: 'stock', sub: 'weft', module: 'inventory' },
        })
      }
      for (const w of workers.data ?? []) {
        out.push({
          id: `emp-${w.id}`,
          kind: 'Employee',
          title: w.full_name || 'Employee',
          subtitle: w.employee_code || 'HR',
          nav: { screen: 'hr-payroll', sub: 'employees', module: 'hr-payroll' },
        })
      }
      for (const c of challans.data ?? []) {
        out.push({
          id: `ch-${c.id}`,
          kind: 'Challan',
          title: c.challan_no || 'Challan',
          subtitle: c.party || 'Dispatch',
          nav: { screen: 'program-dispatch', sub: 'challan', module: 'program-dispatch' },
        })
      }
      for (const inv of invoices.data ?? []) {
        out.push({
          id: `inv-${inv.id}`,
          kind: 'Invoice',
          title: inv.invoice_no || 'Invoice',
          subtitle: inv.party_name || 'GST Invoice',
          nav: { screen: 'program-dispatch', sub: 'invoice', module: 'program-dispatch' },
        })
      }

      // Machine shortcut
      const m = t.toUpperCase().match(/^M([1-6])$/) || t.toUpperCase().match(/^MACHINE\s*([1-6])$/)
      if (m) {
        out.unshift({
          id: `mach-${m[1]}`,
          kind: 'Machine',
          title: `Machine ${m[1]}`,
          subtitle: 'Program / Production',
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
      {open && (q.trim().length >= 2) ? (
        <div className="global-search-panel surface" role="listbox">
          {busy ? <p className="text-muted">Searching…</p> : null}
          {!busy && !hits.length ? <p className="text-muted">No matches</p> : null}
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
              <span className="global-search-kind">{h.kind}</span>
              <span className="global-search-title">{h.title}</span>
              <span className="text-muted global-search-sub">{h.subtitle}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
