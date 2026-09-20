"""
SmartSense Drive Mode - Phase 2A: final deployment training.

Fits ONE final XGBoost regressor on ALL 10 DROZY/DD subjects (no LOSO
holdout - this is a deployment artifact, not a generalization estimate).
Does NOT touch, modify, or recompute the existing LOSO experiment
results under results/dd_continuous_vigilance/.

Reuses the existing feature dataset exactly as produced by
scripts/dd_vigilance_features.py + scripts/dd_vigilance_targets.py.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

IN_FILE = Path("processed/dd_continuous_vigilance/features_with_targets_w8.csv")
MODEL_DIR = Path("models")
MODEL_DIR.mkdir(exist_ok=True)

TARGET_COL = "target_B_60"
TARGET_FORMULA = "vigilance(t) = 100 * (1 - exp(-d(t)/60)), d(t) = min_i |t - event_i| (bidirectional distance to nearest self-report event, seconds)"

EEG_FEATURES = [
    "eeg_mean", "eeg_std", "eeg_var", "eeg_rms", "eeg_range", "eeg_total_power",
    "eeg_delta_power", "eeg_rel_delta", "eeg_theta_power", "eeg_rel_theta",
    "eeg_alpha_power", "eeg_rel_alpha", "eeg_beta_power", "eeg_rel_beta",
    "eeg_theta_alpha", "eeg_theta_beta", "eeg_spectral_entropy",
]
EOG_FEATURES = [
    "eog_mean", "eog_std", "eog_rms", "eog_var", "eog_amplitude", "eog_zcr",
    "eog_lowfreq_power", "eog_spectral_entropy", "eog_blink_count",
    "eog_blink_rate_per_min", "eog_blink_duration_mean",
]
FEATURE_COLS = EEG_FEATURES + EOG_FEATURES  # canonical order - used everywhere downstream

RANDOM_STATE = 42


def main():
    df = pd.read_csv(IN_FILE)
    print(f"Loaded {IN_FILE}  shape={df.shape}")

    # --- Step 2: verify the exact 28 feature columns ---
    assert len(FEATURE_COLS) == 28, f"Expected 28 features, got {len(FEATURE_COLS)}"
    missing = [c for c in FEATURE_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Feature columns missing from {IN_FILE}: {missing}")
    print(f"Verified all {len(FEATURE_COLS)} required feature columns are present.")

    if TARGET_COL not in df.columns:
        raise ValueError(f"Target column {TARGET_COL} not found in {IN_FILE}")

    X = df[FEATURE_COLS].values
    y = df[TARGET_COL].values
    subjects = sorted(df["subject"].unique())

    print(f"Training samples: {len(df)}  Subjects: {subjects} (n={len(subjects)})")

    # --- Steps 5-6: fit scaler + model on ALL data, no split ---
    scaler = StandardScaler().fit(X)
    X_scaled = scaler.transform(X)

    model = XGBRegressor(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        random_state=RANDOM_STATE, n_jobs=-1, verbosity=0,
    )
    model.fit(X_scaled, y)
    print("Fit complete: XGBRegressor trained on all available DROZY subjects (no holdout).")

    # --- Step 9: save artifacts ---
    model_path = MODEL_DIR / "drozy_xgboost_vigilance.joblib"
    scaler_path = MODEL_DIR / "drozy_scaler.joblib"
    metadata_path = MODEL_DIR / "drozy_model_metadata.json"

    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)

    metadata = {
        "dataset": "DROZY / DD-Database",
        "model_type": "XGBRegressor",
        "target": TARGET_COL,
        "target_formula": TARGET_FORMULA,
        "sampling_rate_hz": 128,
        "window_size_seconds": 8,
        "eeg_channel": "C4-Ref",
        "eog_channel": "LOC-Ref - ROC-Ref (bipolar horizontal EOG proxy)",
        "preprocessing": {
            "eeg_bandpass_hz": [0.5, 40],
            "eog_bandpass_hz": [0.1, 15],
        },
        "feature_names": FEATURE_COLS,
        "feature_count": len(FEATURE_COLS),
        "training_sample_count": int(len(df)),
        "subject_count": len(subjects),
        "subjects": [str(s) for s in subjects],
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "warning": (
            "NOT clinically validated. This is an engineering research proxy model "
            "trained on an event-derived vigilance target (self-reported drowsiness "
            "button presses), not a measured physiological quantity. It is trained "
            "on C4-Ref (EEG reference unverified as M1) and LOC-ROC (unverified as "
            "true E1-E2). It has not been evaluated on any BioAmp hardware. This "
            "artifact is trained on ALL 10 subjects with no held-out subject, so it "
            "provides NO evidence of generalization to a new person - see the "
            "separate LOSO experiment results for that evidence, which showed weak, "
            "subject-unstable cross-subject performance (mean-subject R2 = -0.563)."
        ),
    }
    with open(metadata_path, "w") as fh:
        json.dump(metadata, fh, indent=2)

    print("\nSaved:")
    print(f"  {model_path}")
    print(f"  {scaler_path}")
    print(f"  {metadata_path}")


if __name__ == "__main__":
    main()
