import { useCallback, useEffect, useMemo, useState } from 'react'
import { DtoStatusPill, ImageLightbox } from '../components/ImageLightbox'
import {
  fetchDins,
  matchingColourLabel,
  whatsappDinPromoMessage,
  type DinMatching,
  type DinWithMatchings,
} from '../lib/designToOrder'
import type { NavTarget } from '../lib/nav'
import { shareNativeOrWhatsApp, shareWhatsApp, shareWhatsAppBusiness } from '../lib/share'
import { supabase } from '../lib/supabase'

type Props = { onNavigate: (t: NavTarget) => void; initialDinId?: string }

type PartyRow = { id: string; party_name: string; phone: string | null }

export function DtoSamplePromotionScreen({ initialDinId }: Props) {
  const [dins, setDins] = useState<DinWithMatchings[]>([])
  const [dinId, setDinId] = useState(initialDinId || '')
  const [matchingId, setMatchingId] = useState('')
  const [parties, setParties] = useState<PartyRow[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [list, master, crm] = await Promise.all([
      fetchDins(200),
      supabase.from('party_master').select('id, party_name').order('party_name').limit(500),
      supabase.from('crm_customers').select('id, name, whatsapp_number').order('name').limit(300),
    ])
    setDins(list)
    setDinId((prev) => prev || initialDinId || list[0]?.id || '')
    const map = new Map<string, PartyRow>()
    // CRM phones first (Party Master is name-only in current schema)
    for (const c of crm.data ?? []) {
      const name = String(c.name || '')
      if (!name) continue
      map.set(name.toLowerCase(), {
        id: c.id,
        party_name: name,
        phone: c.whatsapp_number ? String(c.whatsapp_number) : null,
      })
    }
    for (const p of master.data ?? []) {
      const name = String(p.party_name || '')
      if (!name) continue
      const key = name.toLowerCase()
      if (map.has(key)) continue
      map.set(key, { id: p.id, party_name: name, phone: null })
    }
    setParties([...map.values()].sort((a, b) => a.party_name.localeCompare(b.party_name)))
  }, [initialDinId])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const din = useMemo(() => dins.find((d) => d.id === dinId) || null, [dins, dinId])
  const matchings = useMemo(() => {
    const all = din?.din_matchings?.slice().sort((a, b) => a.matching_no - b.matching_no) || []
    const approved = all.filter((m) => m.status === 'Approved')
    return approved.length ? approved : all
  }, [din])

  useEffect(() => {
    if (!matchings.length) {
      setMatchingId('')
      return
    }
    if (!matchingId || !matchings.some((m) => m.id === matchingId)) {
      setMatchingId(matchings[0].id)
    }
  }, [matchings, matchingId])

  const matching: DinMatching | null = matchings.find((m) => m.id === matchingId) || null
  // Sales sees only final sample assets — never internal DIN sheet/costing images
  const mainPhoto = din?.main_sample_photo_url || matching?.approved_photo_url || null
  const combinedPhoto = din?.combined_matching_photo_url || null
  const photo = mainPhoto
  const saleRate = din?.approved_sale_rate ?? din?.final_cost_per_mtr ?? null

  const filteredParties = parties.filter((p) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return p.party_name.toLowerCase().includes(needle) || (p.phone || '').includes(needle)
  })

  function promoText() {
    if (!din) return ''
    return whatsappDinPromoMessage({
      din_number: din.din_number,
      design_name: din.design_name,
      matching_no: matching?.matching_no,
      colours: matching ? matchingColourLabel(matching) : undefined,
      imageUrl: photo,
      rate: saleRate,
    })
  }

  function openWa(phone: string | null, business = false) {
    const text = promoText()
    const digits = (phone || '').replace(/\D/g, '')
    if (digits) {
      const base = business ? 'https://api.whatsapp.com/send' : 'https://wa.me'
      window.open(`${base}/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
      return
    }
    if (business) shareWhatsAppBusiness(text)
    else shareWhatsApp(text)
  }

  function downloadImage() {
    if (!photo) {
      setError('No sample photo to download')
      return
    }
    const a = document.createElement('a')
    a.href = photo
    a.download = `${din?.din_number || 'din'}-matching.jpg`
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
    setMessage('Download started')
  }

  function broadcastAll() {
    const text = promoText()
    void shareNativeOrWhatsApp(text, 'JAISAL FW Sample')
    setMessage('Opened share sheet / WhatsApp for broadcast')
  }

  function emailShare() {
    const subject = encodeURIComponent(`JAISAL FW Sample ${din?.din_number || ''}`)
    const body = encodeURIComponent(promoText())
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  return (
    <div className="screen dto-screen">
      <header className="screen-header">
        <div>
          <h1>Sample Promotion</h1>
          <p className="text-muted">
            Sales sees Main Sample Photo + Combined Matching Photo + Approved Sale Rate only — never
            internal DIN costing.
          </p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <section className="surface dto-panel">
        <div className="dto-form-grid">
          <label className="field">
            <span>DIN</span>
            <select
              value={dinId}
              onChange={(e) => {
                setDinId(e.target.value)
                setMatchingId('')
              }}
            >
              {dins.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.din_number} · {d.design_name || '—'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Matching</span>
            <select value={matchingId} onChange={(e) => setMatchingId(e.target.value)}>
              {matchings.map((m) => (
                <option key={m.id} value={m.id}>
                  #{m.matching_no} · {matchingColourLabel(m)} · {m.status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="dto-promo-hero">
          <ImageLightbox src={photo} alt="Main sample" thumbClassName="dto-thumb-hero" />
          {combinedPhoto ? (
            <ImageLightbox src={combinedPhoto} alt="Combined matchings" thumbClassName="dto-thumb-hero" />
          ) : null}
          <div>
            <h2>{din?.design_name || din?.din_number}</h2>
            {matching ? (
              <p>
                Matching {matching.matching_no} · <DtoStatusPill status={matching.status} />
              </p>
            ) : null}
            {saleRate != null ? (
              <p className="text-muted">Approved Sale Rate: ₹{Number(saleRate).toFixed(2)}/mtr</p>
            ) : (
              <p className="text-muted2">Approved sale rate pending CEO finalize</p>
            )}
            {!mainPhoto ? (
              <p className="form-error">Upload Final Sample photos in Sample Tracking before promoting.</p>
            ) : null}
            <div className="dto-share-bar">
              <button type="button" className="btn-warp" onClick={broadcastAll} disabled={!mainPhoto}>
                Broadcast
              </button>
              <button type="button" className="btn-warp" onClick={emailShare} disabled={!mainPhoto}>
                Email
              </button>
              <button type="button" className="btn-warp" onClick={downloadImage} disabled={!mainPhoto}>
                Download Image
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="surface dto-panel">
        <div className="dto-panel-head">
          <h2 className="section-title">Customer / Party list</h2>
          <input className="dto-search" placeholder="Search party / phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Party</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredParties.map((p) => (
                <tr key={p.id}>
                  <td>{p.party_name}</td>
                  <td>{p.phone || '—'}</td>
                  <td className="dto-row-actions">
                    <button type="button" className="link-btn" onClick={() => openWa(p.phone, false)}>
                      WhatsApp
                    </button>
                    <button type="button" className="link-btn" onClick={() => openWa(p.phone, true)}>
                      WhatsApp Business
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted">Uses open/share WhatsApp links — no unauthorized WhatsApp API automation.</p>
      </section>
    </div>
  )
}
