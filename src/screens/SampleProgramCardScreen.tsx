import { useMemo, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { useAuth } from '../lib/auth'
import { CTR_COLOUR_NAMES, MACHINES } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { DesignWiseCosting } from '../pages/DesignWiseCosting'
import { printSummary, rowsToHtml, shareWhatsApp, shareWhatsAppBusiness } from '../lib/share'
import { supabase } from '../lib/supabase'

type CostInfo = {
  din: string
  designId: string | null
  costPerMeter: number
  sellRate: number
  difference: number
}

export function SampleProgramCardScreen() {
  const { profile } = useAuth()
  const [costInfo, setCostInfo] = useState<CostInfo | null>(null)
  const [machineNo, setMachineNo] = useState<string>(MACHINES[0])
  const [warpColour, setWarpColour] = useState('')
  const [weftColour, setWeftColour] = useState('')
  const [colourName, setColourName] = useState<string>(CTR_COLOUR_NAMES[0])
  const [colourNumber, setColourNumber] = useState('')
  const [supplier, setSupplier] = useState('')
  const [pic1, setPic1] = useState('')
  const [pic2, setPic2] = useState('')
  const [pic3, setPic3] = useState('')
  const [jobCardRef, setJobCardRef] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const shareText = useMemo(() => {
    if (!costInfo) return ''
    return [
      `Sample Program Card`,
      `DIN: ${costInfo.din}`,
      `Cost/mtr: ₹${costInfo.costPerMeter.toFixed(2)}`,
      `Sell: ₹${costInfo.sellRate.toFixed(2)} · Diff: ₹${costInfo.difference.toFixed(2)}`,
      `Machine: ${machineNo}`,
      `Warp: ${warpColour || '—'} · Weft: ${weftColour || '—'}`,
      `Colour: ${colourName} ${colourNumber} · Supplier: ${supplier || '—'}`,
      `PIC: 1st=${pic1 || '—'} 2nd=${pic2 || '—'} 3rd=${pic3 || '—'}`,
      `Job Card: ${jobCardRef || '—'}`,
    ].join('\n')
  }, [costInfo, machineNo, warpColour, weftColour, colourName, colourNumber, supplier, pic1, pic2, pic3, jobCardRef])

  async function issueJobCard() {
    if (!costInfo) {
      setError('Complete DIN costing first (step 1–2)')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const pic_counts = {
        first: Number(pic1) || null,
        second: Number(pic2) || null,
        third: Number(pic3) || null,
      }
      const payload = {
        design_id: costInfo.designId,
        din_number: costInfo.din,
        cost_per_meter: costInfo.costPerMeter,
        sell_rate: costInfo.sellRate || null,
        warp_colour: warpColour.trim() || null,
        weft_colour: weftColour.trim() || null,
        colour_number: colourNumber.trim() || null,
        colour_name: colourName || null,
        supplier: supplier.trim() || null,
        pic_counts,
        job_card_ref: jobCardRef.trim() || `SPC-${Date.now().toString().slice(-6)}`,
        machine_no: machineNo,
        created_by: enteredBy,
      }
      if (!payload.job_card_ref) payload.job_card_ref = `SPC-${todayISO()}`

      let id = savedId
      if (id) {
        const { error: uErr } = await supabase.from('sample_program_cards').update(payload).eq('id', id)
        if (uErr) throw uErr
      } else {
        const { data, error: iErr } = await supabase
          .from('sample_program_cards')
          .insert(payload)
          .select('id, job_card_ref')
          .single()
        if (iErr) throw iErr
        id = data.id
        setSavedId(id)
        setJobCardRef(data.job_card_ref || payload.job_card_ref)
      }
      setMessage(`Job Card issued · ${payload.job_card_ref}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Issue failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Sample Program Card</h1>
        <p className="text-muted">DIN upload → costing → matching → job card → share</p>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      <DesignWiseCosting
        embedded
        onCostingSaved={(info) => {
          setCostInfo(info)
          setMessage(`Costing ready for DIN ${info.din}`)
        }}
      />

      <section className="dash-panel surface" style={{ marginTop: 16 }}>
        <h2 className="section-title">2. Costing (auto)</h2>
        {costInfo ? (
          <p>
            DIN <strong>{costInfo.din}</strong> · Cost ₹{costInfo.costPerMeter.toFixed(2)}/mtr · Sell ₹
            {costInfo.sellRate.toFixed(2)} · Diff ₹{costInfo.difference.toFixed(2)}
          </p>
        ) : (
          <p className="text-muted">Save DIN costing above to populate</p>
        )}
      </section>

      <section className="form-stack" style={{ marginTop: 16 }}>
        <h2 className="section-title">3. Matching Card</h2>
        <label className="field">
          <span>Machine (warp colour machine-wise)</span>
          <select value={machineNo} onChange={(e) => setMachineNo(e.target.value)}>
            {MACHINES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Warp colour</span>
          <input value={warpColour} onChange={(e) => setWarpColour(e.target.value)} />
        </label>
        <label className="field">
          <span>Weft colour</span>
          <input value={weftColour} onChange={(e) => setWeftColour(e.target.value)} />
        </label>
        <label className="field">
          <span>Colour name (CTR list)</span>
          <select value={colourName} onChange={(e) => setColourName(e.target.value)}>
            {CTR_COLOUR_NAMES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Colour number</span>
          <input value={colourNumber} onChange={(e) => setColourNumber(e.target.value)} />
        </label>
        <label className="field">
          <span>Supplier</span>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </label>
        <div className="dwc-buildup-grid">
          <label className="field">
            <span>PIC 1st</span>
            <input className="num" inputMode="decimal" value={pic1} onChange={(e) => setPic1(e.target.value)} />
          </label>
          <label className="field">
            <span>PIC 2nd</span>
            <input className="num" inputMode="decimal" value={pic2} onChange={(e) => setPic2(e.target.value)} />
          </label>
          <label className="field">
            <span>PIC 3rd</span>
            <input className="num" inputMode="decimal" value={pic3} onChange={(e) => setPic3(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="form-stack" style={{ marginTop: 16 }}>
        <h2 className="section-title">4. Job Card Issue</h2>
        <label className="field">
          <span>Job card ref</span>
          <input
            value={jobCardRef}
            onChange={(e) => setJobCardRef(e.target.value)}
            placeholder="Auto on issue if blank"
          />
        </label>
        <button type="button" className="primary-save" disabled={busy || !costInfo} onClick={() => void issueJobCard()}>
          {busy ? 'Issuing…' : 'Issue Job Card'}
        </button>
      </section>

      <section className="dash-panel surface" style={{ marginTop: 16 }}>
        <h2 className="section-title">5. Share / Print</h2>
        <ShareActions
          disabled={!savedId && !costInfo}
          onWhatsApp={() => shareWhatsApp(shareText)}
          onWhatsAppBusiness={() => shareWhatsAppBusiness(shareText)}
          onPrint={() =>
            printSummary(
              `Sample Program ${costInfo?.din || ''}`,
              rowsToHtml([
                ['DIN', costInfo?.din],
                ['Cost/mtr', costInfo?.costPerMeter.toFixed(2)],
                ['Sell', costInfo?.sellRate.toFixed(2)],
                ['Diff', costInfo?.difference.toFixed(2)],
                ['Machine', machineNo],
                ['Warp', warpColour],
                ['Weft', weftColour],
                ['Colour', `${colourName} ${colourNumber}`],
                ['Supplier', supplier],
                ['PIC', `${pic1}/${pic2}/${pic3}`],
                ['Job Card', jobCardRef],
              ]),
            )
          }
        />
      </section>
    </div>
  )
}
