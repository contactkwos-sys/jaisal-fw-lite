type Props = {
  options: Array<{ id: string; label: string }>
  value: string
  onChange: (id: string) => void
}

export function SubTabs({ options, value, onChange }: Props) {
  return (
    <div className="sub-tabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={value === o.id ? 'sub-tab active' : 'sub-tab'}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
