"""
SmartSense Drive Mode - Phase 2D: causal temporal trend engine.

Consumes one timestamped vigilance score at a time (or a chronologically
ordered batch) and produces trend diagnostics using ONLY current and
past scores - never future ones.

MODEL SCORE vs DISPLAY STATUS are kept strictly separate:
  - the model score (0-100) comes from the regressor.
  - the DISPLAY category (HIGH/MODERATE/LOW/VERY LOW) and the
    ALERT/WARNING/DROWSY/ALARM status are engineering UI interpretations
    only, not clinically validated thresholds.

Trend/alarm numeric parameters (moving-average windows, slope windows,
persistence threshold, slope threshold) are NOT invented here - they
reuse the same fixed, a-priori, data-informed values already used and
reported in the LOSO experiment's alarm grid search
(results/dd_continuous_vigilance/alarm_grid_search.csv, best-F1 row:
slope_threshold=-1.0, persistence_threshold=2, cooldown_s=60).
"""
from collections import deque
import numpy as np

MOVING_AVG_SHORT_WINDOWS = 4   # 4 x 8s = 32s
MOVING_AVG_MEDIUM_WINDOWS = 8  # 8 x 8s = 64s
SLOPE_SHORT_WINDOWS = 4
SLOPE_MEDIUM_WINDOWS = 8

# Reused from the validated LOSO alarm grid search (not invented here).
DECLINE_SLOPE_THRESHOLD = -1.0
DECLINE_PERSISTENCE_THRESHOLD = 2
ALARM_COOLDOWN_SECONDS = 60

# UI-only display bands. NOT clinically validated. Documented explicitly.
DISPLAY_BANDS = [
    (80, 100, "HIGH"),
    (60, 80, "MODERATE"),
    (40, 60, "LOW"),
    (0, 40, "VERY LOW"),
]


def display_category(score):
    """UI-only category label for a raw 0-100 score. NOT a clinical threshold."""
    for lo, hi, label in DISPLAY_BANDS:
        if lo <= score <= hi:
            return label
    return "UNKNOWN"


def status_label(score, sustained_decline):
    """
    Engineering UI status. ALARM is reserved for sustained decline only -
    never triggered by a single low score, per the design requirement
    that alarms must reflect a persistent trend, not one bad reading.
    """
    if sustained_decline:
        return "ALARM"
    band = display_category(score)
    return {"HIGH": "ALERT", "MODERATE": "WARNING", "LOW": "DROWSY", "VERY LOW": "DROWSY"}.get(band, "ALERT")


def _trailing_slope(values):
    n = len(values)
    if n < 2:
        return float("nan")
    x = np.arange(n)
    return float(np.polyfit(x, np.asarray(values, dtype=float), 1)[0])


class VigilanceTrendEngine:
    """
    Streaming, strictly causal trend engine. Call update(timestamp, score)
    once per new window, in chronological order. Internally keeps only a
    trailing history buffer - never looks ahead.
    """

    def __init__(self):
        self._scores = deque(maxlen=MOVING_AVG_MEDIUM_WINDOWS)
        self._last_alarm_t = -np.inf
        self._decline_persistence = 0
        self._prev_score = None

    def update(self, timestamp, score):
        if self._prev_score is not None:
            self._decline_persistence = self._decline_persistence + 1 if score < self._prev_score else 0
        else:
            self._decline_persistence = 0
        self._prev_score = score
        self._scores.append(score)

        hist = list(self._scores)
        short_hist = hist[-MOVING_AVG_SHORT_WINDOWS:]
        medium_hist = hist  # deque already capped at MOVING_AVG_MEDIUM_WINDOWS

        moving_avg_short = float(np.mean(short_hist))
        moving_avg_medium = float(np.mean(medium_hist))
        slope_short = _trailing_slope(hist[-SLOPE_SHORT_WINDOWS:])
        slope_medium = _trailing_slope(hist[-SLOPE_MEDIUM_WINDOWS:])

        sustained_decline = (
            not np.isnan(slope_medium)
            and slope_medium <= DECLINE_SLOPE_THRESHOLD
            and self._decline_persistence >= DECLINE_PERSISTENCE_THRESHOLD
            and (timestamp - self._last_alarm_t) >= ALARM_COOLDOWN_SECONDS
        )
        if sustained_decline:
            self._last_alarm_t = timestamp

        if np.isnan(slope_medium):
            trend_label = "STABLE"
        elif slope_medium <= DECLINE_SLOPE_THRESHOLD:
            trend_label = "DECLINING"
        elif slope_medium >= -DECLINE_SLOPE_THRESHOLD:
            trend_label = "RISING"
        else:
            trend_label = "STABLE"

        return {
            "timestamp": timestamp,
            "score": score,
            "moving_avg_short": moving_avg_short,
            "moving_avg_medium": moving_avg_medium,
            "slope_short": slope_short,
            "slope_medium": slope_medium,
            "decline_persistence": self._decline_persistence,
            "sustained_decline": bool(sustained_decline),
            "trend_label": trend_label,
            "display_category": display_category(score),
            "status": status_label(score, sustained_decline),
        }


def compute_trend_batch(timestamps, scores):
    """Batch/offline convenience wrapper - identical causal logic, applied
    in order over a pre-collected chronological sequence (e.g. for
    offline testing). Never uses information from index > i to produce
    row i's trend values."""
    engine = VigilanceTrendEngine()
    rows = [engine.update(t, s) for t, s in zip(timestamps, scores)]
    return rows
