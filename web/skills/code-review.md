---
name: code-review
description: Review for correctness, safety, load, tests and needless code.
---
# Code Review

Read the connected code, not only the diff. Report findings ordered by severity:

- **Blocker**: wrong logic, data loss, security hole, crash on a common path.
- **Should fix**: missing error handling, race conditions, N+1 queries, untested risky branch, breaks under real load or large input.
- **Nice to have**: naming, duplication, simpler standard-library alternative, dead code.

For each finding: file and line, what goes wrong in plain words, a concrete scenario that triggers it, and the smallest fix (show code). Call out what is good too, briefly. Finish with a one-line verdict: ship, ship after fixes, or rework.
