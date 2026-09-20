"""SmartSense backend — FastAPI + finalized XGBoost models.

Run from this folder:
    python -m uvicorn main:app --reload

Loads D:\\SIH-26\\models\\smartsense_models.pkl once at startup (see
model_registry.py). Two request styles are served:

- Manual/demo prediction: POST /api/predict/rest and /api/predict/drive take
  an already-extracted feature vector (used by the frontend's Simulation-mode
  "Analyze" buttons, which send a bundled real dataset row on demand).
- Live streaming: POST /api/live/ingest receives raw ESP32/BioAmp samples
  (see esp32_bridge.py), buffers/windows/features/predicts them via
  live_hub.py, and pushes results to whichever frontend clients are
  subscribed over WS /api/live/stream/{rest,drive}.
"""

import asyncio
import logging
import math
import re
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend import live_hub
from backend import model_registry as mr
from backend import trend
from backend.schemas import (
    DriveFeatures,
    DrivePredictionResponse,
    HealthResponse,
    LiveSample,
    RestFeatures,
    RestPredictionResponse,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
logger = logging.getLogger("smartsense.api")

app = FastAPI(title="SmartSense ML Backend", version="1.0.0")

# Same allow-list the WS handshake origin check below reuses, so a browser
# tab that drifted to a different Vite dev port (see the CORS fix history)
# is accepted consistently on both the REST endpoints and the live WebSocket.
_ALLOWED_ORIGIN_RE = re.compile(r"^http://(localhost|127\.0\.0\.1):\d+$")


def _json_safe(value: Any) -> Any:
    """Recursively replaces non-JSON-compliant floats (NaN/Infinity) with their
    string form. Needed because a rejected NaN/Infinity feature value is echoed
    back inside pydantic's validation error detail, and Starlette's JSONResponse
    renders with allow_nan=False — without this, the *rejection itself* would
    crash with an unhandled 500 instead of returning a clean 422."""
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return str(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": _json_safe(exc.errors())})

# The React dev server defaults to 5173, but Vite silently increments to the
# next free port (5174, 5175, ...) whenever 5173 is already taken by another
# running instance — this happened during Stage 1 testing and caused a real
# "OPTIONS -> 400 Disallowed CORS origin" failure because only :5173 was
# allow-listed while the browser was actually on :5174. allow_origin_regex
# covers any localhost/127.0.0.1 dev port so this class of bug can't recur,
# while still refusing every non-local origin (no allow_origins=["*"]).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        bundle_version=mr.BUNDLE_VERSION,
        rest_model_loaded=mr.REST_MODEL is not None,
        rest_feature_count=len(mr.REST_FEATURE_NAMES),
        rest_scaler="none" if mr.REST_SCALER is None else type(mr.REST_SCALER).__name__,
        drive_model_loaded=mr.DRIVE_MODEL is not None,
        drive_feature_count=len(mr.DRIVE_FEATURE_NAMES),
        drive_scaler="none" if mr.DRIVE_SCALER is None else type(mr.DRIVE_SCALER).__name__,
    )


@app.post("/api/predict/rest", response_model=RestPredictionResponse)
def predict_rest(features: RestFeatures) -> RestPredictionResponse:
    try:
        prediction, n2_probability = mr.predict_rest(features.model_dump())
    except Exception as exc:  # pragma: no cover - defensive, model call should not raise on valid input
        raise HTTPException(status_code=500, detail=f"Rest Mode inference failed: {exc}") from exc
    trend.record_rest_prediction(n2_probability)
    return RestPredictionResponse(prediction=prediction, n2_probability=round(n2_probability, 4))


@app.post("/api/predict/drive", response_model=DrivePredictionResponse)
def predict_drive(features: DriveFeatures) -> DrivePredictionResponse:
    try:
        vigilance = mr.predict_drive(features.model_dump())
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Drive Mode inference failed: {exc}") from exc
    trend.record_drive_prediction(vigilance)
    return DrivePredictionResponse(vigilance=round(vigilance, 2))


# ---------------------------------------------------------------------------
# Live ingestion (ESP32/BioAmp -> esp32_bridge.py -> here)
# ---------------------------------------------------------------------------


@app.post("/api/live/ingest")
async def live_ingest(sample: LiveSample) -> dict:
    await live_hub.hub.ingest(sample.eeg, sample.eog, sample.timestamp, sample.sequence)
    return {"ok": True}


@app.get("/api/live/status")
def live_status() -> dict:
    return live_hub.hub.status()


@app.websocket("/api/live/stream/{mode}")
async def live_stream(websocket: WebSocket, mode: str) -> None:
    if mode not in ("rest", "drive"):
        await websocket.close(code=4404)
        return

    origin = websocket.headers.get("origin", "")
    if origin and not _ALLOWED_ORIGIN_RE.match(origin):
        logger.warning("[LIVE] Rejected WebSocket handshake from disallowed origin: %s", origin)
        await websocket.close(code=4403)
        return

    await websocket.accept()
    live_hub.hub.subscribers[mode].add(websocket)
    logger.info("[LIVE] Client connected: mode=%s", mode)
    try:
        await websocket.send_json(live_hub.hub.status())
        while True:
            # Frontend doesn't need to send anything; this just detects disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        live_hub.hub.subscribers[mode].discard(websocket)
        logger.info("[LIVE] Client disconnected: mode=%s", mode)


@app.on_event("startup")
async def _start_status_broadcaster() -> None:
    async def loop():
        while True:
            await asyncio.sleep(2.0)
            try:
                await live_hub.hub.broadcast_status()
            except Exception:  # pragma: no cover - defensive, must never kill the loop
                logger.exception("[LIVE] status broadcast loop error")

    asyncio.create_task(loop())
