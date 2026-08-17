import { colourSwatchHex, type IssuedCardData } from '../lib/sampleJobCard'

type Props = {
  card: IssuedCardData
  className?: string
}

/** Paper-white print layout for Sample Job Card (ink-saving for print). */
export function SampleJobCardPrint({ card, className = '' }: Props) {
  return (
    <article className={`sample-print-card ${className}`.trim()} id="sample-print-card">
      <header className="sample-print-header">
        <div>
          <div className="sample-print-company">Jaisal FashionWeave Industries</div>
          <h2 className="sample-print-title">Sample Job Card</h2>
        </div>
        <div className="sample-print-din">{card.din_number}</div>
      </header>

      <div className="sample-print-meta">
        {card.design_image_url ? (
          <img
            className="sample-print-thumb"
            src={card.design_image_url}
            alt="Design"
          />
        ) : (
          <div className="sample-print-thumb sample-print-thumb-empty">No image</div>
        )}
        <div className="sample-print-fields">
          <div>
            <span className="sample-print-label">Date</span>
            <strong>{card.job_date}</strong>
          </div>
          <div>
            <span className="sample-print-label">Machine No.</span>
            <strong>{card.machine_no || '—'}</strong>
          </div>
          <div>
            <span className="sample-print-label">Work / Quality</span>
            <strong>{card.work_quality || '—'}</strong>
          </div>
        </div>
      </div>

      <table className="sample-print-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Colour</th>
            <th>Number</th>
          </tr>
        </thead>
        <tbody>
          {card.matchings.map((m) => {
            const names = m.colours.map((c) => c.colour_name).join(' / ')
            const numbers = m.colours.map((c) => c.colour_number).join(' / ')
            return (
              <tr key={m.matching_no}>
                <td>{m.matching_no}</td>
                <td>
                  <span className="sample-print-colour-cell">
                    {m.colours.map((c, i) => (
                      <span
                        key={`${m.matching_no}-${i}`}
                        className="sample-swatch"
                        style={{ background: colourSwatchHex(c.colour_name) }}
                        title={c.colour_name}
                      />
                    ))}
                    <span>{names || '—'}</span>
                  </span>
                </td>
                <td>{numbers || '—'}</td>
              </tr>
            )
          })}
          {!card.matchings.length ? (
            <tr>
              <td colSpan={3}>No matchings</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <footer className="sample-print-footer">
        <div>Issued by: {card.issued_by || '—'}</div>
        <div className="sample-print-sign">Supervisor signature: ______________________</div>
      </footer>
    </article>
  )
}
