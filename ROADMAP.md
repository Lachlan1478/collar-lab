# Roadmap

Where the project stands and what comes next. See `ARCHITECTURE.md` for why the
stack is split the way it is, and `PLAN.md` for the original course design.

## Where we are

**Education pack** (`index.html`) — six tabs, complete and reviewed three times:

1. Foundations · 2. Greeks Lab · 3. Bank's Book · 4. Size & Impact ·
5. Spread Wings · 6. Campaign Sim

Every tab carries an animated Scenario theatre (play/pause, milestone narration,
Continue buttons at teaching moments). Path-reactive implied vol with skew
steepening in stress drives tabs 3, 4 and 6.

**Pricer** (`pricer/index.html`) — market data as-of a date, an editable leg
blotter, and outputs where **every value opens a full math trace**: components,
formulas and per-leg arithmetic with numbers substituted in. Outputs today are
collar notional, lending amount, average tenor, lending ratio, PV of lending, net
premium, and the five bank-book greeks.

Tested against a 1-tranche 1y European collar on CBA.AX: strikes solve to
zero-cost within A$201 on a A$177M structure, and the PV/discount arithmetic
reconciles by hand.

---

## Next: pricer depth (highest value)

1. **Multi-tranche worked example.** The blotter already supports N legs with
   different expiries and the outputs weight across them correctly, but there is
   no worked multi-tranche case and no per-tranche breakdown in the traces.
   Add a 6-tranche loader and tranche-level trace sections.
2. **Payoff preview wired to the blotter.** A live payoff-at-expiry chart built
   from whatever legs are in the table — the fastest way to catch a mis-keyed
   direction or strike.
3. **Structure library.** Save/load named structures. Needs persistence, so this
   is the first feature that genuinely wants a Python backend.
4. **Financing depth.** Funding spread over the base rate, margin schedule,
   LVR triggers, and the actual cashflow timeline of a funded collar — with
   traces, in keeping with the audit-first design.
5. **Sensitivity table.** Outputs re-priced across a spot/vol grid, so the desk
   can see where the lending ratio or greeks break down.

## Next: pricing rigour (the Python phase)

Per `ARCHITECTURE.md`, add Python endpoints alongside `server.py` rather than
rewriting the interactive layer:

- **American options** via binomial tree (today: priced European, disclosed).
  The course's early-exercise radar shows exactly when this matters.
- **Asian options** via Monte Carlo (today: averaging-vol approximation).
- **Calibrated vol surface** instead of the parametric skew — the pricer
  currently uses flat 90-day realised vol with no smile, which is the single
  largest modelling gap.
- **A reconciliation harness**: price the same structures through both the JS
  fast path and the Python library, and assert they agree within tolerance. This
  is how the fast path earns continued trust.

## Next: tying the two dashboards together

The original intent. Candidates:

- **Push a priced structure into the course.** Build it in the pricer, then open
  it in Campaign Sim to watch it play out on scenario paths.
- **Pull teaching context into the pricer.** Clicking a greek could link to the
  tab that explains it.
- **Shared market state** so both dashboards read the same as-of date and spot.

## Smaller items

- **README** covering setup (`python3 server.py 8317`) and what each dashboard is
  — the repo is public now and does not yet explain itself.
- **Discrete dividends with ex-div dates** rather than a continuous yield, which
  would sharpen both the early-exercise radar and the pricer's forward.
- **Vol dynamics inside the Campaign Monte Carlo** — paths are still constant-vol
  GBM while strike pricing reacts to path vol; the inconsistency is disclosed in
  a caption but worth closing.
- **Quiz mode** for the course: hide the tiles, predict, then reveal.

## Principles to hold

- **Every output traceable.** New outputs ship with their trace, not after.
- **One engine.** Course and pricer share `js/bs.js`; they must never disagree.
- **Minimal surface.** Value-only tiles; detail lives behind a click.
- **Honest captions.** If the model simplifies, the page says so — the review
  rounds caught real cases of confident text over wrong economics.
