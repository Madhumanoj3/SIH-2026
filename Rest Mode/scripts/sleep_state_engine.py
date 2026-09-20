import os
import pandas as pd
import numpy as np
from pathlib import Path


# ============================================================
# SMARTSENSE REST MODE
# TEMPORAL SLEEP STATE ENGINE
#
# Input:
#   replay_results.csv
#
# Output:
#   Smoothed N2 / Non-N2 state
# ============================================================


SCRIPT_DIR = Path(__file__).resolve().parent

INPUT_FILE = os.path.join(
    SCRIPT_DIR,
    "processed",
    "replay_results.csv"
)

OUTPUT_FILE = os.path.join(
    SCRIPT_DIR,
    "processed",
    "sleep_state_results.csv"
)


# ============================================================
# SETTINGS
# ============================================================

# Number of recent 30-second windows used for smoothing
WINDOW_SIZE = 5

# Probability above this value means N2
N2_THRESHOLD = 0.50

# Minimum number of N2 windows required
# inside the smoothing window
MIN_N2_WINDOWS = 3


# ============================================================
# LOAD RESULTS
# ============================================================

print("=" * 80)
print("SMARTSENSE REST MODE - TEMPORAL SLEEP STATE ENGINE")
print("=" * 80)

print("\nLoading replay results...")

if not os.path.exists(INPUT_FILE):

    print("\nERROR: replay_results.csv not found:")
    print(INPUT_FILE)

    print("\nRun replay_multiple.py first.")

    raise SystemExit


df = pd.read_csv(INPUT_FILE)

print("Replay results loaded.")

print(
    f"Total epochs: {len(df)}"
)


# ============================================================
# CHECK COLUMN
# ============================================================

if "n2_probability" not in df.columns:

    print(
        "\nERROR: n2_probability column not found."
    )

    raise SystemExit


# ============================================================
# TEMPORAL SMOOTHING
# ============================================================

probabilities = df[
    "n2_probability"
].astype(float)


df["smoothed_n2_probability"] = (
    probabilities
    .rolling(
        window=WINDOW_SIZE,
        min_periods=1
    )
    .mean()
)


# ============================================================
# STATE ESTIMATION
# ============================================================

states = []

n2_window_counts = []


for i in range(len(df)):

    # --------------------------------------------------------
    # Get recent probabilities
    # --------------------------------------------------------

    start = max(
        0,
        i - WINDOW_SIZE + 1
    )

    recent = probabilities[
        start:i + 1
    ]


    # --------------------------------------------------------
    # Count N2 predictions
    # --------------------------------------------------------

    n2_count = (
        recent >= N2_THRESHOLD
    ).sum()


    n2_window_counts.append(
        n2_count
    )


    # --------------------------------------------------------
    # Smoothed probability
    # --------------------------------------------------------

    smoothed_probability = (
        recent.mean()
    )


    # --------------------------------------------------------
    # Determine state
    # --------------------------------------------------------

    if (
        smoothed_probability >= N2_THRESHOLD
        and
        n2_count >= MIN_N2_WINDOWS
    ):

        state = "N2"

    else:

        state = "Non-N2"


    states.append(state)


df[
    "recent_n2_windows"
] = n2_window_counts


df[
    "smoothed_state"
] = states


# ============================================================
# STATE CHANGES
# ============================================================

state_changes = []

previous_state = None


for state in states:

    if previous_state is None:

        state_changes.append(
            "START"
        )

    elif state != previous_state:

        state_changes.append(
            "STATE_CHANGE"
        )

    else:

        state_changes.append(
            ""
        )

    previous_state = state


df[
    "state_event"
] = state_changes


# ============================================================
# DISPLAY
# ============================================================

print("\n")

print("=" * 80)

print(
    "TEMPORAL SLEEP STATE"
)

print("=" * 80)

print(
    f"\nSmoothing window : "
    f"{WINDOW_SIZE} epochs"
)

print(
    f"Window duration  : "
    f"{WINDOW_SIZE * 30} seconds"
)

print(
    f"N2 threshold     : "
    f"{N2_THRESHOLD * 100:.0f}%"
)

print(
    f"Minimum N2 windows: "
    f"{MIN_N2_WINDOWS}"
)


print("\n")

print(
    f"{'Epoch':<8}"
    f"{'Raw N2':<12}"
    f"{'Smoothed':<14}"
    f"{'N2 Windows':<13}"
    f"{'State':<12}"
    f"{'Event'}"
)

print("-" * 80)


for _, row in df.iterrows():

    probability = (
        row["n2_probability"]
    )

    smoothed = (
        row["smoothed_n2_probability"]
    )

    n2_count = int(
        row["recent_n2_windows"]
    )

    state = row[
        "smoothed_state"
    ]

    event = row[
        "state_event"
    ]


    print(
        f"{int(row['epoch']):<8}"
        f"{probability * 100:>6.2f}%"
        f"{'':<5}"
        f"{smoothed * 100:>6.2f}%"
        f"{'':<7}"
        f"{n2_count:<13}"
        f"{state:<12}"
        f"{event}"
    )


# ============================================================
# SUMMARY
# ============================================================

n2_epochs = (
    df["smoothed_state"]
    == "N2"
).sum()


non_n2_epochs = (
    df["smoothed_state"]
    == "Non-N2"
).sum()


state_changes_total = (
    df["state_event"]
    == "STATE_CHANGE"
).sum()


print("\n")

print("=" * 80)

print(
    "STATE ENGINE SUMMARY"
)

print("=" * 80)

print(
    f"\nTotal epochs       : "
    f"{len(df)}"
)

print(
    f"N2 state epochs    : "
    f"{n2_epochs}"
)

print(
    f"Non-N2 state epochs: "
    f"{non_n2_epochs}"
)

print(
    f"State changes      : "
    f"{state_changes_total}"
)


if len(df) > 0:

    print(
        f"\nTime represented   : "
        f"{len(df) * 30 / 60:.1f} minutes"
    )


# ============================================================
# SAVE
# ============================================================

df.to_csv(
    OUTPUT_FILE,
    index=False
)


print(
    "\nResults saved to:"
)

print(
    OUTPUT_FILE
)


print("\n")

print("=" * 80)

print(
    "STATE ENGINE COMPLETE"
)

print("=" * 80)