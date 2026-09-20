"""
SmartSense Rest Mode
DREAMT -> Raw EEG/EOG -> Canonical Feature Extraction -> XGBoost Prediction

IMPORTANT:
This replay script uses the SAME feature extractor used during training.
Do not duplicate feature-extraction code here.
"""

import os
import sys
import joblib
import numpy as np
import pandas as pd
from pathlib import Path

from feature_extractor import extract_epoch_features


# ============================================================
# CONFIGURATION
# ============================================================

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

DATA_PATH = str(
    PROJECT_DIR / "dataset"
    / "dreamt-dataset-for-real-time-sleep-stage-estimation-using-multisensor-wearable-technology-2.2.0"
    / "data_100Hz"
    / "S002_PSG_df.csv"
)

# Final model now lives at Rest Mode/models/rest_mode_n2.joblib (was
# scripts/models/xgboost_n2.joblib before the Phase 3 cleanup).
MODEL_PATH = str(PROJECT_DIR / "models" / "rest_mode_n2.joblib")

# Subject
SUBJECT_ID = "S002"

# Epoch to replay
# 1 epoch = 30 seconds
EPOCH_NUMBER = 120

# DREAMT sampling frequency
FS = 100

# Samples per 30-second epoch
EPOCH_SAMPLES = FS * 30


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def print_separator():
    print("=" * 70)


def stage_name(stage):
    """
    Convert DREAMT sleep-stage representation to readable text.
    """

    if pd.isna(stage):
        return "Missing"

    # Handle numeric stages
    try:
        stage_num = int(stage)

        stage_map = {
            0: "W",
            1: "N1",
            2: "N2",
            3: "N3",
            4: "R",
        }

        if stage_num in stage_map:
            return stage_map[stage_num]

    except (ValueError, TypeError):
        pass

    # Handle string stages
    stage_str = str(stage).strip().upper()

    stage_map = {
        "W": "W",
        "WAKE": "W",
        "N1": "N1",
        "N2": "N2",
        "N3": "N3",
        "R": "R",
        "REM": "R",
    }

    return stage_map.get(stage_str, stage_str)


def convert_stage_to_label(stage):
    """
    SmartSense binary target:

        N2      -> 1
        W/N1/N3/R -> 0
    """

    name = stage_name(stage)

    if name == "N2":
        return 1

    return 0


# ============================================================
# START
# ============================================================

print_separator()
print("SMARTSENSE REST MODE - REPLAY TEST")
print_separator()

print(f"Subject       : {SUBJECT_ID}")
print(f"Epoch         : {EPOCH_NUMBER}")
print(f"Sampling rate : {FS} Hz")
print(f"Epoch length  : 30 seconds")
print(f"Samples       : {EPOCH_SAMPLES}")

print_separator()


# ============================================================
# CHECK FILES
# ============================================================

if not os.path.exists(DATA_PATH):
    print("\nERROR: DREAMT dataset file not found:")
    print(DATA_PATH)
    sys.exit(1)

if not os.path.exists(MODEL_PATH):
    print("\nERROR: XGBoost model not found:")
    print(MODEL_PATH)
    sys.exit(1)


# ============================================================
# LOAD MODEL
# ============================================================

print("\nLoading XGBoost model...")

try:
    model = joblib.load(MODEL_PATH)
except Exception as e:
    print(f"ERROR loading model: {e}")
    sys.exit(1)

print("Model loaded successfully.")

# ------------------------------------------------------------
# Get exact training feature order
# ------------------------------------------------------------

if hasattr(model, "feature_names_in_"):
    MODEL_FEATURE_NAMES = list(model.feature_names_in_)

    print(f"Model expects {len(MODEL_FEATURE_NAMES)} features.")

else:
    MODEL_FEATURE_NAMES = None

    print(
        "WARNING: Model does not contain feature_names_in_. "
        "Feature order must match training manually."
    )


# ============================================================
# LOAD RAW DREAMT DATA
# ============================================================

print("\nLoading DREAMT data...")

try:
    df = pd.read_csv(DATA_PATH)
except Exception as e:
    print(f"ERROR loading CSV: {e}")
    sys.exit(1)

print(f"Loaded rows: {len(df):,}")


# ============================================================
# CHECK REQUIRED COLUMNS
# ============================================================

required_columns = [
    "C4-M1",
    "E1",
    "E2",
    "Sleep_Stage"
]

missing_columns = [
    col for col in required_columns
    if col not in df.columns
]

if missing_columns:
    print("\nERROR: Required columns missing:")
    for col in missing_columns:
        print(f"  - {col}")

    print("\nAvailable columns:")
    print(list(df.columns))

    sys.exit(1)


# ============================================================
# DETERMINE NUMBER OF EPOCHS
# ============================================================

total_samples = len(df)

total_epochs = total_samples // EPOCH_SAMPLES

print(f"Total samples : {total_samples:,}")
print(f"Full epochs   : {total_epochs:,}")


# ============================================================
# CHECK REQUESTED EPOCH
# ============================================================

if EPOCH_NUMBER < 0:
    print("\nERROR: Epoch number cannot be negative.")
    sys.exit(1)

if EPOCH_NUMBER >= total_epochs:
    print(
        f"\nERROR: Epoch {EPOCH_NUMBER} does not exist."
    )
    print(
        f"Available epochs: 0 - {total_epochs - 1}"
    )
    sys.exit(1)


# ============================================================
# EXTRACT EXACT 30-SECOND EPOCH
# ============================================================

start_sample = EPOCH_NUMBER * EPOCH_SAMPLES
end_sample = start_sample + EPOCH_SAMPLES

epoch_df = df.iloc[start_sample:end_sample].copy()

print_separator()
print("EPOCH INFORMATION")
print_separator()

print(f"Epoch number  : {EPOCH_NUMBER}")
print(f"Start sample  : {start_sample}")
print(f"End sample    : {end_sample - 1}")
print(f"Rows          : {len(epoch_df)}")


# ============================================================
# VERIFY EPOCH SIZE
# ============================================================

if len(epoch_df) != EPOCH_SAMPLES:
    print(
        "\nERROR: Epoch does not contain exactly "
        f"{EPOCH_SAMPLES} samples."
    )
    sys.exit(1)


# ============================================================
# EXTRACT RAW EEG
# ============================================================

eeg = pd.to_numeric(
    epoch_df["C4-M1"],
    errors="coerce"
).to_numpy(dtype=float)


# ============================================================
# CREATE EOG
# ============================================================

e1 = pd.to_numeric(
    epoch_df["E1"],
    errors="coerce"
).to_numpy(dtype=float)

e2 = pd.to_numeric(
    epoch_df["E2"],
    errors="coerce"
).to_numpy(dtype=float)


# DREAMT EOG representation used by training:
#
# EOG = E1 - E2
#
eog = e1 - e2


# ============================================================
# RAW DATA INFORMATION
# ============================================================

print("\nRAW SIGNAL INFORMATION")
print_separator()

print(f"EEG samples   : {len(eeg)}")
print(f"EOG samples   : {len(eog)}")

print(
    f"EEG NaNs      : {np.isnan(eeg).sum()}"
)

print(
    f"EOG NaNs      : {np.isnan(eog).sum()}"
)

print(
    f"EEG finite    : {np.isfinite(eeg).sum()}/{len(eeg)}"
)

print(
    f"EOG finite    : {np.isfinite(eog).sum()}/{len(eog)}"
)


# ============================================================
# CHECK MISSING DATA
# ============================================================

eeg_missing_fraction = np.mean(~np.isfinite(eeg))
eog_missing_fraction = np.mean(~np.isfinite(eog))

print(
    f"\nEEG missing fraction : "
    f"{eeg_missing_fraction:.4%}"
)

print(
    f"EOG missing fraction : "
    f"{eog_missing_fraction:.4%}"
)


# ============================================================
# MATCH TRAINING MISSING-DATA BEHAVIOR
# ============================================================

# The training pipeline skips an epoch when missingness exceeds
# the configured threshold.
#
# For epochs below the threshold, missing values are filled
# using the same median-based behavior expected by training.

MAX_MISSING_FRACTION = 0.05


if eeg_missing_fraction > MAX_MISSING_FRACTION:
    print(
        "\nERROR: EEG missing fraction exceeds "
        f"{MAX_MISSING_FRACTION:.0%}."
    )
    print("Training pipeline would reject this epoch.")
    sys.exit(1)


if eog_missing_fraction > MAX_MISSING_FRACTION:
    print(
        "\nERROR: EOG missing fraction exceeds "
        f"{MAX_MISSING_FRACTION:.0%}."
    )
    print("Training pipeline would reject this epoch.")
    sys.exit(1)


# ------------------------------------------------------------
# Median fill
# ------------------------------------------------------------

def median_fill(signal):
    signal = np.asarray(signal, dtype=float).copy()

    valid = np.isfinite(signal)

    if not np.any(valid):
        return None

    median_value = np.nanmedian(signal)

    signal[~valid] = median_value

    return signal


eeg = median_fill(eeg)
eog = median_fill(eog)


if eeg is None:
    print("\nERROR: EEG contains no valid samples.")
    sys.exit(1)

if eog is None:
    print("\nERROR: EOG contains no valid samples.")
    sys.exit(1)


# ============================================================
# CANONICAL FEATURE EXTRACTION
# ============================================================

print_separator()
print("FEATURE EXTRACTION")
print_separator()

print(
    "\nUsing canonical feature_extractor.py..."
)

try:

    features = extract_epoch_features(
        eeg=eeg,
        eog=eog,
        fs=FS
    )

except Exception as e:

    print(
        "\nERROR during feature extraction:"
    )

    print(e)

    import traceback
    traceback.print_exc()

    sys.exit(1)


# ============================================================
# FEATURE EXTRACTION FAILURE CHECK
# ============================================================

if features is None:

    print(
        "\nERROR: Feature extraction failed."
    )

    print(
        "The training pipeline would not create "
        "a feature row for this epoch."
    )

    sys.exit(1)


# ============================================================
# CONVERT FEATURES TO DATAFRAME
# ============================================================

feature_df = pd.DataFrame([features])


print(
    f"\nExtracted features: "
    f"{feature_df.shape[1]}"
)


# ============================================================
# FEATURE COUNT CHECK
# ============================================================

if feature_df.shape[1] != 32:

    print(
        "\nERROR: Expected exactly 32 features."
    )

    print(
        f"Got: {feature_df.shape[1]}"
    )

    print(
        "\nExtracted feature names:"
    )

    for i, name in enumerate(feature_df.columns):
        print(f"{i:02d}: {name}")

    sys.exit(1)


# ============================================================
# FEATURE NAME CHECK
# ============================================================

print("\nFEATURE ORDER")

print_separator()

for i, name in enumerate(feature_df.columns):

    print(
        f"{i + 1:02d}. {name}"
    )


# ============================================================
# MATCH MODEL FEATURE ORDER
# ============================================================

if MODEL_FEATURE_NAMES is not None:

    missing_features = [
        name
        for name in MODEL_FEATURE_NAMES
        if name not in feature_df.columns
    ]

    extra_features = [
        name
        for name in feature_df.columns
        if name not in MODEL_FEATURE_NAMES
    ]

    # --------------------------------------------------------
    # Missing feature check
    # --------------------------------------------------------

    if missing_features:

        print(
            "\nERROR: Features expected by model "
            "are missing."
        )

        for name in missing_features:
            print(f"  - {name}")

        sys.exit(1)

    # --------------------------------------------------------
    # Extra feature check
    # --------------------------------------------------------

    if extra_features:

        print(
            "\nWARNING: Extra features detected:"
        )

        for name in extra_features:
            print(f"  - {name}")

    # --------------------------------------------------------
    # EXACT MODEL ORDER
    # --------------------------------------------------------

    feature_df = feature_df[
        MODEL_FEATURE_NAMES
    ]

    print(
        "\nFeature order aligned to model."
    )


# ============================================================
# NUMERICAL VALIDATION
# ============================================================

feature_values = feature_df.to_numpy(
    dtype=float
)

if not np.all(np.isfinite(feature_values)):

    print(
        "\nERROR: Feature vector contains "
        "NaN or infinite values."
    )

    bad_features = feature_df.columns[
        ~np.isfinite(feature_values[0])
    ]

    print(
        "\nBad features:"
    )

    for name in bad_features:
        print(f"  - {name}")

    sys.exit(1)


# ============================================================
# DISPLAY FEATURE VECTOR
# ============================================================

print_separator()
print("FEATURE VECTOR")
print_separator()

for name in feature_df.columns:

    value = feature_df.iloc[0][name]

    print(
        f"{name:<35} {value:.8f}"
    )


# ============================================================
# XGBOOST PREDICTION
# ============================================================

print_separator()
print("XGBOOST PREDICTION")
print_separator()

try:

    probability = model.predict_proba(
        feature_df
    )[0]

except Exception as e:

    print(
        "\nERROR during model prediction:"
    )

    print(e)

    sys.exit(1)


# ============================================================
# GET N2 PROBABILITY
# ============================================================

# For binary XGBoost:
#
# classes_ normally contains [0, 1]
#
# 1 = N2
# 0 = Non-N2

if hasattr(model, "classes_"):

    classes = list(model.classes_)

    if 1 not in classes:

        print(
            "\nERROR: Model does not contain "
            "class 1 (N2)."
        )

        print(
            f"Model classes: {classes}"
        )

        sys.exit(1)

    n2_index = classes.index(1)

else:

    # Standard binary classifier fallback
    n2_index = 1


n2_probability = float(
    probability[n2_index]
)

non_n2_probability = 1.0 - n2_probability


# ============================================================
# PREDICTION
# ============================================================

prediction = int(
    model.predict(feature_df)[0]
)

prediction_text = (
    "N2"
    if prediction == 1
    else "Non-N2"
)


# ============================================================
# GROUND TRUTH
# ============================================================

# DREAMT has a sleep stage for each row.
#
# Because the epoch is 30 seconds, the stage should be
# consistent within the epoch in the normal DREAMT labels.

stage_values = epoch_df["Sleep_Stage"].dropna()

if len(stage_values) == 0:

    actual_stage = "Missing"
    actual_label = None

else:

    # Most common stage in this 30-sec epoch
    actual_stage_raw = stage_values.mode().iloc[0]

    actual_stage = stage_name(
        actual_stage_raw
    )

    actual_label = convert_stage_to_label(
        actual_stage_raw
    )


# ============================================================
# CHECK STAGE CONSISTENCY
# ============================================================

unique_stages = []

for value in stage_values.unique():

    unique_stages.append(
        stage_name(value)
    )

unique_stages = sorted(
    set(unique_stages)
)

if len(unique_stages) > 1:

    print(
        "\nWARNING: Multiple sleep stages found "
        "inside this 30-second epoch:"
    )

    print(
        unique_stages
    )


# ============================================================
# CORRECT / WRONG
# ============================================================

if actual_label is None:

    correct = None

else:

    correct = (
        prediction == actual_label
    )


# ============================================================
# FINAL RESULT
# ============================================================

print_separator()
print("RESULT")
print_separator()

print(
    f"\nSubject            : {SUBJECT_ID}"
)

print(
    f"Epoch              : {EPOCH_NUMBER}"
)

print(
    f"Duration            : 30 seconds"
)

print(
    f"\nN2 probability      : "
    f"{n2_probability * 100:.2f}%"
)

print(
    f"Non-N2 probability  : "
    f"{non_n2_probability * 100:.2f}%"
)

print(
    f"\nPrediction          : "
    f"{prediction_text}"
)

print(
    f"Ground truth        : "
    f"{actual_stage}"
)

if actual_label is not None:

    print(
        f"Actual binary label : "
        f"{actual_label}"
    )

    print(
        f"Correct             : "
        f"{'YES' if correct else 'NO'}"
    )

else:

    print(
        "Correct             : UNKNOWN"
    )


# ============================================================
# FINAL STATUS
# ============================================================

print_separator()

if correct is True:

    print(
        "REPLAY RESULT: CORRECT"
    )

elif correct is False:

    print(
        "REPLAY RESULT: INCORRECT"
    )

else:

    print(
        "REPLAY RESULT: NO GROUND TRUTH"
    )

print_separator()