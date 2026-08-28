import { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  value: string
  options: string[]
  placeholder?: string
  disabled?: boolean
  /** Called on every keystroke (free text) and on option pick. */
  onChange: (value: string) => void
  /** Called when user picks a master yarn (or blurs with a match). */
  onSelect?: (value: string) => void
  className?: string
  'aria-label'?: string
}

/**
 * Searchable Rate Master yarn dropdown — same UX pattern as Cash Book item autocomplete.
 */
export function RateMasterYarnSelect({
  value,
  options,
  placeholder = 'Select yarn from Rate Master',
  disabled,
  onChange,
  onSelect,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return options.slice(0, 16)
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 16)
  }, [options, q])

  function pick(name: string) {
    setQuery(name)
    onChange(name)
    onSelect?.(name)
    setOpen(false)
  }

  return (
    <div className={`dwc-yarn-ac${className ? ` ${className}` : ''}`} ref={wrapRef}>
      <input
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const v = e.target.value
          setQuery(v)
          setOpen(true)
          onChange(v)
        }}
        onBlur={() => {
          const trimmed = query.trim()
          if (!trimmed) return
          const exact = options.find((o) => o.toLowerCase() === trimmed.toLowerCase())
          if (exact) onSelect?.(exact)
          else onSelect?.(trimmed)
        }}
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
      {open && !disabled ? (
        <ul className="dwc-yarn-ac-list" role="listbox">
          {matches.length === 0 ? (
            <li className="dwc-yarn-ac-empty">No Rate Master match</li>
          ) : (
            matches.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(name)}
                >
                  {name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
