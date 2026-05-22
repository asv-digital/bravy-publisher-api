# Generation Datasets

Drop here:

- `padroes_validados.json` — `PatternInfo[]`
- `top_carrosseis.json` — `DatasetTop[]`
- `vocab.json` — `Record<persona, VocabEntry>`

Override location with `DATASET_DIR=/abs/path` env var.

If a file is missing the generation service falls back to an empty list (warning is logged).
