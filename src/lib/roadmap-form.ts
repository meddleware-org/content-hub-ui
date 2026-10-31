// The roadmap editing forms as plain data: what a phase or item looks like in its form, how a stored one fills the form, and the
// request body a form makes. Pure, so the shapes are tested without a component.
import type { Item, Phase } from '../api/types.js'

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
  key: '', sort_order: String(sortOrder), internal_name: '', internal_description: '', public_name: '', public_description: '',
  window_start: null, window_end: null, visible_human: false, visible_bot: false,
})

export const phaseFields = (p: Phase): PhaseFields => ({
  key: p.key, sort_order: String(p.sort_order), internal_name: p.internal_name, internal_description: p.internal_description,
  public_name: p.public_name, public_description: p.public_description, window_start: p.window_start, window_end: p.window_end,
  visible_human: p.visible_human, visible_bot: p.visible_bot,
})

/** A new item's form, in the phase being looked at. */
export const newItem = (phaseId: string): ItemFields => ({
  phase_id: phaseId, key: '', item_type: 'other', internal_title: '', internal_description: '', public_title: '', public_description: '',
  visible_human: false, visible_bot: false, status: 'planned', planned_at: null, due_at: null, public_due_at: null,
})

export const itemFields = (i: Item): ItemFields => ({
  phase_id: String(i.phase_id), key: i.key, item_type: i.item_type, internal_title: i.internal_title, internal_description: i.internal_description,
  public_title: i.public_title ?? '', public_description: i.public_description ?? '', visible_human: i.visible_human, visible_bot: i.visible_bot,
  status: i.status, planned_at: i.planned_at, due_at: i.due_at, public_due_at: i.public_due_at,
})

export const phaseBody = (f: PhaseFields) => ({
  key: f.key.trim(), sort_order: Number(f.sort_order), internal_name: f.internal_name, internal_description: f.internal_description,
  public_name: f.public_name, public_description: f.public_description, window_start: f.window_start, window_end: f.window_end,
  visible_human: f.visible_human, visible_bot: f.visible_bot,
})

/** An empty public title or description is "not public": the server needs null, not an empty string. */
export const itemBody = (f: ItemFields) => ({
  phase_id: Number(f.phase_id), key: f.key.trim(), item_type: f.item_type, internal_title: f.internal_title,
  internal_description: f.internal_description, public_title: f.public_title.trim() || null,
  public_description: f.public_description.trim() || null, visible_human: f.visible_human, visible_bot: f.visible_bot,
  status: f.status, planned_at: f.planned_at, due_at: f.due_at, public_due_at: f.public_due_at,
})
