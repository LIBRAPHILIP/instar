# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Hemolymph — the body Instar governs.

This vault never asks a human to pause it. Before every draw it reads the
governor: paused flag, max_draw_bps, tightness_bps.

Instar can HALT this contract (draws revert) and TUNE how much blood it
may lose in one bite. There is no local admin override.
"""

from genlayer import *

import json


VERSION = "1.0.0-hemolymph"


@gl.contract_interface
class IInstar:
    class View:
        def is_paused(self) -> bool: ...
        def get_max_draw_bps(self) -> u256: ...
        def get_tightness_bps(self) -> u256: ...
        def get_status(self) -> dict: ...

    class Write:
        pass


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


class Hemolymph(gl.Contract):
    """Governed vault. Instar is the nervous system; this is the ichor."""

    version: str
    governor: Address
    credit_count: u256
    credits: TreeMap[str, str]
    draw_count: u256
    draws: TreeMap[str, str]

    def __init__(self, governor_address: str):
        addr = (governor_address or "").strip()
        if not addr:
            raise Exception("governor_required")
        self.governor = Address(addr)
        self.version = VERSION
        self.credit_count = u256(0)
        self.draw_count = u256(0)

    @gl.public.view
    def get_meta(self) -> dict[str, str]:
        return {
            "title": "Hemolymph",
            "version": self.version,
            "governor": self.governor.as_hex,
            "role": "instar-subject-vault",
            "override": "none",
        }

    @gl.public.view
    def get_governor(self) -> str:
        return self.governor.as_hex

    @gl.public.view
    def get_credit(self, who: str) -> str:
        key = Address(who).as_hex.lower()
        if key not in self.credits:
            return "0"
        return self.credits[key]

    @gl.public.view
    def get_draw_count(self) -> u256:
        return self.draw_count

    @gl.public.view
    def get_draw(self, draw_id: str) -> str:
        draw_id = str(draw_id).strip()
        if draw_id not in self.draws:
            return json.dumps({"error": "draw_not_found", "draw_id": draw_id})
        return self.draws[draw_id]

    @gl.public.view
    def preview_draw(self, who: str, amount_wei: str) -> str:
        """Dry-run the governor gates. No state change."""
        try:
            amount = int(str(amount_wei).strip() or "0")
        except Exception:
            amount = 0
        try:
            key = Address(who).as_hex.lower()
        except Exception:
            return json.dumps({"ok": False, "reason": "bad_address"})
        credit = int(self.credits[key]) if key in self.credits else 0
        paused, max_bps, tightness, reason = self._gates()
        cap = credit * max_bps * tightness // 10000 // 10000
        ok = (not paused) and amount > 0 and amount <= credit and amount <= cap
        return json.dumps(
            {
                "ok": ok,
                "paused": paused,
                "credit": str(credit),
                "amount": str(amount),
                "max_draw_bps": str(max_bps),
                "tightness_bps": str(tightness),
                "cap": str(cap),
                "reason": reason if paused else ("" if ok else "over_cap_or_credit"),
            }
        )

    @gl.public.write.payable
    def deposit(self) -> str:
        value = gl.message.value
        if value == u256(0):
            raise Exception("zero_value")
        key = gl.message.sender_address.as_hex.lower()
        current = int(self.credits[key]) if key in self.credits else 0
        if key not in self.credits:
            self.credit_count = self.credit_count + u256(1)
        self.credits[key] = str(current + int(value))
        return self.credits[key]

    @gl.public.write
    def draw(self, amount_wei: str) -> str:
        try:
            amount = int(str(amount_wei).strip() or "0")
        except Exception:
            raise Exception("bad_amount")
        if amount <= 0:
            raise Exception("zero_amount")

        paused, max_bps, tightness, reason = self._gates()
        if paused:
            raise Exception(reason or "halted_by_instar")

        sender = gl.message.sender_address
        key = sender.as_hex.lower()
        credit = int(self.credits[key]) if key in self.credits else 0
        if amount > credit:
            raise Exception("insufficient_credit")

        cap = credit * max_bps * tightness // 10000 // 10000
        if amount > cap:
            raise Exception("over_instar_cap")

        wei = u256(amount)
        if self.balance < wei:
            raise Exception("insufficient_contract_balance")

        self.credits[key] = str(credit - amount)
        draw_id = str(int(self.draw_count))
        self.draw_count = self.draw_count + u256(1)
        self.draws[draw_id] = json.dumps(
            {
                "draw_id": draw_id,
                "who": sender.as_hex,
                "amount": str(amount),
                "cap": str(cap),
                "max_draw_bps": str(max_bps),
                "tightness_bps": str(tightness),
            }
        )
        _Recipient(sender).emit_transfer(value=wei, on="finalized")
        return draw_id

    def _gates(self) -> tuple[bool, int, int, str]:
        instar = IInstar(self.governor)
        try:
            paused = bool(instar.view().is_paused())
        except Exception:
            return True, 0, 0, "governor_unreadable"
        try:
            max_bps = int(instar.view().get_max_draw_bps())
        except Exception:
            max_bps = 0
        try:
            tightness = int(instar.view().get_tightness_bps())
        except Exception:
            tightness = 0
        if max_bps <= 0:
            max_bps = 0
        if tightness <= 0:
            tightness = 0
        reason = "halted_by_instar" if paused else ""
        return paused, max_bps, tightness, reason
