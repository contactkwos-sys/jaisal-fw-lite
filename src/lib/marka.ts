/**
 * Party Marka helpers — JAISAL FW / Fashionweave Industries
 * Examples: Samrat Velvet → SVT, Mahalaxmi Textiles → MHT
 */

/** Derive a short Marka from party name (3 letters preferred). */
export function suggestMarka(partyName: string): string {
  const words = partyName
    .trim()
    .replace(/[^a-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return ''

  if (words.length >= 3) {
    return words
      .slice(0, 3)
      .map((w) => w[0].toUpperCase())
      .join('')
  }

  if (words.length === 2) {
    const a = words[0].toUpperCase()
    const b = words[1].toUpperCase()
    // Samrat Velvet → SVT (first of each + last consonant of second word)
    const bCons = consonants(b)
    const third =
      bCons.filter((c) => c !== b[0]).pop() ||
      consonants(a).find((c) => c !== a[0]) ||
      'X'
    return (a[0] + b[0] + third).toUpperCase()
  }

  // Single word — first letter + next two consonants
  const w = words[0].toUpperCase()
  const cons = consonants(w)
  if (cons.length >= 3) return cons.slice(0, 3).join('')
  let out = cons.join('') || w[0]
  let i = 1
  while (out.length < 3 && i < w.length) {
    if (!out.includes(w[i])) out += w[i]
    i += 1
  }
  while (out.length < 3) out += 'X'
  return out.slice(0, 3)
}

function consonants(s: string): string[] {
  return s
    .toUpperCase()
    .split('')
    .filter((c) => /[A-Z]/.test(c) && !'AEIOU'.includes(c))
}
