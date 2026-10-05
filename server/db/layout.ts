import type { Location } from './types'

// Layouts: where the parts of a piece of furniture sit relative to each other.
// Each part (a shelf, a drawer, a cubby, the top surface) can carry a grid
// cell in its parent: rows count from the top, columns from the left, and a
// part can span several rows or columns. A bookcase with a tall shelf on the
// left beside two short ones on the right:
//
//   +-----------------+-----------------+
//   | Top             |                 |   row 1, cols 1-2
//   +-----------------+-----------------+
//   | Tall shelf      | Records shelf   |   tall shelf: rows 2-3, col 1
//   |                 +-----------------+
//   |                 | Speaker shelf   |
//   +-----------------+-----------------+
//
// With cells stored, "third shelf from the top" or "what's below the
// records?" is arithmetic, and the same drawing is shown to the person (in a
// question, the app, or the export), so what they see is what's stored.

export interface GridCell {
  row: number
  col: number
  rows: number
  cols: number
}

/** Validate a cell (1-based, spans ≥ 1, within reason). */
export function checkGrid(cell: Partial<GridCell>): GridCell {
  const n = (v: unknown, name: string, min: number) => {
    const x = Number(v ?? min)
    if (!Number.isInteger(x) || x < min || x > 50) throw new Error(`grid.${name} must be a whole number from ${min} to 50`)
    return x
  }
  return { row: n(cell.row, 'row', 1), col: n(cell.col, 'col', 1), rows: n(cell.rows, 'rows', 1), cols: n(cell.cols, 'cols', 1) }
}

export function parseGrid(json: string | null | undefined): GridCell | null {
  if (!json) return null
  try {
    return checkGrid(JSON.parse(json))
  } catch {
    return null
  }
}

/** "row 2-3 from the top, column 1 from the left" — for the agents' map and answers. */
export function gridText(json: string | null | undefined): string | null {
  const g = parseGrid(json)
  if (!g) return null
  const span = (start: number, count: number) => (count > 1 ? `${start}-${start + count - 1}` : `${start}`)
  return `row ${span(g.row, g.rows)} from the top, column ${span(g.col, g.cols)} from the left`
}

export interface LayoutPart {
  id: string
  name: string
  cell: GridCell
  contents: string[] // names of what's in it (items, and places inside it)
}

export interface Layout {
  rows: number
  cols: number
  parts: LayoutPart[]
  unplaced: string[] // children with no cell yet
}

/** The layout of a place from its children's cells, or null when none of them has one. */
export function layoutOf(children: Location[], contentsOf: (id: string) => string[]): Layout | null {
  const parts: LayoutPart[] = []
  const unplaced: string[] = []
  for (const child of children) {
    const cell = parseGrid(child.grid)
    if (cell) parts.push({ id: child.id, name: child.name, cell, contents: contentsOf(child.id) })
    else unplaced.push(child.name)
  }
  if (!parts.length) return null
  return {
    rows: Math.max(...parts.map((p) => p.cell.row + p.cell.rows - 1)),
    cols: Math.max(...parts.map((p) => p.cell.col + p.cell.cols - 1)),
    parts: parts.sort((a, b) => a.cell.row - b.cell.row || a.cell.col - b.cell.col),
    unplaced,
  }
}

/** A fixed-width drawing of a layout, readable in a question, a terminal or a .md file. */
export function drawLayout(title: string, layout: Layout, columnWidth = 18): string {
  const W = columnWidth
  const linesOf = (p: LayoutPart) => {
    const inner = p.cell.cols * W + (p.cell.cols - 1) - 2
    return [...wrap(p.name, inner), ...wrap(p.contents.join(', '), inner).map((l) => l)].filter((l, i) => i === 0 || l)
  }

  // Row heights: tall enough for every single-row part, then stretched for spanning parts.
  const h = Array<number>(layout.rows + 1).fill(1)
  for (const p of layout.parts) if (p.cell.rows === 1) h[p.cell.row] = Math.max(h[p.cell.row], linesOf(p).length)
  for (const p of layout.parts) {
    if (p.cell.rows === 1) continue
    const last = p.cell.row + p.cell.rows - 1
    let room = p.cell.rows - 1
    for (let r = p.cell.row; r <= last; r++) room += h[r]
    if (linesOf(p).length > room) h[last] += linesOf(p).length - room
  }
  const Y = [0, 1]
  for (let r = 1; r <= layout.rows; r++) Y[r + 1] = Y[r] + h[r] + 1
  const X = (c: number) => 1 + (c - 1) * (W + 1)

  const height = Y[layout.rows + 1]
  const width = X(layout.cols + 1)
  const canvas = Array.from({ length: height }, () => Array<string>(width).fill(' '))
  const put = (x: number, y: number, ch: string) => {
    const was = canvas[y][x]
    canvas[y][x] = was === ' ' || was === ch ? ch : '+'
  }
  for (const p of layout.parts) {
    const x0 = X(p.cell.col) - 1
    const x1 = X(p.cell.col + p.cell.cols) - 1
    const y0 = Y[p.cell.row] - 1
    const y1 = Y[p.cell.row + p.cell.rows] - 1
    for (let x = x0; x <= x1; x++) (put(x, y0, '-'), put(x, y1, '-'))
    for (let y = y0; y <= y1; y++) (put(x0, y, '|'), put(x1, y, '|'))
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) canvas[y][x] = '+'
    linesOf(p).forEach((line, i) => [...line].forEach((ch, j) => (canvas[y0 + 1 + i][x0 + 2 + j] = ch)))
  }
  const drawing = canvas.map((row) => row.join('').trimEnd())
  const notes = layout.unplaced.length ? [`Not placed in the drawing yet: ${layout.unplaced.join(', ')}`] : []
  return [`${title} (rows from the top, columns from the left)`, ...drawing, ...notes].join('\n')
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.length > width ? word.slice(0, width - 1) + '…' : word
    if (line && line.length + 1 + w.length > width) (lines.push(line), (line = w))
    else line = line ? `${line} ${w}` : w
  }
  if (line || !lines.length) lines.push(line)
  return lines
}
