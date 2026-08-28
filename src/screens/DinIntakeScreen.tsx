import { useCallback, useEffect, useRef, useState } from 'react'
import { DinIntakeCostingPanel } from '../components/DinIntakeCostingPanel'
import { GmailImportPanel } from '../components/GmailImportPanel'
import { GmailManageModal } from '../components/GmailManageModal'
import { ImageLightbox } from '../components/ImageLightbox'
import { useAuth } from '../lib/auth'
import {
  applyWarpItemFromMaster,
  emptyIntakeCostingDraft,
  intakeDraftHasYarn,
  loadExistingCostingForDin,
  loadIntakeCostingDefaults,
  saveIntakeCostingDraft,
  type IntakeCostingDraft,
} from '../lib/dinIntakeCosting'
import {
  createDin,
  DIN_INTAKE_EMAIL,
  emptyMatchingDraft,
  fetchWarpYarnOptions,
  previewNextDinNumber,
  syncDinCostingFromLatest,
  uploadDinImage,
  type DinMatchingDraft,
} from '../lib/designToOrder'
import {
  applyOcrToCostingDraft,
  emptyDesignOcrResult,
  ocrHasDetectedFields,
  readDesignReference,
  readDesignReferenceFromUrl,
  type DesignOcrFeeder,
  type DesignOcrResult,
  type DesignOcrWeftRow,
} from '../lib/designOcr'
import { canEditDinCosting, canViewDinCosting } from '../lib/designWiseCosting'
import type { RateMasterRow } from '../lib/rateMaster'
import {
  fetchGmailStatus,
  linkGmailImportToDin,
  type GmailImportResult,
  type GmailStatus,
} from '../lib/gmailIntake'
import { todayISO } from '../lib/mutate'
import type { NavTarget } from '../lib/nav'
import { supabase } from '../lib/supabase'
import { handleUserError } from '../lib/userError'

type Props = { onNavigate: (t: NavTarget) => void }

type GmailSourceMeta = {
  importId: string
  senderName: string
  senderEmail: string
  receivedAt: string
  attachmentFilename: string
  messageId?: string
  attachmentId?: string
}

export function DinIntakeScreen({ onNavigate }: Props) {
  const { session, profile, isCeo, isManager, roleName } = useAuth()
  const canWriteCosting = canEditDinCosting(roleName || '', isCeo, isManager)
  const canReadCosting = canViewDinCosting(roleName || '', isCeo, isManager)
  const [dinNumber, setDinNumber] = useState('')
  const [receivedDate, setReceivedDate] = useState(todayISO())
  const [designName, setDesignName] = useState('')
  const [partyName, setPartyName] = useState('')
  const [parties, setParties] = useState<string[]>([])
  const [commonWarp, setCommonWarp] = useState('')
  const [warpOther, setWarpOther] = useState('')
  const [warpOptions, setWarpOptions] = useState<string[]>([])
  const [remarks, setRemarks] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [matchings, setMatchings] = useState<DinMatchingDraft[]>([emptyMatchingDraft(1)])
  const [source, setSource] = useState('upload')
  const [gmailMeta, setGmailMeta] = useState<GmailSourceMeta | null>(null)
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null)
  const [showGmailImport, setShowGmailImport] = useState(false)
  const [showGmailManage, setShowGmailManage] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [readingDesign, setReadingDesign] = useState(false)
  const [ocrDraft, setOcrDraft] = useState<DesignOcrResult>(emptyDesignOcrResult())
  const [masterRates, setMasterRates] = useState<RateMasterRow[]>([])
  const [costingDraft, setCostingDraft] = useState<IntakeCostingDraft>(emptyIntakeCostingDraft())
  const [costingReady, setCostingReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refreshGmail = useCallback(async () => {
    try {
      const st = await fetchGmailStatus()
      setGmailStatus(st)
    } catch {
      setGmailStatus(null)
    }
  }, [])

  const refresh = useCallback(async () => {
    const [next, warps, partyRows, costingBoot] = await Promise.all([
      previewNextDinNumber(),
      fetchWarpYarnOptions(),
      supabase.from('party_master').select('party_name').order('party_name').limit(400),
      loadIntakeCostingDefaults(),
    ])
    setDinNumber(next)
    setWarpOptions(warps)
    setParties((partyRows.data ?? []).map((p) => String(p.party_name)).filter(Boolean))
    setMasterRates(costingBoot.rates)
    setCostingDraft(costingBoot.draft)
    setCostingReady(true)
    await refreshGmail()
  }, [refreshGmail])

  useEffect(() => {
    void refresh().catch((e: unknown) =>
      setError(handleUserError('DinIntake', e, 'Unable to load design intake. Please try again.')),
    )
  }, [refresh])

  useEffect(() => {
    if (!imageUrl || !dinNumber.trim() || !costingReady) return
    let cancelled = false
    void loadExistingCostingForDin(dinNumber)
      .then((existing) => {
        if (cancelled || !existing) return
        setCostingDraft(existing)
      })
      .catch(() => {
        /* keep defaults when no prior costing */
      })
    return () => {
      cancelled = true
    }
  }, [imageUrl, dinNumber, costingReady])

  useEffect(() => {
    if (!imageUrl || !canWriteCosting) return
    const warpName = commonWarp === 'Other' ? warpOther.trim() : commonWarp.trim()
    if (!warpName) return
    setCostingDraft((prev) => {
      const first = prev.warps[0]
      if (!first || first.yarn_name.trim()) return prev
      const filled = applyWarpItemFromMaster(first, warpName, masterRates, prev.costingDate)
      const withLength =
        !filled.length_mtr && prev.designLength
          ? { ...filled, length_mtr: prev.designLength }
          : filled
      return { ...prev, warps: [withLength, ...prev.warps.slice(1)] }
    })
  }, [imageUrl, commonWarp, warpOther, masterRates, canWriteCosting])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gmail = params.get('gmail')
    if (!gmail) return
    if (gmail === 'connected') {
      setMessage(`Gmail connected: ${params.get('email') || DIN_INTAKE_EMAIL}`)
    } else if (gmail === 'wrong_account') {
      setError(
        `Connected Gmail (${params.get('email') || 'unknown'}) is not the approved account ${DIN_INTAKE_EMAIL}.`,
      )
    } else if (gmail === 'error') {
      setError('Gmail connection failed. Please try again from Manage Gmail.')
    }
    params.delete('gmail')
    params.delete('email')
    params.delete('reason')
    const qs = params.toString()
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', nextUrl)
    void refreshGmail()
  }, [refreshGmail])

  const applyOcrToIntake = useCallback(
    (ocr: DesignOcrResult) => {
      setOcrDraft(ocr)

      const jfg = ocr.designNumber.value.trim()
      const quality = ocr.qualityName.value.trim()
      if (jfg) setDesignName(jfg)
      else if (quality) setDesignName(quality)

      if (canWriteCosting && costingReady && ocrHasDetectedFields(ocr)) {
        setCostingDraft((prev) => {
          const applied = applyOcrToCostingDraft(ocr, {
            designLength: prev.designLength,
            rates: masterRates,
            costingDate: prev.costingDate,
            existingWarps: prev.warps,
          })
          return {
            ...prev,
            wefts: applied.wefts.length ? applied.wefts : prev.wefts,
            warps: applied.warps.length ? applied.warps : prev.warps,
          }
        })
      }

      if (ocr.readWarning) {
        setError(ocr.readWarning)
        setMessage(null)
      } else if (ocrHasDetectedFields(ocr)) {
        setMessage('Design sheet read — review detected fields below before saving.')
        setError(null)
      } else {
        setError('Could not read design sheet from this image. Enter details manually or retry with a clearer photo.')
        setMessage(null)
      }
    },
    [canWriteCosting, costingReady, masterRates],
  )

  async function runDesignOcr(file: File, hints?: { subject?: string; filename?: string }) {
    setReadingDesign(true)
    setError(null)
    try {
      const ocr = await readDesignReference(file, hints)
      applyOcrToIntake(ocr)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Design read failed')
    } finally {
      setReadingDesign(false)
    }
  }

  function updateOcrDesignNumber(value: string) {
    setOcrDraft((prev) => ({
      ...prev,
      designNumber: { ...prev.designNumber, value: value.toUpperCase(), confidence: 'high' },
    }))
    setDesignName(value.toUpperCase())
  }

  function updateOcrLoomPick(value: string) {
    setOcrDraft((prev) => ({
      ...prev,
      loomPick: { ...prev.loomPick, value, confidence: 'high' },
    }))
  }

  function updateOcrFeeder(idx: number, patch: Partial<DesignOcrFeeder>) {
    setOcrDraft((prev) => ({
      ...prev,
      feeders: prev.feeders.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }))
  }

  function updateOcrWeftRow(idx: number, patch: Partial<DesignOcrWeftRow>) {
    setOcrDraft((prev) => ({
      ...prev,
      weftRows: prev.weftRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }))
  }

  function reapplyOcrToCosting() {
    if (!canWriteCosting || !costingReady) return
    const applied = applyOcrToCostingDraft(ocrDraft, {
      designLength: costingDraft.designLength,
      rates: masterRates,
      costingDate: costingDraft.costingDate,
      existingWarps: costingDraft.warps,
    })
    setCostingDraft((prev) => ({
      ...prev,
      wefts: applied.wefts.length ? applied.wefts : prev.wefts,
      warps: applied.warps.length ? applied.warps : prev.warps,
    }))
    setMessage('Costing rows updated from OCR review.')
    setError(null)
  }

  async function handleFile(file: File | null, src: string) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const url = await uploadDinImage(file)
      setImageUrl(url)
      setSource(src)
      setGmailMeta(null)
      setOcrDraft(emptyDesignOcrResult())
      setMessage('DESIGN image uploaded — reading design sheet…')
      await runDesignOcr(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function updateMatching(key: string, patch: Partial<DinMatchingDraft>) {
    setMatchings((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }

  async function applyGmailImport(result: GmailImportResult) {
    setImageUrl(result.imageUrl)
    setSource('gmail')
    setGmailMeta({
      importId: result.importId,
      senderName: result.senderName,
      senderEmail: result.senderEmail,
      receivedAt: result.receivedAt,
      attachmentFilename: result.attachmentFilename,
      messageId: result.messageId,
      attachmentId: result.attachmentId,
    })
    if (result.senderName && !partyName) setPartyName(result.senderName)
    try {
      const d = new Date(result.receivedAt)
      if (!Number.isNaN(d.getTime())) setReceivedDate(d.toISOString().slice(0, 10))
    } catch {
      /* keep current date */
    }
    setShowGmailImport(false)
    setOcrDraft(emptyDesignOcrResult())
    setMessage('DESIGN image imported from Gmail — reading design sheet…')
    setReadingDesign(true)
    setError(null)
    try {
      const { ocr, file } = await readDesignReferenceFromUrl(result.imageUrl, {
        subject: result.subject,
        filename: result.attachmentFilename,
      })
      if (!file) {
        if (result.subject && !designName) setDesignName(result.subject)
        setError('Design image imported. OCR could not run — enter values manually.')
        return
      }
      applyOcrToIntake(ocr)
      if (!ocr.designNumber.value.trim() && !ocr.qualityName.value.trim() && result.subject) {
        setDesignName(result.subject)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gmail import OCR failed')
    } finally {
      setReadingDesign(false)
    }
  }

  async function saveDin(e: React.FormEvent) {
    e.preventDefault()
    if (!imageUrl) {
      setError('DESIGN image is required')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const warp = commonWarp === 'Other' ? warpOther.trim() : commonWarp
      const cleaned = matchings
        .map((m, i) => ({
          ...m,
          matching_no: i + 1,
          common_warp: m.common_warp || warp,
        }))
        .filter(
          (m) =>
            m.ground_colour.trim() ||
            m.weft_1.trim() ||
            m.weft_2.trim() ||
            m.weft_3.trim() ||
            m.weft_4.trim(),
        )

      const din = await createDin({
        din_number: dinNumber,
        received_date: receivedDate,
        design_name: designName,
        party_name: partyName,
        din_image_url: imageUrl,
        common_warp: warp,
        remarks,
        source,
        source_email: source === 'gmail' ? DIN_INTAKE_EMAIL : undefined,
        source_email_from: gmailMeta?.senderEmail || undefined,
        gmail_message_id: gmailMeta?.messageId,
        gmail_attachment_id: gmailMeta?.attachmentId,
        gmail_import_id: gmailMeta?.importId,
        created_by: session?.user?.id || null,
        matchings: cleaned.length ? cleaned : undefined,
      })

      if (gmailMeta?.importId) {
        await linkGmailImportToDin(gmailMeta.importId, din.id)
      }

      let costingNote = ''
      if (canWriteCosting && costingReady && !costingDraft.isLocked) {
        // Re-apply latest OCR review so feeders / loom pick land on costing rows before save
        const applied = ocrHasDetectedFields(ocrDraft)
          ? applyOcrToCostingDraft(ocrDraft, {
              designLength: costingDraft.designLength,
              rates: masterRates,
              costingDate: costingDraft.costingDate,
              existingWarps: costingDraft.warps,
            })
          : null
        const draftToSave = applied
          ? {
              ...costingDraft,
              wefts: applied.wefts.length ? applied.wefts : costingDraft.wefts,
              warps: applied.warps.length ? applied.warps : costingDraft.warps,
            }
          : costingDraft

        if (intakeDraftHasYarn(draftToSave)) {
          await saveIntakeCostingDraft({
            dinNumber: din.din_number,
            qualityName: designName || din.din_number,
            diaryImageUrl: imageUrl,
            draft: draftToSave,
            userId: session?.user?.id || null,
          })
          await syncDinCostingFromLatest(din.din_number)
          setCostingDraft(draftToSave)
          costingNote = ' · costing draft saved & calculated'
        }
      }

      setMessage(`Saved ${din.din_number}${costingNote}`)
      onNavigate({ screen: 'dto-hub', module: 'design-to-order' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const gmailConnected = gmailStatus?.connected
  const gmailReady = gmailConnected && gmailStatus?.accountMatch !== false
  const activeSenders = (gmailStatus?.senders || []).filter((s) => s.email)
  const showOcrReview = Boolean(imageUrl && !readingDesign)

  function ocrConfidenceLabel(c: string): string {
    if (c === 'high') return '✓'
    if (c === 'low') return '?'
    return '—'
  }

  return (
    <div className="screen dto-screen">
      <header className="screen-header">
        <div>
          <h1>DESIGN Intake</h1>
          <p className="text-muted">
            Receive DESIGN (formerly DIN) by upload, photo, or Gmail — OCR reads JFG / Pick / Strings into the master
            record.
          </p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <section className="surface dto-panel dto-intake-receive">
        <h2 className="section-title">Receive DESIGN by</h2>
        <div className="dto-receive-actions">
          <button type="button" className="btn-warp" onClick={() => fileRef.current?.click()} disabled={uploading || readingDesign}>
            Upload JPG
          </button>
          <button type="button" className="btn-warp" onClick={() => cameraRef.current?.click()} disabled={uploading || readingDesign}>
            Take Photo
          </button>
          <button
            type="button"
            className="btn-warp"
            disabled={!gmailReady || uploading || readingDesign}
            title={gmailReady ? 'Import from Gmail' : 'Connect Gmail first'}
            onClick={() => setShowGmailImport(true)}
          >
            Import from Gmail
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/jpg,image/*"
            hidden
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null, 'upload')}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null, 'camera')}
          />
        </div>

        <div className="dto-gmail-status-bar">
          <div className="dto-gmail-status-line">
            <span className={`gmail-dot ${gmailConnected ? 'connected' : 'disconnected'}`} aria-hidden />
            <span>
              Gmail:{' '}
              {gmailConnected ? (
                <>
                  Connected — <strong>{gmailStatus?.connectedEmail || DIN_INTAKE_EMAIL}</strong>
                </>
              ) : (
                'Not connected'
              )}
            </span>
            <button type="button" className="link-btn" onClick={() => setShowGmailManage(true)}>
              Manage Gmail
            </button>
          </div>
          {gmailConnected && gmailStatus?.accountMatch === false ? (
            <p className="gmail-wrong-account-inline">
              Warning: connected account is not {DIN_INTAKE_EMAIL}. Import is blocked until the correct account is
              connected.
            </p>
          ) : null}
          <div className="dto-approved-senders">
            <span className="text-muted">Approved Design Senders:</span>
            {activeSenders.length ? (
              <span>{activeSenders.map((s) => s.name).join(' | ')}</span>
            ) : (
              <span className="text-muted">None configured — CEO can add sender emails in Admin</span>
            )}
            <button type="button" className="link-btn" onClick={() => onNavigate({ screen: 'admin', sub: 'gmail' })}>
              Manage Senders
            </button>
          </div>
        </div>

        <label
          className={dragOver ? 'dto-dropzone drag-over' : 'dto-dropzone'}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void handleFile(e.dataTransfer.files?.[0] ?? null, 'upload')
          }}
        >
          {imageUrl ? (
            <ImageLightbox src={imageUrl} alt="DESIGN" thumbClassName="dto-thumb-preview" />
          ) : (
            <span>{readingDesign ? 'Reading design sheet…' : 'Drag & drop DESIGN photo here (JPG/JPEG)'}</span>
          )}
        </label>

        {readingDesign ? <p className="text-muted dto-ocr-status">Reading design sheet…</p> : null}

        {showOcrReview ? (
          <div className="dwc-ocr-review dto-intake-ocr">
            <h3 className="dwc-ocr-subtitle">Design Read — review before saving</h3>
            <div className="dto-form-grid">
              <label className="field">
                <span>
                  Detected JFG / Design Ref {ocrConfidenceLabel(ocrDraft.designNumber.confidence)}
                </span>
                <input
                  value={ocrDraft.designNumber.value}
                  onChange={(e) => updateOcrDesignNumber(e.target.value)}
                  placeholder="e.g. JFG2249"
                />
              </label>
              <label className="field">
                <span>
                  Detected Loom Pick {ocrConfidenceLabel(ocrDraft.loomPick.confidence)}
                </span>
                <input
                  className="num"
                  value={ocrDraft.loomPick.value}
                  onChange={(e) => updateOcrLoomPick(e.target.value)}
                  placeholder="e.g. 56"
                />
              </label>
            </div>
            {ocrDraft.feeders.length ? (
              <div className="dwc-ocr-feeders">
                <span className="text-muted2">Feeders</span>
                {ocrDraft.feeders.map((f, idx) => (
                  <div key={f.feederNo} className="dwc-ocr-feeder-row">
                    <span className="num">FD{f.feederNo}</span>
                    <input
                      value={f.yarnType}
                      onChange={(e) => updateOcrFeeder(idx, { yarnType: e.target.value.toUpperCase() })}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            {ocrDraft.weftRows.length ? (
              <div className="dwc-ocr-weft">
                <span className="text-muted2">Pick / Strings</span>
                {ocrDraft.weftRows.map((row, idx) => (
                  <div key={idx} className="dwc-ocr-weft-row">
                    <span className="num">#{idx + 1}</span>
                    <label>
                      PIC
                      <input
                        className="num"
                        value={row.pic}
                        onChange={(e) => updateOcrWeftRow(idx, { pic: e.target.value })}
                      />
                    </label>
                    <label>
                      Strings
                      <input
                        className="num"
                        value={row.strings}
                        onChange={(e) => updateOcrWeftRow(idx, { strings: e.target.value })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            ) : null}
            {canWriteCosting ? (
              <button type="button" className="btn-warp" onClick={reapplyOcrToCosting}>
                Apply to Costing Rows
              </button>
            ) : null}
          </div>
        ) : null}

        {gmailMeta ? (
          <div className="dto-gmail-import-meta surface">
            <h3 className="section-title">Imported DESIGN Image</h3>
            <dl className="gmail-manage-details">
              <div>
                <dt>Source</dt>
                <dd>Gmail</dd>
              </div>
              <div>
                <dt>Sender</dt>
                <dd>
                  {gmailMeta.senderName} ({gmailMeta.senderEmail})
                </dd>
              </div>
              <div>
                <dt>Received</dt>
                <dd>{new Date(gmailMeta.receivedAt).toLocaleString('en-IN')}</dd>
              </div>
              <div>
                <dt>Attachment</dt>
                <dd>{gmailMeta.attachmentFilename}</dd>
              </div>
              <div>
                <dt>Gmail Reference</dt>
                <dd className="text-muted">Stored internally for audit</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </section>

      {showGmailImport && gmailStatus ? (
        <GmailImportPanel
          senders={gmailStatus.senders}
          onImported={(r) => void applyGmailImport(r)}
          onViewDesign={(dinId) => onNavigate({ screen: 'dto-hub', module: 'design-to-order', filter: dinId })}
          onClose={() => setShowGmailImport(false)}
        />
      ) : null}

      {showGmailManage ? (
        <GmailManageModal
          status={gmailStatus}
          onStatusChange={() => void refreshGmail()}
          onClose={() => setShowGmailManage(false)}
        />
      ) : null}

      <form className="surface dto-panel dto-intake-form" onSubmit={(e) => void saveDin(e)}>
        <h2 className="section-title">DESIGN Master Record</h2>
        <div className="dto-form-grid">
          <label className="field">
            <span>DESIGN No. (formerly DIN)</span>
            <input value={dinNumber} onChange={(e) => setDinNumber(e.target.value)} required />
          </label>
          <label className="field">
            <span>Received Date</span>
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Design Name</span>
            <input value={designName} onChange={(e) => setDesignName(e.target.value)} placeholder="e.g. Floral Net" />
          </label>
          <label className="field">
            <span>Customer / Party</span>
            <input
              list="dto-party-list"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder="If known"
            />
            <datalist id="dto-party-list">
              {parties.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Common Warp</span>
            <select value={commonWarp} onChange={(e) => setCommonWarp(e.target.value)}>
              <option value="">Select warp…</option>
              {warpOptions.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
          </label>
          {commonWarp === 'Other' ? (
            <label className="field">
              <span>Other Warp</span>
              <input value={warpOther} onChange={(e) => setWarpOther(e.target.value)} required />
            </label>
          ) : null}
          <label className="field dto-span-2">
            <span>Remarks</span>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </label>
        </div>

        <div className="dto-matchings-block">
          <div className="dto-panel-head">
            <h3 className="section-title">Matchings</h3>
            <button
              type="button"
              className="btn-warp"
              onClick={() => setMatchings((m) => [...m, emptyMatchingDraft(m.length + 1)])}
            >
              + Add Matching
            </button>
          </div>
          {matchings.map((m, idx) => (
            <div key={m.key} className="dto-matching-card">
              <strong>Matching {idx + 1}</strong>
              <div className="dto-form-grid">
                <label className="field">
                  <span>Main Ground Colour</span>
                  <input
                    value={m.ground_colour}
                    onChange={(e) => updateMatching(m.key, { ground_colour: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Weft Colour 1</span>
                  <input value={m.weft_1} onChange={(e) => updateMatching(m.key, { weft_1: e.target.value })} />
                </label>
                <label className="field">
                  <span>Weft Colour 2</span>
                  <input value={m.weft_2} onChange={(e) => updateMatching(m.key, { weft_2: e.target.value })} />
                </label>
                <label className="field">
                  <span>Weft Colour 3</span>
                  <input value={m.weft_3} onChange={(e) => updateMatching(m.key, { weft_3: e.target.value })} />
                </label>
                <label className="field">
                  <span>Weft Colour 4</span>
                  <input value={m.weft_4} onChange={(e) => updateMatching(m.key, { weft_4: e.target.value })} />
                </label>
                <label className="field">
                  <span>Common Warp</span>
                  <input
                    value={m.common_warp}
                    onChange={(e) => updateMatching(m.key, { common_warp: e.target.value })}
                    placeholder={commonWarp === 'Other' ? warpOther : commonWarp || 'Same as DESIGN'}
                  />
                </label>
                <label className="field dto-span-2">
                  <span>Remarks</span>
                  <input value={m.remarks} onChange={(e) => updateMatching(m.key, { remarks: e.target.value })} />
                </label>
              </div>
              {matchings.length > 1 ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    setMatchings((prev) =>
                      prev.filter((x) => x.key !== m.key).map((x, i) => ({ ...x, matching_no: i + 1 })),
                    )
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>


        {imageUrl && canReadCosting ? (
          <DinIntakeCostingPanel
            draft={costingDraft}
            rates={masterRates}
            canWrite={canWriteCosting}
            onChange={setCostingDraft}
            onOpenFullCosting={() =>
              onNavigate({
                screen: 'design-wise-costing',
                module: 'design-to-order',
                filter: dinNumber.trim() || undefined,
              })
            }
          />
        ) : null}

        <div className="dto-form-actions">
          <span className="text-muted">Logged in as {profile?.full_name || 'User'}</span>
          <button type="submit" className="primary-save" disabled={busy || uploading || readingDesign}>
            Save DESIGN
          </button>
        </div>
      </form>
    </div>
  )
}
