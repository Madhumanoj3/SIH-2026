"""
DD Continuous Vigilance - Phase 3: construct multiple honest continuous
targets from the stored event-distance/count columns (never from
performance feedback on any held-out subject - all hyperparameters below
are fixed a priori from the event-timing analysis done earlier in this
project, not tuned against LOSO test results).

Targets (100 = vigilant, 0 = drowsy; Phase 4 orientation):

  A_H  (bounded linear distance-to-event, bidirectional):
       d(t) = min_i |t - event_i|
       vigilance(t) = 100 * min(d(t), H) / H
       H tested at 60, 120, 180 s (fixed a priori)

  B_tau (exponential proximity, bidirectional):
       drowsiness(t) = exp(-d(t)/tau)
       vigilance(t) = 100 * (1 - drowsiness(t))
       tau tested at 30, 60, 90 s (fixed a priori)

  C_sigma (Gaussian proximity, bidirectional):
       drowsiness(t) = exp(-d(t)^2 / (2*sigma^2))
       vigilance(t) = 100 * (1 - drowsiness(t))
       sigma tested at 30, 60, 90 s (fixed a priori)

  D (causal trailing event density - the only target that never looks
     into the future, using only events at or before window center):
       count(t) = # events in [t-300s, t]
       vigilance(t) = 100 * (1 - min(count(t), 3) / 3)
       cap=3 and lookback=300s fixed a priori (p90 inter-event gap was
       365s in the earlier timing analysis; 300s and a 3-event cap keep
       this in the same ballpark without tuning on any performance
       metric).

All of A/B/C use FUTURE event timestamps to build the label - this is
documented explicitly and is NEVER done for the input features (see
dd_vigilance_features.py, which stores only signal-derived features plus
underscore-prefixed non-feature columns).
"""
import numpy as np
import pandas as pd
from pathlib import Path
import json
import sys

IN_DIR = Path("processed/dd_continuous_vigilance")


def build_targets(df):
    d = df["_dist_to_event_bidirectional_s"].values

    targets = {}
    for H in (60, 120, 180):
        targets[f"target_A_{H}"] = 100.0 * np.minimum(d, H) / H

    for tau in (30, 60, 90):
        drowsy = np.exp(-d / tau)
        targets[f"target_B_{tau}"] = 100.0 * (1 - drowsy)

    for sigma in (30, 60, 90):
        drowsy = np.exp(-(d ** 2) / (2 * sigma ** 2))
        targets[f"target_C_{sigma}"] = 100.0 * (1 - drowsy)

    count = df["_trailing_event_count_300s"].values
    cap = 3
    targets["target_D_causal"] = 100.0 * (1 - np.minimum(count, cap) / cap)

    for name, vals in targets.items():
        df[name] = vals
    return df


def main():
    window_seconds = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    in_path = IN_DIR / f"features_w{window_seconds}.csv"
    df = pd.read_csv(in_path)
    df = build_targets(df)

    target_cols = [c for c in df.columns if c.startswith("target_")]
    print(f"Built {len(target_cols)} target variants: {target_cols}")

    print("\nTarget summary statistics:")
    print(df[target_cols].describe().T[["mean", "std", "min", "25%", "50%", "75%", "max"]])

    out_path = IN_DIR / f"features_with_targets_w{window_seconds}.csv"
    df.to_csv(out_path, index=False)
    print(f"\nSaved: {out_path}  shape={df.shape}")

    defs = {
        "orientation": "100 = highly vigilant, 0 = highly drowsy",
        "A": "vigilance=100*min(d,H)/H ; H in {60,120,180}s ; d=bidirectional distance to nearest self-report event",
        "B": "vigilance=100*(1-exp(-d/tau)) ; tau in {30,60,90}s",
        "C": "vigilance=100*(1-exp(-d^2/(2*sigma^2))) ; sigma in {30,60,90}s",
        "D": "vigilance=100*(1-min(count_trailing_300s,3)/3) ; causal, no future info",
        "note": "A/B/C use future event timestamps for LABEL construction only (documented, offline, never used as an input feature). D is fully causal.",
    }
    with open(IN_DIR / f"target_definitions_w{window_seconds}.json", "w") as fh:
        json.dump(defs, fh, indent=2)
    print(f"Saved: {IN_DIR/f'target_definitions_w{window_seconds}.json'}")


if __name__ == "__main__":
    main()
