"""Streaming adaptation of the existing Rest Mode temporal state + smart-alarm
logic (Rest Mode/scripts/sleep_state_engine.py and smart_alarm.py), which
were originally written as batch CSV scripts. Same constants, same
thresholds, same decision rules — just restructured to consume one new
epoch's n2_probability at a time instead of a whole CSV. No new alarm
algorithm is introduced.
"""

from collections import deque

# Identical to sleep_state_engine.py
WINDOW_SIZE = 5
N2_THRESHOLD = 0.50
MIN_N2_WINDOWS = 3

# Identical to smart_alarm.py
REQUIRED_CONSECUTIVE_N2 = 3


class RestStateEngine:
    def __init__(self):
        self._recent_probs: deque[float] = deque(maxlen=WINDOW_SIZE)
        self._consecutive_n2 = 0

    def update(self, n2_probability: float) -> dict:
        self._recent_probs.append(n2_probability)

        smoothed = sum(self._recent_probs) / len(self._recent_probs)
        n2_count = sum(1 for p in self._recent_probs if p >= N2_THRESHOLD)

        smoothed_state = "N2" if (smoothed >= N2_THRESHOLD and n2_count >= MIN_N2_WINDOWS) else "Non-N2"

        self._consecutive_n2 = self._consecutive_n2 + 1 if smoothed_state == "N2" else 0
        smart_alarm = self._consecutive_n2 >= REQUIRED_CONSECUTIVE_N2

        return {
            "smoothed_n2_probability": smoothed,
            "smoothed_state": smoothed_state,
            "consecutive_n2": self._consecutive_n2,
            "smart_alarm": smart_alarm,
        }
