"""
DD Continuous Vigilance - Phases 2, 5, 6: feature extraction.

Input signals: C4-Ref (EEG) and LOC-Ref - ROC-Ref (bipolar horizontal
EOG proxy) ONLY. No C3/O1/O2/ECG. No annotation-derived value is
included as a feature - only window_center and distance/count
ingredients are stored alongside, clearly separated, for later (offline)
target construction in a separate script.

Usage: python scripts/dd_vigilance_features.py <window_seconds>
"""
import sys
import mne
import pyedflib
import numpy as np
import pandas as pd
from pathlib import Path
from scipy.signal import welch

DATASET_DIR = Path("dataset")
OUT_DIR = Path("processed/dd_continuous_vigilance")
OUT_DIR.mkdir(parents=True, exist_ok=True)

FS = 128
EEG_CH = "C4-Ref"
EOG_CH_A = "LOC-Ref"
EOG_CH_B = "ROC-Ref"

BANDS = {"delta": (0.5, 4), "theta": (4, 8), "alpha": (8, 13), "beta": (13, 30)}


def band_power(sig, fs, lo, hi):
    f, p = welch(sig, fs=fs, nperseg=min(len(sig), fs * 4))
    mask = (f >= lo) & (f <= hi)
    return float(np.trapezoid(p[mask], f[mask])) if np.any(mask) else 0.0


def spectral_entropy(sig, fs, lo, hi):
    f, p = welch(sig, fs=fs, nperseg=min(len(sig), fs * 4))
    mask = (f >= lo) & (f <= hi)
    p = p[mask]
    p = p / (p.sum() + 1e-12)
    p = p[p > 0]
    return float(-np.sum(p * np.log2(p)) / np.log2(len(p) + 1e-12)) if len(p) > 1 else 0.0


def zcr(sig):
    signs = np.sign(sig)
    signs[signs == 0] = 1
    return float(np.sum(signs[:-1] != signs[1:]) / len(sig))


def eeg_features(sig, fs):
    feats = {
        "eeg_mean": float(np.mean(sig)),
        "eeg_std": float(np.std(sig)),
        "eeg_var": float(np.var(sig)),
        "eeg_rms": float(np.sqrt(np.mean(sig ** 2))),
        "eeg_range": float(np.max(sig) - np.min(sig)),
    }
    powers = {b: band_power(sig, fs, *r) for b, r in BANDS.items()}
    total = sum(powers.values()) + 1e-12
    feats["eeg_total_power"] = total
    for b in BANDS:
        feats[f"eeg_{b}_power"] = powers[b]
        feats[f"eeg_rel_{b}"] = powers[b] / total
    feats["eeg_theta_alpha"] = powers["theta"] / (powers["alpha"] + 1e-10)
    feats["eeg_theta_beta"] = powers["theta"] / (powers["beta"] + 1e-10)
    feats["eeg_spectral_entropy"] = spectral_entropy(sig, fs, 0.5, 40)
    return feats


def detect_blinks(sig, fs, k=3.0, min_gap_s=0.2):
    abs_sig = np.abs(sig - np.median(sig))
    thr = k * np.std(sig)
    above = abs_sig > thr
    n = len(above)
    blinks, i = [], 0
    while i < n:
        if above[i]:
            j = i
            while j < n and above[j]:
                j += 1
            blinks.append((i, j))
            i = j
        else:
            i += 1
    merged = []
    min_gap = int(min_gap_s * fs)
    for b in blinks:
        if merged and b[0] - merged[-1][1] < min_gap:
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(b)
    durations = [(e - s) / fs for s, e in merged]
    return len(merged), durations


def eog_features(sig, fs, window_seconds):
    feats = {
        "eog_mean": float(np.mean(sig)),
        "eog_std": float(np.std(sig)),
        "eog_rms": float(np.sqrt(np.mean(sig ** 2))),
        "eog_var": float(np.var(sig)),
        "eog_amplitude": float(np.max(sig) - np.min(sig)),
        "eog_zcr": zcr(sig),
        "eog_lowfreq_power": band_power(sig, fs, 0.1, 1.0),
        "eog_spectral_entropy": spectral_entropy(sig, fs, 0.1, 15),
    }
    n_blinks, durations = detect_blinks(sig, fs)
    feats["eog_blink_count"] = n_blinks
    feats["eog_blink_rate_per_min"] = n_blinks / window_seconds * 60.0
    feats["eog_blink_duration_mean"] = float(np.mean(durations)) if durations else 0.0
    return feats


def process_recording(signal_file, annotation_file, window_seconds):
    recording = signal_file.stem
    f = pyedflib.EdfReader(str(annotation_file))
    onsets, _, _ = f.readAnnotations()
    f.close()
    onsets = np.sort(np.asarray(onsets, dtype=float))

    raw = mne.io.read_raw_edf(signal_file, preload=True, verbose=False)
    raw.pick([EEG_CH, EOG_CH_A, EOG_CH_B])
    raw.filter(l_freq=0.5, h_freq=40, picks=[EEG_CH], verbose=False)
    raw.filter(l_freq=0.1, h_freq=15, picks=[EOG_CH_A, EOG_CH_B], verbose=False)

    data = raw.get_data()
    idx = {c: i for i, c in enumerate(raw.ch_names)}
    eeg = data[idx[EEG_CH]]
    loc_roc = data[idx[EOG_CH_A]] - data[idx[EOG_CH_B]]

    duration = raw.times[-1]
    n_samp = int(window_seconds * FS)

    rows = []
    start = 0.0
    while start + window_seconds <= duration:
        stop = start + window_seconds
        s_idx = int(start * FS)
        e_idx = s_idx + n_samp
        eeg_win = eeg[s_idx:e_idx]
        eog_win = loc_roc[s_idx:e_idx]
        if len(eeg_win) < n_samp:
            break

        center = (start + stop) / 2.0
        dist_bidirectional = float(np.min(np.abs(onsets - center))) if len(onsets) else np.inf
        # causal trailing counts at several lookback horizons, for target D
        trailing_counts = {
            w: int(np.sum((onsets <= center) & (onsets >= center - w)))
            for w in (60, 180, 300)
        }

        row = {
            "recording": recording,
            "start": start,
            "stop": stop,
            "window_center": center,
            "_dist_to_event_bidirectional_s": dist_bidirectional,
            "_trailing_event_count_60s": trailing_counts[60],
            "_trailing_event_count_180s": trailing_counts[180],
            "_trailing_event_count_300s": trailing_counts[300],
        }
        row.update(eeg_features(eeg_win, FS))
        row.update(eog_features(eog_win, FS, window_seconds))
        rows.append(row)
        start += window_seconds

    return pd.DataFrame(rows)


def main():
    window_seconds = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    print(f"Building features for window_seconds={window_seconds}")

    signal_files = sorted(f for f in DATASET_DIR.glob("*.edf") if "annotations" not in f.name)
    all_dfs = []
    for sf in signal_files:
        af = DATASET_DIR / f"{sf.stem}_annotations.edf"
        print(f"  {sf.name} ...")
        df = process_recording(sf, af, window_seconds)
        all_dfs.append(df)

    full = pd.concat(all_dfs, ignore_index=True)
    full["subject"] = full["recording"].str[:2]
    full["trial"] = full["recording"].str[-1]

    before = len(full)
    full = full.replace([np.inf, -np.inf], np.nan)
    # keep _dist_to_event_bidirectional_s = inf only possible if zero events (never happens here);
    # drop rows with NaN features only (not the leakage/meta columns)
    feature_cols = [c for c in full.columns if not c.startswith("_") and c not in
                    ("recording", "start", "stop", "window_center", "subject", "trial")]
    full = full.dropna(subset=feature_cols)
    print(f"Dropped {before - len(full)} rows with inf/NaN in features ({len(full)} remain)")

    out_path = OUT_DIR / f"features_w{window_seconds}.csv"
    full.to_csv(out_path, index=False)
    print(f"Saved: {out_path}  shape={full.shape}")


if __name__ == "__main__":
    main()
