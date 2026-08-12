# Collar Lab — Design Plan

> **Status (Aug 2026):** v1 built and shipped, all 7 tabs live. Restyled to match the
> Investment dashboard (navy/amber masthead, Archivo/Instrument Sans/JetBrains Mono,
> white cards on paper; chart series are validated steps of the brand hues).
> Three-agent UX review completed; all fixes applied, plus the full roadmap:
> spot-linked implied-vol dynamics on tabs 3–4 (leverage effect + gap spikes,
> "paid twice" live), restrike/roll menu on tab 3, with/without-dealer-flow
> pinning sim on tab 4, borrow + crossing costs in dealer P&L, vega/theta
> structure comparison on tab 6.
> Remaining ideas if wanted: discrete CBA dividends + ex-div timeline, margin-loan
> funded-collar economics, vol dynamics inside the tab-7 Monte Carlo.

# Original plan (v0, as discussed)

Teaching dashboard: everything about equity collars, greeks-first, scaled up to a
30x ADV multi-tranche program on CBA.AX. Visual, chronological, simulates trader
behaviour on both sides of the trade.

## Reference stock: CBA.AX
- Spot ~A$170 (working assumption; slider everywhere, 52wk range ~140–192)
- Market cap ~A$255B
- ADV ~2.5M shares ≈ ~A$400–450M/day
- **30x ADV ≈ 75M shares ≈ A$11–13B notional** — i.e. a strategic-stake style
  OTC funded collar, not an ETO trade. This drives the whole "size" narrative.
- Big semi-annual fully-franked dividends → forward/carry and early-exercise
  discussion is material.
- ETO conventions (for the small-size baseline): 100 shares/contract, mostly
  American singles, expiry Thursday before last business Friday.

## Proposed tabs (chronological = left to right)

1. **Foundations** — anatomy of a collar. Payoff/P&L diagrams (per leg + net),
   long stock + put + short call composition, zero-cost strike solver under BS,
   why skew makes the "free" collar asymmetric. Interactive: strikes, tenor, vol.

2. **Greeks Lab** — the core teaching tab. Net collar greeks vs spot/time/vol:
   delta, gamma, vega, theta, rho + vanna & charm (needed later for dealer-flow
   story). Small-multiples: each leg's greek and the net. Key visual: the collar's
   gamma "dumbbell" — short gamma near the call, long gamma near the put.

3. **Life of a Trade (10x ADV baseline… actually <10 ADV)** — single-tranche
   collar walked day-by-day on a simulated CBA path. Timeline scrubber: inception
   → mark-to-market → ex-div → approach expiry → pin risk → expiry/roll. Greeks
   evolve live; annotated "what the trader is thinking" at each stage.

4. **The Dealer's Book** — flip perspective. Dealer is short the put / long the
   call → their delta hedge, gamma sign, hedging P&L vs realised vol. Simulate
   discrete re-hedging on the path; show hedging flows and why they push the
   stock around near strikes (pinning / repelling).

5. **Size & Impact** — why 30x ADV changes everything. Initial delta hedge alone
   = many days of ADV. Market impact model (square-root law), participation-rate
   execution. Single-strike vs **multi-tranche averaging-in**: strikes set at
   prevailing spot per tranche → gamma dispersed across levels instead of one
   cliff. Visual: aggregate dealer gamma profile, concentrated vs laddered.

6. **Spreads as Wings** — put-spread collar (sell tail put to cheapen — JPM
   Hedged Equity style) and call-spread overwrite (retain upside above the cap).
   How each reshapes the greeks profile, what risk gets reintroduced (gap risk
   below the low put), premium trade-offs.

7. **Campaign Simulator (capstone)** — build the full 30x ADV program: N
   tranches, schedule, participation rate, strike-setting rule, wings on/off.
   Run Monte Carlo / scripted paths; outputs: blended strikes, aggregate greeks
   over time, dealer hedge flow vs ADV, impact cost, final P&L distribution vs
   naked stock and vs one-shot collar.

## Modelling choices (to confirm)
- Black-Scholes core with continuous dividend yield first; discrete dividends +
  vol skew (simple parametric smile) as a toggle layered in later.
- Perspective toggle (client / dealer) available globally, not just tab 4.
- Simulated paths: GBM baseline + a few scripted "story" paths (grind up, crash,
  pin at strike) because scripted paths teach better than random ones.

## Tech (to confirm)
- Local static app in this folder: vanilla JS modules + SVG charts, no build
  step. Open index.html in browser; easy to iterate, everything inspectable.
- Alternative: Vite + React if preferred.

## Open questions for user
1. Client vs dealer emphasis — global toggle OK?
2. Skew: parametric smile from day one, or flat-vol first then add?
3. OTC European framing for the big trade (with ETO American baseline early) OK?
4. Tech stack preference?
5. Zero-cost constraint always on, or premium-paying collars too?
