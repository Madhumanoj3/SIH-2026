"""Loads the finalized SmartSense model bundle once at process startup.

Reads D:\\SIH-26\\models\\smartsense_models.pkl (read-only) and exposes the
already-trained Rest Mode classifier and Drive Mode regressor+scaler objects
exactly as they were packaged. Nothing here retrains, refits, or otherwise
modifies any model artifact.
"""

from pathlib import Path
from typing import Mapping

import joblib
import numpy as np

MODEL_BUNDLE_PATH = Path(__file__).resolve().parent.parent / "models" / "smartsense_models.pkl"
_bundle = joblib.load(MODEL_BUNDLE_PATH)

BUNDLE_VERSION: str = _bundle.get("bundle_version", "unknown")

_rest = _bundle["rest_mode"]
REST_MODEL = _rest["model"]
REST_SCALER = _rest["scaler"]  # None by design — tree model, no scaling used in training
REST_FEATURE_NAMES: list[str] = list(_rest["feature_names"])
REST_METADATA: dict = _rest["metadata"]

_drive = _bundle["drive_mode"]
DRIVE_MODEL = _drive["model"]
DRIVE_SCALER = _drive["scaler"]
DRIVE_FEATURE_NAMES: list[str] = list(_drive["feature_names"])
DRIVE_METADATA: dict = _drive["metadata"]

# N2 = 1 per rest_mode_metadata.json's class_definitions — read from the model's own
# classes_ attribute rather than hardcoded, so this stays correct if the bundle is
# ever rebuilt with a different class encoding.
_REST_CLASSES = list(REST_MODEL.classes_)
_N2_CLASS_INDEX = _REST_CLASSES.index(1)


def predict_rest(features: Mapping[str, float]) -> tuple[str, float]:
    """Rest Mode inference: 32 features -> XGBoost N2 classifier -> (label, n2_probability).

    No scaler involved (REST_SCALER is None) — matches the training pipeline exactly.
    """
    x = np.array([[features[name] for name in REST_FEATURE_NAMES]], dtype=float)
    proba = REST_MODEL.predict_proba(x)[0]
    n2_probability = float(proba[_N2_CLASS_INDEX])
    predicted_class = int(REST_MODEL.predict(x)[0])
    prediction = "N2" if predicted_class == _REST_CLASSES[_N2_CLASS_INDEX] else "Non-N2"
    return prediction, n2_probability


def predict_drive(features: Mapping[str, float]) -> float:
    """Drive Mode inference: 28 features -> fitted StandardScaler -> XGBoost regressor -> vigilance.

    Uses DRIVE_SCALER.transform() (never .fit / .fit_transform) — the scaler was already fit
    during training and must not be refit here.
    """
    x = np.array([[features[name] for name in DRIVE_FEATURE_NAMES]], dtype=float)
    x_scaled = DRIVE_SCALER.transform(x)
    vigilance = float(DRIVE_MODEL.predict(x_scaled)[0])
    # target_B_60 is defined as 100*(1-exp(-d/60)), which is mathematically bounded to
    # [0, 100); clip only guards against a regression prediction drifting a hair outside
    # that range for an out-of-distribution input — it does not alter the model itself.
    return max(0.0, min(100.0, vigilance))
