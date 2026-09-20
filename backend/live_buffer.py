"""Live sample buffering: rate detection, signal-quality checks, and
non-overlapping window extraction. No ML/feature-extraction logic lives
here — this module only decides WHEN a window is ready and whether it is
trustworthy enough to feed to the model.
"""

import time
from collections import deque
from dataclasses import dataclass

import numpy as np

# ESP32 analogRead() on the common ESP32 boards is a 12-bit ADC (0-4095).
# This is an ASSUMPTION based on the observed live values (~1900, consistent
# with a mid-scale AC-coupled bio-signal reading on a 0-4095 range) — not
# confirmed against the actual firmware source. Documented here rather than
# silently baked in; revisit if the real firmware uses a different ADC width.
ASSUMED_ADC_MIN = 0
ASSUMED_ADC_MAX = 4095


class RateEstimator:
    """Tracks real inter-arrival timestamps and reports the actually
    observed sample rate — never assumed/invented."""

    def __init__(self, maxlen: int = 64):
        self._timestamps: deque[float] = deque(maxlen=maxlen)

    def tick(self, t: float) -> None:
        self._timestamps.append(t)

    @property
    def hz(self) -> float | None:
        if len(self._timestamps) < 2:
            return None
        span = self._timestamps[-1] - self._timestamps[0]
        if span <= 0:
            return None
        return (len(self._timestamps) - 1) / span


def check_signal_quality(
    eeg: np.ndarray,
    eog: np.ndarray,
    adc_min: int = ASSUMED_ADC_MIN,
    adc_max: int = ASSUMED_ADC_MAX,
) -> tuple[str, str]:
    """Returns (quality, reason). quality is GOOD / FAIR / POOR."""
    eeg = np.asarray(eeg, dtype=float)
    eog = np.asarray(eog, dtype=float)

    if eeg.size == 0 or eog.size == 0:
        return "POOR", "no_data"
    if not np.all(np.isfinite(eeg)) or not np.all(np.isfinite(eog)):
        return "POOR", "non_finite_samples"
    if np.std(eeg) < 1e-6 or np.std(eog) < 1e-6:
        return "POOR", "frozen_signal"

    adc_span = adc_max - adc_min
    clip_frac_eeg = float(np.mean((eeg <= adc_min + 1) | (eeg >= adc_max - 1)))
    clip_frac_eog = float(np.mean((eog <= adc_min + 1) | (eog >= adc_max - 1)))
    if clip_frac_eeg > 0.05 or clip_frac_eog > 0.05:
        return "POOR", "excessive_clipping"

    if np.std(eeg) > adc_span * 0.5 or np.std(eog) > adc_span * 0.5:
        return "FAIR", "unusually_high_variance"

    return "GOOD", "ok"


@dataclass
class WindowResult:
    eeg: np.ndarray
    eog: np.ndarray
    quality: str
    reason: str
    detected_fs: float | None
    rate_ok: bool
    sequence_start: int | None = None
    sequence_end: int | None = None
    sequence_valid: bool = True
    missing_sequences: list[int] | None = None
    # Wall-clock receive time of this window's first and last (Nth) sample —
    # used purely for latency instrumentation (see live_hub.py), never for
    # any gating/validation decision.
    window_first_t: float | None = None
    window_last_t: float | None = None


class ModeWindowBuffer:
    """Accumulates raw (t, eeg, eog) samples for one mode (Rest or Drive) and
    yields a complete, non-overlapping window once enough NEW samples have
    arrived. `context_seconds` (Drive only) keeps extra trailing history
    purely so the existing MNE filter has enough samples to be well-defined
    — those extra samples are filter context, never reused as new
    prediction content across windows.
    """

    def __init__(
        self,
        target_fs: float,
        window_seconds: float,
        rate_tolerance: float = 0.2,
        context_seconds: float = 0.0,
    ):
        self.target_fs = target_fs
        self.window_seconds = window_seconds
        self.window_samples = int(round(target_fs * window_seconds))
        self.context_samples = int(round(target_fs * context_seconds))
        self.rate_tolerance = rate_tolerance

        buf_len = self.window_samples + self.context_samples
        self._t: deque[float] = deque(maxlen=buf_len)
        self._eeg: deque[float] = deque(maxlen=buf_len)
        self._eog: deque[float] = deque(maxlen=buf_len)
        self._seq: deque[int | None] = deque(maxlen=buf_len)
        self._new_since_last_window = 0
        self.rate = RateEstimator()

        # Continuity is tracked as samples ARRIVE (add_sample), never reset
        # at window boundaries — a window is just "the last N deque
        # entries", so a gap that falls exactly between one window's last
        # sample and the next window's first sample does NOT show up as a
        # broken pair inside either window's own sequence list; checking
        # per-window in isolation misses it entirely. _last_added_sequence
        # persists across pops so boundary-spanning gaps are still caught.
        # _gap_since_last_pop / _missing_since_last_pop accumulate between
        # pops and are handed to whichever window's cycle they fell in.
        self._last_added_sequence: int | None = None
        self._gap_since_last_pop = False
        self._missing_since_last_pop: list[int] = []

    def reset(self) -> None:
        """Discards ALL buffered samples (both the invalid window and the
        older filter-context history) and starts collecting a fresh,
        guaranteed-contiguous run from scratch.

        Called after a detected sequence gap. Without this, the deques keep
        the pre-gap and post-gap samples sitting next to each other with no
        marker of the real discontinuity between them — even a LATER window
        whose own 1024 samples are perfectly contiguous would still have
        that stale discontinuity sitting in its filter-context tail (Drive
        only), which the band-pass filter would silently treat as
        continuous signal. Resetting is the only way to guarantee the
        filter is never handed a signal with a hidden gap in it, without
        inventing/interpolating anything to paper over the gap.

        This does NOT require refilling the full context_seconds before the
        next window can be attempted — try_pop_window() only ever needs
        window_samples new samples, so recovery after a reset is as fast as
        one clean window's worth of real time (e.g. ~8s for Drive), not the
        full 72s+8s context depth.
        """
        self._t.clear()
        self._eeg.clear()
        self._eog.clear()
        self._seq.clear()
        self._new_since_last_window = 0
        self._last_added_sequence = None
        self._gap_since_last_pop = False
        self._missing_since_last_pop = []
        self.rate = RateEstimator()

    @property
    def contiguous_samples_collected(self) -> int:
        """How many NEW, verified-contiguous samples have accumulated since
        the last pop/reset — i.e. progress toward the next window attempt."""
        return self._new_since_last_window

    def add_sample(self, eeg: float, eog: float, t: float | None = None, sequence: int | None = None) -> None:
        t = t if t is not None else time.time()
        self.rate.tick(t)
        self._t.append(t)
        self._eeg.append(eeg)
        self._eog.append(eog)
        self._seq.append(sequence)
        self._new_since_last_window += 1

        if sequence is None:
            # A source with no sequence numbers at all can't be vouched for -
            # flag it, but don't fabricate a missing-numbers list.
            self._gap_since_last_pop = True
        else:
            if self._last_added_sequence is not None:
                expected = self._last_added_sequence + 1
                if sequence > expected:
                    self._gap_since_last_pop = True
                    self._missing_since_last_pop.extend(range(expected, sequence))
                elif sequence < expected:
                    # Out-of-order or duplicate delivery - also not a trustworthy window.
                    self._gap_since_last_pop = True
            self._last_added_sequence = sequence

    def try_pop_window(self) -> WindowResult | None:
        if self._new_since_last_window < self.window_samples:
            return None
        if len(self._eeg) < self.window_samples:
            return None

        self._new_since_last_window = 0

        eeg_ctx = np.asarray(self._eeg, dtype=float)
        eog_ctx = np.asarray(self._eog, dtype=float)
        eeg_win = eeg_ctx[-self.window_samples :]
        eog_win = eog_ctx[-self.window_samples :]

        # Detected rate computed from the timestamps spanning exactly this
        # window's samples (not the whole context buffer).
        window_t = list(self._t)[-self.window_samples :]
        if len(window_t) >= 2 and window_t[-1] > window_t[0]:
            detected_fs = (len(window_t) - 1) / (window_t[-1] - window_t[0])
        else:
            detected_fs = None

        quality, reason = check_signal_quality(eeg_win, eog_win)
        rate_ok = detected_fs is not None and abs(detected_fs - self.target_fs) / self.target_fs <= self.rate_tolerance

        # Sequence-continuity check: uses the tracker updated in add_sample(),
        # which persists across pops - this is what catches a gap that falls
        # exactly on a window boundary (see the comment in __init__), not
        # just gaps strictly inside this window's own sample list. Missing
        # sequences are reported, never filled/interpolated - a gappy window
        # is marked invalid and must never reach feature extraction.
        window_seq = list(self._seq)[-self.window_samples :]
        sequence_start = window_seq[0]
        sequence_end = window_seq[-1]
        sequence_valid = not self._gap_since_last_pop
        missing: list[int] = list(self._missing_since_last_pop)

        self._gap_since_last_pop = False
        self._missing_since_last_pop = []

        return WindowResult(
            eeg=eeg_ctx if self.context_samples else eeg_win,
            eog=eog_ctx if self.context_samples else eog_win,
            quality=quality,
            reason=reason,
            detected_fs=detected_fs,
            rate_ok=rate_ok,
            sequence_start=sequence_start,
            sequence_end=sequence_end,
            sequence_valid=sequence_valid,
            missing_sequences=missing or None,
            window_first_t=window_t[0] if window_t else None,
            window_last_t=window_t[-1] if window_t else None,
        )
