"""Internal short-term trend bookkeeping — not exposed as an API endpoint yet.

Per the intended live architecture, once ESP32 + BioAmp are connected, a new
ML prediction lands roughly every 8 seconds (one prediction per feature-
extraction window). Those raw ~8s predictions are too frequent for the
Supabase historical dashboard, so the design is layered:

  every ~8s   -> a prediction (record_*_prediction, called from main.py)
  every 1-2min -> a short-term trend derived from recent predictions
                  (get_*_short_term_trend) - used internally for alarm logic
  every 5min  -> a persistent summary written to Supabase (not built yet -
                  no live 8s cadence exists in Stage 1 since nothing feeds
                  predict endpoints on a timer; this module just holds the
                  rolling buffer so that wiring is a small addition later,
                  not a redesign)

In Stage 1 (no ESP32/BioAmp), predictions only happen when a user manually
triggers one from the UI, so this buffer fills at whatever irregular rate
the frontend calls the API — it is deliberately not scheduled here.
"""

import time
from collections import deque
from statistics import mean
from typing import Literal, TypedDict

_BUFFER_MAXLEN = 30  # generous headroom above the ~15 entries a real 8s/2min cadence would produce

_rest_buffer: deque[tuple[float, float]] = deque(maxlen=_BUFFER_MAXLEN)
_drive_buffer: deque[tuple[float, float]] = deque(maxlen=_BUFFER_MAXLEN)

TREND_WINDOW_SECONDS = 120  # 1-2 minute short-term trend window


class TrendSummary(TypedDict):
    average: float
    direction: Literal["IMPROVING", "STABLE", "DECLINING"]
    slope_per_min: float
    sample_count: int


def record_rest_prediction(n2_probability: float) -> None:
    _rest_buffer.append((time.time(), n2_probability))


def record_drive_prediction(vigilance: float) -> None:
    _drive_buffer.append((time.time(), vigilance))


def _recent(buffer: deque[tuple[float, float]]) -> list[tuple[float, float]]:
    cutoff = time.time() - TREND_WINDOW_SECONDS
    return [(t, v) for t, v in buffer if t >= cutoff]


def _summarize(buffer: deque[tuple[float, float]]) -> TrendSummary | None:
    points = _recent(buffer)
    if len(points) < 2:
        return None
    values = [v for _, v in points]
    times = [t for t, _ in points]
    elapsed_min = max((times[-1] - times[0]) / 60.0, 1e-6)
    slope_per_min = (values[-1] - values[0]) / elapsed_min
    direction: Literal["IMPROVING", "STABLE", "DECLINING"]
    if slope_per_min > 1.0:
        direction = "IMPROVING"
    elif slope_per_min < -1.0:
        direction = "DECLINING"
    else:
        direction = "STABLE"
    return {
        "average": mean(values),
        "direction": direction,
        "slope_per_min": slope_per_min,
        "sample_count": len(values),
    }


def get_rest_short_term_trend() -> TrendSummary | None:
    return _summarize(_rest_buffer)


def get_drive_short_term_trend() -> TrendSummary | None:
    return _summarize(_drive_buffer)
