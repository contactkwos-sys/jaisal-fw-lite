type Props = {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'] as const

export function PinPad({ value, onChange, disabled }: Props) {
  function press(key: (typeof KEYS)[number]) {
    if (disabled) return
    if (key === 'clear') {
      onChange('')
      return
    }
    if (key === 'del') {
      onChange(value.slice(0, -1))
      return
    }
    if (value.length >= 4) return
    onChange(value + key)
  }

  return (
    <div className="pin-pad">
      <div className="pin-dots" aria-label="PIN digits entered">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={value.length > i ? 'dot filled' : 'dot'} />
        ))}
      </div>
      <div className="pin-grid">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="pin-key btn-ghost"
            disabled={disabled}
            onClick={() => press(key)}
          >
            {key === 'clear' ? 'C' : key === 'del' ? '<' : key}
          </button>
        ))}
      </div>
    </div>
  )
}
