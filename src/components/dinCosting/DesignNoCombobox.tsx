import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type DesignNoOption = {
  dinNumber: string
  qualityName?: string
  /** ISO timestamp of latest costing for sort/display */
  latestAt?: string
}

type Props = {
  value: string
  options: DesignNoOption[]
  disabled?: boolean
  required?: boolean
  placeholder?: string
  onChange: (value: string) => void
  onBlur?: () => void
  onPick?: (option: DesignNoOption) => void
}

/** Debounce filter list so typing stays snappy (local filter — never hits Supabase). */
const FILTER_DEBOUNCE_MS = 200

/**
 * Searchable Design No. combobox — filter local options (no per-keystroke DB).
 * Free text allowed for brand-new Design Nos.
 */
export function DesignNoCombobox({
  value,
  options,
  disabled,
  required,
  placeholder = 'e.g. JFG1591',
  onChange,
  onBlur,
  onPick,
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [debouncedQuery, setDebouncedQuery] = useState(value)

  useEffect(() => {
    setQuery(value)
    setDebouncedQuery(value)
  }, [value])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), FILTER_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const matches = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    const list = q
      ? options.filter(
          (o) =>
            o.dinNumber.toLowerCase().includes(q) ||
            (o.qualityName || '').toLowerCase().includes(q),
        )
      : options
    return list.slice(0, 40)
  }, [options, debouncedQuery])

  const showNewHint =
    open &&
    query.trim() !== '' &&
    !options.some((o) => o.dinNumber.toLowerCase() === query.trim().toLowerCase())

  function pick(opt: DesignNoOption) {
    setQuery(opt.dinNumber)
    onChange(opt.dinNumber)
    onPick?.(opt)
    setOpen(false)
  }

  return (
    <div className="dwc-design-no-ac" ref={wrapRef}>
      <div className="dwc-design-no-ac-control">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          required={required}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const v = e.target.value.toUpperCase()
            setQuery(v)
            setOpen(true)
            onChange(v)
          }}
          onBlur={() => onBlur?.()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              setQuery(value)
            }
            if (e.key === 'Enter' && matches.length === 1) {
              e.preventDefault()
              pick(matches[0])
            }
          }}
        />
        <button
          type="button"
          className="dwc-design-no-chevron"
          tabIndex={-1}
          aria-label="Toggle Design No. list"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
        >
          ▾
        </button>
      </div>
      {open && !disabled ? (
        <ul className="dwc-design-no-ac-list" id={listId} role="listbox">
          {showNewHint ? (
            <li className="dwc-design-no-ac-hint">New Design No. — will create on save</li>
          ) : null}
          {matches.length === 0 && !showNewHint ? (
            <li className="dwc-design-no-ac-empty">No saved Design Nos. yet — type a new one</li>
          ) : (
            matches.map((opt) => (
              <li key={opt.dinNumber}>
                <button
                  type="button"
                  role="option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt)}
                >
                  <strong>{opt.dinNumber}</strong>
                  {opt.qualityName ? <span className="text-muted2"> · {opt.qualityName}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
