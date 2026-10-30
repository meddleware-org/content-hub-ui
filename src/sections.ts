// The console's sections, in navigation order. Each becomes a tab; ContentHubView maps the id to its view.
export interface Section {
  readonly id: string
  readonly label: string
  readonly summary: string
}

export const SECTIONS: readonly Section[] = [
  { id: 'dashboard', label: 'Dashboard', summary: 'Tasks by status, posts by phase, instances by state, the schedule, reviews due and spend against caps.' },
  { id: 'roadmap', label: 'Roadmap', summary: 'Phases and items with their internal and public wording, and a preview of what the public roadmap shows.' },
  { id: 'tasks', label: 'Tasks', summary: 'Tasks with their allowed status changes, dependencies, links and blocked reasons.' },
  { id: 'composer', label: 'Composer', summary: 'Write a post once and see, per platform, how much of it fits and how it renders.' },
  { id: 'instances', label: 'Publishing', summary: 'Every post on every target: status, links, attempts; mark manual posts done and resolve uncertain sends.' },
  { id: 'schedule', label: 'Schedule', summary: 'What is scheduled to send and which reviews are due, as a list or a calendar, in your time zone.' },
  { id: 'budgets', label: 'Budgets', summary: 'Monthly caps per platform and target, usage, and the audit trail of changes.' },
]
