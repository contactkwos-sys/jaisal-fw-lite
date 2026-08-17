import { useCallback, useEffect, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { supabase } from '../lib/supabase'

type Sub = 'inward' | 'maintenance' | 'dispatch'
type Props = { initialSub?: string }

type LogRow = {
  id: string
  when: string
  kind: string
  party: string
  detail: string
  amount?: string
}

export function SecurityGateScreen({ initialSub }: Props) {
  const [sub, setSub] = useState<Sub>(
    initialSub === 'maintenance' || initialSub === 'dispatch' ? initialSub : 'inward',
  )
  const [rows, setRows] = useState<LogRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSub === 'inward' || initialSub === 'maintenance' || initialSub === 'dispatch') {
      setSub(initialSub)
    }
  }, [initialSub])

  const load = useCallback(async () => {
    setError(null)
    if (sub === 'inward') {
      const [g, w, warp] = await Promise.all([
        supabase
          .from('general_purchases')
          .select('id, party_name, challan_no, grand_total, created_at')
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('weft_purchases')
          .select('id, party_name, supplier, challan_no, grand_total, created_at')
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('warp_yarn_inward')
          .select('id, party_name, qty_kg, created_at')
          .order('created_at', { ascending: false })
          .limit(80),
      ])
      const list: LogRow[] = [
        ...(g.data ?? []).map((r) => ({
          id: `g-${r.id}`,
          when: String(r.created_at),
          kind: 'General',
          party: String(r.party_name || '—'),
          detail: `Challan ${r.challan_no || '—'}`,
          amount: `₹${Number(r.grand_total || 0).toFixed(0)}`,
        })),
        ...(w.data ?? []).map((r) => ({
          id: `w-${r.id}`,
          when: String(r.created_at),
          kind: 'Weft',
          party: String(r.party_name || r.supplier || '—'),
          detail: `Challan ${r.challan_no || '—'}`,
          amount: `₹${Number(r.grand_total || 0).toFixed(0)}`,
        })),
        ...(warp.data ?? []).map((r) => ({
          id: `warp-${r.id}`,
          when: String(r.created_at),
          kind: 'Warp yarn',
          party: String(r.party_name || '—'),
          detail: `${Number(r.qty_kg || 0).toFixed(1)} kg`,
        })),
      ].sort((a, b) => (a.when < b.when ? 1 : -1))
      setRows(list)
      return
    }

    if (sub === 'maintenance') {
      const [mi, inv, tr] = await Promise.all([
        supabase
          .from('maintenance_inward')
          .select('id, party_name, challan_no, grand_total, created_at')
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('maintenance_repair_invoices')
          .select('id, vendor_name, invoice_no, grand_total, created_at')
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('repairing_tracker')
          .select('id, item_name, vendor, gatepass_no, status, created_at')
          .order('created_at', { ascending: false })
          .limit(80),
      ])
      const list: LogRow[] = [
        ...(mi.data ?? []).map((r) => ({
          id: `mi-${r.id}`,
          when: String(r.created_at),
          kind: 'Maint inward',
          party: String(r.party_name || '—'),
          detail: `Challan ${r.challan_no || '—'}`,
          amount: `₹${Number(r.grand_total || 0).toFixed(0)}`,
        })),
        ...(inv.data ?? []).map((r) => ({
          id: `inv-${r.id}`,
          when: String(r.created_at),
          kind: 'Repair invoice',
          party: String(r.vendor_name || '—'),
          detail: `Inv ${r.invoice_no || '—'}`,
          amount: `₹${Number(r.grand_total || 0).toFixed(0)}`,
        })),
        ...(tr.data ?? []).map((r) => ({
          id: `tr-${r.id}`,
          when: String(r.created_at),
          kind: `Repair ${r.status}`,
          party: String(r.vendor || '—'),
          detail: `${r.item_name} · GP ${r.gatepass_no}`,
        })),
      ].sort((a, b) => (a.when < b.when ? 1 : -1))
      setRows(list)
      return
    }

    const [ch, gp] = await Promise.all([
      supabase
        .from('challans')
        .select('id, challan_no, party, meter, total, created_at')
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('gatepass')
        .select('id, gatepass_no, vehicle_no, date, driver_signed, received_signed, created_at')
        .order('created_at', { ascending: false })
        .limit(80),
    ])
    const list: LogRow[] = [
      ...(ch.data ?? []).map((r) => ({
        id: `ch-${r.id}`,
        when: String(r.created_at),
        kind: 'Challan',
        party: String(r.party || '—'),
        detail: `${r.challan_no} · ${Number(r.meter || 0).toFixed(1)} m`,
        amount: `₹${Number(r.total || 0).toFixed(0)}`,
      })),
      ...(gp.data ?? []).map((r) => ({
        id: `gp-${r.id}`,
        when: String(r.created_at),
        kind: 'Gatepass',
        party: String(r.vehicle_no || '—'),
        detail: `${r.gatepass_no || '—'} · ${r.date} · D:${r.driver_signed ? '✓' : '–'} R:${r.received_signed ? '✓' : '–'}`,
      })),
    ].sort((a, b) => (a.when < b.when ? 1 : -1))
    setRows(list)
  }, [sub])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Security Gate</h1>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'inward', label: 'Inward — All' },
            { id: 'maintenance', label: 'Maintenance — All' },
            { id: 'dispatch', label: 'Dispatch — All' },
          ]}
        />
      </header>
      <p className="text-muted">Read-only consolidated gate log</p>
      <div className="list">
        {rows.map((r) => (
          <article key={r.id} className="card-row surface row-top">
            <div>
              <strong>
                {r.kind} · {r.party}
              </strong>
              <div className="text-muted">
                {String(r.when).replace('T', ' ').slice(0, 16)} · {r.detail}
              </div>
            </div>
            {r.amount ? <span className="num text-weft">{r.amount}</span> : null}
          </article>
        ))}
        {!rows.length ? <p className="text-muted">No records</p> : null}
      </div>
      {error ? <p className="form-error text-danger">{error}</p> : null}
    </div>
  )
}
