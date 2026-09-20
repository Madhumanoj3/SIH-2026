import os
import sys
import joblib
import numpy as np
import pandas as pd
from pathlib import Path

from scipy.signal import butter, sosfiltfilt, welch


# ============================================================
# SMARTSENSE REST MODE
# MULTI-EPOCH DREAMT REPLAY
#
# Raw EEG + EOG
#       ↓
# 30-second windows
#       ↓
# 32 features
#       ↓
# XGBoost
#       ↓
# N2 / Non-N2
# ============================================================


# ============================================================
# PATHS
# ============================================================

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent

# Final model now lives at Rest Mode/models/rest_mode_n2.joblib (was
# scripts/models/xgboost_n2.joblib before the Phase 3 cleanup).
MODEL_PATH = os.path.join(
    PROJECT_DIR,
    "models",
    "rest_mode_n2.joblib"
)

RAW_FILE = os.path.join(
    PROJECT_DIR,
    "dataset",
    "dreamt-dataset-for-real-time-sleep-stage-estimation-using-multisensor-wearable-technology-2.2.0",
    "data_100Hz",
    "S002_PSG_df.csv"
)


# ============================================================
# SETTINGS
# ============================================================

FS = 100

EPOCH_SECONDS = 30

SAMPLES_PER_EPOCH = FS * EPOCH_SECONDS

EEG_CHANNEL = "C4-M1"

EOG_CHANNEL_1 = "E1"

EOG_CHANNEL_2 = "E2"


# ------------------------------------------------------------
# CHANGE THESE TO CONTROL THE REPLAY
# ------------------------------------------------------------

START_EPOCH = 100

NUMBER_OF_EPOCHS = 50


# ============================================================
# FILTER
# ============================================================

def bandpass_filter(signal, lowcut, highcut, fs, order=4):

    sos = butter(
        order,
        [lowcut, highcut],
        btype="bandpass",
        fs=fs,
        output="sos"
    )

    return sosfiltfilt(sos, signal)


# ============================================================
# BAND POWER
# ============================================================

def band_power(signal, fs, low, high):

    frequencies, powers = welch(
        signal,
        fs=fs,
        nperseg=min(len(signal), fs * 4)
    )

    mask = (
        (frequencies >= low) &
        (frequencies <= high)
    )

    if not np.any(mask):

        return 0.0

    return np.trapezoid(
        powers[mask],
        frequencies[mask]
    )


# ============================================================
# BASIC FEATURES
# ============================================================

def basic_features(signal):

    return {

        "mean": np.mean(signal),

        "std": np.std(signal),

        "variance": np.var(signal),

        "rms": np.sqrt(
            np.mean(signal ** 2)
        ),

        "min": np.min(signal),

        "max": np.max(signal),

        "range": np.ptp(signal),

        "energy": np.sum(
            signal ** 2
        )
    }


# ============================================================
# SPECTRAL ENTROPY
# ============================================================

def spectral_entropy(signal, fs):

    frequencies, powers = welch(
        signal,
        fs=fs,
        nperseg=min(len(signal), fs * 4)
    )

    total_power = np.sum(powers)

    if total_power <= 0:

        return 0.0

    probabilities = powers / total_power

    probabilities = probabilities[
        probabilities > 0
    ]

    return -np.sum(
        probabilities *
        np.log2(probabilities)
    )


# ============================================================
# ZERO CROSSINGS
# ============================================================

def zero_crossings(signal):

    signal = signal - np.mean(signal)

    return np.sum(
        signal[:-1] *
        signal[1:] < 0
    )


# ============================================================
# EXTRACT 32 FEATURES
# ============================================================

def extract_features(eeg, eog):

    features = {}

    # ========================================================
    # EEG
    # ========================================================

    eeg_delta = band_power(
        eeg,
        FS,
        0.5,
        4
    )

    eeg_theta = band_power(
        eeg,
        FS,
        4,
        8
    )

    eeg_alpha = band_power(
        eeg,
        FS,
        8,
        13
    )

    eeg_beta = band_power(
        eeg,
        FS,
        13,
        30
    )

    total_eeg_power = (
        eeg_delta +
        eeg_theta +
        eeg_alpha +
        eeg_beta
    )

    features[
        "eeg_delta_power"
    ] = eeg_delta

    features[
        "eeg_theta_power"
    ] = eeg_theta

    features[
        "eeg_alpha_power"
    ] = eeg_alpha

    features[
        "eeg_beta_power"
    ] = eeg_beta

    if total_eeg_power > 0:

        features[
            "eeg_delta_relative"
        ] = eeg_delta / total_eeg_power

        features[
            "eeg_theta_relative"
        ] = eeg_theta / total_eeg_power

        features[
            "eeg_alpha_relative"
        ] = eeg_alpha / total_eeg_power

        features[
            "eeg_beta_relative"
        ] = eeg_beta / total_eeg_power

    else:

        features[
            "eeg_delta_relative"
        ] = 0

        features[
            "eeg_theta_relative"
        ] = 0

        features[
            "eeg_alpha_relative"
        ] = 0

        features[
            "eeg_beta_relative"
        ] = 0

    features[
        "eeg_theta_alpha_ratio"
    ] = eeg_theta / max(
        eeg_alpha,
        1e-12
    )

    features[
        "eeg_theta_beta_ratio"
    ] = eeg_theta / max(
        eeg_beta,
        1e-12
    )

    features[
        "eeg_delta_theta_ratio"
    ] = eeg_delta / max(
        eeg_theta,
        1e-12
    )

    features[
        "eeg_spectral_entropy"
    ] = spectral_entropy(
        eeg,
        FS
    )

    eeg_basic = basic_features(
        eeg
    )

    for key, value in eeg_basic.items():

        features[
            f"eeg_{key}"
        ] = value


    # ========================================================
    # EOG
    # ========================================================

    eog_basic = basic_features(
        eog
    )

    for key, value in eog_basic.items():

        features[
            f"eog_{key}"
        ] = value

    eog_low = band_power(
        eog,
        FS,
        0.1,
        4
    )

    features[
        "eog_low_frequency_power"
    ] = eog_low

    total_eog_power = band_power(
        eog,
        FS,
        0.1,
        10
    )

    features[
        "eog_low_frequency_relative"
    ] = (
        eog_low /
        max(
            total_eog_power,
            1e-12
        )
    )

    features[
        "eog_spectral_entropy"
    ] = spectral_entropy(
        eog,
        FS
    )

    features[
        "eog_zero_crossings"
    ] = zero_crossings(
        eog
    )

    return features


# ============================================================
# START
# ============================================================

print("=" * 80)

print(
    "SMARTSENSE REST MODE - "
    "MULTI-EPOCH REPLAY"
)

print("=" * 80)


# ============================================================
# LOAD MODEL
# ============================================================

print("\nLoading XGBoost model...")

if not os.path.exists(MODEL_PATH):

    print("\nERROR: Model not found:")

    print(MODEL_PATH)

    sys.exit(1)


model = joblib.load(
    MODEL_PATH
)

print("Model loaded successfully.")


# ============================================================
# LOAD RAW DATA
# ============================================================

print("\nLoading DREAMT raw data...")

if not os.path.exists(RAW_FILE):

    print("\nERROR: DREAMT file not found:")

    print(RAW_FILE)

    sys.exit(1)


df = pd.read_csv(
    RAW_FILE
)

print("DREAMT file loaded.")

print(
    f"Total samples: "
    f"{len(df):,}"
)


# ============================================================
# CHECK COLUMNS
# ============================================================

required_columns = [

    EEG_CHANNEL,

    EOG_CHANNEL_1,

    EOG_CHANNEL_2,

    "Sleep_Stage"
]


missing = [

    col

    for col in required_columns

    if col not in df.columns
]


if missing:

    print(
        "\nERROR: Missing columns:"
    )

    print(missing)

    sys.exit(1)


# ============================================================
# CONVERT SIGNALS
# ============================================================

eeg_signal = pd.to_numeric(
    df[EEG_CHANNEL],
    errors="coerce"
)

e1_signal = pd.to_numeric(
    df[EOG_CHANNEL_1],
    errors="coerce"
)

e2_signal = pd.to_numeric(
    df[EOG_CHANNEL_2],
    errors="coerce"
)

sleep_stage = df[
    "Sleep_Stage"
]


# ============================================================
# DETERMINE AVAILABLE EPOCHS
# ============================================================

total_epochs = (
    len(df) //
    SAMPLES_PER_EPOCH
)


print(
    f"Total complete epochs: "
    f"{total_epochs}"
)


if START_EPOCH >= total_epochs:

    print(
        "\nERROR: START_EPOCH is too large."
    )

    sys.exit(1)


end_epoch = min(
    START_EPOCH +
    NUMBER_OF_EPOCHS,

    total_epochs
)


actual_epochs = (
    end_epoch -
    START_EPOCH
)


print(
    f"\nReplay configuration:"
)

print(
    f"Start epoch : "
    f"{START_EPOCH}"
)

print(
    f"End epoch   : "
    f"{end_epoch - 1}"
)

print(
    f"Epochs      : "
    f"{actual_epochs}"
)

print(
    f"Duration    : "
    f"{actual_epochs * 30 / 60:.1f} minutes"
)


# ============================================================
# RESULTS
# ============================================================

results = []


# ============================================================
# PROCESS EPOCHS
# ============================================================

print("\n")

print(
    "Starting replay..."
)

print("-" * 80)

print(
    f"{'Epoch':<8}"
    f"{'N2 Prob':<12}"
    f"{'Prediction':<15}"
    f"{'Actual':<12}"
    f"{'Result'}"
)

print("-" * 80)


for epoch_number in range(
    START_EPOCH,
    end_epoch
):

    # --------------------------------------------------------
    # SAMPLE RANGE
    # --------------------------------------------------------

    start = (
        epoch_number *
        SAMPLES_PER_EPOCH
    )

    end = (
        start +
        SAMPLES_PER_EPOCH
    )


    # --------------------------------------------------------
    # GET EPOCH
    # --------------------------------------------------------

    eeg_epoch = (
        eeg_signal
        .iloc[start:end]
        .copy()
    )

    e1_epoch = (
        e1_signal
        .iloc[start:end]
        .copy()
    )

    e2_epoch = (
        e2_signal
        .iloc[start:end]
        .copy()
    )

    stage_epoch = (
        sleep_stage
        .iloc[start:end]
    )


    # --------------------------------------------------------
    # MISSING VALUES
    # --------------------------------------------------------

    eeg_epoch = (
        eeg_epoch
        .interpolate(
            limit_direction="both"
        )
    )

    e1_epoch = (
        e1_epoch
        .interpolate(
            limit_direction="both"
        )
    )

    e2_epoch = (
        e2_epoch
        .interpolate(
            limit_direction="both"
        )
    )


    eeg_epoch = eeg_epoch.fillna(
        eeg_epoch.median()
    )

    e1_epoch = e1_epoch.fillna(
        e1_epoch.median()
    )

    e2_epoch = e2_epoch.fillna(
        e2_epoch.median()
    )


    # --------------------------------------------------------
    # NUMPY
    # --------------------------------------------------------

    eeg = eeg_epoch.to_numpy(
        dtype=float
    )

    eog = (
        e1_epoch.to_numpy(
            dtype=float
        )
        -
        e2_epoch.to_numpy(
            dtype=float
        )
    )


    # --------------------------------------------------------
    # FILTER
    # --------------------------------------------------------

    eeg = bandpass_filter(
        eeg,
        0.5,
        30,
        FS
    )

    eog = bandpass_filter(
        eog,
        0.1,
        10,
        FS
    )


    # --------------------------------------------------------
    # FEATURES
    # --------------------------------------------------------

    features = extract_features(
        eeg,
        eog
    )


    feature_df = pd.DataFrame(
        [features]
    )


    # --------------------------------------------------------
    # MATCH MODEL FEATURE ORDER
    # --------------------------------------------------------

    if hasattr(
        model,
        "feature_names_in_"
    ):

        expected_features = list(
            model.feature_names_in_
        )

        feature_df = feature_df[
            expected_features
        ]


    # --------------------------------------------------------
    # PREDICTION
    # --------------------------------------------------------

    probabilities = (
        model.predict_proba(
            feature_df
        )[0]
    )

    prediction = int(
        model.predict(
            feature_df
        )[0]
    )


    classes = list(
        model.classes_
    )

    n2_index = classes.index(1)

    n2_probability = (
        probabilities[n2_index]
    )


    # --------------------------------------------------------
    # ACTUAL STAGE
    # --------------------------------------------------------

    ground_truth_stage = (
        stage_epoch
        .mode()[0]
    )

    ground_truth = (
        1
        if ground_truth_stage == "N2"
        else 0
    )


    # --------------------------------------------------------
    # RESULT
    # --------------------------------------------------------

    correct = (
        prediction ==
        ground_truth
    )


    prediction_text = (
        "N2"
        if prediction == 1
        else "Non-N2"
    )


    # --------------------------------------------------------
    # PRINT
    # --------------------------------------------------------

    print(
        f"{epoch_number:<8}"
        f"{n2_probability * 100:>6.2f}%"
        f"{'':<5}"
        f"{prediction_text:<15}"
        f"{ground_truth_stage:<12}"
        f"{'YES' if correct else 'NO'}"
    )


    # --------------------------------------------------------
    # SAVE RESULT
    # --------------------------------------------------------

    results.append({

        "epoch": epoch_number,

        "n2_probability":
            n2_probability,

        "prediction":
            prediction,

        "prediction_text":
            prediction_text,

        "actual_stage":
            ground_truth_stage,

        "actual_label":
            ground_truth,

        "correct":
            correct
    })


# ============================================================
# RESULTS DATAFRAME
# ============================================================

results_df = pd.DataFrame(
    results
)


# ============================================================
# SUMMARY
# ============================================================

accuracy = (
    results_df["correct"]
    .mean()
)


n2_actual = (
    results_df["actual_label"]
    == 1
)


n2_predicted = (
    results_df["prediction"]
    == 1
)


n2_recall = (
    (
        n2_actual &
        n2_predicted
    ).sum()
    /
    max(
        n2_actual.sum(),
        1
    )
)


print("\n")

print("=" * 80)

print(
    "REPLAY SUMMARY"
)

print("=" * 80)

print(
    f"\nEpochs processed : "
    f"{len(results_df)}"
)

print(
    f"Replay duration  : "
    f"{len(results_df) * 30 / 60:.1f} minutes"
)

print(
    f"\nAccuracy         : "
    f"{accuracy * 100:.2f}%"
)

print(
    f"N2 recall        : "
    f"{n2_recall * 100:.2f}%"
)

print(
    f"\nActual N2 epochs : "
    f"{n2_actual.sum()}"
)

print(
    f"Predicted N2     : "
    f"{n2_predicted.sum()}"
)


# ============================================================
# SAVE RESULTS
# ============================================================

OUTPUT_PATH = os.path.join(

    SCRIPT_DIR,

    "processed",

    "replay_results.csv"
)


results_df.to_csv(
    OUTPUT_PATH,
    index=False
)


print(
    f"\nResults saved to:"
)

print(
    OUTPUT_PATH
)

print("\n")

print("=" * 80)

print(
    "REPLAY COMPLETE"
)

print("=" * 80)