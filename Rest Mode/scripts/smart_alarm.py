import pandas as pd
from pathlib import Path

# ============================================================
# SMART ALARM SETTINGS
# ============================================================

SCRIPT_DIR = Path(__file__).resolve().parent
FILE = str(SCRIPT_DIR / "processed" / "sleep_state_results.csv")

SMART_WINDOW_MINUTES = 5

# 30 seconds per epoch
EPOCH_DURATION_SECONDS = 30

# Require 5 consecutive N2 epochs
REQUIRED_N2_EPOCHS = 3

# N2 confidence threshold
N2_PROBABILITY_THRESHOLD = 0.50


# ============================================================
# LOAD RESULTS
# ============================================================

df = pd.read_csv(FILE)

df = df.sort_values("epoch").reset_index(drop=True)

print("=" * 60)
print("SMART ALARM - WAKE DURING N2")
print("=" * 60)

print(f"Total epochs: {len(df)}")
print(f"Smart window length: {SMART_WINDOW_MINUTES} minutes")


# ============================================================
# CALCULATE SMART WINDOW
# ============================================================

epochs_in_window = int(
    SMART_WINDOW_MINUTES * 60 / EPOCH_DURATION_SECONDS
)

# For a replay, the final N minutes represent the smart wake window
window_start_index = max(0, len(df) - epochs_in_window)

window_df = df.iloc[window_start_index:].copy()

window_start_epoch = window_df.iloc[0]["epoch"]
window_end_epoch = window_df.iloc[-1]["epoch"]

print(f"Smart window epochs: {len(window_df)}")
print(f"Window starts: epoch {window_start_epoch}")
print(f"Window ends: epoch {window_end_epoch}")


# ============================================================
# DISPLAY TIME RANGE
# ============================================================

def epoch_to_time(epoch):
    """
    Convert epoch number into replay time.
    Epoch 0 = 00:00
    Each epoch = 30 seconds.
    """

    total_seconds = int(epoch) * EPOCH_DURATION_SECONDS

    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


print(
    f"Time range: "
    f"{epoch_to_time(window_start_epoch)} - "
    f"{epoch_to_time(window_end_epoch)}"
)

print("=" * 60)


# ============================================================
# SMART N2 DETECTION
# ============================================================

consecutive_n2 = 0
alarm_triggered = False
alarm_epoch = None


for _, row in window_df.iterrows():

    epoch = int(row["epoch"])

    raw_probability = float(row["n2_probability"])
    smoothed_probability = float(row["smoothed_n2_probability"])
    temporal_state = str(row["smoothed_state"])

    # --------------------------------------------------------
    # N2 CONDITION
    # --------------------------------------------------------

    is_n2 = (
        temporal_state == "N2"
        and
        smoothed_probability >= N2_PROBABILITY_THRESHOLD
    )

    # --------------------------------------------------------
    # COUNT CONSECUTIVE N2
    # --------------------------------------------------------

    if is_n2:

        consecutive_n2 += 1

    else:

        # N2 broken -> RESET
        consecutive_n2 = 0


    # --------------------------------------------------------
    # CHECK ALARM CONDITION
    # --------------------------------------------------------

    if consecutive_n2 >= REQUIRED_N2_EPOCHS:

        alarm_triggered = True
        alarm_epoch = epoch

        print()
        print("SMART N2 ALARM TRIGGERED")
        print("-" * 60)

        print(f"Alarm epoch: {epoch}")
        print(f"Alarm time: {epoch_to_time(epoch)}")

        print(
            f"Raw N2 probability: "
            f"{raw_probability * 100:.2f}%"
        )

        print(
            f"Smoothed N2 probability: "
            f"{smoothed_probability * 100:.2f}%"
        )

        print(
            f"Consecutive N2 epochs: "
            f"{consecutive_n2}"
        )

        print(f"Temporal state: {temporal_state}")

        print(
            f"Reason: {REQUIRED_N2_EPOCHS} consecutive "
            f"N2 epochs confirmed inside smart window"
        )

        print("-" * 60)

        break


# ============================================================
# HARD ALARM FALLBACK
# ============================================================

if not alarm_triggered:

    print()
    print("WARNING: NO SUITABLE N2 FOUND")
    print("-" * 60)

    print(
        "No sequence of "
        f"{REQUIRED_N2_EPOCHS} consecutive N2 epochs "
        "was found inside the smart wake window."
    )

    print()
    print("HARD ALARM")
    print("Reason: Smart wake window expired.")

    print("-" * 60)

    alarm_type = "HARD_ALARM"

else:

    alarm_type = "SMART_N2_ALARM"


# ============================================================
# SUMMARY
# ============================================================

print()
print("=" * 60)
print("SMART ALARM SUMMARY")
print("=" * 60)

if alarm_triggered:

    print("Alarm type      : SMART N2 ALARM")
    print(f"Alarm epoch     : {alarm_epoch}")
    print(f"Alarm time      : {epoch_to_time(alarm_epoch)}")

else:

    print("Alarm type      : HARD ALARM")
    print("Alarm time      : Target wake time")


print(f"Smart window    : {SMART_WINDOW_MINUTES} minutes")
print(f"N2 requirement  : {REQUIRED_N2_EPOCHS} consecutive epochs")
print(
    f"N2 duration     : "
    f"{REQUIRED_N2_EPOCHS * EPOCH_DURATION_SECONDS / 60:.1f} minutes"
)

print("=" * 60)