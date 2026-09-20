"""
SmartSense Drive Mode - Phase 2B: single-file batch inference.

Loads the saved deployment model/scaler/metadata and scores a CSV of raw
C4 EEG + LOC/ROC EOG samples. Reuses the EXACT feature-extraction
functions from scripts/dd_vigilance_features.py so deployment features
are numerically identical to training features (same band-pass filter
call path via mne, same band-power/entropy/blink-detection code).

Expected input CSV columns: C4, LOC, ROC (one row per raw sample, at the
sampling rate given by --fs, default 128 Hz - must match training).

Usage:
    python scripts/predict_vigilance.py --input raw_signals.csv [--fs 128]
"""
import argparse
import sys
from pathlib import Path

import joblib
import json
import mne
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from dd_vigilance_features import eeg_features, eog_features  # reuse exact implementation

MODEL_DIR = Path("models")
OUT_DIR = Path("results")
OUT_DIR.mkdir(exist_ok=True)

WINDOW_SECONDS = 8


def load_artifacts():
    model = joblib.load(MODEL_DIR / "drozy_xgboost_vigilance.joblib")
    scaler = joblib.load(MODEL_DIR / "drozy_scaler.joblib")
    with open(MODEL_DIR / "drozy_model_metadata.json") as fh:
        metadata = json.load(fh)
    return model, scaler, metadata


def build_filtered_signals(c4, loc, roc, fs):
    """Constructs LOC-ROC and applies the SAME band-pass filters used in
    training, via mne.filter on an in-memory RawArray - not a
    reimplementation, the identical filter call path."""
    loc_roc = loc - roc
    info = mne.create_info(ch_names=["C4", "LOC_ROC"], sfreq=fs, ch_types="eeg")
    raw = mne.io.RawArray(np.vstack([c4, loc_roc]), info, verbose=False)
    raw.filter(l_freq=0.5, h_freq=40, picks=["C4"], verbose=False)
    raw.filter(l_freq=0.1, h_freq=15, picks=["LOC_ROC"], verbose=False)
    data = raw.get_data()
    return data[0], data[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="CSV with columns C4, LOC, ROC")
    parser.add_argument("--fs", type=int, default=128, help="sampling rate of the input CSV (Hz)")
    args = parser.parse_args()

    model, scaler, metadata = load_artifacts()
    expected_fs = metadata["sampling_rate_hz"]

    print(f"Loaded model: {MODEL_DIR/'drozy_xgboost_vigilance.joblib'}")
    print(f"Loaded scaler: {MODEL_DIR/'drozy_scaler.joblib'}")
    print(f"Loaded metadata: {MODEL_DIR/'drozy_model_metadata.json'}")
    print(f"Model trained at {expected_fs} Hz; input declared as {args.fs} Hz")

    if args.fs != expected_fs:
        raise ValueError(
            f"Sampling rate mismatch: input declared {args.fs} Hz, "
            f"deployment model trained at {expected_fs} Hz. Refusing to predict."
        )

    df = pd.read_csv(args.input)
    required_cols = {"C4", "LOC", "ROC"}
    if not required_cols.issubset(df.columns):
        raise ValueError(f"Input CSV must contain columns {required_cols}, got {list(df.columns)}")

    c4 = df["C4"].values.astype(float)
    loc = df["LOC"].values.astype(float)
    roc = df["ROC"].values.astype(float)

    fs = args.fs
    n_samp = int(WINDOW_SECONDS * fs)
    n_windows_available = len(c4) // n_samp
    print(f"Input samples: {len(c4)}  -> {n_windows_available} complete {WINDOW_SECONDS}s windows")

    if n_windows_available == 0:
        raise ValueError(f"Input too short for even one {WINDOW_SECONDS}s window at {fs} Hz")

    c4_f, loc_roc_f = build_filtered_signals(c4, loc, roc, fs)

    feature_cols = metadata["feature_names"]
    rows = []
    for i in range(n_windows_available):
        s_idx = i * n_samp
        e_idx = s_idx + n_samp
        eeg_win = c4_f[s_idx:e_idx]
        eog_win = loc_roc_f[s_idx:e_idx]

        feats = {}
        feats.update(eeg_features(eeg_win, fs))
        feats.update(eog_features(eog_win, fs, WINDOW_SECONDS))

        row = {"timestamp": (s_idx + n_samp / 2) / fs}
        row.update(feats)
        rows.append(row)

    feat_df = pd.DataFrame(rows)

    missing = [c for c in feature_cols if c not in feat_df.columns]
    if missing:
        raise ValueError(f"Feature mismatch - missing columns: {missing}")

    X = feat_df[feature_cols].values
    if not np.all(np.isfinite(X)):
        raise ValueError("Non-finite values encountered in extracted features - refusing to predict")

    X_scaled = scaler.transform(X)
    raw_predictions = model.predict(X_scaled)
    vigilance_scores = np.clip(raw_predictions, 0, 100)

    out = pd.DataFrame({
        "timestamp": feat_df["timestamp"],
        "predicted_target": raw_predictions,
        "vigilance_score": vigilance_scores,
    })

    out_path = OUT_DIR / "deployment_predictions.csv"
    out.to_csv(out_path, index=False)

    print(f"\nSaved: {out_path}")
    print(f"Windows scored: {len(out)}")
    print(out.head(10).to_string(index=False))
    print(f"\nvigilance_score: min={vigilance_scores.min():.2f} max={vigilance_scores.max():.2f} "
          f"mean={vigilance_scores.mean():.2f} median={np.median(vigilance_scores):.2f}")
    print("\nNOTE: 92/100 means 'the model's current engineering vigilance score is 92', "
          "NOT '92% vigilant'. This is not a clinically validated measurement.")


if __name__ == "__main__":
    main()
