import type { MainModuleId } from '../lib/nav'
import { moduleById, type NavTarget, type SubItem } from '../lib/nav'
import { canAccessSub } from '../lib/permissions'
import { useAuth } from '../lib/auth'

type Props = {
  moduleId: MainModuleId
  onNavigate: (t: NavTarget) => void
}

/** Production process sequence shown with flow arrows (matches Dashboard "Today's Production Flow"). */
const PRODUCTION_FLOW_IDS = ['warp-issue', 'weft-issue', 'prod-entry', 'folding', 'dispatch'] as const

function HubCardButton({ item, onOpen }: { item: SubItem; onOpen: (item: SubItem) => void }) {
  return (
    <button type="button" className="hub-card" onClick={() => onOpen(item)}>
      <span className="hub-card-label">{item.label}</span>
      {item.hint ? <span className="hub-card-hint text-muted">{item.hint}</span> : null}
    </button>
  )
}

export function ModuleHub({ moduleId, onNavigate }: Props) {
  const { profile, isCeo } = useAuth()
  const roleName = profile?.roles?.role_name || profile?.full_name || (isCeo ? 'CEO' : 'User')
  const mod = moduleById(moduleId)
  const items = mod.items.filter((item) => canAccessSub(roleName, moduleId, item.id))
  const isProduction = moduleId === 'production'

  function open(item: SubItem) {
    onNavigate({
      screen: item.screen,
      sub: item.sub,
      filter: item.filter,
      module: moduleId,
    })
  }

  const flowItems = isProduction
    ? PRODUCTION_FLOW_IDS.map((id) => items.find((item) => item.id === id)).filter(
        (item): item is SubItem => Boolean(item),
      )
    : []
  const restItems = isProduction
    ? items.filter((item) => !(PRODUCTION_FLOW_IDS as readonly string[]).includes(item.id))
    : items

  return (
    <div className={isProduction ? 'screen module-hub module-hub-production' : 'screen module-hub'}>
      <header className="screen-header module-hub-header">
        <h1>{mod.label}</h1>
        <p className="text-muted">Select a function</p>
      </header>
      <div className={isProduction ? 'hub-grid hub-grid-production' : 'hub-grid'}>
        {isProduction && flowItems.length > 0 ? (
          <div className="hub-flow-row" aria-label="Production process sequence">
            {flowItems.map((item, idx) => (
              <div key={item.id} className="hub-flow-step">
                <HubCardButton item={item} onOpen={open} />
                {idx < flowItems.length - 1 ? (
                  <span className="hub-flow-arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {isProduction ? (
          restItems.length > 0 ? (
            <div className="hub-rest-grid">
              {restItems.map((item) => (
                <HubCardButton key={item.id} item={item} onOpen={open} />
              ))}
            </div>
          ) : null
        ) : (
          items.map((item) => <HubCardButton key={item.id} item={item} onOpen={open} />)
        )}

        {items.length === 0 ? (
          <p className="text-muted">No functions available for your role.</p>
        ) : null}
      </div>
    </div>
  )
}
