---
name: python
description: Small, robust Python tools for automation, scraping and data work.
---
# Python Scripts & Automation

- Python 3.11+, standard library first (`pathlib`, `argparse`, `json`, `csv`, `subprocess`, `concurrent.futures`).
- Structure: a `main()` with `argparse`, guarded by `if __name__ == "__main__":`. Type hints on public functions.
- I/O: `pathlib.Path`, context managers, UTF-8 explicitly. Never overwrite inputs; write outputs next to them or to a folder.
- HTTP: `httpx` or `requests` with timeouts and retries; respect robots.txt and rate limits when scraping; prefer an official API.
- Data: `pandas` for tables, `polars` when large. Validate columns before processing.
- Errors: catch specific exceptions, print a clear message and exit non-zero; log progress for long jobs.
- Dependencies in `requirements.txt` with versions; show the exact run command.
