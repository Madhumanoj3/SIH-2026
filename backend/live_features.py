"""Live feature extraction — thin wrappers that call the EXISTING, validated
Rest/Drive feature-extraction implementations directly. No formulas are
reimplemented here.

Rest Mode: imports scripts/feature_extractor.py::extract_epoch_features
unchanged (same function replay_test.py already uses). It does its own
internal band-pass filtering (scipy butter + sosfiltfilt) and works
correctly on an isolated N-sample array, so a live 30s epoch can be passed
straight in with no extra buffering trick.

Drive Mode: imports scripts/dd_vigilance_features.py::eeg_features /
eog_features unchanged (same functions predict_vigilance.py and
realtime_simulator.py already use), plus the same MNE RawArray band-pass
filter call path as predict_vigilance.py::build_filtered_signals. Unlike
Rest, this filter is unstable/undefined on a bare isolated 8s (1024-sample)
window at the 0.1 Hz EOG high-pass cutoff MNE would need to build ~4200+
taps by default. To stay faithful to the exact same filter (not a
reimplementation) while remaining numerically well-defined, the caller
supplies a longer trailing context buffer (see live_buffer.ModeWindowBuffer);
this module filters that whole buffer and returns only the most recent
window's worth of the filtered signal.

IMPORTANT CALIBRATION CAVEAT (documented, not silently ignored):
Both trained models were fit on physical-unit training data (Drive Mode
EEG std up to ~315 in EDF-native units, roughly microvolt-scale; Rest Mode
EEG std up to ~0.0008, roughly volt-scale). The live ESP32 stream currently
supplies raw analog-to-digital converter counts (~1900 baseline, per the
values already observed in SmartSense-main/esp32.py output), not a
calibrated physical unit. No conversion factor is invented here — per
instruction, if the feature extractor already operates correctly on raw
digital samples, that behavior is preserved unchanged, and the scale
mismatch is surfaced explicitly (see LIVE_CALIBRATION_WARNING and the
'uncalibrated' flag threaded through live_hub.py) rather than hidden.
"""

import sys
from pathlib import Path

import numpy as np

REST_SCRIPTS_DIR = Path(r"D:\SIH-26\Rest Mode\scripts")
DRIVE_SCRIPTS_DIR = Path(r"D:\SIH-26\Drive Mode\scripts")

for _dir in (REST_SCRIPTS_DIR, DRIVE_SCRIPTS_DIR):
    if str(_dir) not in sys.path:
        sys.path.insert(0, str(_dir))

from backend.feature_extractor import extract_epoch_features as _rest_extract_epoch_features
from backend.dd_vigilance_features import eeg_features as _drive_eeg_features
from backend.dd_vigilance_features import eog_features as _drive_eog_features

import mne  # noqa: E402

LIVE_CALIBRATION_WARNING = (
    "Live features are computed from raw ESP32 ADC counts, not the physical "
    "units (EDF-native, roughly uV/V scale) the models were trained on. No "
    "calibration/conversion factor has been established for this hardware "
    "yet - treat live predictions as unverified until a calibration pass is "
    "done against known reference signals."
)


def extract_rest_features(eeg: np.ndarray, eog: np.ndarray, fs: int) -> dict | None:
    """Rest Mode: exactly scripts/feature_extractor.py::extract_epoch_features,
    unmodified. Returns None if the canonical extractor itself rejects the
    epoch (its own internal filter failure path)."""
    return _rest_extract_epoch_features(eeg=np.asarray(eeg, dtype=float), eog=np.asarray(eog, dtype=float), fs=fs)


def _drive_filtered(eeg_ctx: np.ndarray, eog_ctx: np.ndarray, fs: int) -> tuple[np.ndarray, np.ndarray]:
    """Same MNE RawArray band-pass call path as
    Drive Mode/scripts/predict_vigilance.py::build_filtered_signals — not a
    reimplementation. Operates on the full trailing context buffer so MNE's
    default filter-length calculation (which needs several thousand samples
    at the 0.1 Hz EOG high-pass cutoff) has enough data to be well-defined."""
    info = mne.create_info(ch_names=["EEG", "EOG"], sfreq=fs, ch_types="eeg")
    raw = mne.io.RawArray(np.vstack([eeg_ctx, eog_ctx]), info, verbose=False)
    raw.filter(l_freq=0.5, h_freq=40, picks=["EEG"], verbose=False)
    raw.filter(l_freq=0.1, h_freq=15, picks=["EOG"], verbose=False)
    data = raw.get_data()
    return data[0], data[1]


def extract_drive_features(
    eeg_context: np.ndarray,
    eog_context: np.ndarray,
    fs: int,
    window_samples: int,
    window_seconds: float,
) -> dict:
    """Drive Mode: filters the full trailing context buffer (see module
    docstring), then extracts the 28 features from only the newest
    window_samples of the filtered signal using the exact
    dd_vigilance_features.eeg_features / eog_features functions, unmodified."""
    eeg_f, eog_f = _drive_filtered(np.asarray(eeg_context, dtype=float), np.asarray(eog_context, dtype=float), fs)
    eeg_win = eeg_f[-window_samples:]
    eog_win = eog_f[-window_samples:]
    feats = {}
    feats.update(_drive_eeg_features(eeg_win, fs))
    feats.update(_drive_eog_features(eog_win, fs, window_seconds))
    return feats
