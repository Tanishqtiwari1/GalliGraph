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
export type Status = 'open' | 'assigned' | 'in_progress' | 'needs_verification' | 'resolved'
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

export interface IngestResult {
  complaint: Complaint
  issue: Issue
  merged: boolean
  needs_review: boolean
  dedup_candidates: { issue_id: number; score: number; text: number; geo: number; time: number; distance_m: number | null }[]
}

export interface TrackResult {
  complaint_id: number
  issue_id: number
  status: Status
  department: string
  summary: string
  priority_score: number
  priority_rank: number | null
  report_count: number
  deadline: Deadline
  message: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ? JSON.stringify(body.detail) : `${res.status} ${res.statusText}`)
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
  sort?: 'priority' | 'recent' | 'reports' | 'deadline'
  limit?: number
}

export const api = {
  health: () =>
    request<{
      status: string
      extractor: string
      embeddings: string
      photo_verifier: string
      trained_model: { source: string; trained_on: number; test_accuracy: number } | null
    }>('/health'),
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
  patchIssue: (id: number, body: { status?: Status; department?: string; assigned_officer?: string; actor?: string }) =>
    request<IssueDetail>(`/issues/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resolve: (
    id: number,
    body: { officer?: string; note?: string; after_image_base64?: string; after_image_media_type?: string },
  ) => request<IssueDetail>(`/issues/${id}/resolve`, { method: 'POST', body: JSON.stringify(body) }),
  workOrder: (id: number) => request<WorkOrder>(`/issues/${id}/work-order`),
  performance: (days = 30) => request<Performance>(`/performance?days=${days}`),
  submit: (body: {
    text: string
    lat?: number
    lng?: number
    channel?: string
    image_base64?: string
    image_media_type?: string
  }) => request<IngestResult>('/complaints', { method: 'POST', body: JSON.stringify(body) }),
  track: (complaintId: number) => request<TrackResult>(`/track/${complaintId}`),
}
