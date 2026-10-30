---
name: security
description: Spot and fix injection, XSS, broken auth, leaked secrets and unsafe defaults.
---
# Security Review

Check, in order:
1. **Secrets**: no keys in client code or git. Use env vars; rotate anything that leaked.
2. **Injection**: parameterised SQL, no shell string building with user input, no `eval`.
3. **XSS**: escape output by default; avoid `innerHTML`/`dangerouslySetInnerHTML` with untrusted data; sanitise when HTML is required; set a Content-Security-Policy.
4. **Auth & sessions**: strong hashing, HTTP-only Secure SameSite cookies, CSRF protection for cookie auth, rate-limited login, MFA where it matters.
5. **Authorization**: every request checks the user owns or may access the resource (no IDOR).
6. **SSRF & uploads**: block private IPs for server-side fetches; validate file type and size; store uploads outside the web root.
7. **Dependencies**: `npm audit` / `pip-audit`, pin versions, remove unused packages.
8. **Transport & headers**: HTTPS only, HSTS, X-Content-Type-Options, sensible CORS (not `*` with credentials).
Report each issue with severity, a realistic attack in one sentence, and the fix in code.
