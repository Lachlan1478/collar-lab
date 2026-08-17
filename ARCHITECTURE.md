# Architecture — why it's built this way

## What the stack actually is

There is no Java in this project. The confusion is a common one: **Java** and
**JavaScript** are unrelated languages that share a name for historical marketing
reasons. Java is a compiled JVM language (backend services, Android); JavaScript
is the language every web browser runs natively.

The repo is three things:

| Layer | Language | Files |
|---|---|---|
| Server + market data | **Python** | `server.py` |
| Pages | **HTML/CSS** | `index.html`, `pricer/index.html`, `css/style.css` |
| Everything interactive | **JavaScript** | `js/*.js`, `pricer/pricer.js` |

So Python and HTML are already here. The real question is why the *pricing and
charting logic* lives in browser JavaScript rather than in a Python/Flask backend.

## Why the maths runs in the browser

**Latency is the whole product.** Both dashboards re-price the entire structure on
every input event — every slider drag on the course, every keystroke in the
pricer's blotter. In-browser that round trip is roughly a millisecond with no
network involved. Behind Flask, each of those becomes an HTTP request:

- The Campaign tab runs a **400-path Monte Carlo** on every parameter change.
  In-browser it completes in ~30–50ms (measured). Over HTTP it becomes a spinner.
- The scenario players animate at up to 60fps, recomputing greeks per frame.
  Server round-trips per frame are not viable.
- The pricer's trace panels re-derive every intermediate (d₁, d₂, N(d), discount
  factors) as you type. Instant feedback is what makes them useful for validation.

**One engine, two dashboards.** `js/bs.js` is imported by both the course and the
pricer, so a greek shown in the teaching material and the same greek in the pricer
are computed by identical code. They cannot drift apart.

**Zero install.** Open the page, it works. No virtualenv, no dependency
resolution, no build step. For a teaching tool that matters.

## Where Python/Flask would genuinely be better

The current approach has real limits, and they are the reasons to add a Python
backend rather than replace anything:

1. **Library-grade pricing.** `js/bs.js` is ~200 lines of hand-rolled
   Black-Scholes. Python gives `scipy`, `numpy` and `QuantLib` — properly tested,
   and the right tools for:
   - American options via binomial/trinomial trees (currently priced European
     with a disclosed caveat)
   - Asian options via Monte Carlo (currently an averaging-vol approximation)
   - Calibrated vol surfaces instead of a parametric skew
2. **Persistence.** Saving structures, audit trails, comparing today's pricing to
   yesterday's. Needs a server and a database.
3. **Trust.** When numbers drive decisions, a validated library beats bespoke
   code. The trace panels mitigate this by making every number auditable, but they
   do not replace a tested pricing library.
4. **Heavy computation.** Large Monte Carlo, scenario grids, XVA-style adjustments
   — work that should not run on the UI thread.

## The intended end state: hybrid, not a rewrite

Keep the browser JavaScript for the instant interactive layer. Add Python
endpoints alongside `server.py` for work that deserves real libraries.

```
Browser (JavaScript)                    Python backend
├─ instant re-pricing on input          ├─ /api/hist        (exists today)
├─ charts, animation, scrubbing         ├─ /api/price/exotic  American, Asian
├─ trace panels                         ├─ /api/calibrate     vol surface
└─ vanilla BS for the fast path         └─ /api/save          persistence
```

The page stays identical; the numbers that need rigour come from Python, and the
UI stays responsive because the fast path never leaves the browser.

## Verdict

Neither language is "better" in the abstract. JavaScript is the only language
browsers execute, which makes it non-negotiable for the interactive layer. Python
is materially stronger for quantitative work, which makes it the right home for
exotic pricing, calibration and persistence. The build so far prioritised
responsiveness and zero-install teaching value; the next phase adds Python where
precision matters more than latency.
