"""Pydantic request/response models.

The two feature-input models (RestFeatures / DriveFeatures) are built
programmatically from the exact feature name lists stored inside
smartsense_models.pkl (see model_registry.py) rather than hand-transcribed,
so the API can never silently drift from the finalized model's real input
contract.

Every feature field is a required, finite float:
- missing fields  -> 422 (pydantic requires every field, no defaults)
- extra/unknown fields (wrong count, typos) -> 422 (extra="forbid")
- non-numeric values -> 422 (float coercion fails)
- NaN / Infinity -> 422 (allow_inf_nan=False)
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, create_model

from backend.model_registry import DRIVE_FEATURE_NAMES, REST_FEATURE_NAMES

FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]


def _build_feature_model(model_name: str, feature_names: list[str]) -> type[BaseModel]:
    fields = {name: (FiniteFloat, ...) for name in feature_names}
    return create_model(model_name, __config__=ConfigDict(extra="forbid"), **fields)  # type: ignore[call-overload]


RestFeatures = _build_feature_model("RestFeatures", REST_FEATURE_NAMES)
DriveFeatures = _build_feature_model("DriveFeatures", DRIVE_FEATURE_NAMES)


class RestPredictionResponse(BaseModel):
    mode: Literal["rest"] = "rest"
    prediction: str
    n2_probability: float


class DrivePredictionResponse(BaseModel):
    mode: Literal["drive"] = "drive"
    vigilance: float


class HealthResponse(BaseModel):
    status: str
    bundle_version: str
    rest_model_loaded: bool
    rest_feature_count: int
    rest_scaler: str
    drive_model_loaded: bool
    drive_feature_count: int
    drive_scaler: str


class LiveSample(BaseModel):
    """One raw ESP32/BioAmp sample, as forwarded by SmartSense-main/esp32.py
    (--forward flag). Values are raw ADC counts, not physical units — see
    live_features.py's LIVE_CALIBRATION_WARNING.

    `timestamp` must be a wall-clock Unix time in seconds (what the Python
    receiver observed it at), NOT the ESP32's own timestamp_us (which is
    microseconds since ESP32 boot, not comparable to Python's time.time()).

    `sequence` is the firmware's monotonic per-sample counter — required for
    the backend's window-level sequence-continuity check (a window with any
    gap is marked invalid and never reaches the model, never interpolated)."""

    model_config = ConfigDict(extra="forbid")

    eeg: FiniteFloat
    eog: FiniteFloat
    timestamp: FiniteFloat | None = None
    sequence: int | None = None
