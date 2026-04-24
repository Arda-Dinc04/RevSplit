# Optional Data Inputs

`tools/reverse_split_exporter.py` can import local CSV files before it scrapes free public sources.

- `data/split_performance.csv`: EDGAR-style rows from the Split Strategy project.
- `data/reverse-splits-2025.csv`: historical reverse split archive seed data.
- `--archive-csv path/to/reverse-splits-YYYY.csv`: additional historical reverse split archive rows.

The dashboard only reads `public/data/reverse-splits.json` at runtime.
