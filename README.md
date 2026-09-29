# SmartSense — Predictive Driver Drowsiness Detection

**SIH 2026 · Problem Statement 26203  Student Innovation** — *AI-based Multimodal Wearable for
Predictive Driver Drowsiness Detection and Intelligent Alert and Rest
Management.*

SmartSense is a full-stack driver-safety prototype: a wearable (ESP32 +
BioAmp EEG/EOG electrodes) feeds raw brain/eye signal samples to a Python
backend, which runs them through trained XGBoost models to predict driving
vigilance and sleep state, and a React dashboard shows the driver (and, in
Rest Mode, monitors their recovery) in real time. Everything also runs
standalone with realistic simulated data — no hardware required to demo the
full product experience.

This file is a map of the whole repository. For deep detail on any one
part, see the README/docstrings inside that folder — this is the overview,
not a replacement for those.

## Architecture at a glance

```
┌─────────────┐   USB Serial or WiFi    ┌──────────────────────┐
│   ESP32 +   │ ──────────────────────▶ │  Python bridge script │
│  BioAmp     │   {"eeg","eog","seq"}   │  (usb_serial_bridge.py │
│  (EEG/EOG)  │                         │   or esp32_bridge.py)  │
└─────────────┘                         └──────────┬───────────┘
                                                     │ POST /api/live/ingest
                                                     ▼
                                         ┌──────────────────────┐
                                         │   FastAPI backend     │
                                         │   (backend/main.py)   │
                                         │  buffer → features →  │
                                         │  trained XGBoost      │
                                         │  models (Drive/Rest)  │
                                         └──────────┬───────────┘
                                                     │ WebSocket
                                                     │ ws://.../api/live/stream/{mode}
                                                     ▼
                                         ┌──────────────────────┐
                                         │  React dashboard       │
                                         │  (SmartSense-main/)    │
                                         │  Overview, Live         │
                                         │  Monitor, Drowsiness,   │
                                         │  Sleep/Recovery, ...    │
                                         └──────────────────────┘
                                                     │ optional
                                                     ▼
                                         ┌──────────────────────┐
                                         │  Supabase (Postgres)   │
                                         │  account + session      │
                                         │  history persistence     │
                                         └──────────────────────┘
```

The frontend never *requires* the hardware/backend/database layers to be
running — it defaults to **Simulation mode**, generating realistic
random-walk vigilance/sleep data client-side, and only switches to **Live
mode** (Settings → Live hardware) once the backend is reachable.

## Repository layout

| Path | What it is |
| --- | --- |
| `SmartSense-main/` | The React 18 + TypeScript + Vite + Tailwind dashboard — the actual product UI. See `SmartSense-main/README.md` for full feature documentation (Rest Management, Trip Planner, Smart Alarm, themes/languages, etc.). |
| `backend/` | FastAPI ML backend — loads the trained model bundle, serves on-demand predictions (`/api/predict/drive`, `/api/predict/rest`) and the real-time live pipeline (`/api/live/ingest` → buffering/feature-extraction → model → `/api/live/stream/{mode}` WebSocket). Also deployed standalone on Render for the frontend's Simulation-mode "Analyze" demo buttons. |
| `SmartSense-main/esp32.py` / `smartsense_128hz.ino` | The WiFi-based ESP32 firmware + its matching Python poller (`GET /data` over WiFi). |
| `SmartSense-main/usb_receiver.py` / `backend/usb_serial_bridge.py` | For ESP32 firmware that streams over **USB Serial** instead of WiFi (one JSON line per sample). `usb_serial_bridge.py` is the one that feeds the real backend pipeline; `usb_receiver.py` is a simpler standalone WebSocket relay (doesn't run the trained models — see its own docstring). |
| `Drive Mode/` | Driving-vigilance model: dataset, feature-extraction scripts, training script (`train_deployment_model.py`), and the deployment feature/target builders reused live by `backend/`. |
| `Rest Mode/` | Sleep-state (N2 classifier) model: feature extraction, the sleep-state engine, Smart Alarm logic, and replay/test scripts for validating against recorded sessions. |
| `models/` | `smartsense_models.pkl` — the finalized, trained model bundle (both Drive and Rest models + their scalers) that `backend/model_registry.py` loads at startup. |
| `processed/`, `archive/` | Intermediate/processed datasets and archived experiment runs from model development — not needed to run the app, kept for provenance. |
| `CLAUDE_HANDOFF.md`, `FINAL_MODEL_PACKAGING_REPORT.md`, `PROJECT_CLEANUP_AUDIT.md*` | Development-history documents from the model-training phase of this project (dataset choices, cleanup decisions, packaging report). Historical record, not living docs. |

## Getting started

### 1. Frontend only (fastest — full demo experience, no backend needed)

```bash
cd SmartSense-main
npm install
npm run dev       # http://localhost:5173
```

Everything works immediately in **Simulation mode**: realistic random-walk
vigilance/sleep data, the full Rest Decision Engine, real GPS + real nearby
rest-stop lookup (free OpenStreetMap APIs), Smart Alarm, reports, etc. See
`SmartSense-main/README.md` for the full feature list.

> **Note on login:** for the current evaluation deployment, the app's
> Supabase auth gate has been removed from routing — `/login`, `/register`
> and every dashboard route go straight to the dashboard with no sign-in
> step, so evaluators never need credentials or database access. See
> `SmartSense-main/src/App.tsx`. `SmartSense-main/README.md`'s "Required:
> connecting a database" section describes the original real-auth setup,
> which is still there in `lib/auth.ts`/`pages/Login.tsx` if you want to
> reinstate it later.

### 2. Full stack with the real ML backend

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate     # Windows
pip install -r requirements.txt

# Run from the REPO ROOT (not from inside backend/), since main.py
# uses `from backend import ...` absolute imports:
cd ..
python -m uvicorn backend.main:app --reload
```

Then in the frontend, Settings → **Live hardware**. The Drowsiness and
Sleep/Recovery pages' "Analyze (sample data)" buttons will now hit this
local backend instead of the publicly-deployed Render instance.

### 3. Real hardware (ESP32 + BioAmp)

Depends on which firmware is flashed:

- **WiFi firmware** (`smartsense_128hz.ino`): run
  `python SmartSense-main/esp32.py --esp32-url http://<esp32-ip>` to poll
  it, or `python backend/esp32_bridge.py --esp32-url http://<esp32-ip>/data`
  to feed it straight into the real backend pipeline.
- **USB Serial firmware** (one JSON line per sample over `Serial.begin(115200)`):
  run `python backend/usb_serial_bridge.py --port COM<N>` (with the real
  backend from step 2 already running) to feed the real pipeline.

  Common gotcha on Windows: `PermissionError: could not open port` almost
  always means something else already has the port open — most often the
  Arduino IDE, whose background board-detection service holds serial ports
  even with no Serial Monitor tab open. Close it fully and retry.

## Model training pipeline

- **Drive Mode** (`Drive Mode/scripts/`): 28-feature vigilance regressor
  (XGBoost), trained on a real driving-dataset (DROZY-derived), sampled at
  128 Hz, 8-second windows. `dd_vigilance_features.py` / `dd_vigilance_targets.py`
  build the feature/target sets; `train_deployment_model.py` produces the
  finalized model; `predict_vigilance.py` / `realtime_simulator.py` are
  standalone dataset-replay tools for offline validation.
- **Rest Mode** (`Rest Mode/scripts/`): 32-feature N2/non-N2 sleep-stage
  classifier (XGBoost), trained on real sleep-EEG data (DREAMT-derived), 30
  second windows at 100 Hz. `feature_extractor.py` builds features;
  `sleep_state_engine.py` / `smart_alarm.py` are the stability-check and
  wake-decision logic reused live by `backend/live_hub.py`.
- Both finalized models + their fitted scalers are bundled together in
  `models/smartsense_models.pkl`, loaded once at backend startup by
  `backend/model_registry.py`.

## Current status / known limitations

- No real hardware wearable is required to demo the product — Simulation
  mode is the default and is fully featured (see `SmartSense-main/README.md`
  → "Demo / simulation mode").
- The ML backend deployed on Render (`https://sih-2026-backend-bq02.onrender.com`,
  used by the frontend's Simulation-mode "Analyze" demo buttons) is on
  Render's free tier, which sleeps after ~15 minutes idle — the frontend
  retries through that cold-start automatically (`SmartSense-main/src/lib/mlBackend.ts`)
  rather than failing outright.
- Login/auth is currently bypassed at the routing level for evaluation
  purposes (see above) — this is a deliberate, reversible change for the
  current deployment, not a security fix.
- IMU/accelerometer/gyroscope data is intentionally not used anywhere in
  this version, per the problem statement's instruction to use EEG/EOG
  only — verified by a full-repo search (see `SmartSense-main/README.md`
  → "IMU removal — verified").
- GPS-based rest-stop lookup, routing, and geocoding are real (free
  OpenStreetMap/OSRM public APIs), with a clearly-labeled demo fallback
  when offline or out of coverage.

## Where to look next

- **Frontend features in depth** (Rest Decision Engine, Trip Planner,
  Smart Alarm, themes/languages, safe-zone ranking formula, etc.):
  `SmartSense-main/README.md`.
- **Live pipeline internals** (buffering, feature extraction, windowing):
  docstrings in `backend/live_hub.py`, `backend/live_features.py`,
  `backend/live_buffer.py`.
- **Database schema**: `SmartSense-main/supabase/migrations/`.
