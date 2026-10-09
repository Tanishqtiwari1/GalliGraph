export type Category =
  | 'road_damage'
  | 'water_supply'
  | 'drainage'
  | 'garbage'
  | 'streetlight'
  | 'stray_animals'
  | 'traffic'
  | 'electricity'
  | 'other'
export type Status = 'open' | 'info_requested' | 'assigned' | 'in_progress' | 'needs_verification' | 'resolved' | 'rejected'
export type Tier = 'critical' | 'high' | 'medium' | 'low'

export interface PriorityFactor {
  factor: string
  weight: number
  value: number
  points: number
  reason: string
}

export interface Extraction {
  category: Category
  sub_type: string
  location_text: string | null
  location_detail: string | null
  duration_days: number | null
  severity: number
  severity_reason: string
  safety_risk: boolean
  language: string
  summary_en: string
  secondary_category: Category | null
}

export interface Complaint {
  id: number
  raw_text: string
  channel: string
  has_image: boolean
  created_at: string
  extracted: Extraction
  extractor: string
  category: Category
  lat: number | null
  lng: number | null
  locality_id: string | null
  geo_precision: string
  issue_id: number
  dedup_score: number | null
  needs_review: boolean
  processing_ms: number | null
  image_url: string | null
  tracking_code: string | null
  triage_meta: { confidence: number | null; basis?: string; missing: string[] } | null
  sms_to: string | null
  sms_opt_in: boolean
}

export interface Issue {
  id: number
  category: Category
  sub_type: string
  summary: string
  lat: number | null
  lng: number | null
  locality_id: string | null
  locality: string | null
  geo_precision: string
  location_detail: string | null
  spot_keys: string[]
  severity: number
  safety_risk: boolean
  reported_duration_days: number | null
  report_count: number
  priority_score: number
  priority_breakdown: PriorityFactor[] | null
  department: string
  status: Status
  first_reported: string
  last_reported: string
  resolved_at: string | null
  rank: number | null
  secondary_department: string | null
  sla_tier: Tier | null
  sla_hours: number | null
  sla_due_at: string | null
  escalation_level: number
  assigned_officer: string | null
  resolution_note: string | null
  after_image_url: string | null
  verification: Verification | null
  confirmations: number
  reviewed_at: string | null
  reviewed_by: string | null
  info_request: string | null
  disputed: boolean
  citizen_confirmed: number
  sla: Deadline
}

export interface Deadline {
  due_at: string | null
  hours_left: number | null
  overdue: boolean
  met: boolean | null
}

export interface Verification {
  verdict: 'resolved' | 'not_resolved' | 'unclear'
  confidence: 'high' | 'medium' | 'low'
  same_location_likely: boolean | null
  explanation: string
  method: 'claude' | 'ollama' | 'none'
  checked_at: string
}

export interface Task {
  id: number
  department: string
  role: 'primary' | 'linked'
  status: string
  created_at: string
  completed_at: string | null
}

export interface IssueEvent {
  at: string
  kind: string
  message: string
  actor: string
}

export interface IssueDetail extends Issue {
  complaints: Complaint[]
  tasks: Task[]
  events: IssueEvent[]
}

export interface WorkOrder {
  work_order_no: string
  issued_at: string
  issue_id: number
  title: string
  category: string
  sub_type: string
  location: { locality: string | null; detail: string | null; lat: number | null; lng: number | null; precision: string; map_url: string | null }
  priority: { score: number; tier: Tier | null; rank: number | null; reasons: string[] }
  deadline: Deadline
  sla_hours: number | null
  assigned_officer: string | null
  status: Status
  tasks: Task[]
  safety_risk: boolean
  evidence: { report_count: number; first_reported: string; last_reported: string; citizen_quotes: string[]; photos: string[] }
  completion_requirements: string[]
}

export interface PerfSummary {
  open: number
  overdue: number
  overdue_critical: number
  overdue_rate_pct: number
  escalated: number
  awaiting_verification: number
  resolved: number
  median_resolution_hours: number | null
  sla_compliance_pct: number | null
  resolution_rate_pct: number | null
  avg_open_priority: number
}

export interface Performance {
  window_days: number
  overall: PerfSummary
  departments: (PerfSummary & { department: string })[]
  wards: (PerfSummary & { locality_id: string; locality: string })[]
  weekly: { week_start: string; opened: number; resolved: number }[]
}

export interface Stats {
  complaints: number
  issues: number
  active_issues: number
  resolved_issues: number
  duplicates_merged: number
  dedup_reduction_pct: number
  needs_review: number
  critical_issues: number
  overdue_issues: number
  awaiting_verification: number
  unassigned: number
  untriaged: number
  disputed: number
  high_priority: number
  scope: string | null
  avg_processing_ms: number
  by_category: Record<Category, number>
  by_department: { department: string; open_issues: number; avg_priority: number; overdue: number }[]
  extractor: string
}

export interface Alert {
  locality_id: string
  locality: string
  lat: number
  lng: number
  category: Category
  category_label: string
  observed: number
  expected: number
  z_score: number
  ratio: number | null
  window_days: number
  message: string
  severity: 'warning' | 'critical'
  series: { day: string; count: number }[]
}

export interface Meta {
  categories: { key: Category; label: string; department: string; sub_types: string[] }[]
  localities: { id: string; name: string; lat: number; lng: number; population: number }[]
  departments: string[]
  statuses: Status[]
}

export interface Receipt {
  tracking_code: string
  merged: boolean
  report_count: number
  extractor: string
  processing_ms: number | null
  geo_precision: string
  understood: Pick<
    Extraction,
    'category' | 'sub_type' | 'location_text' | 'location_detail' | 'duration_days' | 'severity' | 'safety_risk' | 'language' | 'summary_en'
  >
  department: string
  secondary_department: string | null
  priority_score: number
  priority_breakdown: PriorityFactor[] | null
  tier: Tier | null
  deadline: Deadline
  status: Status
}

export interface TrackResult {
  tracking_code: string
  reported_at: string
  label: string
  category: Category
  status: Status
  stages: { key: string; label: string; at: string | null }[]
  info_request: string | null
  has_evidence: boolean
  resolution_note: string | null
  can_give_feedback: boolean
  disputed: boolean
  sms_opt_in: boolean
  department: string
  secondary_department: string | null
  report_count: number
  tier: Tier | null
  deadline: Deadline
  escalated: boolean
  message: string
  timeline: { at: string; kind: string; message: string }[]
}

export interface MapPoint {
  id: number
  lat: number
  lng: number
  category: Category
  label: string
  locality: string | null
  status: 'open' | 'in_progress' | 'resolved'
  reports: number
  confirmations: number
  tier: Tier
  score: number
  first_reported: string
  department: string
  days_open: number
  overdue: boolean
}

interface PublicPerf {
  open: number
  overdue: number
  resolved: number
  median_resolution_hours: number | null
  sla_compliance_pct: number | null
}

export interface PublicSummary {
  window_days: number
  complaints_received: number
  issues_resolved: number
  active_issues: number
  duplicates_merged: number
  median_fix_days: number | null
  avg_triage_ms: number
  hotspots: { locality_id: string; locality: string; lat: number; lng: number; category: Category; category_label: string; issues: number; reports: number }[]
  on_time_pct: number | null
  departments: (PublicPerf & { department: string })[]
  areas: (PublicPerf & { locality_id: string; locality: string })[]
  weekly: { week_start: string; opened: number; resolved: number }[]
  by_category: Record<Category, number>
  notices: { locality: string; category: Category; category_label: string; message: string }[]
}

export interface Preview {
  understood: Extraction
  extractor: string
  locality: string | null
  geo_precision: string
  department: string
  secondary_department: string | null
  estimated_priority: number
  tier: Tier
  deadline_hours: number
}

export interface Activity {
  issue_id: number
  at: string
  kind: string
  message: string
  actor: string
  summary: string
  category: Category
  priority_score: number
  department: string
}

export interface SlaItem {
  id: number
  summary: string
  category: Category
  department: string
  assigned_officer: string | null
  status: Status
  priority_score: number
  sla_tier: Tier
  sla_due_at: string
  escalation_level: number
  locality: string | null
  first_reported: string
  hours_left: number
}

export interface SlaOverview {
  policy_hours: Record<Tier, number>
  upcoming: SlaItem[]
  overdue: SlaItem[]
  history: { issue_id: number; at: string; message: string; actor: string; summary: string }[]
}

export interface DuplicateRow {
  complaint_id: number
  tracking_code: string | null
  raw_text: string
  summary: string | null
  created_at: string
  channel: string
  match_score: number | null
  needs_review: boolean
  distance_m: number | null
  geo_precision: string
  hours_after_first: number
  same_category: boolean
  is_first: boolean
}

export interface StaffUser {
  id: number
  username: string
  display_name: string
  role: 'official' | 'supervisor'
  department: string | null
  created_at: string
  last_login_at: string | null
}

export interface User {
  id: number
  username: string
  role: 'official' | 'supervisor'
  display_name: string
  department: string | null
}

export interface Health {
  status: string
  extractor: string
  embeddings: string
  photo_verifier: string
  sms_provider: string
  demo_data: boolean
  trained_model: { source: string; trained_on: number; test_accuracy: number } | null
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Called when an official's session expires, so the portal can show the login screen. */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = typeof body.detail === 'string' ? body.detail : body.detail ? 'Please check what you entered.' : res.statusText
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized?.()
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export interface IssueFilters {
  status?: string
  category?: string
  locality_id?: string
  department?: string
  tier?: string
  since_days?: number
  overdue?: boolean
  untriaged?: boolean
  unassigned?: boolean
  disputed?: boolean
  sort?: 'priority' | 'recent' | 'reports' | 'deadline'
  limit?: number
}

export const api = {
  health: () => request<Health>('/health'),
  login: (username: string, password: string) =>
    request<User>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<User>('/auth/me'),
  publicMap: (category?: string) => request<MapPoint[]>(`/public/map${category ? `?category=${category}` : ''}`),
  publicSummary: () => request<PublicSummary>('/public/summary'),
  meta: () => request<Meta>('/meta'),
  stats: () => request<Stats>('/stats'),
  alerts: () => request<Alert[]>('/alerts'),
  issues: (f: IssueFilters = {}) => {
    const q = new URLSearchParams(
      Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
    )
    return request<Issue[]>(`/issues?${q}`)
  },
  issue: (id: number) => request<IssueDetail>(`/issues/${id}`),
  patchIssue: (id: number, body: { status?: Status; department?: string; assigned_officer?: string; reason?: string }) =>
    request<IssueDetail>(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resolve: (
    id: number,
    body: { note?: string; after_image_base64?: string; after_image_media_type?: string },
  ) => request<IssueDetail>(`/issues/${id}/resolve`, { method: 'POST', body: JSON.stringify(body) }),
  workOrder: (id: number) => request<WorkOrder>(`/issues/${id}/work-order`),
  triage: (
    id: number,
    body: { action: 'approve' | 'edit' | 'reject' | 'request_info'; reason?: string; question?: string; category?: string; sub_type?: string; severity?: number; department?: string },
  ) => request<IssueDetail>(`/issues/${id}/triage`, { method: 'POST', body: JSON.stringify(body) }),
  addNote: (id: number, text: string, isPublic: boolean) =>
    request<IssueDetail>(`/issues/${id}/notes`, { method: 'POST', body: JSON.stringify({ text, public: isPublic }) }),
  remind: (id: number) => request<{ ok: boolean; to: string }>(`/issues/${id}/remind`, { method: 'POST' }),
  duplicates: (id: number) => request<DuplicateRow[]>(`/issues/${id}/duplicates`),
  confirmDuplicate: (complaintId: number) => request<{ ok: boolean }>(`/complaints/${complaintId}/confirm-duplicate`, { method: 'POST' }),
  split: (complaintId: number) => request<{ new_issue_id: number }>(`/complaints/${complaintId}/split`, { method: 'POST' }),
  activity: (limit = 40) => request<Activity[]>(`/activity?limit=${limit}`),
  slaOverview: () => request<SlaOverview>('/sla/overview'),
  users: () => request<StaffUser[]>('/admin/users'),
  createUser: (body: { username: string; display_name: string; role: string; department?: string; password: string }) =>
    request<{ ok: boolean }>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  resetPassword: (username: string, password: string) =>
    request<{ ok: boolean }>(`/admin/users/${encodeURIComponent(username)}/password`, { method: 'POST', body: JSON.stringify({ password }) }),
  deleteUser: (username: string) => request<{ ok: boolean }>(`/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),
  settings: () => request<{ sla_hours: Record<Tier, number>; defaults: Record<Tier, number> }>('/admin/settings'),
  saveSettings: (hours: Record<string, number>) =>
    request<{ sla_hours: Record<Tier, number>; reapplied_to: number }>('/admin/settings', { method: 'PUT', body: JSON.stringify({ hours }) }),
  preview: (body: { text: string; lat?: number; lng?: number; category_hint?: string; image_base64?: string; image_media_type?: string }) =>
    request<Preview>('/complaints/preview', { method: 'POST', body: JSON.stringify(body) }),
  feedback: (code: string, verdict: 'fixed' | 'not_fixed', note?: string) =>
    request<TrackResult>(`/track/${encodeURIComponent(code)}/feedback`, { method: 'POST', body: JSON.stringify({ verdict, note }) }),
  reply: (code: string, text: string) =>
    request<TrackResult>(`/track/${encodeURIComponent(code)}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
  performance: (days = 30) => request<Performance>(`/performance?days=${days}`),
  submit: (body: {
    text: string
    lat?: number
    lng?: number
    channel?: string
    image_base64?: string
    image_media_type?: string
    category_hint?: string
    phone?: string
    sms_opt_in?: boolean
  }) => request<Receipt>('/complaints', { method: 'POST', body: JSON.stringify(body) }),
  notifyOptIn: (code: string, phone: string) =>
    request<{ ok: boolean; to: string }>(`/track/${encodeURIComponent(code)}/notify`, { method: 'POST', body: JSON.stringify({ phone }) }),
  issueSms: (id: number) =>
    request<{ provider: string; messages: { to_masked: string; body: string; provider: string; status: string; error: string | null; created_at: string }[] }>(`/issues/${id}/sms`),
  confirm: (issueId: number) =>
    request<{ confirmations: number; already: boolean }>(`/public/issues/${issueId}/confirm`, { method: 'POST' }),
  escalate: (issueId: number, reason: string) =>
    request<IssueDetail>(`/issues/${issueId}/escalate`, { method: 'POST', body: JSON.stringify({ reason }) }),
  track: (code: string) => request<TrackResult>(`/track/${encodeURIComponent(code.trim())}`),
}
