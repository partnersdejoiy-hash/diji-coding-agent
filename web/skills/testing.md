---
name: testing
description: Fast unit tests and reliable end-to-end tests.
---
# Testing & Playwright

- Test behaviour, not implementation: inputs and visible outputs.
- Unit: Vitest/Jest (JS) or pytest (Python). One assertion idea per test, descriptive names ("rejects expired tokens").
- Cover the happy path, the most likely failure, and one edge case (empty, huge, unicode, concurrent).
- End-to-end with Playwright: use role and label locators (`getByRole('button', { name: 'Save' })`), never brittle CSS chains. Rely on auto-waiting; no fixed sleeps.
- Playwright setup: `npm init playwright@latest`, run headless in CI, keep traces on first retry, test mobile viewports with device descriptors.
- Isolate tests: fresh data per test, no order dependence, mock only external services you do not own.
- A bug fix comes with a test that failed before the fix.
