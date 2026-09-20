"""
SmartSense Drive Mode - Phase 2E: offline end-to-end deployment test, and
Phase 2F: model consistency check against the existing LOSO OOF
predictions.

Re-extracts features from a REAL DROZY recording using the exact
existing implementation (dd_vigilance_features.process_recording),
scores them with the saved deployment model, runs the causal trend
engine, and verifies the pipeline end to end. Also compares the
deployment model's predictions on that recording's rows against the
already-existing LOSO XGBoost out-of-fold predictions for the same
rows (results/dd_continuous_vigilance/oof_predictions_all_models.csv)
purely as a plumbing check (feature order / scaling / model loading) -
NOT as a generalization claim. The two are expected to differ because
the deployment model saw this subject during training and the LOSO
model did not.

Usage:
    python scripts/test_deployment_pipeline.py --input dataset/01M_1.edf
"""
import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy.stats import pearsonr

sys.path.insert(0, str(Path(__file__).parent))
from dd_vigilance_features import process_recording  # reuse exact implementation
from dd_vigilance_targets import build_targets        # reuse exact implementation
from vigilance_trend import compute_trend_batch

MODEL_DIR = Path("models")
DATASET_DIR = Path("dataset")
OOF_FILE = Path("results/dd_continuous_vigilance/oof_predictions_all_models.csv")
OUT_DIR = Path("results/dd_continuous_vigilance")
WINDOW_SECONDS = 8


def load_artifacts():
    model = joblib.load(MODEL_DIR / "drozy_xgboost_vigilance.joblib")
    scaler = joblib.load(MODEL_DIR / "drozy_scaler.joblib")
    with open(MODEL_DIR / "drozy_model_metadata.json") as fh:
        metadata = json.load(fh)
    return model, scaler, metadata


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="dataset/01M_1.edf", help="a real DROZY .edf recording")
    args = parser.parse_args()
    signal_file = Path(args.input)
    recording = signal_file.stem
    annotation_file = DATASET_DIR / f"{recording}_annotations.edf"

    print("=" * 70)
    print("PHASE 2E - OFFLINE END-TO-END DEPLOYMENT TEST")
    print("=" * 70)

    # ---- verify model loading ----
    try:
        model, scaler, metadata = load_artifacts()
        print("[PASS] model, scaler, and metadata loaded without error")
    except Exception as e:
        print(f"[FAIL] could not load deployment artifacts: {e}")
        raise

    feature_cols = metadata["feature_names"]

    # ---- re-extract features from the RAW recording (genuine re-extraction, not reading old CSVs) ----
    df = process_recording(signal_file, annotation_file, WINDOW_SECONDS)
    df = build_targets(df)  # adds target_B_60 etc., for the Phase 2F comparison only

    # ---- verify feature match ----
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        print(f"[FAIL] feature mismatch - missing: {missing}")
        raise ValueError("feature mismatch")
    print(f"[PASS] no feature mismatch - all {len(feature_cols)} expected features present")

    X = df[feature_cols].values

    # ---- verify no NaN / Inf ----
    has_nan = not np.all(np.isfinite(X))
    if has_nan:
        print("[FAIL] non-finite values found in extracted features")
        raise ValueError("non-finite features")
    print("[PASS] no NaNs / no Inf in extracted features")

    # ---- verify scaler compatibility ----
    if scaler.n_features_in_ != X.shape[1]:
        print(f"[FAIL] scaler expects {scaler.n_features_in_} features, got {X.shape[1]}")
        raise ValueError("scaler mismatch")
    print(f"[PASS] scaler feature count matches ({scaler.n_features_in_})")

    X_scaled = scaler.transform(X)
    raw_pred = model.predict(X_scaled)
    vigilance_score = np.clip(raw_pred, 0, 100)
    print("[PASS] prediction pipeline executed without error")

    # ---- causal trend engine ----
    timestamps = df["window_center"].values
    trend_rows = compute_trend_batch(timestamps, vigilance_score)
    n_alarms = sum(r["sustained_decline"] for r in trend_rows)

    out = df[["recording", "window_center"]].copy()
    out["true_target_B_60"] = df["target_B_60"]
    out["predicted_target"] = raw_pred
    out["vigilance_score"] = vigilance_score
    out["trend_label"] = [r["trend_label"] for r in trend_rows]
    out["status"] = [r["status"] for r in trend_rows]
    out["sustained_decline"] = [r["sustained_decline"] for r in trend_rows]

    out_path = OUT_DIR / f"test_pipeline_output_{recording}.csv"
    out.to_csv(out_path, index=False)
    print(f"[PASS] saved complete output: {out_path}")

    print("\n" + "=" * 70)
    print("RESULTS")
    print("=" * 70)
    print(f"Recording: {recording}")
    print(f"Number of windows: {len(out)}")
    print(f"Score min   : {vigilance_score.min():.2f}")
    print(f"Score max   : {vigilance_score.max():.2f}")
    print(f"Score mean  : {vigilance_score.mean():.2f}")
    print(f"Score median: {np.median(vigilance_score):.2f}")
    print(f"Number of alarm events (sustained decline): {n_alarms}")

    print("\nFirst 20 predictions:")
    print(out[["window_center", "predicted_target", "vigilance_score", "trend_label", "status"]].head(20).to_string(index=False))

    # ================================================================
    # PHASE 2F - MODEL CONSISTENCY CHECK vs existing LOSO OOF predictions
    # ================================================================
    print("\n" + "=" * 70)
    print("PHASE 2F - MODEL CONSISTENCY CHECK (deployment model vs LOSO OOF)")
    print("=" * 70)

    if OOF_FILE.exists():
        oof = pd.read_csv(OOF_FILE)
        oof_rec = oof[oof["recording"] == recording].sort_values("timestamp")
        merged = pd.merge(
            out.rename(columns={"window_center": "timestamp"}),
            oof_rec[["timestamp", "true_target", "pred_xgboost"]],
            on="timestamp", how="inner",
        )
        if len(merged) == 0:
            print("[WARN] no overlapping rows found between deployment output and LOSO OOF file "
                  "(timestamp alignment differs) - skipping numeric comparison.")
        else:
            diff = merged["predicted_target"] - merged["pred_xgboost"]
            corr, _ = pearsonr(merged["predicted_target"], merged["pred_xgboost"])
            print(f"Rows compared: {len(merged)}")
            print(f"Correlation (deployment pred vs LOSO-held-out pred): {corr:.3f}")
            print(f"Mean absolute difference: {diff.abs().mean():.2f}")
            print(f"Max absolute difference : {diff.abs().max():.2f}")
            print(
                "\nThese are EXPECTED to differ (deployment model trained on this subject too; "
                "LOSO model never saw it). This check only confirms feature order, scaling, and "
                "model loading are correct - a strong positive correlation with a nonzero but "
                "bounded difference is the expected 'pipeline is wired correctly' signature; "
                "identical values would actually indicate something is wrong (e.g. the LOSO file "
                "being mistakenly reused instead of a fresh prediction)."
            )
    else:
        print(f"[WARN] {OOF_FILE} not found - skipping Phase 2F comparison.")

    print("\nAll verifications passed.")


if __name__ == "__main__":
    main()
