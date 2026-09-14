# Instar

**The protocol that molts.**

- GitHub: https://github.com/LIBRAPHILIP/instar
- Demo: https://instar-lifeform.vercel.app
- Track: Agent Tank · **Autonomous Protocols**

A self-molting autonomic governor on [GenLayer](https://genlayer.com).

> If a contract pauses, tunes, or rewrites another contract — or its own rules — with no one voting, it belongs here.

Instar does all four, as one organism.

| Reflex | What happens | Who votes |
|--------|----------------|-----------|
| **HALT** | Pauses Hemolymph. Draws revert. | Nobody. Anyone with a public exploit URL. |
| **TUNE** | Rewrites `max_draw_bps` / `tightness_bps` the body must obey | Nobody. |
| **MOLT** | Rewrites Instar's own constitution | Nobody. The hatcher cannot. |
| **RESUME** | Unpause only if a page proves the hole is closed | Nobody. Not an admin key. |
| **Pulse** | Lifeform loop: re-reads wounds, may molt | Anyone can fire it. |

There is no owner pause. There is no token vote. After hatch, the only editor of the rules is a MOLT that survives Optimistic Democracy.

## Why this is not a pause guardian

A normal circuit breaker is a multisig. Instar is a nervous system:

1. Evidence is a public URL. Each validator independently calls `gl.nondet.web.get`.
2. Equivalence is **field-level**: `action_final`, `exploit_active`, `paused_next`, `generation_next`, TUNE key/value. Rationale text is free.
3. Genome gates run **inside** consensus (`halt_confidence_min`, etc.). Weak HALT degrades to STAND before state changes.
4. Hemolymph never trusts the frontend. It reads `is_paused`, `get_max_draw_bps`, `get_tightness_bps` through `gl.get_contract_at`.
5. Monetary tightness is policy that *reads and reacts*: a near-miss TUNE shrinks how much blood the body may lose per bite.
6. `pulse()` is the lifeform loop — no new URL, the contract rewrites itself from its own scar tissue.

## Organism

```
anyone + evidence URL
        │
        ▼
   Instar.file_threat
        │
        ├─ leader fetches page + LLM structured reflex
        ├─ validators re-fetch, re-judge, compare decision fields
        └─ HALT | TUNE | MOLT | STAND
                │
                ▼
         Hemolymph.draw
                │
                ├─ is_paused? revert
                ├─ amount > credit * max_draw_bps * tightness_bps / 1e8 ? revert
                └─ emit_transfer
```

- Governor: [`contracts/instar.py`](contracts/instar.py)
- Body: [`contracts/hemolymph.py`](contracts/hemolymph.py)

## Quick start

```bash
cd instar
npm install
npm test
npm run dev
```

Open the Vite URL (default `http://localhost:5177`).

Judges: see [`HOW_TO_DEMO.md`](HOW_TO_DEMO.md) and [`SUBMISSION.md`](SUBMISSION.md).

1. **Ephemeral** or **Connect** a wallet on Studionet / Bradbury.
2. Fund the account (Studio 💧 or [Bradbury faucet](https://testnet-faucet.genlayer.foundation)).
3. **Hatch organism** — deploys Instar, deploys Hemolymph, binds the body once.
4. File a threat with a public URL, or load the sample exploit / non-exploit pages.
5. Watch validator votes from `consensus_data.votes` (not a mock).
6. Deposit into Hemolymph, preview the genome cap, try a draw. Halt the organism and watch the draw revert.

CLI deploy:

```bash
npm run deploy:studionet
# PRIVATE_KEY=0x… npm run deploy:bradbury
```

Addresses land in `src/deployed.json` and `deployments/`.

## Contract surface

### Instar

| Method | Type | Effect |
|--------|------|--------|
| `bind_subject(address)` | write | Once. Forever. |
| `file_threat(url, allegation)` | write | Anyone. Consensus reflex. |
| `pulse()` | write | Lifeform loop from stored wounds. |
| `resume_probe(url, note)` | write | Evidence-based unpause. |
| `is_paused` / `get_max_draw_bps` / `get_tightness_bps` | view | What the body obeys. |
| `get_status` / `get_lineage` / `get_molts` | view | Organism + scar tissue. |

### Hemolymph

| Method | Type | Effect |
|--------|------|--------|
| `deposit()` | payable write | Add credit. |
| `draw(amount_wei)` | write | Gated by Instar. No local override. |
| `preview_draw(who, amount)` | view | Dry-run the gates. |

## Networks

| Network | RPC | Explorer |
|---------|-----|----------|
| Studionet | `https://studio.genlayer.com/api` | [explorer-studio](https://explorer-studio.genlayer.com) |
| Bradbury | `https://rpc-bradbury.genlayer.com` | [explorer-bradbury](https://explorer-bradbury.genlayer.com) |

## For Agent Tank reviewers

- Track: **Autonomous Protocols**.
- One build. Public GitHub + full app (this repo).
- Intelligent Contract uses `gl.vm.run_nondet_unsafe` with independent web fetch and partial-field equivalence — not `prompt_non_comparative` as a schema check, not a frontend LLM whose answer is stored.
- The hatcher address is provenance only. There is no `set_constitution`, no `admin_pause`.
- Tests: `npm test` covers genome clamp, reflex gates, molt generation, Hemolymph cap math.

## License

MIT
