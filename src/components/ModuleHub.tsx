import { useEffect, useState, type ReactNode } from 'react'
import type { MainModuleId } from '../lib/nav'
import { moduleById, type NavTarget, type SubItem } from '../lib/nav'
import { canAccessSub } from '../lib/permissions'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { BeamPipeStock, WeftYarnStock } from '../lib/database.types'

type Props = {
  moduleId: MainModuleId
  onNavigate: (t: NavTarget) => void
}

type HubTone =
  | 'purple'
  | 'green'
  | 'orange'
  | 'blue'
  | 'pink'
  | 'teal'
  | 'amber'
  | 'slate'
  | 'violet'

const INVENTORY_TONES: Record<string, HubTone> = {
  'yarn-stock': 'purple',
  'wy-overview': 'blue',
  'wy-machines': 'teal',
  'wy-godown': 'green',
  'wy-empty': 'slate',
  'wy-warper': 'violet',
  'wy-reports': 'orange',
  'warp-yarn': 'blue',
  'warp-yarn-link': 'blue',
  'beam-stock': 'green',
  'warp-beam-pipe': 'orange',
  'yarn-inward': 'teal',
  'security-inventory': 'blue',
  'greige-stock': 'amber',
  consumables: 'pink',
  inward: 'teal',
  'stock-adj': 'violet',
  'stock-reports': 'slate',
}

const FALLBACK_TONES: HubTone[] = [
  'blue',
  'green',
  'orange',
  'purple',
  'teal',
  'amber',
  'pink',
  'violet',
  'slate',
]

type OverviewStat = {
  id: string
  label: string
  value: string
  tone: HubTone
}

function toneFor(moduleId: MainModuleId, item: SubItem, index: number): HubTone {
  if (moduleId === 'inventory' && INVENTORY_TONES[item.id]) return INVENTORY_TONES[item.id]
  return FALLBACK_TONES[index % FALLBACK_TONES.length]
}

function HubIcon({ itemId }: { itemId: string }) {
  const path = ICON_PATHS[itemId] || ICON_PATHS.default
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="hub-card-ico">
      <path fill="currentColor" d={path} />
    </svg>
  )
}

const ICON_PATHS: Record<string, string> = {
  default: 'M4 7l8-4 8 4v2H4V7zm0 3h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9zm4 2v2h8v-2H8z',
  'yarn-stock':
    'M12 2a4 4 0 0 1 4 4v1.1A5 5 0 0 1 17 17.9V20a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2.1A5 5 0 0 1 8 7.1V6a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v1.05c.64-.1 1.3-.15 2-.15s1.36.05 2 .15V6a2 2 0 0 0-2-2z',
  'warp-yarn':
    'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm2 3v6h12V9H6zm2 2h2v2H8v-2zm4 0h2v2h-2v-2z',
  'beam-stock':
    'M3 7h18v2H3V7zm1 4h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8zm4 2v2h8v-2H8z',
  'warp-beam-pipe':
    'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm2 3v6h12V9H6zm2 2h2v2H8v-2zm4 0h2v2h-2v-2z',
  'yarn-inward':
    'M11 4h2v7h3l-4 5-4-5h3V4zm-7 14h16v2H4v-2z',
  'security-inventory':
    'M12 2l7 3v6c0 5-3.5 8.5-7 9.5C8.5 19.5 5 16 5 11V5l7-3zm0 2.2L7 6.1v4.9c0 3.6 2.4 6.3 5 7.2 2.6-.9 5-3.6 5-7.2V6.1l-5-1.9zM11 10h2v5h-2v-5zm0-3h2v2h-2V7z',
  'greige-stock':
    'M4 5h16v3H4V5zm0 5h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9zm3 2v2h10v-2H7z',
  consumables:
    'M7 3h10l1 4H6l1-4zm-1 5h12l-1 13H7L6 8zm4 2v9h2V10h-2zm4 0v9h2V10h-2z',
  inward: 'M12 3l7 7h-4v7h-6v-7H5l7-7zm-8 16h16v2H4v-2z',
  'stock-adj':
    'M4 4h7v7H4V4zm9 0h7v4h-7V4zM4 13h7v7H4v-7zm9 3h3v-3h2v3h3v2h-3v3h-2v-3h-3v-2z',
  'stock-reports':
    'M5 3h14a1 1 0 0 1 1 1v16l-8-3-8 3V4a1 1 0 0 1 1-1zm3 4v2h8V7H8zm0 4v2h5v-2H8z',
  'design-costing':
    'M4 4h16v2H4V4zm0 4h10v2H4V8zm0 4h16v2H4v-2zm0 4h10v2H4v-2z',
  broadcast:
    'M12 3a1 1 0 0 1 1 1v1.06A7.002 7.002 0 0 1 19 12v1a1 1 0 1 1-2 0v-1a5 5 0 0 0-10 0v1a1 1 0 1 1-2 0v-1a7.002 7.002 0 0 1 6-6.94V4a1 1 0 0 1 1-1zm-4 11a2 2 0 0 1 2 2v4H6v-4a2 2 0 0 1 2-2zm8 0a2 2 0 0 1 2 2v4h-4v-4a2 2 0 0 1 2-2z',
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="hub-card-chevron">
      <path
        fill="currentColor"
        d="M9.3 6.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4L13.58 12 9.3 7.7a1 1 0 0 1 0-1.4z"
      />
    </svg>
  )
}

function HubCardButton({
  item,
  tone,
  onOpen,
}: {
  item: SubItem
  tone: HubTone
  onOpen: (item: SubItem) => void
}) {
  return (
    <button
      type="button"
      className={`hub-card hub-tone-${tone}`}
      onClick={() => onOpen(item)}
    >
      <span className="hub-card-icon-well" aria-hidden="true">
        <HubIcon itemId={item.id} />
      </span>
      <span className="hub-card-body">
        <span className="hub-card-label">{item.label}</span>
        {item.hint ? <span className="hub-card-hint">{item.hint}</span> : null}
      </span>
      <Chevron />
    </button>
  )
}

function OverviewIcon({ tone }: { tone: HubTone }) {
  const icons: Record<HubTone, ReactNode> = {
    purple: (
      <path
        fill="currentColor"
        d="M4 7l8-4 8 4v2H4V7zm0 3h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9z"
      />
    ),
    green: (
      <path
        fill="currentColor"
        d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"
      />
    ),
    pink: (
      <path
        fill="currentColor"
        d="M12 2a5 5 0 0 1 5 5v1h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v1h6V7a3 3 0 0 0-3-3z"
      />
    ),
    blue: (
      <path
        fill="currentColor"
        d="M3 6h18v2H3V6zm2 4h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8zm3 2v2h8v-2H8z"
      />
    ),
    orange: (
      <path
        fill="currentColor"
        d="M12 2l2.4 7.2H22l-6 4.4 2.3 7L12 16.8 5.7 20.6 8 13.6 2 9.2h7.6L12 2z"
      />
    ),
    teal: (
      <path fill="currentColor" d="M4 4h16v4H4V4zm0 6h16v10H4V10zm4 2v2h8v-2H8z" />
    ),
    amber: (
      <path fill="currentColor" d="M11 2h2v12h-2V2zm0 14h2v4h-2v-4z" />
    ),
    slate: (
      <path
        fill="currentColor"
        d="M5 3h14v18l-7-3-7 3V3zm3 4v2h8V7H8zm0 4v2h5v-2H8z"
      />
    ),
    violet: (
      <path
        fill="currentColor"
        d="M11 4h2v7h3l-4 5-4-5h3V4zM4 18h16v2H4v-2z"
      />
    ),
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="hub-overview-ico">
      {icons[tone]}
    </svg>
  )
}

export function ModuleHub({ moduleId, onNavigate }: Props) {
  const { roleName: authRoleName, profile, isCeo } = useAuth()
  const roleName = authRoleName || profile?.roles?.role_name || profile?.full_name || (isCeo ? 'CEO' : 'User')
  const mod = moduleById(moduleId)
  const items = mod.items.filter((item) => canAccessSub(roleName, moduleId, item.id))
  const isInventory = moduleId === 'inventory'
  const [overview, setOverview] = useState<OverviewStat[]>([])

  useEffect(() => {
    if (!isInventory) {
      setOverview([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [{ data: beams }, { data: yarns }, pipesRes] = await Promise.all([
          supabase.from('beam_pipe_stock').select('id,quantity_pcs'),
          supabase.from('weft_yarn_stock').select('id,stock_kg'),
          supabase.from('warp_pipes').select('id,status'),
        ])
        if (cancelled) return
        const beamRows = (beams as Pick<BeamPipeStock, 'id' | 'quantity_pcs'>[]) ?? []
        const yarnRows = (yarns as Pick<WeftYarnStock, 'id' | 'stock_kg'>[]) ?? []
        const pipeRows = pipesRes.error
          ? []
          : ((pipesRes.data as Array<{ id: string; status: string }> | null) ?? [])
        const totalSku = yarnRows.length + (pipeRows.length || beamRows.length)
        const inStock =
          yarnRows.filter((y) => Number(y.stock_kg) > 0).length +
          (pipeRows.length
            ? pipeRows.filter((p) =>
                ['FILLED_GODOWN', 'ON_MACHINE', 'EMPTY'].includes(p.status),
              ).length
            : beamRows.filter((b) => Number(b.quantity_pcs) > 0).length)
        const outOfStock = Math.max(0, totalSku - inStock)
        const beamPcs = pipeRows.length
          ? pipeRows.length
          : beamRows.reduce((s, b) => s + Number(b.quantity_pcs || 0), 0)
        const yarnKg = yarnRows.reduce((s, y) => s + Number(y.stock_kg || 0), 0)
        setOverview([
          {
            id: 'sku',
            label: 'Total SKU',
            value: totalSku.toLocaleString('en-IN'),
            tone: 'purple',
          },
          {
            id: 'in',
            label: 'In Stock',
            value: inStock.toLocaleString('en-IN'),
            tone: 'green',
          },
          {
            id: 'out',
            label: 'Out of Stock',
            value: outOfStock.toLocaleString('en-IN'),
            tone: 'pink',
          },
          {
            id: 'beam',
            label: pipeRows.length ? 'Warp Pipes' : 'Beam Pcs',
            value: beamPcs.toLocaleString('en-IN'),
            tone: 'blue',
          },
          {
            id: 'yarn',
            label: 'Yarn Kg',
            value: yarnKg.toLocaleString('en-IN', { maximumFractionDigits: 0 }),
            tone: 'orange',
          },
        ])
      } catch {
        if (!cancelled) setOverview([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isInventory])

  function open(item: SubItem) {
    onNavigate({
      screen: item.screen,
      sub: item.sub,
      filter: item.filter,
      module: moduleId,
    })
  }

  return (
    <div className={`screen module-hub module-hub-${moduleId}`}>
      <header className="screen-header module-hub-header">
        <h1 className="hub-section-title">Select a Function</h1>
        <p className="text-muted hub-section-sub">
          {isInventory
            ? 'Open a stock room, inward flow, adjustment, or report'
            : `Choose a ${mod.label.toLowerCase()} function to continue`}
        </p>
      </header>

      <div className="hub-grid" role="list">
        {items.map((item, index) => (
          <div key={item.id} role="listitem" className="hub-grid-item">
            <HubCardButton item={item} tone={toneFor(moduleId, item, index)} onOpen={open} />
          </div>
        ))}
        {items.length === 0 ? (
          <p className="text-muted">No functions available for your role.</p>
        ) : null}
      </div>

      {isInventory && overview.length > 0 ? (
        <section className="hub-overview" aria-label="Inventory overview">
          <header className="hub-overview-header">
            <h2 className="hub-section-title">Inventory Overview</h2>
            <p className="text-muted hub-section-sub">Live balances across yarn and beam stock</p>
          </header>
          <div className="hub-overview-grid">
            {overview.map((stat) => (
              <article key={stat.id} className={`hub-overview-card hub-tone-${stat.tone}`}>
                <span className="hub-overview-icon-well" aria-hidden="true">
                  <OverviewIcon tone={stat.tone} />
                </span>
                <div className="hub-overview-copy">
                  <span className="hub-overview-label">{stat.label}</span>
                  <strong className="hub-overview-value num">{stat.value}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
