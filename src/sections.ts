/** One tab of the console: its id, its label and a one-line summary. */
export interface Section {
  readonly id: string
  readonly label: string
  readonly summary: string
}

/** The sections in navigation order. */
export const SECTIONS: readonly Section[] = [
  // The overview of everything else.
  { id: 'dashboard', label: 'Dashboard', summary: 'Tasks by status, posts by phase, instances by state, the schedule, reviews due and spend against caps.' },
  // The roadmap, with its internal and public wording.
  { id: 'roadmap', label: 'Roadmap', summary: 'Phases and items with their internal and public wording, and a preview of what the public roadmap shows.' },
  // The work behind it.
  { id: 'tasks', label: 'Tasks', summary: 'Tasks with their allowed status changes, dependencies, links and blocked reasons.' },
  // Where a post is written once and checked per platform.
  { id: 'composer', label: 'Composer', summary: 'Write a post once and see, per platform, how much of it fits and how it renders.' },
  // Where posts go out, and where a person finishes the ones that need one.
  { id: 'instances', label: 'Publishing', summary: 'Every post on every target: status, links, attempts; mark manual posts done and resolve uncertain sends.' },
  // When things happen.
  { id: 'schedule', label: 'Schedule', summary: 'What is scheduled to send and which reviews are due, as a list or a calendar, in your time zone.' },
  // What it may cost, and who changed what.
  { id: 'budgets', label: 'Budgets', summary: 'Monthly caps per platform and target, usage, and the audit trail of changes.' },
]
