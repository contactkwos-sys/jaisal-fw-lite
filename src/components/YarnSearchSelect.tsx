import { useEffect, useId, useMemo, useRef, useState } from 'react'

type Props = {
  label: string
  required?: boolean
  value: string
  options: string[]
  placeholder?: string
  error?: string
  hint?: string
  allowAdd?: boolean
  addLabel?: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function YarnSearchSelect({
  label,
  required,
  value,
  options,
  placeholder = 'Select…',
  error,
  hint,
  allowAdd = true,
  addLabel = '+ Add New',
  disabled,
  onChange,
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [adding, setAdding] = useState(false)
  const [newValue, setNewValue] = useState('')

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setAdding(false)
        setQuery(value)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 40)
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 40)
  }, [options, query])

  const exactMatch = options.some((o) => o.toLowerCase() === query.trim().toLowerCase())

  function select(v: string) {
    onChange(v)
    setQuery(v)
    setOpen(false)
    setAdding(false)
    setNewValue('')
  }

  function commitAdd() {
    const v = newValue.trim()
    if (!v) return
    select(v)
  }

  return (
    <div className={`yarn-combo field${error ? ' has-error' : ''}`} ref={rootRef}>
      <span>
        {label}
        {required ? <em className="req"> *</em> : null}
      </span>
      <div className="yarn-combo-control">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            onChange(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              setQuery(value)
            }
            if (e.key === 'Enter' && filtered.length === 1) {
              e.preventDefault()
              select(filtered[0])
            }
          }}
        />
        <button
          type="button"
          className="yarn-combo-chevron"
          tabIndex={-1}
          aria-label="Toggle options"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
        >
          ▾
        </button>
      </div>
      {open ? (
        <div className="yarn-combo-menu" id={listId} role="listbox">
          {filtered.length === 0 ? (
            <div className="yarn-combo-empty">No matches</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={opt === value}
                className={`yarn-combo-option${opt === value ? ' is-selected' : ''}`}
                onClick={() => select(opt)}
              >
                {opt}
              </button>
            ))
          )}
          {allowAdd && !exactMatch ? (
            <div className="yarn-combo-add">
              {adding ? (
                <div className="yarn-combo-add-row">
                  <input
                    autoFocus
                    value={newValue}
                    placeholder="Enter new value"
                    onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitAdd()
                      }
                    }}
                  />
                  <button type="button" className="btn-primary yarn-combo-add-btn" onClick={commitAdd}>
                    Add
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="yarn-combo-add-trigger"
                  onClick={() => {
                    setAdding(true)
                    setNewValue(query.trim())
                  }}
                >
                  {addLabel}
                  {query.trim() ? ` “${query.trim()}”` : ''}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <small className="yarn-field-error">{error}</small> : null}
      {!error && hint ? <small className="yarn-field-hint">{hint}</small> : null}
    </div>
  )
}
