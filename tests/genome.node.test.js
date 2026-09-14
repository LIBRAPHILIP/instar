/**
 * Mirrors contracts/instar.py genome + gate helpers.
 * These are the deterministic rules validators apply after the LLM speaks.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const TUNE_KEYS = [
  "halt_confidence_min",
  "tune_confidence_min",
  "molt_confidence_min",
  "max_draw_bps",
  "tightness_bps",
  "molt_min_wounds",
];

function clampInt(n, lo, hi, fallback) {
  const v = Number.parseInt(String(n), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

function normalizeGenome(raw = {}) {
  return {
    halt_confidence_min: clampInt(raw.halt_confidence_min, 0, 100, 70),
    tune_confidence_min: clampInt(raw.tune_confidence_min, 0, 100, 55),
    molt_confidence_min: clampInt(raw.molt_confidence_min, 0, 100, 80),
    max_draw_bps: clampInt(raw.max_draw_bps, 1, 10000, 2500),
    tightness_bps: clampInt(raw.tightness_bps, 1, 10000, 10000),
    molt_min_wounds: clampInt(raw.molt_min_wounds, 1, 20, 2),
  };
}

function stageName(generation) {
  if (generation <= 0) return "egg";
  if (generation === 1) return "L1";
  if (generation === 2) return "L2";
  if (generation === 3) return "L3";
  if (generation === 4) return "pupa";
  return "imago";
}

function gateAction(action, confidence, genome, paused, { pulse = false, wounds = 0 } = {}) {
  action = String(action || "").toUpperCase().trim();
  const allowed = ["HALT", "TUNE", "MOLT", "STAND", "RESUME"];
  if (!allowed.includes(action)) return "STAND";
  if (action === "HALT") {
    if (paused) return "STAND";
    if (confidence < genome.halt_confidence_min) return "STAND";
    return "HALT";
  }
  if (action === "TUNE") {
    if (confidence < genome.tune_confidence_min) return "STAND";
    return "TUNE";
  }
  if (action === "MOLT") {
    if (confidence < genome.molt_confidence_min) return "STAND";
    if (pulse && wounds < genome.molt_min_wounds) return "STAND";
    return "MOLT";
  }
  if (action === "RESUME") {
    if (!paused) return "STAND";
    if (confidence < genome.halt_confidence_min) return "STAND";
    return "RESUME";
  }
  return "STAND";
}

function applyNext(action, paused, generation) {
  if (action === "HALT") return { paused: true, generation };
  if (action === "RESUME") return { paused: false, generation };
  if (action === "MOLT") return { paused, generation: generation + 1 };
  return { paused, generation };
}

function drawCap(credit, maxBps, tightness) {
  return Math.floor((credit * maxBps * tightness) / 10000 / 10000);
}

describe("genome normalize", () => {
  it("fills defaults", () => {
    const g = normalizeGenome({});
    assert.equal(g.halt_confidence_min, 70);
    assert.equal(g.max_draw_bps, 2500);
    assert.equal(g.tightness_bps, 10000);
  });

  it("clamps absurd values", () => {
    const g = normalizeGenome({
      halt_confidence_min: 400,
      max_draw_bps: 0,
      tightness_bps: -9,
      molt_min_wounds: 99,
    });
    assert.equal(g.halt_confidence_min, 100);
    assert.equal(g.max_draw_bps, 1);
    assert.equal(g.tightness_bps, 1);
    assert.equal(g.molt_min_wounds, 20);
  });
});

describe("reflex gate — no vote, genome is law", () => {
  const g = normalizeGenome({});

  it("refuses halt below confidence min", () => {
    assert.equal(gateAction("HALT", 40, g, false), "STAND");
  });

  it("halts when confidence clears the genome", () => {
    assert.equal(gateAction("HALT", 90, g, false), "HALT");
  });

  it("will not halt twice — already paused is STAND", () => {
    assert.equal(gateAction("HALT", 99, g, true), "STAND");
  });

  it("resume is impossible unless paused", () => {
    assert.equal(gateAction("RESUME", 99, g, false), "STAND");
    assert.equal(gateAction("RESUME", 99, g, true), "RESUME");
  });

  it("pulse molt requires wound count", () => {
    assert.equal(gateAction("MOLT", 99, g, false, { pulse: true, wounds: 0 }), "STAND");
    assert.equal(gateAction("MOLT", 99, g, false, { pulse: true, wounds: 2 }), "MOLT");
  });

  it("file_threat molt does not use the pulse wound gate", () => {
    assert.equal(gateAction("MOLT", 99, g, false, { pulse: false, wounds: 0 }), "MOLT");
  });

  it("unknown action becomes STAND", () => {
    assert.equal(gateAction("NUKE", 100, g, false), "STAND");
  });
});

describe("lifeform + body math", () => {
  it("molt increments generation without unpausing", () => {
    assert.deepEqual(applyNext("MOLT", true, 3), { paused: true, generation: 4 });
  });

  it("halt does not molt", () => {
    assert.deepEqual(applyNext("HALT", false, 1), { paused: true, generation: 1 });
  });

  it("stage names follow the insect", () => {
    assert.equal(stageName(0), "egg");
    assert.equal(stageName(3), "L3");
    assert.equal(stageName(4), "pupa");
    assert.equal(stageName(9), "imago");
  });

  it("hemolymph cap is genome-gated", () => {
    const credit = 1_000_000;
    const open = drawCap(credit, 2500, 10000);
    const tight = drawCap(credit, 2500, 2000);
    const haltedCap = drawCap(credit, 2500, 1);
    assert.equal(open, 250_000);
    assert.equal(tight, 50_000);
    assert.ok(haltedCap < tight);
  });

  it("tune keys are the only genome surface", () => {
    assert.ok(TUNE_KEYS.includes("tightness_bps"));
    assert.ok(!TUNE_KEYS.includes("constitution"));
  });
});
