# CivicPulse API contract

Base URL: `http://localhost:8000/api`. Interactive docs: `http://localhost:8000/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Status + which extractor (`claude` / `rules`) and embedding backend is active |
| GET | `/meta` | Categories (with departments), localities, statuses |
| POST | `/complaints` | Ingest one complaint → full pipeline result |
| GET | `/complaints?limit&needs_review` | Recent raw complaints |
| GET | `/issues?status&category&locality_id&department&tier&since_days&overdue&sort&limit` | Ranked issue queue. `status=active` = everything not resolved. `tier` = critical/high/medium/low. `sort` = `priority` / `recent` / `reports` / `deadline` |
| GET | `/issues/{id}` | Issue + merged complaints + tasks + event timeline + deadline + live rank |
| PATCH | `/issues/{id}` | `{status?, department?, assigned_officer?, actor?}`; every change is logged |
| POST | `/issues/{id}/resolve` | `{officer, note?, after_image_base64?, after_image_media_type?}`: close with evidence. AI verifies the photo; if not verified, status becomes `needs_verification` |
| GET | `/issues/{id}/work-order` | Printable work order: deadline, tasks per department, priority reasons, evidence |
| GET | `/performance?days=30` | Accountability: overall + per department + per area (on-time %, median fix time, overdue, escalated), weekly opened vs resolved |
| GET | `/media/{file}` | Stored evidence photos |
| GET | `/track/{complaint_id}` | Citizen-facing status message + target date |
| POST | `/complaints/preview` | Review before submitting: what the AI understood, department, estimated priority and deadline (nothing saved) |
| POST | `/track/{code}/feedback` | Citizen `{verdict: fixed / not_fixed, note}`. A dispute sends the issue to supervisor review |
| POST | `/track/{code}/reply` | Citizen answers an officer's request for information |
| GET | `/track/{code}/evidence` | After-repair photo for the citizen who reported |
| POST | `/public/issues/{id}/confirm` | "I have this too (+1)" |
| POST | `/issues/{id}/triage` | Officer `{action: approve / edit / reject / request_info, ...}`. Overrides need a reason and are audited |
| POST | `/issues/{id}/notes` | Work note `{text, public}`. Public notes appear on the citizen's tracking page |
| POST | `/issues/{id}/escalate` · `/remind` | Manual escalation (with reason) and deadline reminder |
| GET | `/issues/{id}/duplicates` | Related reports with match %, distance and time gap |
| POST | `/complaints/{id}/confirm-duplicate` · `/split` | Confirm a merge, or split a report out into its own incident |
| GET | `/activity` · `/sla/overview` | Notification feed; SLA centre (due in 48 h, overdue, escalation history) |
| GET/POST/DELETE | `/admin/users…` · GET/PUT `/admin/settings` | Supervisor: staff accounts and deadline policy |
| GET | `/alerts` | Spike alerts with 21-day daily series |
| GET | `/hotspots` | Locality × category pairs with most issues (90 days) |
| GET | `/stats` | Dashboard KPIs |
| POST | `/admin/rescore` | Recompute all priority scores |

## POST /complaints

```json
{
  "text": "bhai Raja Park gali no 5 me 2 hafte se bada gaddha hai, kal scooty gir gayi",
  "lat": 26.8964, "lng": 75.8260,          // optional (device GPS)
  "channel": "whatsapp",                   // web | whatsapp | email | app | voice | import
  "image_base64": "...",                   // optional photo (no data: prefix)
  "image_media_type": "image/jpeg",
  "created_at": "2026-10-01T09:30:00"      // optional, for imports
}
```

Response (abridged):

```json
{
  "merged": true,
  "needs_review": false,
  "complaint": {
    "id": 663, "extractor": "claude", "processing_ms": 840, "geo_precision": "locality",
    "extracted": {
      "category": "road_damage", "sub_type": "pothole",
      "location_text": "Raja Park", "location_detail": "gali no 5",
      "duration_days": 14, "severity": 4, "safety_risk": true,
      "language": "hinglish",
      "summary_en": "Large pothole in Raja Park lane 5 for ~2 weeks; a scooter rider fell."
    }
  },
  "issue": {
    "id": 285, "report_count": 3, "priority_score": 68.8, "department": "PWD / Municipal Roads",
    "priority_breakdown": [
      {"factor": "severity", "weight": 30, "value": 0.75, "points": 22.5, "reason": "Severity 4/5"},
      {"factor": "safety", "weight": 10, "value": 1.0, "points": 10.0, "reason": "Safety risk (injury / disease / electrocution)"}
    ]
  },
  "dedup_candidates": [{"issue_id": 285, "score": 0.81, "text": 0.62, "geo": 1.0, "time": 0.97, "distance_m": null}]
}
```

## Pipeline

1. **Extract**: Claude structured output (`extract.py`), with an offline typo-tolerant rule fallback
2. **Geocode**: device GPS → OSM Nominatim landmark (optional) → offline Jaipur gazetteer
3. **Embed + spot fingerprint**: multilingual text vector + lane-number/landmark keys
4. **Deduplicate**: `0.5·text + 0.3·geo + 0.2·time` against open issues of the same category within 300 m / 14 days; different lanes in the same locality never merge
5. **Prioritise**: severity 30 · population/nearby schools & hospitals 20 · reports 15 · duration 15 · recurrence 10 · safety 10
6. **Route**: category → department
7. **Trends**: Poisson z-score spike detection per locality × category (last 2 days vs 28-day baseline)
8. **Deadlines**: critical 24 h · high 72 h · medium 7 d · low 14 d from first report; escalation to Ward Supervisor (missed) then Commissioner (past 2× the allowed time)
9. **Closure**: after-repair photo, AI verification against the citizens' photos, supervisor review when not verified

Statuses: `open` → (`info_requested`) → `assigned` → `in_progress` → `needs_verification` (resolution review) → `resolved`, or `rejected` (not actionable). Officials with a department only see and act on that department's issues.
