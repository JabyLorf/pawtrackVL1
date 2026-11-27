// Spreadsheet (CSV) downloads for staff records. Opens in Excel or Google Sheets.

type Cell = string | number | boolean | null | undefined

function cell(v: Cell) {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)
  // Quote everything that needs it; stop spreadsheet formulas from running.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(headers: string[], rows: Cell[][]) {
  // The BOM tells Excel the file is UTF-8 (₱, ñ and emoji show correctly).
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}

/** "2026-11-27", for file names and date columns. */
export function isoDay(value?: string | Date | null) {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Saves the CSV. Browsers download it; inside the Android app (which can't
 * download files) it opens the share menu so it can be saved to Drive, sent
 * by email, etc. Returns a message to show, or null when nothing is needed.
 */
export async function downloadCsv(name: string, headers: string[], rows: Cell[][]): Promise<string | null> {
  const fileName = `${name}-${isoDay(new Date())}.csv`
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' })
  const { isNativeApp } = await import('./app')
  if (isNativeApp) {
    const file = new File([blob], fileName, { type: 'text/csv' })
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: fileName })
        return null
      } catch {
        return null
      }
    }
    return 'Downloads work on the website: open the staff desk in a browser to download this file.'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return null
}
