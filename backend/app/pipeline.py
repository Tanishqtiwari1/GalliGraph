"""The full triage pipeline: extract -> geocode -> embed -> dedup -> merge/create -> prioritise -> route."""
import json
import sqlite3
import time
from dataclasses import asdict
from datetime import datetime

from . import priority, sla
from .db import complaint_row_to_dict, from_blob, issue_row_to_dict, log_event, new_tracking_code, to_blob
from .dedup import DedupResult, find_match, merged_embedding
from .embed import embed
from .extract import extract
from .geo import geocode, spot_keys
from .media import save_image
from .taxonomy import CATEGORIES, department_for
from .timeutil import iso, parse, utcnow


def _triage_meta(text: str, ex, geo, spots: list[str], has_image: bool) -> dict:
    """What an officer needs to judge the AI's suggestion: how sure the model is and what is missing."""
    from . import classifier

    from .extract import keyword_hits

    # Confidence reflects what actually drove the decision: the trained model when it is sure,
    # otherwise how many specific keywords matched (the path used for Hindi/Hinglish text).
    pred = classifier.predict(text)
    p_model = pred[2].get(ex.category, 0.0) if pred is not None else 0.0
    hits = keyword_hits(text, ex.category)
    if p_model >= 0.5:
        confidence, basis = p_model, "trained model"
    elif hits >= 2:
        confidence, basis = max(p_model, 0.8), f"{hits} keyword matches"
    elif hits == 1:
        confidence, basis = max(p_model, 0.6), "1 keyword match"
    else:
        confidence, basis = p_model, "weak signal - please check"
    confidence = round(confidence, 2)
    missing = []
    if geo.precision == "unknown":
        missing.append("location")
    elif geo.precision == "locality" and not spots:
        missing.append("exact spot (lane / landmark)")
    if not ex.duration_days:
        missing.append("how long the problem has existed")
    if not has_image:
        missing.append("photo")
    return {"confidence": confidence, "basis": basis, "missing": missing}


# Incidents, not standing problems: two reports are two separate events even at the same spot.
NEVER_MERGE = {("traffic", "rule_violation")}


def _embedding_text(raw: str, summary: str, detail: str | None) -> str:
    # The normalised English summary is repeated so it outweighs surface wording: a Hindi and an
    # English report of the same pothole share little raw text but nearly identical summaries.
    return f"{summary} {summary} {detail or ''} {raw}"


def ingest(conn: sqlite3.Connection, *, text: str, lat: float | None = None, lng: float | None = None,
           channel: str = "web", image_b64: str | None = None, image_media_type: str | None = None,
           created_at: str | None = None, reporter_contact: str | None = None,
           category_hint: str | None = None, sms_opt_in: bool = False) -> dict:
    t0 = time.perf_counter()
    created_at = iso(parse(created_at)) if created_at else iso(utcnow())
    image_path = save_image(image_b64, image_media_type) if image_b64 else None  # validates before any AI spend

    # 1. Extract structured fields
    ex, extractor = extract(text, image_b64, image_media_type)
    if category_hint and ex.category == "other" and category_hint in CATEGORIES:
        # The citizen picked a category tile and the text alone was not conclusive: trust the tile.
        ex.category, ex.sub_type = category_hint, "other"

    # 2. Geocode
    geo = geocode(ex.location_text, text, lat, lng)

    # 3. Embed + spot fingerprint (lane number / landmark)
    vec = embed(_embedding_text(text, ex.summary_en, ex.location_detail))
    spots = spot_keys(text, ex.location_detail)

    # 4. Deduplicate (one-off incidents such as a traffic violation by a specific vehicle are never merged)
    if (ex.category, ex.sub_type) in NEVER_MERGE:
        match = DedupResult(None, None, False)
    else:
        match = find_match(conn, category=ex.category, lat=geo.lat, lng=geo.lng, precision=geo.precision,
                           locality_id=geo.locality_id, created_at=created_at, embedding=vec, spot_keys=spots)

    secondary_dept = department_for(ex.secondary_category) if ex.secondary_category else None

    # 5. Merge into an existing issue, or open a new one
    if match.issue_id is not None:
        issue = conn.execute("SELECT * FROM issues WHERE id = ?", (match.issue_id,)).fetchone()
        upgrade_loc = geo.precision in ("gps", "landmark") and issue["geo_precision"] not in ("gps", "landmark")
        conn.execute(
            """UPDATE issues SET report_count = report_count + 1,
                   last_reported = MAX(last_reported, ?), first_reported = MIN(first_reported, ?),
                   severity = MAX(severity, ?), safety_risk = MAX(safety_risk, ?),
                   reported_duration_days = MAX(COALESCE(reported_duration_days, 0), COALESCE(?, 0)),
                   location_detail = COALESCE(location_detail, ?),
                   lat = ?, lng = ?, geo_precision = ?, locality_id = COALESCE(?, locality_id),
                   embedding = ?, spot_keys = ?, secondary_department = COALESCE(secondary_department, ?),
                   status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END
               WHERE id = ?""",
            (created_at, created_at, ex.severity, int(ex.safety_risk), ex.duration_days, ex.location_detail,
             geo.lat if upgrade_loc else issue["lat"], geo.lng if upgrade_loc else issue["lng"],
             geo.precision if upgrade_loc else issue["geo_precision"], geo.locality_id,
             to_blob(merged_embedding(from_blob(issue["embedding"]), issue["report_count"], vec)),
             json.dumps(sorted(set(json.loads(issue["spot_keys"] or "[]")) | set(spots))),
             secondary_dept, match.issue_id),
        )
        issue_id, merged = match.issue_id, True
    else:
        cur = conn.execute(
            """INSERT INTO issues (category, sub_type, summary, lat, lng, locality_id, geo_precision, location_detail,
                   spot_keys, severity, safety_risk, reported_duration_days, department, first_reported, last_reported,
                   embedding, secondary_department)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (ex.category, ex.sub_type, ex.summary_en, geo.lat, geo.lng, geo.locality_id, geo.precision,
             ex.location_detail, json.dumps(spots), ex.severity, int(ex.safety_risk), ex.duration_days, department_for(ex.category),
             created_at, created_at, to_blob(vec), secondary_dept),
        )
        issue_id, merged = cur.lastrowid, False
        conn.execute("INSERT INTO issue_tasks (issue_id, department, role, created_at) VALUES (?, ?, 'primary', ?)",
                     (issue_id, department_for(ex.category), created_at))

    cur = conn.execute(
        """INSERT INTO complaints (raw_text, channel, has_image, created_at, extracted, extractor, category, lat, lng,
               locality_id, geo_precision, embedding, issue_id, dedup_score, needs_review, reporter_contact, processing_ms,
               image_path, tracking_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (text, channel, int(bool(image_b64)), created_at, ex.model_dump_json(), extractor, ex.category,
         geo.lat, geo.lng, geo.locality_id, geo.precision, to_blob(vec), issue_id, match.score,
         int(match.needs_review), reporter_contact, None, image_path, new_tracking_code()),
    )
    complaint_id = cur.lastrowid
    conn.execute("UPDATE complaints SET triage_meta = ?, sms_opt_in = ? WHERE id = ?",
                 (json.dumps(_triage_meta(text, ex, geo, spots, bool(image_b64))), int(bool(sms_opt_in and reporter_contact)),
                  complaint_id))
    if secondary_dept:
        conn.execute("INSERT OR IGNORE INTO issue_tasks (issue_id, department, role, created_at) VALUES (?, ?, 'linked', ?)",
                     (issue_id, secondary_dept, created_at))
    if merged:
        log_event(conn, issue_id, created_at, "report",
                  f"Report #{complaint_id} via {channel} merged (match {match.score:.0%})"
                  + (" - flagged for review" if match.needs_review else ""))
    else:
        log_event(conn, issue_id, created_at, "created",
                  f"Issue opened from report #{complaint_id} via {channel}; routed to {department_for(ex.category)}"
                  + (f" with a linked task for {secondary_dept}" if secondary_dept else ""))

    # 6. Prioritise + set the deadline (7. routing happened at issue creation via department_for).
    # Scored "as of" the report time so imported history replays faithfully.
    rescore_issue(conn, issue_id, now=min(parse(created_at), utcnow()))
    conn.execute("UPDATE complaints SET processing_ms = ? WHERE id = ?",
                 (round((time.perf_counter() - t0) * 1000), complaint_id))

    issue_row = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
    complaint_row = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    return {
        "complaint": complaint_row_to_dict(complaint_row),
        "issue": issue_row_to_dict(issue_row),
        "merged": merged,
        "needs_review": match.needs_review,
        "dedup_candidates": [asdict(c) for c in match.candidates],
    }


def rescore_issue(conn: sqlite3.Connection, issue_id: int, now: datetime | None = None) -> None:
    row = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
    total, breakdown = priority.score(conn, dict(row), now)
    conn.execute("UPDATE issues SET priority_score = ?, priority_breakdown = ? WHERE id = ?",
                 (total, json.dumps(breakdown), issue_id))
    sla.apply(conn, issue_id, now)


def rescore_all(conn: sqlite3.Connection, now: datetime | None = None) -> int:
    ids = [r["id"] for r in conn.execute("SELECT id FROM issues WHERE status NOT IN ('resolved', 'rejected')")]
    for i in ids:
        rescore_issue(conn, i, now)
    return len(ids)
