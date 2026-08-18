type Props = {
  title: string
  description?: string
}

const COPY: Record<string, { title: string; body: string }> = {
  'maint-schedule': {
    title: 'Maintenance Schedule',
    body: 'Plan recurring machine service windows. Use Machine Maintenance and Breakdown Entry for live work orders.',
  },
  'machine-master': {
    title: 'Machine Master',
    body: 'Current floor machines are M1–M6 (Airjet). Production Entry and Program Card already use this list. Full editable machine master can be added here without a new sidebar tab.',
  },
  'dept-master': {
    title: 'Department Master',
    body: 'Departments are currently derived from worker records and roles. Manage employees via Attendance / Employee Master.',
  },
  'shift-master': {
    title: 'Shift Master',
    body: 'Default shift is Day Shift. Configure additional shifts under Settings → Shift Settings.',
  },
  'login-activity': {
    title: 'Login Activity',
    body: 'Session activity is managed via Supabase Auth. PIN login creates a secure session; use Sign out from the sidebar to end it.',
  },
  company: {
    title: 'Company Settings',
    body: 'JAISAL FW / Fashionweave Industries. Company profile fields can be stored here in a future update without adding a new main tab.',
  },
  'shift-settings': {
    title: 'Shift Settings',
    body: 'Day Shift is active by default on the dashboard header. Night / general shifts can be configured here.',
  },
  notifications: {
    title: 'Notification Settings',
    body: 'Alerts for low weft stock, beam returns, repair out, and gatepass signatures appear on the CEO Dashboard.',
  },
  backup: {
    title: 'Backup',
    body: 'Data is stored in Supabase Postgres. Use your Supabase project backups / Point-in-Time Recovery for disaster recovery.',
  },
}

export function PlaceholderScreen({ title, description }: Props) {
  const key = Object.keys(COPY).find((k) => title.toLowerCase().includes(k.replace(/-/g, ' ')) || title === COPY[k].title)
  const meta = key ? COPY[key] : null

  return (
    <div className="screen placeholder-screen">
      <article className="placeholder-card">
        <h2>{meta?.title || title}</h2>
        <p className="text-muted">{description || meta?.body || 'This function lives inside the current module. Full form UI will connect to existing tables without adding a new main tab.'}</p>
      </article>
    </div>
  )
}
