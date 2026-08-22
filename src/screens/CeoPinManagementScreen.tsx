import { useCallback, useEffect, useMemo, useState } from 'react'
import { PinPad } from '../components/PinPad'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import {
  buildPinShareMessage,
  changeCeoPin,
  fetchModulePins,
  fetchPinAudit,
  fetchPinDepartments,
  fetchPinUsers,
  logPinShared,
  resetModulePin,
  setModuleDepartment,
  setModulePin,
  syncModulePins,
  toggleModulePin,
  type ModulePinRow,
  type PinAuditRow,
  type PinDepartment,
  type PinDepartmentUser,
  type PinSummary,
  upsertPinDepartment,
  upsertPinUser,
} from '../lib/ceoPinManagement'
import { MAIN_MODULES } from '../lib/nav'
import { shareWhatsApp } from '../lib/share'

type Tab = 'modules' | 'departments' | 'users' | 'audit'

const PIN_DESIGNATIONS = [
  'Operator',
  'Supervisor',
  'Manager',
  'Engineer',
  'Accountant',
  'Others',
]

export function CeoPinManagementScreen() {
  const { isCeo, profile } = useAuth()
  const [tab, setTab] = useState<Tab>('modules')
  const [search, setSearch] = useState('')
  const [modules, setModules] = useState<ModulePinRow[]>([])
  const [summary, setSummary] = useState<PinSummary | null>(null)
  const [departments, setDepartments] = useState<PinDepartment[]>([])
  const [users, setUsers] = useState<PinDepartmentUser[]>([])
  const [audit, setAudit] = useState<PinAuditRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [editPinModule, setEditPinModule] = useState<ModulePinRow | null>(null)
  const [editPinValue, setEditPinValue] = useState('')
  const [editPinConfirm, setEditPinConfirm] = useState('')

  const [sendModule, setSendModule] = useState<ModulePinRow | null>(null)
  const [sendDept, setSendDept] = useState('')
  const [sendUser, setSendUser] = useState('')
  const [sendEmail, setSendEmail] = useState('')

  const [ceoPinOpen, setCeoPinOpen] = useState(false)
  const [ceoCurrent, setCeoCurrent] = useState('')
  const [ceoNew, setCeoNew] = useState('')
  const [ceoOtp, setCeoOtp] = useState('')

  const [deptForm, setDeptForm] = useState<{ id?: string; name: string; code: string }>({ name: '', code: '' })
  const [userForm, setUserForm] = useState<{
    id?: string
    department_id: string
    full_name: string
    email: string
    mobile: string
    designation_choice: string
    custom_designation: string
    module_keys: string[]
    is_active: boolean
  }>({
    department_id: '',
    full_name: '',
    email: '',
    mobile: '',
    designation_choice: '',
    custom_designation: '',
    module_keys: [],
    is_active: true,
  })

  const performedBy = { id: profile?.id, name: profile?.full_name || profile?.roles?.role_name || 'CEO' }

  const load = useCallback(async () => {
    const [pinData, depts, pinUsers, auditRows] = await Promise.all([
      fetchModulePins(),
      fetchPinDepartments(),
      fetchPinUsers(),
      fetchPinAudit(150),
    ])
    setModules(pinData.modules)
    setSummary(pinData.summary)
    setDepartments(depts)
    setUsers(pinUsers)
    setAudit(auditRows)
  }, [])

  useEffect(() => {
    if (!isCeo) return
    void load().catch((e: Error) => setError(e.message))
  }, [isCeo, load])

  const needle = search.trim().toLowerCase()

  const filteredModules = useMemo(() => {
    if (!needle) return modules
    return modules.filter((m) => {
      const deptUsers = users.filter(
        (u) =>
          u.pin_departments?.name?.toLowerCase().includes(needle) ||
          u.full_name.toLowerCase().includes(needle),
      )
      return (
        m.module_name.toLowerCase().includes(needle) ||
        m.module_key.toLowerCase().includes(needle) ||
        (m.department_name || '').toLowerCase().includes(needle) ||
        deptUsers.some((u) => u.pin_user_module_access?.some((a) => a.module_key === m.module_key))
      )
    })
  }, [modules, users, needle])

  const filteredUsers = useMemo(() => {
    if (!needle) return users
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(needle) ||
        (u.email || '').toLowerCase().includes(needle) ||
        (u.mobile || '').includes(needle) ||
        (u.pin_departments?.name || '').toLowerCase().includes(needle) ||
        (u.designation || '').toLowerCase().includes(needle),
    )
  }, [users, needle])

  async function refreshModules() {
    setBusy(true)
    setError(null)
    try {
      await syncModulePins()
      await load()
      setMessage('Module list refreshed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveModulePin() {
    if (!editPinModule) return
    if (!/^\d{4}$/.test(editPinValue)) {
      setError('PIN must be 4 digits')
      return
    }
    if (editPinValue !== editPinConfirm) {
      setError('PIN confirmation does not match')
      return
    }
    setBusy(true)
    try {
      await setModulePin(editPinModule.module_key, editPinValue)
      setMessage(`PIN updated for ${editPinModule.module_name}`)
      setEditPinModule(null)
      setEditPinValue('')
      setEditPinConfirm('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleResetModulePin(m: ModulePinRow) {
    setBusy(true)
    try {
      const pin = await resetModulePin(m.module_key)
      setMessage(`New PIN for ${m.module_name}: ${pin}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(m: ModulePinRow) {
    setBusy(true)
    try {
      await toggleModulePin(m.module_key)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeptChange(moduleKey: string, departmentId: string) {
    setBusy(true)
    try {
      await setModuleDepartment(moduleKey, departmentId || null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Department update failed')
    } finally {
      setBusy(false)
    }
  }

  function openSend(m: ModulePinRow) {
    setSendModule(m)
    setSendDept(m.department_name || '')
    setSendUser('')
    setSendEmail('')
  }

  async function sharePin(channel: 'WhatsApp' | 'Email') {
    if (!sendModule) return
    const text = buildPinShareMessage({
      moduleName: sendModule.module_name,
      departmentName: sendDept || sendModule.department_name || undefined,
      pin: sendModule.pin,
      issuedBy: performedBy.name,
    })
    if (channel === 'WhatsApp') {
      shareWhatsApp(text)
    } else if (sendEmail.trim()) {
      const subject = encodeURIComponent(`Module PIN — ${sendModule.module_name}`)
      const body = encodeURIComponent(text)
      window.location.href = `mailto:${sendEmail.trim()}?subject=${subject}&body=${body}`
    }
    await logPinShared({
      moduleKey: sendModule.module_key,
      departmentName: sendDept,
      targetUser: sendUser || sendEmail,
      channel,
    })
    setMessage(`PIN share logged (${channel})`)
    setSendModule(null)
    await load()
  }

  async function handleChangeCeoPin() {
    if (!/^\d{4}$/.test(ceoNew)) {
      setError('New CEO PIN must be 4 digits')
      return
    }
    setBusy(true)
    try {
      await changeCeoPin({
        currentPin: ceoCurrent || undefined,
        newPin: ceoNew,
        otpPin: ceoOtp || ceoCurrent || undefined,
      })
      setMessage('CEO PIN updated')
      setCeoPinOpen(false)
      setCeoCurrent('')
      setCeoNew('')
      setCeoOtp('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CEO PIN change failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveDepartment() {
    if (!deptForm.name.trim()) return
    setBusy(true)
    try {
      await upsertPinDepartment({
        id: deptForm.id,
        name: deptForm.name,
        code: deptForm.code,
      })
      setDeptForm({ name: '', code: '' })
      setMessage('Department saved')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveUser() {
    if (!userForm.full_name.trim()) return
    const designation =
      userForm.designation_choice === 'Others'
        ? userForm.custom_designation.trim()
        : userForm.designation_choice
    setBusy(true)
    try {
      await upsertPinUser(
        {
          id: userForm.id,
          department_id: userForm.department_id || null,
          full_name: userForm.full_name,
          email: userForm.email,
          mobile: userForm.mobile,
          designation,
          custom_designation: userForm.designation_choice === 'Others' ? userForm.custom_designation : null,
          is_active: userForm.is_active,
          module_keys: userForm.module_keys,
        },
        performedBy,
      )
      setUserForm({
        department_id: '',
        full_name: '',
        email: '',
        mobile: '',
        designation_choice: '',
        custom_designation: '',
        module_keys: [],
        is_active: true,
      })
      setMessage('User saved')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (!isCeo) {
    return (
      <div className="screen ceo-pin-screen">
        <p className="form-error">CEO PIN Management is available only to CEO / Admin.</p>
      </div>
    )
  }

  return (
    <div className="screen ceo-pin-screen">
      <header className="ceo-pin-hero">
        <div>
          <p className="ceo-pin-eyebrow">JAISAL FASHIONWEAV INDUSTRIES</p>
          <h1>CEO PIN Management</h1>
          <p className="text-muted">Module-wise PINs · Department sharing · Audit trail</p>
        </div>
        <div className="ceo-pin-hero-actions">
          <button type="button" className="btn-warp" disabled={busy} onClick={() => setCeoPinOpen(true)}>
            Change CEO PIN
          </button>
          <button type="button" className="primary-save" disabled={busy} onClick={() => void refreshModules()}>
            Refresh Module List
          </button>
        </div>
      </header>

      <div className="ceo-pin-search-wrap">
        <input
          className="ceo-pin-search"
          type="search"
          placeholder="Search modules, departments, users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search modules, departments, users"
        />
      </div>

      {summary ? (
        <section className="ceo-pin-summary-row">
          {[
            ['Total Modules', summary.total_modules],
            ['Active PINs', summary.active_pins],
            ['Departments', summary.departments],
            ['Users', summary.users],
            ['CEO PIN', summary.ceo_pin_set ? 'Set' : 'Not set'],
          ].map(([label, val]) => (
            <div key={label} className="ceo-pin-summary-card surface">
              <span className="text-muted">{label}</span>
              <strong className="num">{val}</strong>
            </div>
          ))}
        </section>
      ) : null}

      <SubTabs
        value={tab}
        onChange={(id) => setTab(id as Tab)}
        options={[
          { id: 'modules', label: 'Module PINs' },
          { id: 'departments', label: 'Departments' },
          { id: 'users', label: 'Users & Access' },
          { id: 'audit', label: 'Audit Log' },
        ]}
      />

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      {tab === 'modules' ? (
        <section>
          <h2 className="ceo-pin-section-title">Module PIN Management</h2>
          <div className="ceo-pin-module-grid">
            {filteredModules.map((m) => (
              <article key={m.module_key} className="ceo-pin-module-card surface">
                <div className="ceo-pin-module-head">
                  <span className="ceo-pin-lock" aria-hidden="true">🔐</span>
                  <div>
                    <h3>{m.module_name}</h3>
                    <p className="text-muted text-sm">{m.module_key}</p>
                  </div>
                  <span className={m.is_active ? 'ceo-pin-status active' : 'ceo-pin-status inactive'}>
                    {m.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <label className="ceo-pin-dept-label">
                  <span className="text-muted">Department</span>
                  <select
                    value={m.department_id || ''}
                    onChange={(e) => void handleDeptChange(m.module_key, e.target.value)}
                    disabled={busy}
                  >
                    <option value="">—</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </label>
                <div className="ceo-pin-digits" aria-label="Module PIN">{m.pin}</div>
                <p className="text-muted text-sm">
                  Updated {new Date(m.updated_at).toLocaleString('en-IN')}
                </p>
                <div className="ceo-pin-module-actions">
                  <button
                    type="button"
                    className="btn-warp"
                    onClick={() => {
                      setEditPinModule(m)
                      setEditPinValue('')
                      setEditPinConfirm('')
                    }}
                  >
                    Edit PIN
                  </button>
                  <button type="button" className="btn-warp" onClick={() => openSend(m)}>
                    Send PIN
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void handleResetModulePin(m)} disabled={busy}>
                    Reset
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void handleToggle(m)} disabled={busy}>
                    {m.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'departments' ? (
        <section className="ceo-pin-panel surface">
          <h2 className="ceo-pin-section-title">Departments</h2>
          <div className="ceo-pin-form-row">
            <input placeholder="Department name" value={deptForm.name} onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))} />
            <input placeholder="Code" value={deptForm.code} onChange={(e) => setDeptForm((f) => ({ ...f, code: e.target.value }))} />
            <button type="button" className="primary-save" disabled={busy} onClick={() => void saveDepartment()}>
              {deptForm.id ? 'Update' : 'Add'} Department
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.code || '—'}</td>
                    <td>{d.is_active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setDeptForm({ id: d.id, name: d.name, code: d.code || '' })}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'users' ? (
        <section className="ceo-pin-panel surface">
          <h2 className="ceo-pin-section-title">Users & Module Access</h2>
          <div className="ceo-pin-user-form">
            <input placeholder="Full name" value={userForm.full_name} onChange={(e) => setUserForm((f) => ({ ...f, full_name: e.target.value }))} />
            <select value={userForm.department_id} onChange={(e) => setUserForm((f) => ({ ...f, department_id: e.target.value }))}>
              <option value="">Department…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <input placeholder="Email" value={userForm.email} onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))} />
            <input placeholder="Mobile" value={userForm.mobile} onChange={(e) => setUserForm((f) => ({ ...f, mobile: e.target.value }))} />
            <select value={userForm.designation_choice} onChange={(e) => setUserForm((f) => ({ ...f, designation_choice: e.target.value }))}>
              <option value="">Designation…</option>
              {PIN_DESIGNATIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            {userForm.designation_choice === 'Others' ? (
              <input
                placeholder="Custom designation"
                value={userForm.custom_designation}
                onChange={(e) => setUserForm((f) => ({ ...f, custom_designation: e.target.value }))}
              />
            ) : null}
            <div className="ceo-pin-module-checks">
              <span className="text-muted">Module access</span>
              <div className="ceo-pin-check-grid">
                {MAIN_MODULES.map((mod) => (
                  <label key={mod.id} className="ceo-pin-check">
                    <input
                      type="checkbox"
                      checked={userForm.module_keys.includes(mod.id)}
                      onChange={(e) => {
                        const keys = e.target.checked
                          ? [...userForm.module_keys, mod.id]
                          : userForm.module_keys.filter((k) => k !== mod.id)
                        setUserForm((f) => ({ ...f, module_keys: keys }))
                      }}
                    />
                    {mod.label}
                  </label>
                ))}
              </div>
            </div>
            <button type="button" className="primary-save" disabled={busy} onClick={() => void saveUser()}>
              {userForm.id ? 'Update' : 'Add'} User
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Modules</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id}>
                    <td>{u.full_name}</td>
                    <td>{u.pin_departments?.name || '—'}</td>
                    <td>{u.designation || u.custom_designation || '—'}</td>
                    <td>{u.email || '—'}</td>
                    <td>{u.mobile || '—'}</td>
                    <td className="text-sm">
                      {(u.pin_user_module_access || [])
                        .filter((a) => a.can_access)
                        .map((a) => a.module_key)
                        .join(', ') || '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          setUserForm({
                            id: u.id,
                            department_id: u.department_id || '',
                            full_name: u.full_name,
                            email: u.email || '',
                            mobile: u.mobile || '',
                            designation_choice:
                              PIN_DESIGNATIONS.includes(u.designation as string) ? u.designation! : 'Others',
                            custom_designation: u.custom_designation || u.designation || '',
                            module_keys: (u.pin_user_module_access || [])
                              .filter((a) => a.can_access)
                              .map((a) => a.module_key),
                            is_active: u.is_active,
                          })
                        }
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'audit' ? (
        <section className="ceo-pin-panel surface">
          <h2 className="ceo-pin-section-title">Audit Log</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Module</th>
                  <th>Department</th>
                  <th>User</th>
                  <th>By</th>
                  <th>Ref</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString('en-IN')}</td>
                    <td>{row.action}</td>
                    <td>{row.module_name || row.module_key || '—'}</td>
                    <td>{row.department_name || '—'}</td>
                    <td>{row.target_user || '—'}</td>
                    <td>{row.performed_by_name || '—'}</td>
                    <td>{row.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {editPinModule ? (
        <div className="ceo-pin-modal-overlay" role="dialog" aria-modal="true">
          <div className="ceo-pin-modal surface">
            <h3>Edit PIN — {editPinModule.module_name}</h3>
            <label>
              <span className="text-muted">New PIN</span>
              <input value={editPinValue} onChange={(e) => setEditPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} />
            </label>
            <label>
              <span className="text-muted">Confirm PIN</span>
              <input value={editPinConfirm} onChange={(e) => setEditPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} />
            </label>
            <div className="ceo-pin-modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setEditPinModule(null)}>Cancel</button>
              <button type="button" className="primary-save" disabled={busy} onClick={() => void handleSaveModulePin()}>
                Save PIN
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sendModule ? (
        <div className="ceo-pin-modal-overlay" role="dialog" aria-modal="true">
          <div className="ceo-pin-modal surface">
            <h3>Send PIN — {sendModule.module_name}</h3>
            <label>
              <span className="text-muted">Department</span>
              <input value={sendDept} onChange={(e) => setSendDept(e.target.value)} />
            </label>
            <label>
              <span className="text-muted">User / Responsible person</span>
              <input value={sendUser} onChange={(e) => setSendUser(e.target.value)} />
            </label>
            <label>
              <span className="text-muted">Email (for mail share)</span>
              <input type="email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} />
            </label>
            <ShareActions
              onWhatsApp={() => void sharePin('WhatsApp')}
              onPrint={() => {
                const text = buildPinShareMessage({
                  moduleName: sendModule.module_name,
                  departmentName: sendDept || sendModule.department_name || undefined,
                  pin: sendModule.pin,
                  issuedBy: performedBy.name,
                })
                const w = window.open('', '_blank')
                if (w) {
                  w.document.write(`<pre>${text}</pre>`)
                  w.print()
                }
              }}
              extra={
                <button type="button" className="btn-warp" onClick={() => void sharePin('Email')}>
                  Email
                </button>
              }
            />
            <button type="button" className="btn-ghost" onClick={() => setSendModule(null)}>Close</button>
          </div>
        </div>
      ) : null}

      {ceoPinOpen ? (
        <div className="ceo-pin-modal-overlay" role="dialog" aria-modal="true">
          <div className="ceo-pin-modal surface">
            <h3>Change CEO PIN</h3>
            <p className="text-muted">CEO Dashboard PIN is separate from all module PINs. Enter current PIN as OTP confirmation.</p>
            {summary?.ceo_pin_set ? (
              <label>
                <span className="text-muted">Current CEO PIN (OTP)</span>
                <PinPad value={ceoCurrent} onChange={setCeoCurrent} disabled={busy} />
              </label>
            ) : null}
            <label>
              <span className="text-muted">New CEO PIN</span>
              <PinPad value={ceoNew} onChange={setCeoNew} disabled={busy} />
            </label>
            <div className="ceo-pin-modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setCeoPinOpen(false)}>Cancel</button>
              <button type="button" className="primary-save" disabled={busy} onClick={() => void handleChangeCeoPin()}>
                Save CEO PIN
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
