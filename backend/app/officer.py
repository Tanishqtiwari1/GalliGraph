"""Officer & supervisor operations: AI triage decisions, work notes, duplicate review, activity feed,
SLA centre, staff management and policy settings.

Access rules:
  * An official with a department sees and acts only on that department's issues (jurisdiction).
  * Supervisors (no department restriction) see everything and manage staff and settings.
"""
import json
import sqlite3
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth, db, sla
from .geo import haversine_m, locality_by_id
from .pipeline import rescore_issue
from .taxonomy import CATEGORIES, department_for
from .timeutil import iso, parse, utcnow

router = APIRouter(prefix="/api")
Official = Depends(auth.require_official)
Supervisor = Depends(auth.require_supervisor)


def scope(user: dict) -> str | None:
    """Department an official is limited to (None = city-wide)."""
    return None if user["role"] == "supervisor" else user.get("department")


def check_access(conn: sqlite3.Connection, user: dict, issue_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
    if not row:
        raise HTTPException(404, "issue not found")
    dept = scope(user)
    if dept and row["department"] != dept and not conn.execute(
            "SELECT 1 FROM issue_tasks WHERE issue_id = ? AND department = ?", (issue_id, dept)).fetchone():
        raise HTTPException(403, "This issue is outside your department's jurisdiction")
    return row


def actor(user: dict) -> str:
    return f"{user['display_name']} ({user['username']})"


# ----------------------------------------------------------------------------- AI triage decisions

class TriageIn(BaseModel):
    action: Literal["approve", "edit", "reject", "request_info"]
    reason: str | None = Field(default=None, max_length=500)
    question: str | None = Field(default=None, max_length=500)
    category: str | None = None
    sub_type: str | None = None
    severity: int | None = Field(default=None, ge=1, le=5)
    department: str | None = Field(default=None, max_length=100)


@router.post("/issues/{issue_id}/triage")
def triage(issue_id: int, body: TriageIn, user: dict = Official):
    """AI suggests; the officer decides. Every override is recorded with its reason."""
    now, who = iso(utcnow()), actor(user)
    with db.session() as conn:
        row = check_access(conn, user, issue_id)
        if row["status"] in sla.CLOSED:
            raise HTTPException(409, "issue is closed")
        if body.action == "approve":
            conn.execute("UPDATE issues SET reviewed_at = ?, reviewed_by = ? WHERE id = ?", (now, who, issue_id))
            db.log_event(conn, issue_id, now, "triage", "AI triage reviewed and approved", who)
        elif body.action == "edit":
            if not body.reason or len(body.reason.strip()) < 3:
                raise HTTPException(422, "Give a reason for overriding the AI suggestion")
            changes, sets, args = [], [], []
            if body.category and body.category != row["category"]:
                if body.category not in CATEGORIES:
                    raise HTTPException(422, "unknown category")
                sub = body.sub_type if body.sub_type in CATEGORIES[body.category]["sub_types"] else "other"
                changes.append(f"category {row['category']} → {body.category}")
                sets += ["category = ?", "sub_type = ?"]
                args += [body.category, sub]
                if not body.department:
                    body.department = department_for(body.category)
            elif body.sub_type and body.sub_type != row["sub_type"] and body.sub_type in CATEGORIES[row["category"]]["sub_types"]:
                changes.append(f"sub-type {row['sub_type']} → {body.sub_type}")
                sets.append("sub_type = ?")
                args.append(body.sub_type)
            if body.severity and body.severity != row["severity"]:
                changes.append(f"severity {row['severity']} → {body.severity}")
                sets.append("severity = ?")
                args.append(body.severity)
            if body.department and body.department != row["department"]:
                changes.append(f"department {row['department']} → {body.department}")
                sets.append("department = ?")
                args.append(body.department)
                conn.execute("UPDATE issue_tasks SET department = ? WHERE issue_id = ? AND role = 'primary'",
                             (body.department, issue_id))
            if not changes:
                raise HTTPException(422, "Nothing was changed")
            sets += ["reviewed_at = ?", "reviewed_by = ?"]
            args += [now, who, issue_id]
            conn.execute(f"UPDATE issues SET {', '.join(sets)} WHERE id = ?", args)
            db.log_event(conn, issue_id, now, "override", f"AI suggestion overridden ({'; '.join(changes)}). Reason: {body.reason.strip()}", who)
        elif body.action == "reject":
            if not body.reason or len(body.reason.strip()) < 3:
                raise HTTPException(422, "Give a reason for rejecting")
            conn.execute("UPDATE issues SET status = 'rejected', resolved_at = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?",
                         (now, now, who, issue_id))
            db.log_event(conn, issue_id, now, "status", f"Rejected as not actionable: {body.reason.strip()}", who)
        elif body.action == "request_info":
            if not body.question or len(body.question.strip()) < 5:
                raise HTTPException(422, "Write the question for the citizen")
            conn.execute("UPDATE issues SET status = 'info_requested', info_request = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?",
                         (body.question.strip(), now, who, issue_id))
            db.log_event(conn, issue_id, now, "info_request", f"More information requested from citizen: {body.question.strip()}", who)
        rescore_issue(conn, issue_id)
    from .main import get_issue_detail
    return get_issue_detail(issue_id)


# ----------------------------------------------------------------------------- work notes

class NoteIn(BaseModel):
    text: str = Field(min_length=2, max_length=1000)
    public: bool = False


@router.post("/issues/{issue_id}/notes")
def add_note(issue_id: int, body: NoteIn, user: dict = Official):
    """Internal work notes stay with officers; public updates also appear on the citizen's tracking page."""
    with db.session() as conn:
        check_access(conn, user, issue_id)
        db.log_event(conn, issue_id, iso(utcnow()), "update" if body.public else "note", body.text.strip(), actor(user))
    from .main import get_issue_detail
    return get_issue_detail(issue_id)


@router.post("/issues/{issue_id}/remind")
def remind(issue_id: int, user: dict = Official):
    with db.session() as conn:
        row = check_access(conn, user, issue_id)
        target = row["assigned_officer"] or row["department"]
        db.log_event(conn, issue_id, iso(utcnow()), "reminder", f"Deadline reminder sent to {target}", actor(user))
    return {"ok": True, "to": target}


# ----------------------------------------------------------------------------- duplicate review

@router.get("/issues/{issue_id}/duplicates")
def duplicates(issue_id: int, user: dict = Official):
    """Every report merged into this incident, compared with the first one."""
    with db.session() as conn:
        issue = check_access(conn, user, issue_id)
        rows = conn.execute("SELECT * FROM complaints WHERE issue_id = ? ORDER BY created_at", (issue_id,)).fetchall()
    if not rows:
        return []
    first = rows[0]
    out = []
    for r in rows:
        dist = (round(haversine_m(r["lat"], r["lng"], issue["lat"], issue["lng"]))
                if r["lat"] is not None and issue["lat"] is not None and r["geo_precision"] in ("gps", "landmark") else None)
        ex = json.loads(r["extracted"])
        out.append({
            "complaint_id": r["id"], "tracking_code": r["tracking_code"], "raw_text": r["raw_text"],
            "summary": ex.get("summary_en"), "created_at": r["created_at"], "channel": r["channel"],
            "match_score": r["dedup_score"], "needs_review": bool(r["needs_review"]),
            "distance_m": dist, "geo_precision": r["geo_precision"],
            "hours_after_first": round((parse(r["created_at"]) - parse(first["created_at"])).total_seconds() / 3600, 1),
            "same_category": ex.get("category") == issue["category"], "is_first": r["id"] == first["id"],
        })
    return out


@router.post("/complaints/{complaint_id}/confirm-duplicate")
def confirm_duplicate(complaint_id: int, user: dict = Official):
    with db.session() as conn:
        c = conn.execute("SELECT issue_id FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
        if not c:
            raise HTTPException(404, "complaint not found")
        check_access(conn, user, c["issue_id"])
        conn.execute("UPDATE complaints SET needs_review = 0 WHERE id = ?", (complaint_id,))
        db.log_event(conn, c["issue_id"], iso(utcnow()), "duplicate", f"Report #{complaint_id} confirmed as a duplicate", actor(user))
    return {"ok": True}


@router.post("/complaints/{complaint_id}/split")
def split_out(complaint_id: int, user: dict = Official):
    """Not the same problem after all: give this report its own incident (it keeps its tracking code)."""
    now, who = iso(utcnow()), actor(user)
    with db.session() as conn:
        c = conn.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
        if not c:
            raise HTTPException(404, "complaint not found")
        old = check_access(conn, user, c["issue_id"])
        if old["report_count"] <= 1:
            raise HTTPException(409, "This is the only report in the incident")
        ex = json.loads(c["extracted"])
        cur = conn.execute(
            """INSERT INTO issues (category, sub_type, summary, lat, lng, locality_id, geo_precision, location_detail, spot_keys,
                   severity, safety_risk, reported_duration_days, department, first_reported, last_reported, embedding)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?)""",
            (ex["category"], ex["sub_type"], ex["summary_en"], c["lat"], c["lng"], c["locality_id"], c["geo_precision"],
             ex.get("location_detail"), ex["severity"], int(ex["safety_risk"]), ex.get("duration_days"),
             department_for(ex["category"]), c["created_at"], c["created_at"], c["embedding"]))
        new_id = cur.lastrowid
        conn.execute("INSERT INTO issue_tasks (issue_id, department, role, created_at) VALUES (?, ?, 'primary', ?)",
                     (new_id, department_for(ex["category"]), now))
        conn.execute("UPDATE complaints SET issue_id = ?, needs_review = 0, dedup_score = NULL WHERE id = ?", (new_id, complaint_id))
        conn.execute("UPDATE issues SET report_count = report_count - 1 WHERE id = ?", (old["id"],))
        db.log_event(conn, old["id"], now, "duplicate", f"Report #{complaint_id} split out into a separate incident #{new_id}", who)
        db.log_event(conn, new_id, now, "created", f"Incident created by splitting report #{complaint_id} out of #{old['id']}", who)
        rescore_issue(conn, old["id"])
        rescore_issue(conn, new_id)
    return {"new_issue_id": new_id}


# ----------------------------------------------------------------------------- activity & notifications

NOTIFY_KINDS = ("sms", "created", "report", "assignment", "escalation", "verification", "dispute", "override", "info_reply",
                "citizen_feedback", "status", "reminder")


@router.get("/activity")
def activity(limit: int = 40, user: dict = Official):
    dept = scope(user)
    sql = ("SELECT e.issue_id, e.at, e.kind, e.message, e.actor, i.summary, i.category, i.priority_score, i.department "
           "FROM issue_events e JOIN issues i ON i.id = e.issue_id WHERE e.kind IN (%s) AND e.at <= ?"
           % ",".join("?" * len(NOTIFY_KINDS)))
    args: list = [*NOTIFY_KINDS, iso(utcnow())]
    if dept:
        sql += " AND i.department = ?"
        args.append(dept)
    sql += " ORDER BY e.at DESC, e.id DESC LIMIT ?"
    args.append(min(limit, 200))
    with db.session() as conn:
        return [dict(r) for r in conn.execute(sql, args)]


# ----------------------------------------------------------------------------- SLA centre

@router.get("/sla/overview")
def sla_overview(user: dict = Official):
    now = utcnow()
    dept = scope(user)
    dept_sql, dept_args = (" AND department = ?", [dept]) if dept else ("", [])
    with db.session() as conn:
        sla.check(conn)
        cols = "id, summary, category, department, assigned_officer, status, priority_score, sla_tier, sla_due_at, escalation_level, locality_id, first_reported"
        upcoming = conn.execute(
            f"SELECT {cols} FROM issues WHERE status NOT IN ('resolved', 'rejected') AND sla_due_at >= ? AND sla_due_at < ?{dept_sql} "
            "ORDER BY sla_due_at LIMIT 50", (iso(now), iso(now + timedelta(hours=48)), *dept_args)).fetchall()
        overdue = conn.execute(
            f"SELECT {cols} FROM issues WHERE status NOT IN ('resolved', 'rejected') AND sla_due_at < ?{dept_sql} "
            "ORDER BY priority_score DESC LIMIT 100", (iso(now), *dept_args)).fetchall()
        history = conn.execute(
            "SELECT e.issue_id, e.at, e.message, e.actor, i.summary FROM issue_events e JOIN issues i ON i.id = e.issue_id "
            f"WHERE e.kind IN ('escalation', 'reminder') AND e.at <= ?{dept_sql.replace('department', 'i.department')} "
            "ORDER BY e.at DESC LIMIT 40", (iso(now), *dept_args)).fetchall()

    def view(r):
        d = dict(r)
        d["locality"] = locality_by_id().get(d.pop("locality_id") or "", {}).get("name")
        d["hours_left"] = round((parse(d["sla_due_at"]) - now).total_seconds() / 3600, 1)
        return d
    return {"policy_hours": sla.policy(), "upcoming": [view(r) for r in upcoming], "overdue": [view(r) for r in overdue],
            "history": [dict(r) for r in history]}


# ----------------------------------------------------------------------------- supervisors: staff & settings

class NewUser(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str = Field(min_length=2, max_length=80)
    role: Literal["official", "supervisor"] = "official"
    department: str | None = Field(default=None, max_length=100)
    password: str = Field(min_length=8, max_length=200)


class PasswordIn(BaseModel):
    password: str = Field(min_length=8, max_length=200)


@router.get("/admin/users")
def list_users(_user: dict = Supervisor):
    with db.session() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT id, username, display_name, role, department, created_at, last_login_at FROM users ORDER BY role DESC, username")]


@router.post("/admin/users", status_code=201)
def create_user(body: NewUser, user: dict = Supervisor):
    with db.session() as conn:
        try:
            auth.create_user(conn, body.username, body.password, body.role, body.display_name,
                             body.department if body.role == "official" else None)
        except sqlite3.IntegrityError as exc:
            raise HTTPException(409, "That username is already taken") from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    return {"ok": True}


@router.post("/admin/users/{username}/password")
def reset_password(username: str, body: PasswordIn, _user: dict = Supervisor):
    with db.session() as conn:
        n = conn.execute("UPDATE users SET password_hash = ? WHERE username = ?",
                         (auth.hash_password(body.password), username.lower())).rowcount
    if not n:
        raise HTTPException(404, "user not found")
    return {"ok": True}


@router.delete("/admin/users/{username}")
def delete_user(username: str, user: dict = Supervisor):
    if username.lower() == user["username"]:
        raise HTTPException(409, "You cannot remove your own account")
    with db.session() as conn:
        if not conn.execute("DELETE FROM users WHERE username = ?", (username.lower(),)).rowcount:
            raise HTTPException(404, "user not found")
    return {"ok": True}


class PolicyIn(BaseModel):
    hours: dict[str, float]


@router.get("/admin/settings")
def get_settings(_user: dict = Supervisor):
    return {"sla_hours": sla.policy(), "defaults": sla.DEFAULT_HOURS}


@router.put("/admin/settings")
def put_settings(body: PolicyIn, user: dict = Supervisor):
    with db.session() as conn:
        hours = sla.save_policy(conn, body.hours)
        ids = [r["id"] for r in conn.execute("SELECT id FROM issues WHERE status NOT IN ('resolved', 'rejected')")]
        for i in ids:
            sla.apply(conn, i)
    return {"sla_hours": hours, "reapplied_to": len(ids)}
