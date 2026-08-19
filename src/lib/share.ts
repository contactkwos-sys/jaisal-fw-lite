/** Share text via WhatsApp (mobile deep-link / web fallback). */
export function shareWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** WhatsApp Business deep-link (same wa.me; OS / app chooser picks Business when installed). */
export function shareWhatsAppBusiness(text: string) {
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Native share sheet when available (WhatsApp / WhatsApp Business picker). */
export async function shareNativeOrWhatsApp(text: string, title = 'Jaisal FW'): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return
    } catch {
      /* fall through */
    }
  }
  shareWhatsApp(text)
}

/** Open a simple printable HTML summary in a new window. */
export function printSummary(title: string, bodyHtml: string) {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900')
  if (!w) {
    window.print()
    return
  }
  w.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;color:#111}
  h1{font-size:18px;margin:0 0 12px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px}
  .muted{color:#666;font-size:12px}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
<p class="muted">Jaisal FW Lite · ${new Date().toLocaleString()}</p>
<script>window.onload=()=>{window.print()}</script>
</body></html>`)
  w.document.close()
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function rowsToHtml(rows: Array<[string, string | number | null | undefined]>) {
  return `<table>${rows
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v ?? '—'))}</td></tr>`)
    .join('')}</table>`
}
