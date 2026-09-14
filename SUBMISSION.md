# Agent Tank submission — Instar

**Track:** Autonomous Protocols  
**Builder:** LIBRAPHILIP  
**Rule check:** one project per portal account · public GitHub · full application

## One sentence

Instar is a self-molting nervous system for other contracts: anyone who proves an exploit can halt or tune the body, and the only way the rules themselves change is a molt that survives GenLayer consensus — no vote, no owner key.

## What we shipped

| Piece | Where |
|-------|--------|
| Governor Intelligent Contract | `contracts/instar.py` |
| Governed vault (the body) | `contracts/hemolymph.py` |
| App | this repo, Vite + `genlayer-js` |
| Tests | `npm test` |

## How it maps to the brief

> Systems that run themselves. If a contract pauses, tunes or rewrites another contract or its own rules with no one voting, it belongs here.

| Idea they asked for | Instar |
|---------------------|--------|
| Emergency halt module | `file_threat` → HALT. Anyone. Public URL. Validators re-fetch. Hemolymph draws revert. |
| Intelligent policy that reads and reacts | Genome `tightness_bps` / `max_draw_bps` TUNE from evidence. The body cannot ignore it. |
| Contracts that govern contracts | Hemolymph has **zero** local pause. It reads Instar on every draw. |
| Lifeform | `pulse()` rewrites the constitution from wound history. Hatch constitution is kept; skins are stored in `get_molts`. Hatcher cannot edit rules. |

## What is deliberately not here

- No multisig, no governor token, no `onlyOwner` pause.
- No frontend LLM whose verdict is written on-chain.
- No mock consensus path.
- Not a docket, not a prediction market, not a recall bond, not a content court.

## Demo path (four minutes)

1. Open the live app. Connect or use ephemeral. Fund on Studionet.
2. **Hatch organism** — three accepted txs (Instar, Hemolymph, bind).
3. Load **Sample non-exploit** (GenLayer docs) → file threat → expect STAND.
4. Load **Sample exploit page** → file threat → HALT or TUNE depending on validators.
5. Try **Draw** while halted — must revert.
6. **Fire pulse** — lifeform loop, may MOLT if wounds justify it.
7. Watch votes in the nervous-system panel; they come from `consensus_data.votes`.

## Consensus (for protocol reviewers)

- `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`
- Leader and validators both `gl.nondet.web.get` the evidence URL (threat / resume).
- Compared fields: `action_final`, `exploit_active`, `paused_next`, `generation_next`, confidence ±25, TUNE key + clamped value.
- Genome gates run inside the nondet block so a HALT below `halt_confidence_min` becomes STAND *before* storage writes.
- Side effects (`self.paused`, constitution, genome) happen only after consensus.

## Live pointers

- App: https://instar-lifeform.vercel.app
- Repo: https://github.com/LIBRAPHILIP/instar
- Hatch from the UI (Studionet). Addresses land in `src/deployed.json` after `npm run deploy:*`.
