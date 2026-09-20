# SmartSense SIH-26 — Handoff Document

Written at the end of a cleanup + packaging session. Read this before touching anything.
Prior reports with full detail/evidence trails: `PROJECT_CLEANUP_AUDIT.md`, `PROJECT_CLEANUP_PHASE3_REPORT.md`, `FINAL_MODEL_PACKAGING_REPORT.md`.

---

## 1. Current project structure

```
SIH-26/
├── models/
│   └── smartsense_models.pkl          <- combined bundle, both modes
│
├── Rest Mode/
│   ├── dataset/                        DREAMT dataset, ~101GB, untouched, do not move
│   ├── models/
│   │   ├── rest_mode_n2.joblib         <- FINAL Rest Mode model
│   │   └── rest_mode_metadata.json
│   └── scripts/
│       ├── feature_extractor.py        canonical 32-feature extraction (imported)
│       ├── replay_test.py              single-epoch smoke test
│       ├── replay_multiple.py          multi-epoch batch replay (own duplicate feature code, see §15)
│       ├── sleep_state_engine.py        temporal smoothing
│       ├── smart_alarm.py              wake-during-N2 alarm logic
│       ├── models/                     now empty (original model archived, see §16)
│       └── processed/{train.csv, test.csv, dreamt_features_all.csv, ...}
│
├── Drive Mode/
│   ├── .venv/                          Python 3.11.9, has xgboost/sklearn/mne/pyedflib/etc.
│   ├── dataset/                        DROZY/DD-Database, single canonical copy, untouched
│   ├── models/
│   │   ├── drozy_xgboost_vigilance.joblib  <- FINAL Drive Mode model
│   │   ├── drozy_scaler.joblib
│   │   └── drozy_model_metadata.json
│   ├── processed/dd_continuous_vigilance/features_with_targets_w8.csv
│   ├── results/dd_continuous_vigilance/    (final research/provenance record, 14 files incl. FINAL_REPORT.md)
│   └── scripts/
│       ├── predict_vigilance.py        batch inference CLI
│       ├── realtime_simulator.py       streaming demo (loads a real EDF, simulates live)
│       ├── vigilance_trend.py          smoothing/trend/alarm engine
│       ├── train_deployment_model.py   reproduces the exact deployed model
│       ├── dd_vigilance_features.py    canonical 28-feature extraction (imported)
│       ├── dd_vigilance_targets.py     target construction (imported by test harness)
│       └── test_deployment_pipeline.py end-to-end self-test
│
├── archive/                            everything superseded/research-tier, hash-verified, nothing deleted
│   ├── _manifests/                     JSON hash logs of every move this session
│   ├── raw_downloads/                  DROZY zip + duplicate extracted folder
│   ├── drive_mode_experiments/         26 research scripts + ~55 research data files
│   └── rest_mode_experiments/          13 research scripts, non-final models, eval CSVs,
│                                        original xgboost_n2.joblib (archive/.../models/original_model/)
│
├── PROJECT_CLEANUP_AUDIT.md
├── PROJECT_CLEANUP_PHASE3_REPORT.md
├── FINAL_MODEL_PACKAGING_REPORT.md
└── CLAUDE_HANDOFF.md                   (this file)
```

---

## 2. Rest Mode — final model

- **Model**: `Rest Mode/models/rest_mode_n2.joblib` — `XGBClassifier`, binary (N2 = 1, non-N2 = 0)
- **Metadata**: `Rest Mode/models/rest_mode_metadata.json`
- **Byte-identical original**, preserved: `archive/rest_mode_experiments/models/original_model/xgboost_n2.joblib`
- **Scaler**: **none** — confirmed from the (archived) training script that the classifier is fit directly on raw features. This is correct for a tree model, not a gap.
- **32 features** (see §7 for the full list)
- Known warning: loading it prints an XGBoost `UserWarning` about pickle version compatibility (was saved by an older xgboost than the one now installed). It still loads and predicts correctly — **do not "fix" this by retraining or re-exporting** unless explicitly asked.
- Dataset: DREAMT (`dreamt-dataset-for-real-time-sleep-stage-estimation-using-multisensor-wearable-technology-2.2.0`), 100Hz, 30-second epochs.

## 3. Drive Mode — final model

- **Model**: `Drive Mode/models/drozy_xgboost_vigilance.joblib` — `XGBRegressor`, continuous 0–100 vigilance score
- **Scaler**: `Drive Mode/models/drozy_scaler.joblib` — `StandardScaler`, required (unlike Rest Mode)
- **Metadata**: `Drive Mode/models/drozy_model_metadata.json`
- **28 features** (see §7)
- Target is `target_B_60`: an event-derived proxy (`vigilance(t) = 100*(1-exp(-d(t)/60))`, distance to nearest self-reported drowsiness button-press) — **not PERCLOS, not a physiological measurement**.
- Trained on **all 10 DROZY subjects with no held-out subject** — this artifact alone provides no evidence of generalizing to a new person. The separate LOSO experiment (`results/dd_continuous_vigilance/`) showed weak, subject-unstable cross-subject performance (mean-subject R² = -0.563). This is already stated in the metadata file itself — don't let a future session quietly drop that caveat.
- Dataset: DROZY/DD-Database, 128Hz, 8-second non-overlapping windows.

## 4. `smartsense_models.pkl` contents

Path: `SIH-26/models/smartsense_models.pkl` (2.56MB, sha256 `b85e461140c4d768c42d29e6e15d334483de4a25ab1b6e8d3d48d35596107b25`)

```python
{
    "bundle_version": "1.0",
    "project": "SmartSense SIH-26",
    "rest_mode": {
        "model": <XGBClassifier>,      # the actual trained object, not reconstructed
        "scaler": None,
        "feature_names": [...32 names, exact training order...],
        "metadata": {...rest_mode_metadata.json content...},
    },
    "drive_mode": {
        "model": <XGBRegressor>,
        "scaler": <StandardScaler>,
        "feature_names": [...28 names, exact training order...],
        "metadata": {...drozy_model_metadata.json content...},
    },
}
```
Load with `joblib.load(...)`. Verified in a fresh process: loads correctly, and predictions from the bundled objects are bit-for-bit identical to predictions from the original standalone `.joblib` files (tested both modes, both prediction and `predict_proba`/scaler-transform paths).

## 5/6. One-line summary (as requested)

- **Rest Mode = 32 features, XGBClassifier, no scaler.**
- **Drive Mode = 28 features, XGBRegressor + StandardScaler.**

## 7. Exact feature lists (training order, verified from the model objects themselves)

**Rest Mode (32):**
```
eeg_mean, eeg_std, eeg_variance, eeg_rms, eeg_min, eeg_max, eeg_range, eeg_energy,
eeg_delta_power, eeg_theta_power, eeg_alpha_power, eeg_beta_power,
eeg_delta_relative, eeg_theta_relative, eeg_alpha_relative, eeg_beta_relative,
eeg_theta_alpha_ratio, eeg_theta_beta_ratio, eeg_delta_theta_ratio, eeg_spectral_entropy,
eog_mean, eog_std, eog_variance, eog_rms, eog_min, eog_max, eog_range, eog_energy,
eog_low_frequency_power, eog_low_frequency_relative, eog_spectral_entropy, eog_zero_crossings
```

**Drive Mode (28):**
```
eeg_mean, eeg_std, eeg_var, eeg_rms, eeg_range, eeg_total_power,
eeg_delta_power, eeg_rel_delta, eeg_theta_power, eeg_rel_theta,
eeg_alpha_power, eeg_rel_alpha, eeg_beta_power, eeg_rel_beta,
eeg_theta_alpha, eeg_theta_beta, eeg_spectral_entropy,
eog_mean, eog_std, eog_rms, eog_var, eog_amplitude, eog_zcr,
eog_lowfreq_power, eog_spectral_entropy, eog_blink_count, eog_blink_rate_per_min, eog_blink_duration_mean
```

Note the two feature sets use **different names and slightly different definitions** for superficially similar quantities (e.g. Rest's `eeg_var` vs Drive's `eeg_var`, Rest has ratio triplets Drive doesn't, Drive has `_rel_` prefixes where Rest has `_relative` suffixes). **Do not assume interchangeability between the two feature sets** — each model must only ever see its own exact list, in its own exact order.

## 8. Current validated inference scripts

All 8 were run and passed in this session, on real data, not synthetic:

- Rest Mode: `replay_test.py`, `replay_multiple.py`, `sleep_state_engine.py`, `smart_alarm.py` (chain: replay → smoothing → alarm)
- Drive Mode: `predict_vigilance.py`, `realtime_simulator.py`, `vigilance_trend.py`, `test_deployment_pipeline.py`

---

## 9. Hardware still to be integrated

**Nothing hardware-related exists in this project yet.** A repo-wide search this session found no ESP32 firmware, no BioAmp driver code, and no EXG Pill integration anywhere under `D:\SIH-26`. Everything built so far is trained on public research datasets (DREAMT, DROZY) — there is no code path yet that takes a live signal from real hardware.

## 10. BioAmp EXG Pill status

**Hardware setup: TWO separate BioAmp EXG Pill boards — a two-channel setup, one EXG Pill per channel** (the EXG Pill is a single-channel analog front-end/biopotential amplifier, so one signal chain needs two of them, not one multi-channel board):

- **BioAmp EXG Pill #1 → EEG acquisition** — wired for the EEG channel, target **C4-M1**.
- **BioAmp EXG Pill #2 → EOG acquisition** — wired for the EOG channel, target **E1-E2**.

Neither board is wired or verified yet, and no driver/acquisition code exists for either in this project (confirmed by a repo-wide search — see §9). Before wiring them to either ML pipeline, verify:
- **Actual achievable sampling rate** out of each EXG Pill → ESP32 ADC acquisition path, and whether it can be set/resampled to exactly 100Hz (Rest Mode) or 128Hz (Drive Mode) — both models were trained at a fixed rate and don't currently do their own resampling.
- **Reference/derivation scheme**: EXG Pill #1 must actually be wired as C4 referenced to M1 (not just "some EEG signal"), and EXG Pill #2 must be wired as a true E1-E2 bipolar pair — not just "2 signals," but the *correct electrodes* per channel (see §12).
- **Signal amplitude/gain range** compatible with the bandpass filters and feature formulas already baked into `feature_extractor.py` / `dd_vigilance_features.py` (which assume specific units/scale from their training data) — a raw ADC count scale that's wildly different from the training data's physical units could silently break every downstream feature.
- **Noise floor and electrode contact quality** — both training datasets are clinical/lab-grade PSG recordings; consumer EXG Pills on dry electrodes will be noisier, and neither pipeline currently has any noise-quality gating beyond the existing missing-data-fraction check in Rest Mode's replay scripts.

## 11. ESP32 status

No firmware, no code, nothing found in this project. The ESP32's intended role (not yet built) is **ESP32 ADC acquisition**: sampling both EXG Pill outputs (EEG from Pill #1, EOG from Pill #2) synchronously, then **raw signal streaming to PC** (serial/BLE/WiFi — your call) for the Python-side pipeline to consume. Whatever ESP32 work exists (if any) lives outside `SIH-26/` — this handoff does not assume or invent an integration status beyond "not started here."

## 12. Intended EEG/EOG electrode configuration

Per your stated hardware target, using **two BioAmp EXG Pills in a two-channel setup**:
- **BioAmp EXG Pill #1 → EEG acquisition → target: C4-M1**
- **BioAmp EXG Pill #2 → EOG acquisition → target: E1-E2**

Important asymmetry to know about:
- **Rest Mode already trains on real `C4-M1`, `E1`, `E2` channels** — the DREAMT dataset's own raw columns are literally named `C4-M1`, `E1`, `E2` (confirmed directly in `replay_test.py`'s required-column check). So Rest Mode's training channel definition **already matches your intended two-EXG-Pill hardware exactly** — no proxy, no approximation.
- **Drive Mode does NOT.** DROZY provides `C4-Ref` (referenced to *something*, not confirmed as M1) and `LOC-Ref`/`ROC-Ref` (combined as `LOC-Ref - ROC-Ref`, documented in its own metadata as an *unverified* bipolar-horizontal-EOG proxy, not confirmed as true E1-E2). This is stated plainly in `drozy_model_metadata.json`'s `eeg_channel`/`eog_channel` fields and warning text — don't let a future session upgrade that language to "verified" without new evidence.

## 13. Required sampling rates / windows

| Mode | Sampling rate | Window/epoch | Overlap |
|---|---|---|---|
| Rest Mode | 100 Hz | 30 seconds (3000 samples) | none (non-overlapping) |
| Drive Mode | 128 Hz | 8 seconds (1024 samples) | none (non-overlapping) |

## 14. Complete hardware-to-ML pipeline (electrodes → BioAmp EXG Pills → ESP32 → Python → output)

Neither pipeline currently starts before "raw signal already in a CSV/EDF file" — everything from the electrodes through to the PC is not built yet. What does exist, and what any hardware integration must feed into unchanged:

```
========================= NOT BUILT YET =========================

Electrodes (C4-M1 EEG, E1-E2 EOG)
        |
        v
BioAmp EXG Pill #1 (EEG acquisition, target: C4-M1)
BioAmp EXG Pill #2 (EOG acquisition, target: E1-E2)
   [two separate single-channel EXG Pill boards -- a two-channel setup]
        |
        v
ESP32 ADC acquisition (samples both EXG Pill outputs synchronously,
ideally at 100Hz or 128Hz depending on target mode)
        |
        v
Raw signal streaming to PC (serial / BLE / WiFi)
        |
        v
Python ingestion buffer
(must produce fixed-length, non-overlapping epoch arrays:
3000 samples/30s for Rest Mode, 1024 samples/8s for Drive Mode)

===================== EXISTING AND VALIDATED =====================

        |
        v
bandpass filter (per mode, see model metadata:
Rest: EEG 0.5-30Hz / EOG 0.1-10Hz, order-4 Butterworth, zero-phase
Drive: EEG 0.5-40Hz / EOG 0.1-15Hz)
        |
        v
feature extraction (REUSE, do not reimplement:
Rest -> scripts/feature_extractor.py::extract_epoch_features
Drive -> scripts/dd_vigilance_features.py functions)
        |
        v
model.predict() / predict_proba()
(load from smartsense_models.pkl, or the individual
.joblib files directly - both verified equivalent)
        |
        v
Rest: sleep_state_engine.py (temporal smoothing)
      -> smart_alarm.py (sustained-N2 alarm)
Drive: vigilance_trend.py (smoothing + slope + sustained-decline alarm)
        |
        v
[USER-FACING OUTPUT]
```

The four scripts named "REUSE" above are exactly the code path already proven correct in this session (§8) — a hardware integration should call into them, not duplicate their math.

---

## 15. Important warnings / known limitations

- **Neither model is clinically validated.** Both metadata files say so explicitly; preserve that language.
- Drive Mode's deployed artifact has **no LOSO holdout** — it was fit on all 10 subjects. Cross-subject generalization evidence is weak (mean-subject R² = -0.563 from the separate LOSO run).
- Drive Mode's channel labels are **proxies, not verified hardware matches** (§12).
- Rest Mode has **two independent copies of the same feature-extraction logic** — `feature_extractor.py` (canonical, imported by `replay_test.py`) and an inline duplicate inside `replay_multiple.py`. Currently verified equivalent (same filters, same band definitions), but they could silently drift if one is edited without the other. If you ever touch feature math, fix both or better, refactor `replay_multiple.py` to import the canonical module.
- Rest Mode's model triggers an XGBoost pickle-version `UserWarning` on every load. Harmless today, was deliberately not "fixed" (would require re-exporting/retraining).
- Drive Mode's regressor has no `feature_names_in_` (trained on a raw NumPy array) — feature-order correctness is structural (one shared list in `train_deployment_model.py`), not independently re-checkable via model introspection.
- ~13 archived Rest Mode research scripts still contain hardcoded `D:\Rest Mode\...` paths and will not run without fixing — left that way deliberately (decided out of scope for the live pipeline).

## 16. MUST NOT retrain / overwrite / delete / reconstruct

- `Rest Mode/models/rest_mode_n2.joblib` and `rest_mode_metadata.json`
- `Drive Mode/models/drozy_xgboost_vigilance.joblib`, `drozy_scaler.joblib`, `drozy_model_metadata.json`
- `models/smartsense_models.pkl`
- `archive/rest_mode_experiments/models/original_model/xgboost_n2.joblib` (the byte-identical original)
- `Drive Mode/dataset/` (canonical DROZY copy) and `Rest Mode/dataset/` (101GB DREAMT) — never move, rename, or modify contents
- Anything under `archive/` — it's the project's full research/provenance history; treat as read-only unless the user explicitly asks to prune it
- The 32-feature and 28-feature definitions and their exact order (§7) — any change here breaks compatibility with the already-trained models

## 17. Exact next recommended steps for hardware integration

1. Bench-test both BioAmp EXG Pill boards in isolation first (EXG Pill #1 for EEG, EXG Pill #2 for EOG): confirm actual sample rate, noise floor, and signal amplitude/units against what the two bandpass filters and feature formulas expect (§10) — before any electrode is placed on a person.
2. Decide (and document) which mode's hardware wiring you're validating first — Rest Mode is the stronger starting point since its trained channel definition (`C4-M1`, `E1`, `E2`) already matches your intended hardware exactly, with no channel-proxy uncertainty to resolve (§12).
3. Wire and verify electrode placement/reference matches the target definition exactly (C4 referenced to left mastoid M1 for EEG; E1/E2 periocular bipolar for EOG) — confirm with impedance checks, not just "it produces a signal."
4. Write ESP32 firmware to sample both channels synchronously at the target rate and stream them (serial/BLE/WiFi — your call) to a Python host.
5. Write the Python ingestion layer that buffers the stream into fixed-length, non-overlapping epochs (3000 samples/30s for Rest, 1024 samples/8s for Drive) — this is the one piece of the pipeline in §14 that doesn't exist yet anywhere.
6. Feed each epoch through the existing, already-validated filter → feature-extraction → model → smoothing/alarm chain unchanged. Do not write new feature-extraction code — import and call the existing functions.
7. Before trusting any live alert, run a bench validation: known reference conditions (eyes-open/eyes-closed alpha rhythm, deliberate blinks) through the live pipeline and confirm the extracted features respond in the expected direction, the same way `replay_test.py` already validates against DREAMT ground truth.
8. Keep the "not clinically validated" framing all the way through — a live-hardware demo does not change that status.

---

*This document is a snapshot as of the end of this session. If anything in the project changes after this point, this file will not reflect that automatically — re-verify paths/hashes before relying on anything above for a destructive or high-stakes action.*
