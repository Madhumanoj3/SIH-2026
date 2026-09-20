# DD-Database Continuous Vigilance Model — Final Report

**Scope:** DivyaDataset/ only. Rest Mode, New Drive Mode/SEED-VIG, and all pre-existing DD benchmark files were untouched — every output in this report lives under `processed/dd_continuous_vigilance/`, `results/dd_continuous_vigilance/`, or new files in `scripts/`. All numbers below come from code that was actually executed this session, not projected.

## Terminology used throughout (Phase 0 distinction, as required)

1. **Native DD annotation** — a timestamped "Event" marker: the moment a subject pressed a self-report button during a driving-simulator session. This is the only ground truth DD provides. It is **not** a continuous vigilance measurement.
2. **Engineered continuous target** — a mathematical function of distance/proximity to those event timestamps, constructed offline by us (`target_A/B/C/D` below), scaled to 0–100. This is a **proxy**, not a measured quantity.
3. **Model prediction** — the regressor's output when given only causal EEG/EOG features (`C4-Ref` + `LOC-ROC`) for a window.
4. **User-facing 0–100 vigilance score** — the model prediction, clipped to [0,100]. Never claimed to be clinically validated.

---

## Phase 1 — Dataset Audit (confirmed, `processed/dd_continuous_vigilance/dataset_audit.json`)

- 20 recordings, 10 subjects (01–10), 2 trials each, 128 Hz, ~120 min/recording.
- `C4-Ref` present in **all 20/20** recordings. `LOC-Ref` and `ROC-Ref` present in **all 20/20** recordings → `LOC-ROC` constructible in every file.
- EEG reference is **not** documented as M1/A1/A2 in any EDF header field (re-confirmed, not re-derived from prior audits in this same project).
- Event counts per recording range from **2 (09M_1) to 162 (07F_2)** — confirms severe cross-subject label imbalance going into this experiment.

**Conclusion:** `C4-Ref` = C4 anatomical-site proxy (reference unverified). `LOC-ROC` = horizontal bipolar EOG proxy (not verified as `E1-E2`). Neither is renamed at any point in code or output.

---

## Phase 3 — Multiple Honest Continuous Targets

Ten target variants were built purely from event timestamps (never from EEG/EOG features), documented in `processed/dd_continuous_vigilance/target_definitions_w8.json`:

- **A_H** (linear distance-to-event, bidirectional), H ∈ {60,120,180}s
- **B_tau** (exponential proximity, bidirectional), τ ∈ {30,60,90}s
- **C_sigma** (Gaussian proximity, bidirectional), σ ∈ {30,60,90}s
- **D_causal** (trailing 300s event count, capped at 3) — the only variant that never uses future information, even for the label

All hyperparameters (H, τ, σ, cap) were fixed **before** any model was run, based on the event-timing distribution from the dataset audit (median gap 54s, p75 131s) — **never chosen by looking at held-out-subject performance.**

**Leakage control:** A/B/C use future event timestamps to build the *label* only — documented explicitly. The feature file (`dd_vigilance_features.py`) stores signal-derived features and event-distance columns in strictly separate, underscore-prefixed columns; the training scripts never pass those columns as model inputs.

---

## Phase 7–9 — Target Screening (Ridge, LOSO, all 10 variants + baselines)

Full table: `results/dd_continuous_vigilance/target_screening.csv`. Key finding, ranked by mean-subject Pearson:

| Target | Pooled R² | Pooled Pearson | Mean-subj R² | Median-subj R² | Std-subj R² |
|---|---|---|---|---|---|
| B_30 | 0.099 | 0.326 | −0.450 | −0.089 | 0.787 |
| **B_60** | 0.101 | 0.331 | −0.518 | −0.125 | 0.893 |
| A_60 | 0.097 | 0.322 | −0.432 | −0.065 | 0.755 |
| C_30 | 0.100 | 0.326 | −0.454 | −0.062 | 0.796 |
| … (7 more, all in the same range) | | | | | |
| D_causal | 0.027 | 0.222 | −2.020 | −0.267 | 3.558 |

**Critical honest finding — baseline comparison:** for several tighter-horizon targets (A_60, B_30, C_30), the trivial **"always predict 100" (ceiling) baseline had a *lower* pooled MAE than the trained Ridge model** (e.g., target_A_60: ceiling MAE=22.29 vs Ridge MAE=26.63). Pooled R²/Pearson looked positive for every variant, but that is a correlation/variance-explained measure — it does not guarantee the model beats a constant predictor on average error. This is reported because Phase 9 explicitly requires it, and it directly contradicts a naive read of the R² numbers alone.

**Per Phase 9's stated promising-criteria, checked against every single target variant:**
- ✅ Cross-subject correlation "meaningfully above zero"? Marginally — pooled Pearson ≈ 0.29–0.33 for A/B/C variants (statistically non-zero at n=18,118, but weak).
- ❌ Not dominated by one subject? **Fails for all 10 variants** — std-subject-R² of 0.75–3.56, and mean-subject R² is 4–6x more negative than median-subject R², meaning 2–3 subjects (08/09/10 — the same sparse-event subjects flagged in Phase 1) dominate the aggregate.
- ❌ Subject-level performance reasonably stable? **Fails** — same evidence.
- ⚠️ Survives strict LOSO? Pooled numbers survive (weakly positive); subject-level numbers do not.
- ❌ Beats a simple baseline reliably? **Fails for the tightest-horizon variants** (ceiling baseline wins on MAE); marginal wins for looser horizons (B_60, A_120, A_180).

**Conclusion: no target variant passes all of Phase 9's promising criteria.** `target_B_60` was carried forward for the deeper analysis below as the *least unstable, most defensible* candidate (best pooled R²/Pearson among the ten, τ=60s matches the empirical median inter-event gap of 54s) — **not** because it qualifies as "promising" by the stated bar. This is stated plainly, not hidden.

---

## Phase 7–8, 10 — Full 3-Model LOSO (target_B_60, 8s window)

Full numbers: `results/dd_continuous_vigilance/loso_metrics_full.json`, `subjectwise_metrics.csv`.

| Model | Pooled MAE | Pooled RMSE | Pooled R² | Pooled Pearson | Pooled Spearman | Mean-subj R² |
|---|---|---|---|---|---|---|
| Ridge | 27.40 | 32.05 | 0.101 | 0.331 | 0.300 | −0.518 |
| Random Forest | 27.80 | 32.48 | 0.078 | 0.313 | 0.265 | −0.586 |
| **XGBoost** | 27.35 | 32.45 | 0.079 | 0.328 | 0.282 | −0.563 |
| Baseline: global mean | 30.90 | 34.85 | −0.062 | −0.514* | −0.581* | — |
| Baseline: training-subject mean | 30.89 | 34.85 | −0.062 | −0.514* | −0.581* | — |
| Baseline: ceiling (always 100) | 29.59 | 44.93 | −0.766 | n/a | n/a | — |

*(Pearson/Spearman are near-meaningless for a constant predictor whose tiny residual variation is driven by pooled distribution shift across folds — reported for completeness, not as evidence of anything.)*

**On this specific target (B_60), all three real models beat all three baselines on pooled MAE and R².** No model is dramatically better than the others — consistent with the earlier DD experiments in this project, where XGBoost never clearly dominates. XGBoost was used for the downstream trend/alarm/personalization work only because it had the best combination of pooled and mean-subject Pearson, not because it was assumed best going in.

**Per-subject XGBoost R²** (full table in `subjectwise_metrics.csv`): ranges from **+0.09 (subject 06)** down to **−2.90 (subject 09)**. Subjects 08/09/10 (2–8 total self-report events per session) again collapse (R² −0.90 to −2.90), matching the same pattern already flagged in Phase 1 and in the earlier DD audits of this project.

**Answer to "does C4 + one EOG contain useful cross-subject signal?":** Weakly, at the pooled/aggregate level (small, real, non-zero effect — models beat baselines). **No, in the sense that matters for a per-driver product** — the effect does not reliably transfer to a *specific new* held-out individual, and for the sparsest-event subjects it fails outright.

---

## Phase 6 — Window-Size Comparison (XGBoost, target_B_60)

`results/dd_continuous_vigilance/window_size_comparison.csv`:

| Window | Pooled R² | Pooled Pearson | Mean-subj R² | Std-subj R² |
|---|---|---|---|---|
| 8s | 0.079 | 0.328 | −0.563 | 0.913 |
| 16s | 0.113 | 0.372 | −0.552 | 1.019 |
| 30s | 0.142 | 0.413 | −0.482 | 1.061 |

Larger windows give a modest, expected pooled-correlation improvement (less noisy spectral estimates per window) — but **do not fix the negative mean-subject R² problem**, and subject-to-subject variance (std-subject-R²) actually gets slightly worse. **Window size is not the bottleneck; the label/subject-imbalance problem is.** 8s remains a reasonable real-time-compatible choice; a product build could reasonably use 16–30s for slightly better pooled correlation at the cost of coarser real-time resolution.

---

## Phase 11–12 — Temporal Trend & Alarm

Trend-quality metrics (causal, `results/dd_continuous_vigilance/trend_quality_metrics.json`):
- Correlation between predicted and true medium-term (8-window) slope: **0.132** (weak but non-zero).
- Slope sign agreement: **53.3%** (barely above the 50% chance baseline).
- Of windows where the true target was genuinely declining, only **16.6%** were flagged by the persistence rule.

Alarm grid (fixed a priori parameters, full table in `alarm_grid_search.csv`), best-F1 row:

| Slope thr. | Persistence | Cooldown | Precision | Recall | F1 | FA/hour | Mean lead time |
|---|---|---|---|---|---|---|---|
| −1.0 | 2 | 60s | 0.301 | 0.328 | 0.314 | 15.5 | 20.2s |

**Per the exact instruction in Phase 12: "The temporal alarm mechanism is computationally feasible, but predictive reliability is insufficient for deployment."** The underlying regression signal (Pearson ~0.33 pooled, near-chance slope agreement) is too weak to support a trustworthy sustained-decline alarm; ~15 false alarms/hour at the best-F1 operating point is not usable in a real vehicle, and tighter thresholds that reduce false alarms push recall down to ~10–20%.

---

## Phase 13 — Within-Subject Analysis (separate from LOSO, does not replace it)

Train on trial 1 → test on trial 2, and vice versa, per subject (`results/dd_continuous_vigilance/within_subject_metrics.csv`):

- Mean R² = **−0.248**, median R² = −0.128, mean Pearson = 0.200.
- Compare: LOSO pooled R² = 0.079 (LOSO wins here — 9x more training data helps more than same-subject consistency); LOSO mean-subject R² = −0.563 (within-subject is **less negative**, i.e. modestly better, than LOSO's own per-subject generalization).

**Interpretation:** the same-person relationship is not dramatically stronger than the cross-subject one — with only ~900 windows from a single 2-hour session, there isn't enough data for a session trained purely on that person to clearly outperform a model trained on 9 other people. This is an honest negative-ish result: personalization via "train fresh on this person alone" is not obviously the answer.

---

## Phase 14 — Personal Calibration Experiment

Realistic strategy actually tested: keep the LOSO (cross-subject) XGBoost model as the base/initialization model; fit a 2-parameter affine correction (`corrected = a·pred + b`) using only the subject's own trial-1 data (calibration), evaluate on their unseen, chronologically-later trial-2 (`results/dd_continuous_vigilance/personalization_metrics.csv`):

- Mean raw R² = **−0.775** → mean calibrated R² = **−0.060** (still negative, but a large improvement).
- Mean MAE improvement = **+4.59** (positive/better), 14 of 20 subject×direction cases improved on MAE.
- **The biggest gains are exactly where they're needed most:** subjects 08/09/10 (sparse-event, base model badly biased toward predicting too much drowsiness for them) improve dramatically — e.g. subject 09: R² −2.05 → −0.05, MAE 27.4 → 7.6.
- Two subjects (01, 06) got *worse* after calibration — a 2-parameter fit on ~900 calibration windows can overfit; this is reported, not hidden.

**Interpretation:** most of this improvement is **correcting a systematic per-subject bias** (the base model, trained mostly on high-event subjects, over-predicts drowsiness for people who rarely self-report) rather than teaching the model to track that individual's real-time fluctuations better (R² mostly stays weak/negative even after calibration). **Personalization via simple recalibration is real and worth doing, but it is not a fix for the underlying weak temporal signal.**

---

## Phase 15 — Hardware Transfer: DD vs. BioAmp

| | DD (`C4-Ref` + `LOC-ROC`) | BioAmp (`C4-M1` + `E1-E2`) |
|---|---|---|
| EEG site | C4 (10-20 standard) | C4 |
| EEG reference | Undocumented (README says A1 or A2, unspecified which) | M1 |
| EOG concept | Horizontal (LOC/ROC = outer canthus) | Bipolar E1-E2 (exact placement TBD by hardware) |

**MATCHES:**
- C4 anatomical site (same electrode position)
- Single-EEG-channel, single-EOG-channel architecture (hardware-compatible by design)
- Horizontal bipolar EOG concept (`LOC-ROC` cancels a shared reference exactly, algebraically, same as any bipolar EOG derivation would)
- Compact, real-time-computable DSP features (Welch PSD on 1024–3840 sample windows, simple thresholded blink detection — all causal, all cheap)

**MISMATCHES:**
- Exact EEG reference (A1/A2, undocumented, vs. M1 — not verified identical or equivalent)
- Exact EOG electrode placement (LOC/ROC vs. BioAmp's actual E1/E2 geometry — unknown without your hardware's montage spec)
- Amplifier characteristics (AKONIC PSG hardware vs. BioAmp electronics — gain, noise floor, input impedance all differ)
- Sampling rate (DD fixed at 128 Hz; must confirm/resample to match BioAmp's actual rate)
- Electrode impedance (clinical AgGold electrodes vs. whatever BioAmp uses)
- Signal amplitude/noise floor (different hardware generations, different environments)

**This DD-trained model is not validated on BioAmp data in any way. It is, at best, a proxy-on-a-proxy prototype**, and this session's own results (weak, subject-unstable LOSO performance) mean it should not be over-trusted even on DD's own terms, let alone assumed to transfer.

---

## Phase 16 — Real BioAmp Calibration Plan (engineering prototype, no clinical claim)

1. **Sessions:** at minimum 8–10 volunteers (matching DD's subject count order of magnitude), 2 sessions each on different days (mirrors DD's own trial-1/trial-2 structure, which this report's within-subject analysis actually used).
2. **Session length:** 60–90 minutes minimum per session — long enough to capture natural alertness decline (DD's median inter-event gap was 54s within episodes, but full drowsiness build-up spans much longer; shorter sessions won't produce enough naturally-occurring low-vigilance data).
3. **C4-M1 EEG recording:** single differential channel, C4 electrode (10-20 site) referenced to M1 (left mastoid), consistent, single fixed reference across all sessions/subjects (unlike DD, document the reference explicitly in every recording's metadata).
4. **E1-E2 EOG recording:** bipolar pair at the intended final hardware sites; record and log electrode polarity/order explicitly per session (avoids the sign-ambiguity risk this analysis flagged for `LOC-ROC`).
5. **Timestamping:** hardware timestamp every sample at acquisition (not post-hoc estimated); log session start/stop wall-clock time.
6. **Label synchronization:** do not rely solely on a self-report button (this report's biggest finding is how unstable/sparse that ground truth is). Prefer at least one additional concurrent signal — e.g., a simple reaction-time task, a camera-based eye-closure/PERCLOS reference measurement, or a structured periodic alertness probe (KSS-style rating) — synchronized to the same clock as the EEG/EOG.
7. **States to collect:** fully alert (start of session), natural progressive fatigue (extend session length/time-of-day to induce it, similar to DD's protocol), and at least a few genuine drowsy/microsleep episodes if ethically and safely obtainable (simulator context, supervised).
8. **Using the DD-trained model:** use it strictly as an **initialization/starting point** for feature engineering and modeling code (not as a validated predictor) — the feature extraction pipeline (`dd_vigilance_features.py`) and the causal trend/alarm code (`dd_vigilance_trend_alarm.py`) are directly reusable; the regression weights are not something to trust as-is.
9. **Fine-tuning/calibration approach:** replicate the Phase 14 affine-recalibration strategy first (cheap, already shown to help most where the base model is most biased) using a short per-subject calibration slice; if more data becomes available, retrain the regressor from scratch on real BioAmp data rather than continuing to lean on DD.

---

## Answers to the 11 Required Questions

1. **Can DD produce a continuous vigilance proxy?** Yes, mechanically — ten mathematically well-defined proxies were built and documented. Whether any of them is *useful* is a separate question (see #2).
2. **Which target construction worked best?** None passed the full Phase 9 "promising" bar. `target_B_60` (exponential proximity, τ=60s) was the least unstable and used for the deeper analysis, but this is a "least bad," not a validated winner.
3. **Which model worked best?** No model dominated. XGBoost and Ridge were statistically indistinguishable in pooled metrics (XGBoost MAE 27.35 vs Ridge 27.40); XGBoost had marginally better mean-subject Pearson and was used downstream for that reason alone.
4. **Exact LOSO metrics?** Pooled: MAE 27.35, RMSE 32.45, R² 0.079, Pearson 0.328, Spearman 0.282 (XGBoost, target_B_60, 8s window). Mean-subject R² = −0.563 (see full breakdown in Phase 7–8 section above).
5. **Does C4 + one EOG contain useful cross-subject signal?** A small, real, non-zero pooled effect — yes. A reliable, individually-transferable signal for a brand-new driver — no, not with this dataset's labels.
6. **Does personalization improve performance?** Yes, substantially on MAE and R² via simple affine recalibration (mean R² −0.775 → −0.060), largely by correcting per-subject bias rather than by improving temporal tracking. Training a fresh model on only that person's own single session (within-subject) did **not** clearly help (mean R² −0.248, worse than LOSO's pooled number).
7. **Does temporal trend improve alarm detection?** The trend/alarm layer is fully causal and computationally works, but slope-sign agreement with the true target (53.3%) is barely above chance, and only 16.6% of genuinely declining periods get flagged. It does not yet meaningfully improve reliability over the raw regression signal.
8. **Best achievable 0–100 vigilance score?** A continuous score is produced and saved (`dd_continuous_vigilance_predictions.csv`), mathematically defined as the clipped XGBoost prediction of `target_B_60`. Its accuracy (pooled MAE ≈27, R²≈0.08, deeply negative for 3/10 subjects) means it should be described as an experimental estimate only, not a reliable score.
9. **Limitations?** Severely imbalanced/sparse self-report events across subjects (2–162 per session); no native continuous ground truth exists at all; unverified EEG reference and EOG electrode placement relative to BioAmp; weak and subject-unstable cross-subject generalization; alarm trend layer not yet reliable; window size does not fix the core problem.
10. **Can this transfer to BioAmp C4-M1 + E1-E2?** Not validated. Matches/mismatches are listed explicitly in Phase 15. The anatomical site and single-channel architecture transfer conceptually; the reference, electrode geometry, amplifier, and impedance do not, and have never been tested against real BioAmp data.
11. **What real BioAmp data is required?** See the concrete plan in Phase 16 — 8–10 subjects, 2 sessions each, 60–90 min/session, explicit and consistent C4-M1/E1-E2 reference and polarity documentation, and a stronger label source than a sparse self-report button (e.g., a synchronized PERCLOS/reaction-time measure).

---

## Bottom line

This experiment did not manufacture a good-looking result. The honest finding is: DD-Database's `C4-Ref` + `LOC-ROC` inputs carry a small, statistically real but practically weak cross-subject signal for an event-proximity vigilance proxy; that signal does not reliably generalize to new individuals (mean-subject R² is negative for every target variant tested, every model, and every window size); a simple personalization step meaningfully helps but mostly by fixing per-subject bias, not by improving temporal tracking; and the trend/alarm layer, while computationally sound and fully causal, is not yet predictive enough for deployment. None of this rules out the general approach — it specifically reflects DD's sparse, self-reported, cross-subject-imbalanced labels and the single-channel proxy inputs used here.
