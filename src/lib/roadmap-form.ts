// The roadmap editing forms as plain data: what a phase or item looks like in its form, how a stored one fills the form, and the
// request body a form makes. Pure, so the shapes are tested without a component.
// The stored shapes the forms start from.
import type { Item, Phase } from '../api/types.js'

/** A phase as its form holds it: numbers are text while edited, dates stay null until set. */
export interface PhaseFields {
  key: string
  sort_order: string
  internal_name: string
  internal_description: string
  public_name: string
  public_description: string
  window_start: string | null
  window_end: string | null
  visible_human: boolean
  visible_bot: boolean
}

/** An item as its form holds it: ids and numbers are text while edited, an empty public wording means "not public". */
export interface ItemFields {
  phase_id: string
  key: string
  item_type: string
  internal_title: string
  internal_description: string
  public_title: string
  public_description: string
  visible_human: boolean
  visible_bot: boolean
  status: string
  planned_at: string | null
  due_at: string | null
  public_due_at: string | null
}

/** A new phase's form: it goes last. */
export const newPhase = (sortOrder: number): PhaseFields => ({
  // Every text field starts empty and neither audience sees the phase until the operator chooses.
  key: '', sort_order: String(sortOrder), internal_name: '', internal_description: '', public_name: '', public_description: '',
  window_start: null, window_end: null, visible_human: false, visible_bot: false,
})

/** A stored phase as the form's fields. */
export const phaseFields = (p: Phase): PhaseFields => ({
  // A stored phase fills the form field by field; numbers become text.
  key: p.key, sort_order: String(p.sort_order), internal_name: p.internal_name, internal_description: p.internal_description,
  public_name: p.public_name, public_description: p.public_description, window_start: p.window_start, window_end: p.window_end,
  visible_human: p.visible_human, visible_bot: p.visible_bot,
})

/** A new item's form, in the phase being looked at. */
export const newItem = (phaseId: string): ItemFields => ({
  // Every text field starts empty, the type is `other`, the status `planned`, and neither audience sees the item until the operator chooses.
  phase_id: phaseId, key: '', item_type: 'other', internal_title: '', internal_description: '', public_title: '', public_description: '',
  visible_human: false, visible_bot: false, status: 'planned', planned_at: null, due_at: null, public_due_at: null,
})

/** A stored item as the form's fields; a missing public wording becomes empty text. */
export const itemFields = (i: Item): ItemFields => ({
  // A stored item fills the form; a missing public wording becomes empty text.
  phase_id: String(i.phase_id), key: i.key, item_type: i.item_type, internal_title: i.internal_title, internal_description: i.internal_description,
  public_title: i.public_title ?? '', public_description: i.public_description ?? '', visible_human: i.visible_human, visible_bot: i.visible_bot,
  status: i.status, planned_at: i.planned_at, due_at: i.due_at, public_due_at: i.public_due_at,
})

/** The request body a phase form makes: the key trimmed and the order as a number. */
export const phaseBody = (f: PhaseFields) => ({
  // The body the server expects: the key trimmed, the order as a number, the rest as typed.
  key: f.key.trim(), sort_order: Number(f.sort_order), internal_name: f.internal_name, internal_description: f.internal_description,
  public_name: f.public_name, public_description: f.public_description, window_start: f.window_start, window_end: f.window_end,
  visible_human: f.visible_human, visible_bot: f.visible_bot,
})

/** An empty public title or description is "not public": the server needs null, not an empty string. */
export const itemBody = (f: ItemFields) => ({
  // The body the server expects: ids as numbers, an empty public wording as null.
  phase_id: Number(f.phase_id), key: f.key.trim(), item_type: f.item_type, internal_title: f.internal_title,
  internal_description: f.internal_description, public_title: f.public_title.trim() || null,
  public_description: f.public_description.trim() || null, visible_human: f.visible_human, visible_bot: f.visible_bot,
  status: f.status, planned_at: f.planned_at, due_at: f.due_at, public_due_at: f.public_due_at,
})
