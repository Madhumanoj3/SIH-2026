# DROZY/DD Deployment Model — Documentation

This describes the **deployment artifact** built in Phase 2, which is a separate thing from the LOSO research experiment. It does not modify, retrain, or supersede the LOSO results in this same directory.

## 1. What model was trained

`XGBRegressor` (xgboost), same hyperparameters as the LOSO experiment's XGBoost config (`n_estimators=300, max_depth=6, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, random_state=42`), fit **once on all 10 DROZY/DD subjects combined** (18,118 windows), with no held-out subject.

## 2. What data was used

`processed/dd_continuous_vigilance/features_with_targets_w8.csv` — the exact same feature file the LOSO experiment used. Nothing was recomputed or regenerated for this step.

## 3. Exact 28 features (fixed order, stored in `models/drozy_model_metadata.json`)

EEG (17): `eeg_mean, eeg_std, eeg_var, eeg_rms, eeg_range, eeg_total_power, eeg_delta_power, eeg_rel_delta, eeg_theta_power, eeg_rel_theta, eeg_alpha_power, eeg_rel_alpha, eeg_beta_power, eeg_rel_beta, eeg_theta_alpha, eeg_theta_beta, eeg_spectral_entropy`

EOG (11): `eog_mean, eog_std, eog_rms, eog_var, eog_amplitude, eog_zcr, eog_lowfreq_power, eog_spectral_entropy, eog_blink_count, eog_blink_rate_per_min, eog_blink_duration_mean`

## 4. Exact preprocessing

- EEG (`C4-Ref`): band-pass 0.5–40 Hz
- EOG (`LOC-Ref − ROC-Ref`, bipolar horizontal proxy): band-pass 0.1–15 Hz
- Window: 8 s, non-overlapping, 128 Hz → 1024 samples/window
- Same filtering call path (`mne` `.filter()`) and same feature functions (`eeg_features`/`eog_features` in `scripts/dd_vigilance_features.py`) are reused everywhere in the deployment code — training, batch inference, real-time simulation, and the end-to-end test all call the identical implementation.

## 5. Exact target

`target_B_60`: `vigilance(t) = 100 * (1 - exp(-d(t)/60))`, where `d(t) = min_i |t − event_i|` is the bidirectional distance (seconds) to the nearest self-reported drowsiness event in that recording. **This is an event-derived proxy, not clinical ground truth.**

## 6. LOSO evaluation vs. final deployment training — the critical distinction

| | LOSO experiment | Deployment model (this phase) |
|---|---|---|
| Purpose | Estimate generalization to a *new* person | Produce a usable scoring artifact |
| Training data per fold | 9 subjects | **All 10 subjects** |
| Test data | 1 held-out subject, never seen in training | None — no held-out data |
| Result saved | `oof_predictions_all_models.csv`, `loso_metrics_full.json` (pooled R²=0.079, mean-subject R²=−0.563 for XGBoost) | `models/drozy_xgboost_vigilance.joblib` |
| What it tells you | How well this approach transfers to someone new (answer: weakly and unstably — see the audit) | Nothing about generalization by itself |

## 7. Why the deployment model is NOT evidence of generalization

Fitting on all 10 subjects with no holdout means this model has already seen every subject's data — its predictions on those same subjects (e.g. in the Phase 2F consistency check) will look better than the LOSO numbers **purely because it memorized/fit patterns specific to those exact people**, not because the underlying problem got any easier. The only valid evidence of how this approach performs on a *new* person is the LOSO experiment, which showed weak, subject-unstable performance (mean-subject R² = −0.563, with subjects 08/09/10 collapsing to R² between −0.90 and −2.90). The deployment model inherits every one of those limitations; training on more of the same subjects does not fix them.

## 8. How to run inference

```
python scripts/predict_vigilance.py --input <csv with C4, LOC, ROC columns> --fs 128
```
Loads `models/drozy_xgboost_vigilance.joblib`, `models/drozy_scaler.joblib`, `models/drozy_model_metadata.json`; validates the sampling rate against the model's training rate; constructs `LOC-ROC`; applies the identical filtering and feature extraction as training; saves `results/deployment_predictions.csv` (`timestamp, predicted_target, vigilance_score`).

## 9. How to run the simulator

```
python scripts/realtime_simulator.py --input dataset/01M_1.edf --speed 10
```
Streams an existing DROZY `.edf` recording forward in time (never touching future samples or annotations), buffering 8 s at a time, scoring each window, and feeding the causal trend engine. `--speed 1` paces in real time; `--speed 10` runs ~10x faster. Displays `SMARTSENSE DRIVE MODE / Time / Vigilance / Trend / Status` per window.

## 10. How the vigilance score is generated

Raw signal → `LOC − ROC` construction → identical band-pass filtering as training → identical 28-feature extraction → saved `StandardScaler.transform()` → saved `XGBRegressor.predict()` → `np.clip(prediction, 0, 100)`. The unclipped value is saved separately as `predicted_target`; the clipped, user-facing value is `vigilance_score`.

## 11. Why 0–100 is an engineering score, not a clinical percentage

**"92/100 is the model's current engineering vigilance score" — never "92% vigilant."** The number is the output of a regressor trained on a self-report-event-derived proxy target, using an EEG channel with an unverified reference and an EOG derivation that is a physiologically-motivated proxy, not a verified E1-E2 match. It has not been validated against any clinical vigilance measure (e.g. PERCLOS, polysomnography-scored drowsiness) and has not been evaluated on real BioAmp hardware. The LOSO audit (see `results/dd_continuous_vigilance/FINAL_REPORT.md`) documents exactly how weak and subject-unstable the underlying signal is.

## 12. Hardware mismatch

| | DROZY/DD (this model) | BioAmp (target hardware) |
|---|---|---|
| EEG | `C4-Ref` — C4 site, reference undocumented (README says A1 or A2, unspecified which) | `C4-M1` — C4 referenced to left mastoid |
| EOG | `LOC-ROC` — outer-canthus horizontal bipolar derivation | `E1-E2` — exact placement defined by BioAmp hardware, not yet confirmed equivalent |

The C4 electrode **site** matches; the reference electrode, the EOG electrode geometry, amplifier characteristics, sampling rate, electrode impedance, and signal amplitude/noise floor are all unverified or known to differ.

## 13. Why BioAmp calibration is still required

This model has only ever seen DROZY/DD signals. It has never seen a single sample from BioAmp hardware. Amplifier gain, noise floor, electrode impedance, and the EEG reference/EOG geometry differences listed above mean the raw feature distributions a BioAmp stream produces could differ systematically from what this model was trained on — the same kind of per-subject bias problem documented in the LOSO experiment's personalization analysis (Phase 14), but now at the hardware level instead of the individual level. Before any real use, this model requires calibration against real BioAmp recordings (see the calibration plan in `FINAL_REPORT.md`, Phase 16) — at minimum an affine recalibration step similar to the one already shown to help in the personalization experiment, and ideally a full retrain once sufficient real BioAmp data exists.
