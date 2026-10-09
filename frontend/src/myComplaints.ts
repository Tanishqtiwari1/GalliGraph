/** Tracking codes this browser has filed, so "Your active grievance" can show them. Device-local only. */
const KEY = 'gg_my_codes'

export function myCodes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function rememberCode(code: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([code, ...myCodes().filter((c) => c !== code)].slice(0, 10)))
  } catch {
    /* storage unavailable: the receipt still shows the code */
  }
}

const CONFIRMED = 'gg_confirmed'

export function confirmedIssues(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(CONFIRMED) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : []
  } catch {
    return []
  }
}

export function rememberConfirmed(id: number) {
  try {
    localStorage.setItem(CONFIRMED, JSON.stringify([...new Set([id, ...confirmedIssues()])].slice(0, 200)))
  } catch {
    /* ignore */
  }
}
