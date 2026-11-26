// The admin API's response and request shapes (content-hub-service `crates/api`, `crates/store/src/repo`). Hand-kept
// until the client package ships generated types; the service's contract job checks routes and enumerations, and the
// console's mocked-API tests use these same shapes. Timestamps are ISO 8601 strings in UTC.

// The shared vocabularies come from the client package, so the console and the service cannot drift apart.
import type { CountingMethod, ExternalStatus, ItemStatus, ItemType, Markup, PostingMode, TaskStatus, TaskType } from '@meddleware/content-hub-client'

/** One page of a cursor-paged list: the rows, and the cursor of the next page (absent on the last). */
export interface Page<T> {
  items: T[]
  next_cursor?: string | null
}

/** Who is signed in, as the gateway's identity reports it. */
export interface Me {
  /** The stable identity (the gateway's subject), recorded in the audit trail. */
  subject: string
  /** The name shown in the header. */
  display_name: string
}

/** A roadmap phase: a group of items, with an internal name for the team and a public name for the public roadmap. */
export interface Phase {
  id: number
  /** The stable key the team uses. */
  key: string
  /** The identifier the public roadmap uses; it never changes. */
  public_id: string
  /** The position among phases. */
  sort_order: number
  /** The name the team sees. */
  internal_name: string
  internal_description: string
  /** The name the public roadmap shows. */
  public_name: string
  public_description: string
  /** When the phase begins (ISO 8601, UTC), if planned. */
  window_start: string | null
  window_end: string | null
  /** Shown on the public page people read. */
  visible_human: boolean
  /** Included in the machine-readable roadmap. */
  visible_bot: boolean
}

/** A roadmap item: internal wording for the team, optional public wording, who may see it, and its dates. */
export interface Item {
  id: number
  /** The phase the item belongs to. */
  phase_id: number
  key: string
  public_id: string
  /** What kind of item it is. */
  item_type: ItemType
  internal_title: string
  internal_description: string
  /** The wording the public sees; null keeps the item off the public roadmap. */
  public_title: string | null
  public_description: string | null
  visible_human: boolean
  visible_bot: boolean
  status: ItemStatus
  /** When it is planned for. */
  planned_at: string | null
  /** The internal due date. */
  due_at: string | null
  /** The due date the public sees, which may differ from the internal one. */
  public_due_at: string | null
  updated_at: string
}

/** A unit of work, optionally under a roadmap item, with its status, schedule and review cycle. */
export interface Task {
  id: number
  /** The item the task serves, if any. */
  roadmap_item_id: number | null
  key: string
  task_type: TaskType
  title: string
  description: string
  status: TaskStatus
  /** Why the task is blocked (set when its status is blocked). */
  blocked_reason: string | null
  /** When the work is scheduled. */
  scheduled_at: string | null
  completed_at: string | null
  /** How often the task is reviewed again once done. */
  review_interval_days: number | null
  /** When the next review is due. */
  next_review_at: string | null
  /** Who it is assigned to (an identity subject). */
  assignee_subject: string | null
  /** True when it waits for the organisation to exist. */
  entity_gated: boolean
  updated_at: string
}

/** A platform (and optionally one target) a task is about. */
export interface TaskPlatform {
  id: number
  platform_definition_id: number
  platform_code: string
  platform_target_id: number | null
}

/** A link from a task to a post, a platform instance or an outside address. */
export interface TaskLink {
  id: number
  link_kind: 'post' | 'platform_instance' | 'external'
  post_id: number | null
  platform_instance_id: number | null
  url: string | null
  label: string
  created_at: string
}

/** A task with what depends on it and what it points to. */
export interface TaskDetail {
  task: Task
  depends_on: number[]
  platforms: TaskPlatform[]
  links: TaskLink[]
  /** The statuses this task may move to now (the state machine and its dependencies). */
  allowed_moves: TaskStatus[]
}

/** A roadmap item with its tasks and posts. */
export interface ItemDetail {
  item: Item
  tasks: Task[]
  posts: Post[]
}

/** A post written once in Markdown, with its tags, categories and revision number. */
export interface Post {
  id: number
  public_id: string
  title: string
  /** The text as written, in Markdown. */
  body_markdown: string
  /** Draft, ready to publish, or archived. */
  status: 'draft' | 'ready' | 'archived'
  /** Free labels. */
  tags: string[]
  /** Broader groupings. */
  categories: string[]
  roadmap_item_id: number | null
  task_id: number | null
  /** Increases on every saved change. */
  revision: number
  created_by: string
  updated_at: string
}

/** One saved revision of a post. */
export interface PostRevision {
  id: number
  revision: number
  title: string
  body_markdown: string
  created_by: string
  created_at: string
}

/** A post queued for one target: its state, schedule, attempts, cost estimate and the exact payload that was or will be sent. */
export interface Instance {
  id: number
  post_id: number
  platform_target_id: number
  /** A title for this platform only. */
  override_title: string | null
  /** A body for this platform only. */
  override_body: string | null
  /** Where the instance is in its life, from planned to posted, failed or cancelled. */
  status: 'planned' | 'queued' | 'sending' | 'posted' | 'failed' | 'unknown' | 'manual_required' | 'cancelled'
  /** What the platform itself reports, when it does. */
  external_status: ExternalStatus | null
  /** The posted address or the platform's own id. */
  url_or_external_id: string | null
  scheduled_at: string | null
  posted_at: string | null
  /** Set when a send begins, so an interrupted send can be told from one never made. */
  sending_started_at: string | null
  /** How many attempts have been made. */
  attempt_count: number
  /** When a retry is due. */
  next_attempt_at: string | null
  /** The last failure, in short. */
  last_error: string | null
  /** The estimated cost in millionths of a US dollar. */
  cost_estimate_usd_micros: number
  /** The post revision the payload was made from. */
  post_revision: number | null
  payload_title: string | null
  payload_body: string | null
  /** A hash of the exact payload, so a resend can be proved identical. */
  payload_sha256: string | null
  created_at: string
  updated_at: string
}

/** One attempt to send an instance: when, the outcome, the answer's status and excerpt, and a redacted copy of the request. */
export interface Attempt {
  id: number
  started_at: string
  finished_at: string | null
  /** How the attempt ended; null while it is running. */
  outcome: 'success' | 'failed' | 'unknown' | 'rate_limited' | 'validation_error' | 'dry_run' | null
  http_status: number | null
  /** A short excerpt of the platform's answer. */
  response_excerpt: string | null
  /** The request with secrets removed. */
  request_redacted: unknown
  /** True when nothing was actually sent. */
  dry_run: boolean
  rendered_payload_sha256: string
}

/** A post with its revisions and its instances. */
export interface PostDetail {
  post: Post
  revisions: PostRevision[]
  instances: Instance[]
}

/** An instance with its attempts, the compose link of a manual platform and the moves the operator may make now. */
export interface InstanceDetail {
  instance: Instance
  attempts: Attempt[]
  /** The prefilled compose link of a manual platform (when its definition has one). */
  intent_url: string | null
  /** The moves an operator may make now. */
  operator_moves: Instance['status'][]
}

/** A platform the hub knows: how it is posted to, how its limit is counted, how its markup is written and what it costs. */
export interface PlatformDefinition {
  id: number
  code: string
  name: string
  category: string
  /** Automatic, manual or disabled. */
  posting_mode: PostingMode
  /** How the limit is counted (characters, graphemes, bytes and so on). */
  counting_method: CountingMethod | null
  /** The main length limit. */
  primary_limit: number | null
  /** Other limits, by name. */
  secondary_limits: Record<string, unknown>
  /** The markup the platform accepts. */
  markup: Markup
  supports_media: boolean
  base_url: string | null
  /** Address templates (compose links and the like). */
  url_templates: Record<string, string>
  /** How a post is costed. */
  cost_model: Record<string, unknown>
  enabled: boolean
  notes: string
}

/** A place on a platform the hub may post to (an account, a channel or a server), with its secret reference (never the secret) and whether it is live. */
export interface PlatformTarget {
  id: number
  platform_definition_id: number
  platform_code: string
  name: string
  /** The platform's own id for the place (a channel id, a handle). */
  external_ref: string | null
  /** Settings that are not secret. */
  config: Record<string, unknown>
  /** The name of the secret that holds the credential; never the credential itself. */
  secret_ref: string | null
  /** True for a test place. */
  is_sandbox: boolean
  enabled: boolean
  /** True when sends are allowed to reach it. */
  live: boolean
}

/** A monthly spend limit for the whole hub, one platform or one target, with an optional daily post limit. Amounts are USD micros. */
export interface SpendCap {
  id: number
  /** What the cap covers. */
  scope: 'total' | 'platform' | 'target'
  platform_definition_id: number | null
  platform_target_id: number | null
  /** The monthly limit in millionths of a US dollar. */
  monthly_limit_usd_micros: number
  /** The most posts per day, if limited. */
  daily_post_limit: number | null
  updated_by: string
  updated_at: string
}

/** The fixed ceilings, the caps set on top of them, and this month's usage per platform. */
export interface Budgets {
  /** The fixed ceilings the caps may not exceed. */
  ceilings: { total_monthly_usd_micros: number; per_platform_monthly_usd_micros: number }
  /** The caps set by the team. */
  caps: SpendCap[]
  /** This month's spend per platform. */
  usage: Array<{ platform_definition_id: number; used_usd_micros: number }>
}

/** A count for one key (a status or a phase). */
export interface CountBy {
  key: string
  count: number
}

/** The dashboard's counts, by status and phase, and how many reviews are due. */
export interface Stats {
  tasks_by_status: CountBy[]
  items_by_status: CountBy[]
  posts_by_status: CountBy[]
  instances_by_status: CountBy[]
  posts_by_phase: CountBy[]
  reviews_due: number
}

/** What is scheduled to send and which reviews are due. */
export interface Schedule {
  instances: Instance[]
  reviews_due: Task[]
}

/** One row of the audit trail: who did what to which entity, with the state before and after. */
export interface AuditEntry {
  id: number
  at: string
  actor_subject: string
  action: string
  entity_type: string
  entity_id: string | null
  before: unknown
  after: unknown
}

/** The public roadmap document (`/public/v1/roadmap`), as returned by the preview route. */
export interface PublicRoadmap {
  schema_version: number
  updated_at: string | null
  phases: Array<{
    id: string
    name: string
    description: string
    window_start: string | null
    window_end: string | null
    items: Array<{ id: string; title: string; description: string; status: string; due_at: string | null; updated_at: string }>
  }>
}

/** One target the enqueue step refused, and why. */
/** One target the enqueue step refused, and why. */
export interface TargetProblem {
  target_id: number
  problem: string
}

/** One target to queue a post for, with an optional title or body override for that platform. */
export interface EnqueueTarget {
  target_id: number
  override_title?: string
  override_body?: string
}
