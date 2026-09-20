-- SmartSense Rest Mode — enable per-epoch persistence of REAL live predictions
-- into the existing public.sleep_epochs table (created in 0001_init_schema.sql).
--
-- Context: 0001 already defines sleep_epochs with exactly the columns this
-- needs (n2_probability, binary_prediction, prediction_label,
-- smoothed_n2_probability, current_smoothed_sleep_state, model_version_id),
-- but nothing populated it yet — the frontend only ever wrote sleep_sessions
-- rows (see lib/dbSession.ts). This migration does NOT create a new table,
-- drop anything, or touch any other table's data; it only:
--   1. Gives sleep_epochs.features a safe default so a live-mode insert that
--      has no per-feature breakdown to report (the WebSocket prediction
--      message carries the model's OUTPUT, not its 32-feature INPUT vector)
--      can satisfy the existing "features jsonb not null" constraint without
--      fabricating feature values or loosening the column's NOT NULL rule.
--      (Raw EEG/EOG samples are still never stored here — nothing about this
--      migration changes that; it stores prediction output, not signal.)
--   2. Seeds ONE reference row in the existing public.model_versions table
--      for the deployed Rest Mode model, sourced from the real metadata file
--      (Rest Mode/models/rest_mode_metadata.json) shipped with the model
--      bundle, not invented — so sleep_epochs.model_version_id can point to
--      a real, traceable model version instead of staying null.

alter table public.sleep_epochs
  alter column features set default '{}'::jsonb;

insert into public.model_versions (
  model_name,
  version,
  algorithm,
  feature_extractor_version,
  training_dataset,
  validation_metrics,
  model_path,
  notes
)
values (
  'rest_mode_n2',
  '1.0',
  'XGBoost',
  'Rest Mode/scripts/feature_extractor.py (32-feature contract, verified against the model''s own feature_names_in_)',
  'DREAMT (dreamt-dataset-for-real-time-sleep-stage-estimation-using-multisensor-wearable-technology-2.2.0)',
  jsonb_build_object(
    'classes', jsonb_build_array('non-N2', 'N2'),
    'sampling_rate_hz', 100,
    'epoch_length_seconds', 30,
    'clinically_validated', false
  ),
  'Rest Mode/models/rest_mode_n2.joblib',
  'Binary N2 vs Non-N2 XGBClassifier, no scaler. Not clinically validated — see rest_mode_metadata.json.'
)
on conflict (model_name, version) do nothing;
