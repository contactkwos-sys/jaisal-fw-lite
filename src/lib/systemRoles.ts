/**
 * Canonical PIN / login system roles — must match `public.roles.role_name`
 * (seeded by migrations). Login chips and Security PIN management both use this.
 */
export const SYSTEM_ROLE_NAMES = [
  'CEO',
  'Manager',
  'Machine Supervisor',
  'Salesman',
  'Checker & Dispatch',
  'Program Supervisor',
  'Programmer',
  'Security',
  'Operator',
] as const

export type SystemRoleName = (typeof SYSTEM_ROLE_NAMES)[number]

export function orderRolesBySystemList<T extends { role_name: string }>(roles: T[]): T[] {
  const byName = new Map(roles.map((r) => [r.role_name, r]))
  const ordered: T[] = []
  for (const name of SYSTEM_ROLE_NAMES) {
    const hit = byName.get(name)
    if (hit) ordered.push(hit)
  }
  for (const role of roles) {
    if (!(SYSTEM_ROLE_NAMES as readonly string[]).includes(role.role_name)) {
      ordered.push(role)
    }
  }
  return ordered
}

export function missingSystemRoleNames(roles: Array<{ role_name: string }>): string[] {
  const have = new Set(roles.map((r) => r.role_name))
  return SYSTEM_ROLE_NAMES.filter((name) => !have.has(name))
}
