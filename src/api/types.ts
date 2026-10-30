// The admin API's response and request shapes (content-hub-service `crates/api`, `crates/store/src/repo`). Hand-kept
// until the client package ships generated types; the service's contract job checks routes and enumerations, and the
// console's mocked-API tests use these same shapes. Timestamps are ISO 8601 strings in UTC.

import type { CountingMethod, ExternalStatus, ItemStatus, ItemType, Markup, PostingMode, TaskStatus, TaskType } from '@meddleware/content-hub-client'

export interface Page<T> {
  items: T[]
  next_cursor?: string | null
}

export interface Me {
  subject: string
  display_name: string
}

export interface Phase {
  id: number
  key: string
  public_id: string
  sort_order: number
  internal_name: string
  internal_description: string
  public_name: string
  public_description: string
  window_start: string | null
  window_end: string | null
  visible_human: boolean
  visible_bot: boolean
}

export interface Item {
  id: number
  phase_id: number
  key: string
  public_id: string
  item_type: ItemType
  internal_title: string
  internal_description: string
  public_title: string | null
  public_description: string | null
  visible_human: boolean
  visible_bot: boolean
  status: ItemStatus
  planned_at: string | null
  due_at: string | null
  public_due_at: string | null
  updated_at: string
}

export interface Task {
  id: number
  roadmap_item_id: number | null
  key: string
  task_type: TaskType
  title: string
  description: string
  status: TaskStatus
  blocked_reason: string | null
  scheduled_at: string | null
  completed_at: string | null
  review_interval_days: number | null
  next_review_at: string | null
  assignee_subject: string | null
  entity_gated: boolean
  updated_at: string
}

export interface TaskPlatform {
  id: number
  platform_definition_id: number
  platform_code: string
  platform_target_id: number | null
}

export interface TaskLink {
  id: number
  link_kind: 'post' | 'platform_instance' | 'external'
  post_id: number | null
  platform_instance_id: number | null
  url: string | null
  label: string
  created_at: string
}

export interface TaskDetail {
  task: Task
  depends_on: number[]
  platforms: TaskPlatform[]
  links: TaskLink[]
  /** The statuses this task may move to now (the state machine and its dependencies). */
  allowed_moves: TaskStatus[]
}

export interface ItemDetail {
  item: Item
  tasks: Task[]
  posts: Post[]
}

export interface Post {
  id: number
  public_id: string
  title: string
  body_markdown: string
  status: 'draft' | 'ready' | 'archived'
  tags: string[]
  categories: string[]
  roadmap_item_id: number | null
  task_id: number | null
  revision: number
  created_by: string
  updated_at: string
}

export interface PostRevision {
  id: number
  revision: number
  title: string
  body_markdown: string
  created_by: string
  created_at: string
}

export interface Instance {
  id: number
  post_id: number
  platform_target_id: number
  override_title: string | null
  override_body: string | null
  status: 'planned' | 'queued' | 'sending' | 'posted' | 'failed' | 'unknown' | 'manual_required' | 'cancelled'
  external_status: ExternalStatus | null
  url_or_external_id: string | null
  scheduled_at: string | null
  posted_at: string | null
  sending_started_at: string | null
  attempt_count: number
  next_attempt_at: string | null
  last_error: string | null
  cost_estimate_usd_micros: number
  post_revision: number | null
  payload_title: string | null
  payload_body: string | null
  payload_sha256: string | null
  created_at: string
  updated_at: string
}

export interface Attempt {
  id: number
  started_at: string
  finished_at: string | null
  outcome: 'success' | 'failed' | 'unknown' | 'rate_limited' | 'validation_error' | 'dry_run' | null
  http_status: number | null
  response_excerpt: string | null
  request_redacted: unknown
  dry_run: boolean
  rendered_payload_sha256: string
}

export interface PostDetail {
  post: Post
  revisions: PostRevision[]
  instances: Instance[]
}

export interface InstanceDetail {
  instance: Instance
  attempts: Attempt[]
  /** The prefilled compose link of a manual platform (when its definition has one). */
  intent_url: string | null
  /** The moves an operator may make now. */
  operator_moves: Instance['status'][]
}

export interface PlatformDefinition {
  id: number
  code: string
  name: string
  category: string
  posting_mode: PostingMode
  counting_method: CountingMethod | null
  primary_limit: number | null
  secondary_limits: Record<string, unknown>
  markup: Markup
  supports_media: boolean
  base_url: string | null
  url_templates: Record<string, string>
  cost_model: Record<string, unknown>
  enabled: boolean
  notes: string
}

export interface PlatformTarget {
  id: number
  platform_definition_id: number
  platform_code: string
  name: string
  external_ref: string | null
  config: Record<string, unknown>
  secret_ref: string | null
  is_sandbox: boolean
  enabled: boolean
  live: boolean
}

export interface SpendCap {
  id: number
  scope: 'total' | 'platform' | 'target'
  platform_definition_id: number | null
  platform_target_id: number | null
  monthly_limit_usd_micros: number
  daily_post_limit: number | null
  updated_by: string
  updated_at: string
}

export interface Budgets {
  ceilings: { total_monthly_usd_micros: number; per_platform_monthly_usd_micros: number }
  caps: SpendCap[]
  usage: Array<{ platform_definition_id: number; used_usd_micros: number }>
}

export interface CountBy {
  key: string
  count: number
}

export interface Stats {
  tasks_by_status: CountBy[]
  items_by_status: CountBy[]
  posts_by_status: CountBy[]
  instances_by_status: CountBy[]
  posts_by_phase: CountBy[]
  reviews_due: number
}

export interface Schedule {
  instances: Instance[]
  reviews_due: Task[]
}

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
export interface TargetProblem {
  target_id: number
  problem: string
}

export interface EnqueueTarget {
  target_id: number
  override_title?: string
  override_body?: string
}
