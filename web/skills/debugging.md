---
name: debugging
description: Reproduce, isolate and fix the real cause of a bug, then prove it.
---
# Root-Cause Debugging

1. Restate the symptom precisely: expected vs actual, exact error text, where and when it happens.
2. Reproduce with the smallest input. If you cannot reproduce, say what information would let you.
3. Form 2–3 hypotheses ranked by likelihood, and name the cheapest check that rules each in or out (a log line, a breakpoint, a failing test).
4. Read the error from the bottom of the stack trace to the first frame in the user's own code.
5. Fix the cause, not the symptom. Search for every caller of the code you change so the fix lands once, in the shared place.
6. Prove it: a test or a short reproduction that failed before and passes now.
7. Explain in two sentences: what was wrong and why the fix works. Mention any similar spot that may have the same bug.
Never swallow errors with empty catch blocks to make a symptom go away.
