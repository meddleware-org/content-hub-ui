// How a status is shown: in words first (the label), with a tone and a symbol (a UiBadge) as reinforcement. The server decides every
// status; this only chooses how one looks.
// The badge tones the shared UI offers.
import type { BadgeTone } from '@meddleware/ui'
// Turns `in_progress` into `in progress`.
import { humanize } from '@meddleware/web-utils'

// A tone per status: green for finished, amber for waiting or uncertain, red for stopped; anything else is neutral.
const TONE: Record<string, BadgeTone> = {
  posted: 'ok', done: 'ok', ready: 'ok', published: 'ok', approved: 'ok',
  queued: 'warn', sending: 'warn', in_progress: 'warn', unknown: 'warn', manual_required: 'warn',
  failed: 'danger', blocked: 'danger', cancelled: 'danger', rejected: 'danger',
}
// Statuses whose words differ from the humanised key.
const LABEL: Record<string, string> = { manual_required: 'manual' }

/** The tone of a status; one this build does not know is neutral. */
/** The tone of a status; one this build does not know is neutral. */
export const statusTone = (status: string): BadgeTone => TONE[status] ?? 'neutral'

/** A status as words (`in_progress` → `in progress`). */
/** A status as words (`in_progress` becomes `in progress`). */
export const statusLabel = (status: string): string => LABEL[status] ?? humanize(status)
