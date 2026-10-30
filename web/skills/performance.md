---
name: performance
description: Measure first, then fix the real bottleneck.
---
# Performance

1. Measure: Lighthouse / Web Vitals (LCP, INP, CLS) for the web, a profiler or timing logs for servers, `EXPLAIN ANALYZE` for SQL.
2. Fix the biggest cost first, then measure again.

Web: ship less JS (code-split routes, drop heavy libraries), preload the LCP image and fonts, set image sizes and `aspect-ratio`, lazy-load below the fold, avoid layout thrash, debounce input handlers, virtualise long lists.
Server: add the missing index, remove N+1 queries, cache expensive reads (HTTP cache headers, Redis), stream large responses, set timeouts, do slow work in background jobs.
Algorithms: state the time and space complexity and pick a better structure (hash map, heap, two pointers) when the input can grow.
Report the before and after numbers.
