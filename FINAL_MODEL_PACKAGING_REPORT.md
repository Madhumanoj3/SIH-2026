# SmartSense SIH-26 — Final Model Packaging Report (Phases 4/5/6)

**FINAL MODEL BUNDLE CREATED SUCCESSFULLY**

`D:\SIH-26\models\smartsense_models.pkl`

No model was retrained, overwritten, or reconstructed from parameters anywhere in this process. Every check below passed; nothing was improvised.

---

## 0. Phase 3 open-item resolutions (completed before Phase 4)

| Item | Resolution |
|---|---|
| Original Rest Mode model | Re-verified hash match (`5ea4cc86e463...`) against the copy, then hash-verified move to `archive/rest_mode_experiments/models/original_model/xgboost_n2.joblib`. Copy re-verified unchanged afterward. |
| Archived script paths | Left as-is, not fixed — confirmed as your explicit decision. |
| Unicode print fix | Kept, not reverted — confirmed as your explicit decision. |
| Duplicate `random_forest_n2.joblib` / `random_forest_eeg_eog.joblib` | Re-confirmed byte-identical (`616be0988be9...`). Kept `random_forest_n2.joblib` as canonical in `archive/rest_mode_experiments/models/`; moved (not deleted) `random_forest_eeg_eog.joblib` to `archive/rest_mode_experiments/models/duplicate_random_forest_models/`, alongside a `hash_evidence.json` recording the match. |

`Rest Mode/scripts/models/` is now empty (both files it held have been relocated with hash verification).

---

## 1. Artifact paths

**Rest Mode:**
- `Rest Mode/models/rest_mode_n2.joblib`
- `Rest Mode/models/rest_mode_metadata.json`
- (original, archived: `archive/rest_mode_experiments/models/original_model/xgboost_n2.joblib`)

**Drive Mode:**
- `Drive Mode/models/drozy_xgboost_vigilance.joblib`
- `Drive Mode/models/drozy_scaler.joblib`
- `Drive Mode/models/drozy_model_metadata.json`

---

## 2. Feature counts

| Mode | Feature count | Verified against |
|---|---|---|
| Rest Mode | **32** | model's own `feature_names_in_`, cross-checked against `train.csv` columns — exact match |
| Drive Mode | **28** | scaler's `n_features_in_` and metadata's `feature_names` (model itself has no `feature_names_in_` — see §3 note) |

---

## 3. Exact feature verification status

**Rest Mode — PASS.** The model object's own `feature_names_in_` attribute was read directly (not re-typed by hand) and compared to `scripts/processed/train.csv`'s real column order (38 columns − 6 metadata columns). Identical, in the same order, both times this was checked (Phase 3 and again independently in Phase 4).

**Drive Mode — PASS, with one honest caveat.** `drozy_xgboost_vigilance.joblib` was trained on a raw NumPy array (`train_deployment_model.py` calls `.values` before scaling/fitting), so the fitted model object carries **no** `feature_names_in_` — there is nothing on the model itself to introspect for order. What *was* verified: `train_deployment_model.py`'s `FEATURE_COLS` list (the single variable used both to build `X` for `.fit()` and to write `metadata["feature_names"]`) is the same list in both places by construction — order-correctness is structural, not something a fresh reload can independently re-derive. I'm not claiming a false PASS from introspection that wasn't actually possible.

Both feature lists (32 and 28 names, in order) are printed in full inside the bundle integrity test output (§7) and stored in the bundle itself.

---

## 4. Model loading status

| Artifact | Loads | Type | Notes |
|---|---|---|---|
| `rest_mode_n2.joblib` | YES | `XGBClassifier` | XGBoost version-compatibility `UserWarning` still occurs (expected, unchanged, not fixed per instruction) |
| `drozy_xgboost_vigilance.joblib` | YES | `XGBRegressor` | No warnings |
| `drozy_scaler.joblib` | YES | `StandardScaler` | No warnings, `n_features_in_ == 28` |
| `rest_mode_metadata.json` | YES | — | Valid JSON, reviewed and enriched (see §5) |
| `drozy_model_metadata.json` | YES | — | Valid JSON, unchanged |

Rest Mode task confirmed binary (`classes_ == [0, 1]`, `predict_proba` returns shape `(n, 2)`). Confirmed no scaler is used in Rest Mode training (checked the archived `train_xgboost.py` source directly — no `StandardScaler` or scaling call anywhere).

---

## 5. Rest Mode metadata (Phase 5)

`Rest Mode/models/rest_mode_metadata.json` already existed from Phase 3. Inspected, verified accurate against fresh Phase 4 introspection, and **enriched rather than overwritten** — added the explicitly requested keys (`classes`, `feature_names`, `artifact`, `xgboost_compatibility_warning: true`, `notes`) alongside the existing, already-verified detail (hyperparameters, inference chain, known issues, exact preprocessing). Nothing correct was removed or replaced.

---

## 6. Inference test status

| Script | Mode | Result |
|---|---|---|
| `replay_test.py` | Rest | PASS — single-epoch smoke test, N2 predicted (88.08%), matched ground truth |
| `replay_multiple.py` | Rest | PASS — 50 epochs, 96% accuracy, 97.73% N2 recall |
| `sleep_state_engine.py` | Rest | PASS — smoothing applied, 2 state changes detected |
| `smart_alarm.py` | Rest | PASS — smart N2 alarm correctly triggered at epoch 142 |
| `predict_vigilance.py` | Drive | PASS — batch inference on a real 120s sample extracted fresh from `dataset/01M_1.edf` |
| `realtime_simulator.py` | Drive | PASS — streamed `01M_1.edf`, live vigilance/trend/status output |
| `vigilance_trend.py` | Drive | PASS (exercised via `realtime_simulator.py` and `test_deployment_pipeline.py`, both of which import it directly) |
| `test_deployment_pipeline.py` | Drive | PASS — all 6 built-in checks green, including the LOSO-consistency sanity check (correlation 0.822, the expected signature of correct wiring) |

All 8 were re-run in Phase 4, after archiving the original Rest Mode model out of `scripts/models/`, to confirm nothing broke. Grep-confirmed: no remaining `D:\Rest Mode` reference anywhere in the 5 active Rest Mode scripts.

---

## 7. Bundle creation, loading, and prediction-equivalence status

**Creation:** PASS. Built from the actual loaded model/scaler objects (`joblib.load()` of the real artifact files, never reconstructed from hyperparameters). `SIH-26/models/` created; bundle written to `SIH-26/models/smartsense_models.pkl`.

**Fresh-process load:** PASS. Loaded in a brand-new `python.exe` invocation with no shared state with the process that built it.
```
models = joblib.load("models/smartsense_models.pkl")
models["rest_mode"]["model"]    -> XGBClassifier   OK
models["drive_mode"]["model"]   -> XGBRegressor     OK
models["drive_mode"]["scaler"]  -> StandardScaler   OK
```

**Prediction equivalence (Rest Mode):** PASS. Identical 5-row random input through the original `rest_mode_n2.joblib` and the copy inside the bundle → identical `predict()` output and **bit-for-bit identical** `predict_proba()` output.

**Prediction equivalence (Drive Mode):** PASS. Identical 5-row random input, scaled through both the original and bundled `StandardScaler` (identical output), then through both the original and bundled `XGBRegressor` → **max absolute difference: 0.0**.

No newly-trained model was used anywhere in this test — both sides of every comparison load the same pre-existing trained artifacts.

---

## 8. SHA256 hashes

| Artifact | SHA256 |
|---|---|
| `Rest Mode/models/rest_mode_n2.joblib` | `5ea4cc86e46386c173a2ba319009105a624c573dc164c1015380544c046144e4` |
| `Rest Mode/models/rest_mode_metadata.json` | `14d62710b2be528baac1ce7608e1d5ede35b6a44a37fb0468f6c3a6daf287ea9` |
| `Drive Mode/models/drozy_xgboost_vigilance.joblib` | `4e75043da9d72b14646e6ba5ce413c1a4ef1f8b60fb0eae93535a2728765c592` |
| `Drive Mode/models/drozy_scaler.joblib` | `5dceeee74b3707c0fc5cb32bf7bc48ddf14df7c1481b7a023582af48f8299749` |
| `Drive Mode/models/drozy_model_metadata.json` | `71aa606784ae63967cb0094e0ab71fd13538f7815b3063d51ef2bd8b80c512db` |
| `models/smartsense_models.pkl` (the bundle itself) | `b85e461140c4d768c42d29e6e15d334483de4a25ab1b6e8d3d48d35596107b25` |

The first 4 model/scaler hashes are **identical** to the ones recorded in the Phase 3 report — confirmed untouched across the entire Phase 4/5/6 process. Bundle size: 2.56 MB.

---

## 9. Remaining warnings

1. **XGBoost version-compatibility warning on `rest_mode_n2.joblib`** (and therefore on the bundle's `rest_mode.model` too, since it's the same object) — loads and predicts correctly today; not addressed, per explicit instruction not to re-export or retrain.
2. **Two independent feature-extraction code paths in Rest Mode** (`feature_extractor.py`, canonical/imported; `replay_multiple.py`'s inline duplicate) — currently equivalent (same band definitions, same filter cutoffs), but could silently drift if one is edited without the other. Documented in metadata `known_issues`.
3. **Drive Mode's model has no `feature_names_in_`** (trained on a raw array) — feature-order correctness for Drive Mode rests on `train_deployment_model.py`'s single-source-of-truth `FEATURE_COLS` list, not on independently re-derivable model introspection (§3).

## 10. Remaining limitations

- Neither model is clinically validated (both metadata files say so explicitly, unprompted, and this report doesn't override that).
- Rest Mode's deployment scaling story is "no scaler, tree-based model, verified from source" — not a placeholder.
- Drive Mode's `drozy_model_metadata.json` already documents that the deployed artifact was trained on all 10 DROZY subjects with no held-out subject, so it alone provides no generalization evidence (LOSO mean-subject R² = -0.563 is cited there, not fabricated here).
- ~13 archived Rest Mode research scripts still contain stale `D:\Rest Mode` paths and will not run without fixing (deliberately left, per your decision).

## 11. Exact path to the bundle

**`D:\SIH-26\models\smartsense_models.pkl`**
