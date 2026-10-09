# CivicPulse: AI triage for civic complaints

> Thousands of messy citizen complaints in, one ranked, deduplicated, department-routed action list out.

Built for **OFFGRID** (Problem Statement #10, *AI Civic Complaint Triage*). It also covers **#11** (duplicate detection), **#2** (priority engine), **#9** (trend detection) and **#4** (waste complaint intelligence).

## What it does

A complaint like *"bhai raja park gali no 5 me 2 hafte se bada gaddha hai, kal scooty gir gayi"* goes through these stages in milliseconds:

| Stage | What happens |
|---|---|
| **Extract** | Claude (or an offline typo-tolerant fallback) pulls out category, sub-type, location, lane/landmark, duration, severity, safety risk, language and an English summary. It works for English, Hindi and Hinglish, and can read photos |
| **Geocode** | Device GPS, then OpenStreetMap landmark lookup, then an offline Jaipur gazetteer |
| **Deduplicate** | Combines text similarity, distance and time, plus a *spot fingerprint* (lane number or landmark), so "gali 5" and "gali 12" in the same area never merge |
| **Prioritise** | Explainable 0–100 score: severity, population impact (including **real schools and hospitals from OpenStreetMap**), report count, how long it has been open, recurrence and safety |
| **Route** | Sends each category to the responsible department (PWD, PHED, Sewerage, Sanitation, Electrical) |
| **Detect spikes** | Poisson z-score per locality × category flags emerging problems ("drainage complaints in Malviya Nagar at 19.8× normal") |
| **Deadlines & escalation** | Each issue gets a deadline from its priority tier (critical 24 h, high 72 h, medium 7 d, low 14 d). It tightens if the priority rises. Missed deadlines escalate to the Ward Supervisor, then the Commissioner, and every step is logged on a timeline |
| **Work orders** | Printable work order per issue with deadline, priority reasons, citizen evidence and a sign-off table. When one complaint involves two departments (e.g. a pipe burst that collapsed a road), a linked task is created for the second department |
| **Verified closure** | Officers close an issue by uploading an after-repair photo. Claude compares it with the citizens' photos. Missing, unclear or mismatched photos are sent to a supervisor instead of closing the issue |
| **Accountability** | Department scorecard (on-time %, median fix time, overdue, escalated), weekly opened vs resolved, and the areas with the worst backlog |

## Measured results

Ground-truth evaluation (`scripts/evaluate.py`) on synthetic Jaipur complaint streams. These include typos, three languages, vague landmarks, partial GPS, and hard negatives (different issues of the same type in the same locality). The numbers below are for **offline mode, with no API key**:

| Metric | Dataset A (661 complaints) | Held-out dataset B (788 complaints) |
|---|---|---|
| Category accuracy | **97.9%** | **97.7%** |
| Duplicate-detection precision | **95.4%** | **96.6%** |
| Duplicate-detection recall | 86.3% | 79.8% |
| Duplicate-detection F1 | **0.906** | **0.874** |
| Planted spike detected | ✅ | ✅ |
| Avg processing time | ~12 ms / complaint | |

High precision is deliberate. Wrongly merging two different problems hides one of them, which is worse than leaving a duplicate unmerged. Borderline matches are merged but flagged for human review.

> These numbers come from synthetic data. Before the final pitch, re-run `evaluate.py` on real complaints (Google Form, campus pilot, public posts) labelled by hand.

## Quick start

```bash
./run.sh
```

Open **http://localhost:5173**. API docs are at **http://localhost:8000/docs**.

On the first run, `run.sh` creates the Python virtualenv, installs npm packages, generates the synthetic dataset and seeds the database.

### Choose the AI mode

Set `CIVICPULSE_EXTRACTOR` in `backend/.env` (copy it from `backend/.env.example`):

| Mode | Cost | Speed | What you need |
|---|---|---|---|
| `rules` | Free | ~12 ms | Nothing. Offline keyword and fuzzy rules. No photo checks |
| `ollama` | **Free** | ~7 s | [Ollama](https://ollama.com) with `ollama pull qwen2.5:7b` and `ollama pull gemma3:4b`. Runs on your machine, so **complaints never leave the server** |
| `claude` / `auto` | ~$0.002 per complaint | ~1 s | `ANTHROPIC_API_KEY` from console.anthropic.com |

```bash
# free local AI
ollama pull qwen2.5:7b && ollama pull gemma3:4b
echo "CIVICPULSE_EXTRACTOR=ollama" >> backend/.env
```

Every AI mode falls back to offline rules if the model is unreachable, so the demo never breaks. With a local model, the extraction is cross-checked against rule-based safety keywords: small models tend to under-rate danger, so severity is never lowered below what the rules detect. A local model only auto-accepts a repair photo at *high* confidence; anything else goes to a supervisor.

`scripts/seed.py` always loads the synthetic history with fast offline rules. Pass `--use-configured-ai` to use the configured AI instead.

### Manual commands

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python ../scripts/generate_synthetic.py      # data/synthetic_complaints.csv
.venv/bin/python ../scripts/seed.py                    # load into civicpulse.db
.venv/bin/python ../scripts/evaluate.py                # accuracy / dedup metrics
.venv/bin/python ../scripts/fetch_pois.py              # refresh schools & hospitals from OSM
.venv/bin/uvicorn app.main:app --reload --port 8000

cd ../frontend && npm install && npm run dev
```

Optional: `pip install sentence-transformers` gives neural multilingual embeddings for deduplication. They're picked up automatically.

## Project layout

```
backend/app/
  extract.py    Claude / local Ollama structured extraction + offline fallback
  ollama.py     client for free local models
  fuzzy.py      typo-tolerant phrase matching
  geo.py        geocoding, localities, OSM POIs, spot fingerprints
  embed.py      text embeddings (hashed n-grams or sentence-transformers)
  dedup.py      duplicate matching
  priority.py   explainable priority score
  trends.py     spike alerts, hotspots
  sla.py        deadlines and escalation
  verify.py     AI before/after photo verification of closures
  analytics.py  department and area accountability metrics
  media.py      evidence photo storage
  pipeline.py   end-to-end ingest
  main.py       FastAPI routes
frontend/src/   React + Tailwind + Leaflet + Recharts dashboard
scripts/        generate_synthetic, seed, evaluate, fetch_pois
data/           Jaipur gazetteer, OSM POIs, synthetic dataset
docs/api.md     API contract
```

## Roadmap
- WhatsApp bot intake (Twilio) and voice notes (Whisper)
- Real ward polygons and Census ward population
- Official feedback loop: corrections to merges and categories become new evaluation data
- Citizen confirmation of fixes (SMS/WhatsApp "is it fixed?") alongside photo verification
- Configurable deadlines per department and category
- Campus pilot on MUJ hostel and maintenance complaints
