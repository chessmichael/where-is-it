import type { HouseDb } from '../db/house'
import type { GridCell } from '../db/layout'
import type { AgentTool } from './loop'
import { integer, nullable, object, textWith } from './schema'

// Layout support shared by both agents: the grid-cell field for places, and a
// tool that draws a piece of furniture from the cells stored for its parts.

export const gridField = nullable(
  object(
    { row: integer, col: integer, rows: integer, cols: integer },
    'Where this part sits in its parent piece of furniture, as a grid cell: row counts from the top (1 = top), col from the left (1 = left); rows/cols are how many it spans (1 normally; a tall shelf beside two short ones spans rows: 2). Set it for the parts of bookcases, dressers, cabinets and shelving whenever their arrangement is known.',
  ),
)

export const gridOrNull = (value: unknown): GridCell | null => (value && typeof value === 'object' ? (value as GridCell) : null)

export function showLayoutTool<S extends { db: HouseDb }>(): AgentTool<S> {
  return {
    def: {
      name: 'show_layout',
      description:
        'Draw a piece of furniture (or any place) from the layout cells stored for its parts, as a fixed-width diagram with what is in each part. Use it to answer "which shelf from the top / what is below / what is left of" questions, to check your understanding, and as the diagram for a question about how something is arranged.',
      parameters: object({ location: textWith('A location id, a path like "Living room › Bookcase", or a name.') }),
    },
    run: (input, { db }) => {
      const place = db.locations.resolve(String(input.location))
      if (!place) throw new Error(`no location matching "${input.location}"`)
      const drawing = db.locations.drawing(place.id)
      return drawing
        ? { location_id: place.id, diagram: drawing }
        : { location_id: place.id, diagram: null, note: 'None of its parts has a layout cell yet. Set grid on its parts (upsert_location / update_location) once the arrangement is known.' }
    },
  }
}

export const diagramField = nullable(
  textWith(
    'Optional fixed-width sketch shown on screen with the question (it is not read aloud), e.g. your understanding of how a bookcase is arranged: boxes drawn with + - |, one label per part. Use show_layout\'s diagram when the parts already have cells. Keep it under 40 characters wide.',
  ),
)
