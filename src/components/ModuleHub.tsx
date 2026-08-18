import type { MainModuleId } from '../lib/nav'
import { moduleById, type NavTarget, type SubItem } from '../lib/nav'
import { canAccessSub } from '../lib/permissions'
import { useAuth } from '../lib/auth'

type Props = {
  moduleId: MainModuleId
  onNavigate: (t: NavTarget) => void
}

export function ModuleHub({ moduleId, onNavigate }: Props) {
  const { profile, isCeo } = useAuth()
  const roleName = profile?.roles?.role_name || profile?.full_name || (isCeo ? 'CEO' : 'User')
  const mod = moduleById(moduleId)
  const items = mod.items.filter((item) => canAccessSub(roleName, moduleId, item.id))

  function open(item: SubItem) {
    onNavigate({
      screen: item.screen,
      sub: item.sub,
      filter: item.filter,
      module: moduleId,
    })
  }

  return (
    <div className="screen module-hub">
      <header className="screen-header module-hub-header">
        <h1>{mod.label}</h1>
        <p className="text-muted">Select a function</p>
      </header>
      <div className="hub-grid">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="hub-card"
            onClick={() => open(item)}
          >
            <span className="hub-card-label">{item.label}</span>
            {item.hint ? <span className="hub-card-hint text-muted">{item.hint}</span> : null}
          </button>
        ))}
        {items.length === 0 ? (
          <p className="text-muted">No functions available for your role.</p>
        ) : null}
      </div>
    </div>
  )
}
