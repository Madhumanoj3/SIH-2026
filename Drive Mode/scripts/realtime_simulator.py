"""
SmartSense Drive Mode - Phase 2C: real-time streaming simulator.

Simulates BioAmp-style streaming using an existing DROZY raw recording
(an EDF file from dataset/). Reads sequentially, buffers 8s, extracts
the same 28 features, predicts one vigilance score per window, and
feeds it into the causal trend engine - never touching future signal
samples or future event annotations (annotations are never loaded here
at all).

Usage:
    python scripts/realtime_simulator.py --input dataset/01M_1.edf --speed 10
"""
import argparse
import sys
import time
from pathlib import Path

import joblib
import json
import mne
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from dd_vigilance_features import eeg_features, eog_features  # reuse exact implementation
from vigilance_trend import VigilanceTrendEngine

MODEL_DIR = Path("models")
WINDOW_SECONDS = 8
EEG_CH = "C4-Ref"
EOG_CH_A = "LOC-Ref"
EOG_CH_B = "ROC-Ref"


def load_artifacts():
    model = joblib.load(MODEL_DIR / "drozy_xgboost_vigilance.joblib")
    scaler = joblib.load(MODEL_DIR / "drozy_scaler.joblib")
    with open(MODEL_DIR / "drozy_model_metadata.json") as fh:
        metadata = json.load(fh)
    return model, scaler, metadata


def fmt_clock(seconds):
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="path to a DROZY .edf recording")
    parser.add_argument("--speed", type=float, default=1, help="playback speed multiplier (1=real time, 10=10x)")
    args = parser.parse_args()

    model, scaler, metadata = load_artifacts()
    feature_cols = metadata["feature_names"]
    fs = metadata["sampling_rate_hz"]

    print("Loading recording (this only reads PAST/current data as we stream forward)...")
    raw = mne.io.read_raw_edf(args.input, preload=True, verbose=False)
    raw.pick([EEG_CH, EOG_CH_A, EOG_CH_B])
    raw.filter(l_freq=0.5, h_freq=40, picks=[EEG_CH], verbose=False)
    raw.filter(l_freq=0.1, h_freq=15, picks=[EOG_CH_A, EOG_CH_B], verbose=False)

    data = raw.get_data()
    idx = {c: i for i, c in enumerate(raw.ch_names)}
    eeg = data[idx[EEG_CH]]
    loc_roc = data[idx[EOG_CH_A]] - data[idx[EOG_CH_B]]

    duration = raw.times[-1]
    n_samp = int(WINDOW_SECONDS * fs)
    n_windows = int(duration // WINDOW_SECONDS)

    print(f"Recording duration: {duration:.0f}s  ->  {n_windows} windows of {WINDOW_SECONDS}s")
    print(f"Playback speed: {args.speed}x  (sleep {WINDOW_SECONDS/args.speed:.2f}s between windows)\n")

    trend_engine = VigilanceTrendEngine()
    sleep_s = WINDOW_SECONDS / args.speed

    for i in range(n_windows):
        s_idx = i * n_samp
        e_idx = s_idx + n_samp
        # only samples up to and including the current window - never future data
        eeg_win = eeg[s_idx:e_idx]
        eog_win = loc_roc[s_idx:e_idx]

        feats = {}
        feats.update(eeg_features(eeg_win, fs))
        feats.update(eog_features(eog_win, fs, WINDOW_SECONDS))

        X = np.array([[feats[c] for c in feature_cols]])
        X_scaled = scaler.transform(X)
        raw_pred = float(model.predict(X_scaled)[0])
        score = float(np.clip(raw_pred, 0, 100))

        window_center = (s_idx + n_samp / 2) / fs
        trend = trend_engine.update(window_center, score)

        print("=" * 44)
        print("SMARTSENSE DRIVE MODE")
        print(f"Time: {fmt_clock(window_center)}")
        print(f"Vigilance: {score:.0f}/100")
        print(f"Trend: {trend['trend_label']}")
        print(f"Status: {trend['status']}")
        print("=" * 44)

        if i < n_windows - 1:
            time.sleep(sleep_s)

    print("\nSimulation complete.")
    print("NOTE: vigilance score is an engineering research estimate, not a clinically validated measurement.")


if __name__ == "__main__":
    main()
