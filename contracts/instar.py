# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Instar — a self-molting autonomic governor for GenLayer.

No token vote. No owner pause. No committee.

Anyone who can prove an exploit with a public URL trips a reflex.
Validators independently re-fetch the evidence and agree on a structured
action. Only then does Instar:

  HALT   — pause the bound subject (emergency halt module)
  TUNE   — rewrite a genome parameter the subject must obey
  MOLT   — rewrite Instar's own constitution (lifeform)
  RESUME — unpause if public evidence shows the hole is closed
  STAND  — evidence is rumor, mismatch, or too weak

The hatcher cannot change the constitution. The only way the rules change
is a MOLT that survives Optimistic Democracy.

Hemolymph (the body) reads is_paused / max_draw_bps / tightness_bps and
cannot move value if this contract says no.
"""

from genlayer import *

import json
import time
import collections.abc


VERSION = "1.0.0-instar"
BODY_LIMIT = 12000
MAX_CONSTITUTION = 4000
MAX_ALLEGATION = 1500
MAX_URL = 500
MAX_RATIONALE = 1200
ZERO = Address("0x0000000000000000000000000000000000000000")

ACTIONS = ("HALT", "TUNE", "MOLT", "STAND", "RESUME")
TUNE_KEYS = (
    "halt_confidence_min",
    "tune_confidence_min",
    "molt_confidence_min",
    "max_draw_bps",
    "tightness_bps",
    "molt_min_wounds",
)

DEFAULT_CONSTITUTION = (
    "Instar is the autonomic nervous system of its bound subject. "
    "No human vote. No owner pause. "
    "HALT if public evidence shows an active or still-unpatched exploit that can drain funds, "
    "mint without cap, seize ownership, or bypass the subject's limits. "
    "TUNE tightness_bps or max_draw_bps downward when a near-miss or same-class historical "
    "exploit is proven against this class of vault. "
    "MOLT only when this constitution failed to name the attack class — rewrite it so the "
    "next reflex is faster and narrower. "
    "RESUME only when public evidence shows the hole is closed. "
    "STAND on rumor, marketing pages, unmatched allegations, or missing mechanism. "
    "Never invent an exploit from a page that does not describe one."
)

DEFAULT_GENOME = {
    "halt_confidence_min": 70,
    "tune_confidence_min": 55,
    "molt_confidence_min": 80,
    "max_draw_bps": 2500,
    "tightness_bps": 10000,
    "molt_min_wounds": 2,
}


def _now() -> str:
    return str(int(time.time()))


def _clamp_int(n, lo: int, hi: int, default: int) -> int:
    try:
        v = int(n)
    except Exception:
        return default
    if v < lo:
        return lo
    if v > hi:
        return hi
    return v


def _normalize_genome(raw) -> dict:
    if not isinstance(raw, dict):
        raw = {}
    return {
        "halt_confidence_min": _clamp_int(raw.get("halt_confidence_min"), 0, 100, 70),
        "tune_confidence_min": _clamp_int(raw.get("tune_confidence_min"), 0, 100, 55),
        "molt_confidence_min": _clamp_int(raw.get("molt_confidence_min"), 0, 100, 80),
        "max_draw_bps": _clamp_int(raw.get("max_draw_bps"), 1, 10000, 2500),
        "tightness_bps": _clamp_int(raw.get("tightness_bps"), 1, 10000, 10000),
        "molt_min_wounds": _clamp_int(raw.get("molt_min_wounds"), 1, 20, 2),
    }


def _stage_name(generation: int) -> str:
    if generation <= 0:
        return "egg"
    if generation == 1:
        return "L1"
    if generation == 2:
        return "L2"
    if generation == 3:
        return "L3"
    if generation == 4:
        return "pupa"
    return "imago"


def _gate_action(
    action: str,
    confidence: int,
    genome: dict,
    paused: bool,
    *,
    pulse: bool = False,
    wounds: int = 0,
) -> str:
    action = str(action).upper().strip()
    if action not in ACTIONS:
        return "STAND"
    if action == "HALT":
        if paused:
            return "STAND"
        if confidence < int(genome["halt_confidence_min"]):
            return "STAND"
        return "HALT"
    if action == "TUNE":
        if confidence < int(genome["tune_confidence_min"]):
            return "STAND"
        return "TUNE"
    if action == "MOLT":
        if confidence < int(genome["molt_confidence_min"]):
            return "STAND"
        if pulse and wounds < int(genome["molt_min_wounds"]):
            return "STAND"
        return "MOLT"
    if action == "RESUME":
        if not paused:
            return "STAND"
        if confidence < int(genome["halt_confidence_min"]):
            return "STAND"
        return "RESUME"
    return "STAND"


def _extract_json(raw) -> dict:
    text = raw if isinstance(raw, str) else str(raw)
    text = text.strip()
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            candidate = part.strip()
            if candidate.startswith("json"):
                candidate = candidate[4:].strip()
            if candidate.startswith("{"):
                text = candidate
                break
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    try:
        data = json.loads(text)
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    return data


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1", "y")
    return False


def _fetch_page(url: str) -> tuple[str, str]:
    if not url:
        return "", "no_url"
    try:
        page = gl.nondet.web.get(url)
        body = page.body
        if isinstance(body, bytes):
            body = body.decode("utf-8", errors="replace")
        return str(body)[:BODY_LIMIT], "web_fetch_ok"
    except Exception as e:
        return f"[fetch_failed: {type(e).__name__}]", "web_fetch_failed"


def _apply_next(action: str, paused: bool, generation: int) -> tuple[bool, int]:
    if action == "HALT":
        return True, generation
    if action == "RESUME":
        return False, generation
    if action == "MOLT":
        return paused, generation + 1
    return paused, generation


class Instar(gl.Contract):
    """Autonomic governor. Molts under consensus. Never by vote."""

    version: str
    hatcher: Address
    subject: Address
    bound: bool
    paused: bool
    generation: u256
    constitution: str
    hatch_constitution: str
    genome: str
    incident_count: u256
    incidents: TreeMap[str, str]
    molt_count: u256
    molts: TreeMap[str, str]
    last_action: str
    last_at: str

    def __init__(self, constitution: str):
        text = (constitution or "").strip()
        if not text:
            text = DEFAULT_CONSTITUTION
        if len(text) < 40:
            raise Exception("constitution_too_short")
        if len(text) > MAX_CONSTITUTION:
            text = text[:MAX_CONSTITUTION]
        self.version = VERSION
        self.hatcher = gl.message.sender_address
        self.subject = ZERO
        self.bound = False
        self.paused = False
        self.generation = u256(0)
        self.constitution = text
        self.hatch_constitution = text
        self.genome = json.dumps(_normalize_genome(DEFAULT_GENOME), sort_keys=True)
        self.incident_count = u256(0)
        self.molt_count = u256(0)
        self.last_action = "HATCH"
        self.last_at = _now()

    # ------------------------------------------------------------------
    # Views — the body (Hemolymph) reads these. No LLM here.
    # ------------------------------------------------------------------

    @gl.public.view
    def get_meta(self) -> dict[str, str]:
        g = self._genome()
        return {
            "title": "Instar",
            "version": self.version,
            "track": "autonomous-protocols",
            "consensus": "run_nondet_unsafe independent re-fetch + field equivalence",
            "vote": "none",
            "owner_pause": "none",
            "generation": str(int(self.generation)),
            "stage": _stage_name(int(self.generation)),
            "paused": "true" if self.paused else "false",
            "bound": "true" if self.bound else "false",
            "incident_count": str(int(self.incident_count)),
            "molt_count": str(int(self.molt_count)),
            "max_draw_bps": str(g["max_draw_bps"]),
            "tightness_bps": str(g["tightness_bps"]),
        }

    @gl.public.view
    def get_status(self) -> dict[str, str]:
        g = self._genome()
        return {
            "paused": "true" if self.paused else "false",
            "generation": str(int(self.generation)),
            "stage": _stage_name(int(self.generation)),
            "subject": self.subject.as_hex,
            "bound": "true" if self.bound else "false",
            "hatcher": self.hatcher.as_hex,
            "constitution": self.constitution,
            "hatch_constitution": self.hatch_constitution,
            "genome": self.genome,
            "max_draw_bps": str(g["max_draw_bps"]),
            "tightness_bps": str(g["tightness_bps"]),
            "halt_confidence_min": str(g["halt_confidence_min"]),
            "tune_confidence_min": str(g["tune_confidence_min"]),
            "molt_confidence_min": str(g["molt_confidence_min"]),
            "molt_min_wounds": str(g["molt_min_wounds"]),
            "incident_count": str(int(self.incident_count)),
            "molt_count": str(int(self.molt_count)),
            "last_action": self.last_action,
            "last_at": self.last_at,
            "version": self.version,
        }

    @gl.public.view
    def is_paused(self) -> bool:
        return self.paused

    @gl.public.view
    def get_max_draw_bps(self) -> u256:
        return u256(int(self._genome()["max_draw_bps"]))

    @gl.public.view
    def get_tightness_bps(self) -> u256:
        return u256(int(self._genome()["tightness_bps"]))

    @gl.public.view
    def get_constitution(self) -> str:
        return self.constitution

    @gl.public.view
    def get_genome(self) -> str:
        return self.genome

    @gl.public.view
    def get_incident_count(self) -> u256:
        return self.incident_count

    @gl.public.view
    def get_incident(self, incident_id: str) -> str:
        incident_id = str(incident_id).strip()
        if incident_id not in self.incidents:
            return json.dumps({"error": "incident_not_found", "incident_id": incident_id})
        return self.incidents[incident_id]

    @gl.public.view
    def get_lineage(self, offset: u256, limit: u256) -> collections.abc.Sequence[str]:
        off = max(0, int(offset))
        lim = int(limit)
        if lim <= 0:
            lim = 10
        if lim > 50:
            lim = 50
        total = int(self.incident_count)
        out: list[str] = []
        idx = total - 1 - off
        while idx >= 0 and len(out) < lim:
            key = str(idx)
            if key in self.incidents:
                out.append(self.incidents[key])
            idx -= 1
        return out

    @gl.public.view
    def get_molts(self, offset: u256, limit: u256) -> collections.abc.Sequence[str]:
        off = max(0, int(offset))
        lim = int(limit)
        if lim <= 0:
            lim = 10
        if lim > 20:
            lim = 20
        total = int(self.molt_count)
        out: list[str] = []
        idx = total - 1 - off
        while idx >= 0 and len(out) < lim:
            key = str(idx)
            if key in self.molts:
                out.append(self.molts[key])
            idx -= 1
        return out

    @gl.public.view
    def describe_protocol(self) -> dict[str, str]:
        return {
            "name": "Instar",
            "kind": "autonomic-governor",
            "halt": "anyone with a public exploit URL; validators re-fetch; no vote",
            "tune": "genome parameters the subject must obey (draw cap, tightness)",
            "molt": "rewrites this contract's constitution; hatcher cannot",
            "resume": "evidence that the hole is closed; not an admin key",
            "body": "Hemolymph vault reads is_paused / max_draw_bps / tightness_bps",
        }

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    @gl.public.write
    def bind_subject(self, subject_address: str) -> str:
        """Lock the body. Once. Forever. Not a vote — a hatch."""
        if self.bound:
            raise Exception("already_bound")
        addr = (subject_address or "").strip()
        if not addr:
            raise Exception("subject_required")
        subject = Address(addr)
        if subject == ZERO:
            raise Exception("subject_zero")
        self.subject = subject
        self.bound = True
        self.last_action = "BIND"
        self.last_at = _now()
        return subject.as_hex

    @gl.public.write
    def file_threat(self, evidence_url: str, allegation: str) -> str:
        """Anyone. Prove an exploit. Validators fetch the URL themselves."""
        evidence_url = (evidence_url or "").strip()
        allegation = (allegation or "").strip()
        if len(allegation) < 16:
            raise Exception("allegation_too_short")
        if len(allegation) > MAX_ALLEGATION:
            raise Exception("allegation_too_long")
        if len(evidence_url) > MAX_URL:
            raise Exception("url_too_long")
        if evidence_url and not (
            evidence_url.startswith("http://") or evidence_url.startswith("https://")
        ):
            raise Exception("invalid_evidence_url")

        mode = "threat"
        result = self._adjudicate(mode, evidence_url, allegation)
        return self._commit(mode, evidence_url, allegation, result)

    @gl.public.write
    def resume_probe(self, evidence_url: str, note: str) -> str:
        """Anyone. Prove the hole is closed. Not an owner unpause."""
        if not self.paused:
            raise Exception("not_paused")
        evidence_url = (evidence_url or "").strip()
        note = (note or "").strip()
        if len(note) < 16:
            raise Exception("note_too_short")
        if len(note) > MAX_ALLEGATION:
            raise Exception("note_too_long")
        if not evidence_url.startswith("http://") and not evidence_url.startswith(
            "https://"
        ):
            raise Exception("invalid_evidence_url")

        mode = "resume"
        result = self._adjudicate(mode, evidence_url, note)
        return self._commit(mode, evidence_url, note, result)

    @gl.public.write
    def pulse(self) -> str:
        """
        Autonomic cycle. Anyone can fire it. No new URL.

        Reads stored wounds against the live constitution and may MOLT.
        This is the lifeform loop: the contract rewrites itself when its
        own history shows the current genome is inadequate.
        """
        mode = "pulse"
        result = self._adjudicate(mode, "", "")
        return self._commit(mode, "", "autonomic pulse", result)

    # ------------------------------------------------------------------
    # Consensus
    # ------------------------------------------------------------------

    def _adjudicate(self, mode: str, evidence_url: str, allegation: str) -> dict:
        constitution = self.constitution
        genome = self._genome()
        paused = bool(self.paused)
        generation = int(self.generation)
        wounds = int(self.incident_count)
        subject_hex = self.subject.as_hex
        wound_brief = self._wound_brief()

        def leader_fn():
            evidence_text = ""
            source_note = "no_url"
            if mode in ("threat", "resume"):
                evidence_text, source_note = _fetch_page(evidence_url)

            if mode == "threat":
                task = (
                    "Decide whether the EVIDENCE PAGE proves an exploit or failure mode "
                    "that should trigger a reflex on the bound subject vault."
                )
                allowed = "HALT | TUNE | MOLT | STAND"
            elif mode == "resume":
                task = (
                    "The subject is HALTED. Decide whether the EVIDENCE PAGE proves the "
                    "hole is closed enough to RESUME. If not, STAND."
                )
                allowed = "RESUME | STAND"
            else:
                task = (
                    "Autonomic pulse. No new page. Read the WOUND LOG against the "
                    "CONSTITUTION. MOLT only if the constitution failed to name a "
                    "repeated attack class. Otherwise STAND. Do not HALT from a pulse."
                )
                allowed = "MOLT | STAND"
                source_note = "pulse_memory"

            prompt = f"""You are one validator in GenLayer Optimistic Democracy for INSTAR,
an autonomic governor. There is no human vote. You must be skeptical.

TASK: {task}
ALLOWED_ACTION: {allowed}

MODE: {mode}
SUBJECT: {subject_hex}
CURRENTLY_PAUSED: {paused}
GENERATION: {generation}
STAGE: {_stage_name(generation)}

CONSTITUTION:
{constitution}

GENOME_JSON:
{json.dumps(genome, sort_keys=True)}

ALLEGATION:
{allegation or "(none)"}

EVIDENCE_URL: {evidence_url or "(none)"}
SOURCE_STATUS: {source_note}
EVIDENCE_EXCERPT:
{evidence_text if evidence_text else "(no page body)"}

WOUND_LOG (most recent first):
{wound_brief}

Return ONLY valid JSON with exactly these keys:
{{
  "action": "{allowed}",
  "exploit_active": true or false,
  "confidence": <integer 0-100>,
  "tune_key": "<one of {", ".join(TUNE_KEYS)} or empty>",
  "tune_value": <integer, 0 if not TUNE>,
  "new_constitution": "<full replacement constitution if MOLT, else empty>",
  "rationale": "<2-4 sentences>"
}}

Rules:
- Prefer STAND over guessing.
- exploit_active is true only if the page describes a real mechanism, not a vibe.
- HALT requires a mechanism that would work on a GEN vault / owner-controlled contract.
- TUNE must name a real genome key. Downward tightness or max_draw is the usual near-miss.
- MOLT requires a complete new_constitution that keeps the no-vote, no-owner-pause law.
- RESUME requires evidence the hole is closed, not a promise.
- Do not copy the allegation if the page contradicts it.
"""
            raw = gl.nondet.exec_prompt(prompt)
            data = _extract_json(raw)

            action = str(data.get("action", "STAND")).upper().strip()
            exploit_active = _as_bool(data.get("exploit_active"))
            confidence = _clamp_int(data.get("confidence"), 0, 100, 0)
            tune_key = str(data.get("tune_key", "")).strip()
            if tune_key not in TUNE_KEYS:
                tune_key = ""
            tune_value = _clamp_int(data.get("tune_value"), 0, 10000, 0)
            new_constitution = str(data.get("new_constitution", "")).strip()
            if len(new_constitution) > MAX_CONSTITUTION:
                new_constitution = new_constitution[:MAX_CONSTITUTION]
            rationale = str(data.get("rationale", ""))[:MAX_RATIONALE]

            if mode == "resume" and action not in ("RESUME", "STAND"):
                action = "STAND"
            if mode == "pulse" and action not in ("MOLT", "STAND"):
                action = "STAND"
            if mode == "threat" and action not in ("HALT", "TUNE", "MOLT", "STAND"):
                action = "STAND"
            if action == "MOLT" and len(new_constitution) < 40:
                action = "STAND"
            if action == "TUNE" and not tune_key:
                action = "STAND"

            action_final = _gate_action(
                action,
                confidence,
                genome,
                paused,
                pulse=(mode == "pulse"),
                wounds=wounds,
            )
            if action_final != "TUNE":
                tune_key = ""
                tune_value = 0
            if action_final != "MOLT":
                new_constitution = ""

            if action_final == "TUNE":
                patched = dict(genome)
                patched[tune_key] = tune_value
                patched = _normalize_genome(patched)
                tune_value = int(patched[tune_key])

            paused_next, generation_next = _apply_next(
                action_final, paused, generation
            )

            return {
                "action": action,
                "action_final": action_final,
                "exploit_active": exploit_active,
                "confidence": confidence,
                "tune_key": tune_key,
                "tune_value": tune_value,
                "new_constitution": new_constitution,
                "rationale": rationale,
                "source_note": source_note,
                "paused_next": paused_next,
                "generation_next": generation_next,
            }

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            leader_data = leader_result.calldata
            if not isinstance(leader_data, dict):
                return False
            if leader_data.get("action_final") not in ACTIONS:
                return False
            try:
                mine = leader_fn()
            except Exception:
                return False
            if leader_data.get("action_final") != mine.get("action_final"):
                return False
            if _as_bool(leader_data.get("exploit_active")) != _as_bool(
                mine.get("exploit_active")
            ):
                return False
            if _as_bool(leader_data.get("paused_next")) != _as_bool(
                mine.get("paused_next")
            ):
                return False
            try:
                if int(leader_data.get("generation_next", -1)) != int(
                    mine.get("generation_next", -2)
                ):
                    return False
                lc = int(leader_data.get("confidence", -1))
                vc = int(mine.get("confidence", -1))
            except Exception:
                return False
            if abs(lc - vc) > 25:
                return False
            if leader_data.get("action_final") == "TUNE":
                if leader_data.get("tune_key") != mine.get("tune_key"):
                    return False
                try:
                    if int(leader_data.get("tune_value", 0)) != int(
                        mine.get("tune_value", 1)
                    ):
                        return False
                except Exception:
                    return False
            return True

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    def _commit(self, mode: str, evidence_url: str, allegation: str, result: dict) -> str:
        if not isinstance(result, dict):
            result = {}

        action_final = str(result.get("action_final", "STAND")).upper()
        if action_final not in ACTIONS:
            action_final = "STAND"
        confidence = _clamp_int(result.get("confidence"), 0, 100, 0)
        exploit_active = _as_bool(result.get("exploit_active"))
        tune_key = str(result.get("tune_key", "")).strip()
        if tune_key not in TUNE_KEYS:
            tune_key = ""
        tune_value = _clamp_int(result.get("tune_value"), 0, 10000, 0)
        new_constitution = str(result.get("new_constitution", "")).strip()
        if len(new_constitution) > MAX_CONSTITUTION:
            new_constitution = new_constitution[:MAX_CONSTITUTION]
        rationale = str(result.get("rationale", ""))[:MAX_RATIONALE]
        source_note = str(result.get("source_note", ""))

        genome = self._genome()
        paused_next, generation_next = _apply_next(
            action_final, bool(self.paused), int(self.generation)
        )

        if action_final == "TUNE" and tune_key:
            genome[tune_key] = tune_value
            genome = _normalize_genome(genome)
            self.genome = json.dumps(genome, sort_keys=True)

        if action_final == "MOLT" and len(new_constitution) >= 40:
            molt_id = str(int(self.molt_count))
            self.molts[molt_id] = json.dumps(
                {
                    "molt_id": molt_id,
                    "from_generation": str(int(self.generation)),
                    "to_generation": str(generation_next),
                    "previous_constitution": self.constitution,
                    "new_constitution": new_constitution,
                    "at": _now(),
                    "mode": mode,
                }
            )
            self.molt_count = self.molt_count + u256(1)
            self.constitution = new_constitution

        self.paused = bool(paused_next)
        self.generation = u256(int(generation_next))
        self.last_action = action_final
        self.last_at = _now()

        incident_id = str(int(self.incident_count))
        self.incident_count = self.incident_count + u256(1)
        record = {
            "incident_id": incident_id,
            "mode": mode,
            "allegation": allegation,
            "evidence_url": evidence_url,
            "filer": gl.message.sender_address.as_hex,
            "action": str(result.get("action", action_final)),
            "action_final": action_final,
            "exploit_active": exploit_active,
            "confidence": confidence,
            "tune_key": tune_key,
            "tune_value": tune_value,
            "paused": bool(self.paused),
            "generation": str(int(self.generation)),
            "stage": _stage_name(int(self.generation)),
            "rationale": rationale,
            "source_note": source_note,
            "consensus": "optimistic_democracy",
            "at": self.last_at,
        }
        self.incidents[incident_id] = json.dumps(record)
        return incident_id

    def _genome(self) -> dict:
        try:
            raw = json.loads(self.genome)
        except Exception:
            raw = {}
        return _normalize_genome(raw)

    def _wound_brief(self) -> str:
        total = int(self.incident_count)
        if total <= 0:
            return "(no wounds yet)"
        lines = []
        idx = total - 1
        n = 0
        while idx >= 0 and n < 6:
            key = str(idx)
            if key in self.incidents:
                try:
                    rec = json.loads(self.incidents[key])
                except Exception:
                    rec = {}
                lines.append(
                    f"#{rec.get('incident_id', key)} {rec.get('mode')} -> "
                    f"{rec.get('action_final')} conf={rec.get('confidence')} "
                    f"exploit={rec.get('exploit_active')} "
                    f"{str(rec.get('allegation', ''))[:180]}"
                )
                n += 1
            idx -= 1
        return "\n".join(lines) if lines else "(no wounds yet)"
