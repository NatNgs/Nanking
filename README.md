# Nanking

Tool for ranking entries using various criterions (user notation, pair comparisons, ...).

## TODO List

- Implement Dual comparison mode, and first computed notes algorithm
- Add rate-limiting on API endpoints, to prevent abuse (see below)
- Uniformize client-side error handling: currently, a failed API call while a token
  expires mid-session does not always redirect to the login page (only `goToPage`
  does it; `callAPI`/`APIget`/`APIpost`/`APIput` callers must handle the error
  themselves, and most don't)

### Rate-limiting

Not implemented yet. Each API endpoint could benefit from rate-limiting to prevent abuse,
with different settings depending on the endpoint's sensitivity:

- `POST /login`: strict limit (e.g. 5 attempts / minute / IP), to slow down brute-force
  attempts on account passwords.
- `PUT /user/entry`, `POST /quiz/dual`: looser limit (e.g. 60 requests / minute / user),
  mostly to prevent scripted abuse rather than security.

Suggested implementation:

1. Add a lightweight rate-limiting middleware (e.g. `express-rate-limit`), configured
   per-route rather than globally, so `/login` can have a stricter window than
   `/user/*`/`/quiz/*`.
2. Key the limiter by IP for the unauthenticated `/login` route, and by authenticated
   username (`req.user.username`, once `authenticate` has run) for the routes under
   `/user` and `/quiz` — an IP-based limit alone would penalize multiple users behind
   the same NAT/proxy.
3. Store limiter state in memory (sufficient for a single-instance server like this
   one); revisit only if the server is ever run as multiple instances behind a
   load-balancer, in which case a shared store would be needed.
4. Return `429 Too Many Requests` with a `Retry-After` header so the client can inform
   the user rather than silently failing.
