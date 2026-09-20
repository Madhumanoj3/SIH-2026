"""Central live-data orchestrator.

Owns the single logical live session (one ESP32/BioAmp source): receives raw
samples from /api/live/ingest, feeds them into a Rest window buffer and a
Drive window buffer in parallel (same hardware feeds both — the frontend
picks which prediction stream to look at), runs the existing feature
extraction + existing trained models on each completed window, updates the
existing-logic trend/alarm engines, and broadcasts JSON messages to whatever
frontend WebSocket clients are subscribed to each mode.

This module intentionally owns: ingestion, buffering, preprocessing (via
live_features), feature extraction (via live_features), inference (via
model_registry), and streaming (broadcast to subscribers). It does not know
about HTTP/WebSocket wire details beyond `subscribers` being objects with an
async `send_json`.
"""

import logging
import math
import sys
import time
from pathlib import Path

from starlette.concurrency import run_in_threadpool

from backend import model_registry as mr
from backend import live_features as lf
from backend.live_buffer import ModeWindowBuffer
from backend.rest_state import RestStateEngine


DRIVE_SCRIPTS_DIR = Path(r"D:\SIH-26\Drive Mode\scripts")
if str(DRIVE_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(DRIVE_SCRIPTS_DIR))
from backend.vigilance_trend import VigilanceTrendEngine  # noqa: E402 — existing Drive trend/alarm engine, reused as-is

logger = logging.getLogger("smartsense.live")

REST_FS = 100
REST_WINDOW_SECONDS = 30

DRIVE_FS = 128
DRIVE_WINDOW_SECONDS = 8
# Extra trailing context so the MNE band-pass filter (0.1 Hz EOG high-pass)
# has enough samples to be numerically well-defined — see live_features.py.
DRIVE_CONTEXT_SECONDS = 72

STALE_AFTER_SECONDS = 5.0
STATUS_LOG_THROTTLE_SECONDS = 2.0


class LiveHub:
    def __init__(self):
        self.rest_buffer = ModeWindowBuffer(REST_FS, REST_WINDOW_SECONDS, context_seconds=0.0)
        self.drive_buffer = ModeWindowBuffer(DRIVE_FS, DRIVE_WINDOW_SECONDS, context_seconds=DRIVE_CONTEXT_SECONDS)
        self.rest_state = RestStateEngine()
        self.drive_trend = VigilanceTrendEngine()

        self.subscribers: dict[str, set] = {"rest": set(), "drive": set()}
        self.last_sample_at: float | None = None
        self.total_samples = 0
        self._last_log_t = 0.0

        # Recovery state: set True the moment a sequence gap invalidates a
        # window, cleared the moment the NEXT valid prediction succeeds.
        # Surfaced in status() so the frontend can show "recovering" instead
        # of a stale, indistinguishable-from-broken POOR state - see
        # requirement L. Purely observational; never affects the gate logic.
        self.rest_recovering = False
        self.drive_recovering = False

    async def ingest(self, eeg: float, eog: float, t: float | None = None, sequence: int | None = None) -> None:
        t = t if t is not None else time.time()
        first_sample = self.last_sample_at is None
        self.last_sample_at = t
        self.total_samples += 1

        self.rest_buffer.add_sample(eeg, eog, t, sequence)
        self.drive_buffer.add_sample(eeg, eog, t, sequence)

        if first_sample:
            logger.info("[LIVE] Client connected (first sample received)")

        await self._broadcast("rest", {"type": "sample", "eeg": eeg, "eog": eog, "t": t})
        await self._broadcast("drive", {"type": "sample", "eeg": eeg, "eog": eog, "t": t})

        now = time.time()
        if now - self._last_log_t > STATUS_LOG_THROTTLE_SECONDS:
            self._last_log_t = now
            logger.info(
                "[LIVE] EEG/EOG samples received: total=%d  Sampling rate: ~%.1f Hz (drive-window estimate)",
                self.total_samples,
                self.drive_buffer.rate.hz or 0.0,
            )

        rest_window = self.rest_buffer.try_pop_window()
        if rest_window is not None:
            await self._handle_rest_window(rest_window)

        drive_window = self.drive_buffer.try_pop_window()
        if drive_window is not None:
            await self._handle_drive_window(drive_window)

    async def _handle_rest_window(self, w) -> None:
        if not w.sequence_valid:
            expected = w.missing_sequences[0] if w.missing_sequences else None
            logger.warning("NETWORK GAP DETECTED (Rest) - last good seq=%s expected=%s missing=%d", w.sequence_start, expected, len(w.missing_sequences or []))
            logger.warning("RESETTING REST WINDOW")
            self.rest_buffer.reset()
            self.rest_recovering = True
            logger.info("COLLECTING FRESH CONTIGUOUS WINDOW (rest)")
            await self._broadcast("rest", {
                "type": "quality_reject", "mode": "rest", "reason": "sequence_gap",
                "missing_sequences": w.missing_sequences, "sequence_start": w.sequence_start, "sequence_end": w.sequence_end,
                "recovering": True, "contiguous_samples": 0, "target_samples": self.rest_buffer.window_samples,
            })
            return

        if w.quality == "POOR" or not w.rate_ok:
            reason = w.reason if w.quality == "POOR" else "insufficient_sample_rate"
            logger.info("[LIVE] Rest epoch rejected: quality=%s rate_ok=%s detected_fs=%s reason=%s", w.quality, w.rate_ok, w.detected_fs, reason)
            await self._broadcast("rest", {"type": "quality_reject", "mode": "rest", "reason": reason, "quality": w.quality, "detected_fs": w.detected_fs})
            return

        # --- Timing instrumentation (Issue 2 diagnostics) --------------------
        # Real measured wall-clock timestamps at every stage, per instruction
        # "I want actual measured numbers, not estimates." epoch_complete_t is
        # when the window's LAST (3000th) sample was actually received, which
        # is what a correct latency figure must be measured from - NOT
        # time.time() at the top of this handler, which already lags behind
        # by however long the event loop took to get back to this coroutine.
        epoch_complete_t = w.window_last_t or time.time()
        epoch_first_t = w.window_first_t or epoch_complete_t

        # Runs in a worker thread - CPU-bound filtering/feature-extraction must
        # never block the asyncio event loop, or every OTHER concurrent
        # /api/live/ingest request (including the ESP32 receiver's own
        # forwarding calls) stalls for the duration, which can itself cause
        # HTTP timeouts upstream - a self-inflicted transport problem that
        # looks identical to a real network issue. Found empirically: a
        # plain loopback POST timed out at >1s during window processing
        # before this fix.
        t_feat_start = time.time()
        feats = await run_in_threadpool(lf.extract_rest_features, w.eeg, w.eog, REST_FS)
        t_feat_end = time.time()
        if feats is None:
            logger.info("[LIVE] Rest epoch: canonical feature extractor rejected the epoch")
            await self._broadcast("rest", {"type": "quality_reject", "mode": "rest", "reason": "feature_extraction_failed", "quality": w.quality, "detected_fs": w.detected_fs})
            return

        missing = [name for name in mr.REST_FEATURE_NAMES if name not in feats]
        if missing:
            logger.error("[LIVE] Rest feature contract mismatch, missing: %s", missing)
            return

        logger.info("[LIVE] Rest epoch complete: %d samples", len(w.eeg))
        logger.info("[LIVE] Rest features extracted: %d", len(mr.REST_FEATURE_NAMES))
        if self.rest_recovering:
            logger.info("WINDOW VALID (rest, post-recovery)")
        self.rest_recovering = False

        t_infer_start = time.time()
        prediction, n2_probability = await run_in_threadpool(mr.predict_rest, feats)
        t_infer_end = time.time()
        logger.info("[LIVE] Rest prediction: %s (n2_probability=%.3f)", prediction, n2_probability)
        logger.info("[LIVE] Signal quality: %s", w.quality)
        logger.info("PREDICTION READY (rest)")

        state = self.rest_state.update(n2_probability)

        t_broadcast = time.time()
        total_latency = t_broadcast - epoch_complete_t
        start_to_prediction = t_broadcast - epoch_first_t
        logger.info(
            "[LIVE][TIMING] rest epoch: first_sample=%.3f last_sample=%.3f feat_extract=%.1fms infer=%.1fms "
            "TOTAL_LATENCY(3000th_sample->broadcast)=%.1fms START_TO_PREDICTION(1st_sample->broadcast)=%.2fs",
            epoch_first_t, epoch_complete_t,
            (t_feat_end - t_feat_start) * 1000.0,
            (t_infer_end - t_infer_start) * 1000.0,
            total_latency * 1000.0,
            start_to_prediction,
        )

        await self._broadcast(
            "rest",
            {
                "type": "prediction",
                "mode": "rest",
                "prediction": prediction,
                "n2_probability": round(n2_probability, 4),
                "timestamp": time.time(),
                "quality": w.quality,
                "detected_fs": w.detected_fs,
                "uncalibrated": True,
                "epoch_total_latency_ms": round(total_latency * 1000.0, 1),
                "epoch_start_to_prediction_s": round(start_to_prediction, 2),
                **state,
            },
        )

    async def _handle_drive_window(self, w) -> None:
        window_samples = self.drive_buffer.window_samples
        duration_s = window_samples / DRIVE_FS
        gap_count = len(w.missing_sequences) if w.missing_sequences else 0

        logger.info("=" * 44)
        logger.info("LIVE DRIVE WINDOW")
        logger.info("-" * 44)
        logger.info("Samples: %d", window_samples)
        logger.info("Duration: %.2f s", duration_s)
        logger.info("Sequence start: %s", w.sequence_start)
        logger.info("Sequence end: %s", w.sequence_end)
        logger.info("Sequence gaps: %d", gap_count)

        # Sequence integrity is checked FIRST and unconditionally: a window
        # with any missing sequence number is not really "8 continuous
        # seconds" regardless of how good the present samples look. Per
        # instruction, it is never filled/interpolated - just reported and
        # discarded before feature extraction ever runs.
        if not w.sequence_valid:
            expected = w.missing_sequences[0] if w.missing_sequences else None
            logger.warning("NETWORK GAP DETECTED - last good seq=%s expected=%s missing=%d", w.sequence_start, expected, len(w.missing_sequences or []))
            logger.warning("RESETTING DRIVE WINDOW")
            # Discard the ENTIRE buffer (window + filter context), not just
            # this window - see ModeWindowBuffer.reset(): without this, the
            # next "sequence-valid" window would still hand the band-pass
            # filter a signal with this exact discontinuity buried in its
            # trailing context, contaminating a window that otherwise looks
            # perfectly fine.
            self.drive_buffer.reset()
            self.drive_recovering = True
            logger.info("COLLECTING FRESH CONTIGUOUS WINDOW")
            logger.info("=" * 44)
            await self._broadcast("drive", {
                "type": "quality_reject", "mode": "drive", "reason": "sequence_gap",
                "missing_sequences": w.missing_sequences,
                "sequence_start": w.sequence_start, "sequence_end": w.sequence_end,
                "quality": w.quality, "detected_fs": w.detected_fs,
                "recovering": True, "contiguous_samples": 0, "target_samples": window_samples,
            })
            return

        if w.quality == "POOR" or not w.rate_ok:
            reason = w.reason if w.quality == "POOR" else "insufficient_sample_rate"
            logger.info("[LIVE] Drive window rejected: quality=%s rate_ok=%s detected_fs=%s reason=%s", w.quality, w.rate_ok, w.detected_fs, reason)
            logger.info("=" * 44)
            await self._broadcast("drive", {"type": "quality_reject", "mode": "drive", "reason": reason, "quality": w.quality, "detected_fs": w.detected_fs})
            return

        if self.drive_recovering:
            logger.info("WINDOW VALID (post-recovery)")
        self.drive_recovering = False

        # Stats on the actual 8s window content (not the extra trailing
        # filter-context samples, which exist purely for the band-pass
        # filter's numerical stability - see live_features.py).
        eeg_win = w.eeg[-window_samples:]
        eog_win = w.eog[-window_samples:]
        logger.info("EEG: mean=%.2f std=%.2f min=%.2f max=%.2f", float(eeg_win.mean()), float(eeg_win.std()), float(eeg_win.min()), float(eeg_win.max()))
        logger.info("EOG: mean=%.2f std=%.2f min=%.2f max=%.2f", float(eog_win.mean()), float(eog_win.std()), float(eog_win.min()), float(eog_win.max()))

        try:
            # See the comment on the Rest-mode equivalent above - this is the
            # expensive one (MNE filtering over up to ~9216 context samples).
            feats = await run_in_threadpool(lf.extract_drive_features, w.eeg, w.eog, DRIVE_FS, window_samples, DRIVE_WINDOW_SECONDS)
        except Exception as exc:
            logger.error("[LIVE] Drive feature extraction failed: %s", exc)
            logger.info("=" * 44)
            await self._broadcast("drive", {"type": "quality_reject", "mode": "drive", "reason": "feature_extraction_failed", "quality": w.quality, "detected_fs": w.detected_fs})
            return

        missing_feats = [name for name in mr.DRIVE_FEATURE_NAMES if name not in feats]
        if missing_feats:
            logger.error("[LIVE] Drive feature contract mismatch, missing: %s", missing_feats)
            logger.info("=" * 44)
            return

        # Exact order verified against the model bundle's own feature list
        # (model_registry.DRIVE_FEATURE_NAMES, sourced from
        # smartsense_models.pkl's metadata) - never re-derived or guessed here.
        feature_values = [feats[name] for name in mr.DRIVE_FEATURE_NAMES]
        nan_count = sum(1 for v in feature_values if math.isnan(v))
        inf_count = sum(1 for v in feature_values if math.isinf(v))

        logger.info("Features: %d", len(feature_values))
        logger.info("NaN: %d", nan_count)
        logger.info("Inf: %d", inf_count)
        logger.info("Calibration: UNCALIBRATED")
        for name, val in zip(mr.DRIVE_FEATURE_NAMES, feature_values):
            logger.info("  %-24s = %.6g", name, val)

        if nan_count or inf_count:
            logger.error("[LIVE] Drive feature vector contains NaN/Inf - refusing to predict")
            logger.info("=" * 44)
            await self._broadcast("drive", {"type": "quality_reject", "mode": "drive", "reason": "nan_or_inf_features", "quality": w.quality, "detected_fs": w.detected_fs})
            return

        logger.info("Model input: %d features", len(feature_values))
        logger.info("Scaler: OK (drozy_scaler.joblib, n_features_in_=%d)", mr.DRIVE_SCALER.n_features_in_)
        logger.info("Model: OK (drozy_xgboost_vigilance.joblib, n_features_in_=%d)", mr.DRIVE_MODEL.n_features_in_)

        vigilance = await run_in_threadpool(mr.predict_drive, feats)
        logger.info("Prediction: %.2f", vigilance)
        logger.info("UNCALIBRATED - NOT PHYSIOLOGICALLY VALIDATED (no electrodes / uncalibrated ADC scale)")
        logger.info("PREDICTION READY")
        logger.info("=" * 44)

        trend = self.drive_trend.update(time.time(), vigilance)

        await self._broadcast(
            "drive",
            {
                "type": "prediction",
                "mode": "drive",
                "vigilance": round(vigilance, 2),
                "timestamp": time.time(),
                "quality": w.quality,
                "detected_fs": w.detected_fs,
                "uncalibrated": True,
                "sequence_start": w.sequence_start,
                "sequence_end": w.sequence_end,
                "trend_label": trend["trend_label"],
                "status": trend["status"],
                "sustained_decline": trend["sustained_decline"],
            },
        )

    async def _broadcast(self, mode: str, message: dict) -> None:
        dead = []
        for ws in self.subscribers[mode]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.subscribers[mode].discard(ws)

    def status(self) -> dict:
        now = time.time()
        stale = self.last_sample_at is None or (now - self.last_sample_at) > STALE_AFTER_SECONDS
        return {
            "type": "status",
            "connection": "DISCONNECTED" if stale else "CONNECTED",
            "total_samples": self.total_samples,
            "detected_fs_drive": self.drive_buffer.rate.hz,
            "detected_fs_rest": self.rest_buffer.rate.hz,
            "last_sample_age_s": (now - self.last_sample_at) if self.last_sample_at else None,
            # Recovery progress - lets the frontend show "collecting fresh
            # data (N/1024)" instead of a stale POOR state indistinguishable
            # from a broken system while a real, correct wait is in
            # progress. Purely observational, piggybacked on the existing
            # 2s status heartbeat rather than adding a new broadcast timer.
            "drive_recovering": self.drive_recovering,
            "drive_contiguous_samples": self.drive_buffer.contiguous_samples_collected,
            "drive_target_samples": self.drive_buffer.window_samples,
            "rest_recovering": self.rest_recovering,
            "rest_contiguous_samples": self.rest_buffer.contiguous_samples_collected,
            "rest_target_samples": self.rest_buffer.window_samples,
        }

    async def broadcast_status(self) -> None:
        status = self.status()
        await self._broadcast("rest", status)
        await self._broadcast("drive", status)


hub = LiveHub()
