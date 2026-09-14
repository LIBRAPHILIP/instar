/**
 * Instar + Hemolymph — genuine GenLayer read/write paths only.
 */
import { TransactionStatus, ExecutionResult } from "genlayer-js/types";
import {
  getReadClient,
  getWriteClient,
  initializeConsensus,
  getActiveNetworkKey,
} from "./client.js";
import { getNetwork } from "./networks.js";
import instarSource from "../../contracts/instar.py?raw";
import hemolymphSource from "../../contracts/hemolymph.py?raw";

export { instarSource, hemolymphSource };

const KEY_INSTAR = "instar.governor";
const KEY_HEMO = "instar.hemolymph";

export const DEFAULT_CONSTITUTION = (
  "Instar is the autonomic nervous system of its bound subject. " +
  "No human vote. No owner pause. " +
  "HALT if public evidence shows an active or still-unpatched exploit that can drain funds, " +
  "mint without cap, seize ownership, or bypass the subject's limits. " +
  "TUNE tightness_bps or max_draw_bps downward when a near-miss or same-class historical " +
  "exploit is proven against this class of vault. " +
  "MOLT only when this constitution failed to name the attack class — rewrite it so the " +
  "next reflex is faster and narrower. " +
  "RESUME only when public evidence shows the hole is closed. " +
  "STAND on rumor, marketing pages, unmatched allegations, or missing mechanism. " +
  "Never invent an exploit from a page that does not describe one."
);

export function loadSavedGovernor() {
  try {
    return localStorage.getItem(KEY_INSTAR) || "";
  } catch {
    return "";
  }
}

export function loadSavedHemolymph() {
  try {
    return localStorage.getItem(KEY_HEMO) || "";
  } catch {
    return "";
  }
}

export function saveGovernor(address) {
  try {
    if (address) localStorage.setItem(KEY_INSTAR, address);
    else localStorage.removeItem(KEY_INSTAR);
  } catch {
    /* ignore */
  }
}

export function saveHemolymph(address) {
  try {
    if (address) localStorage.setItem(KEY_HEMO, address);
    else localStorage.removeItem(KEY_HEMO);
  } catch {
    /* ignore */
  }
}

function requireAddress(address, label = "Instar") {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Set a valid ${label} address first (0x…).`);
  }
  return address;
}

function extractContractAddress(receipt) {
  return (
    receipt?.data?.contract_address ||
    receipt?.to_address ||
    receipt?.txDataDecoded?.contractAddress ||
    receipt?.contractAddress ||
    receipt?.data?.contractAddress ||
    null
  );
}

export function assertHealthyReceipt(receipt, label = "transaction") {
  const validators = receipt?.consensus_data?.validators;
  if (Array.isArray(validators)) {
    const errored = validators.filter(
      (v) =>
        v?.execution_result === "ERROR" ||
        v?.genvm_result?.stderr ||
        v?.genvm_result?.error_code
    );
    if (errored.length === validators.length && validators.length > 0) {
      const sample =
        errored[0]?.genvm_result?.stderr ||
        errored[0]?.result ||
        "all validators reported ERROR";
      throw new Error(
        `${label} accepted by consensus but GenVM execution failed:\n${String(sample).slice(0, 800)}`
      );
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitWithConsensus(txHash, { onRound, preferFinalized = false } = {}) {
  const client = getReadClient();
  const target = preferFinalized ? TransactionStatus.FINALIZED : TransactionStatus.ACCEPTED;

  let stopped = false;
  const poll = (async () => {
    let ticks = 0;
    while (!stopped && ticks < 200) {
      ticks += 1;
      try {
        const snapshot = await fetchConsensusSnapshot(txHash);
        onRound?.(snapshot);
      } catch {
        /* round data may not exist yet */
      }
      await sleep(2500);
    }
  })();

  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      status: target,
      retries: 360,
      interval: 5000,
      fullTransaction: true,
    });
    try {
      const snapshot = await fetchConsensusSnapshot(txHash);
      onRound?.({ ...snapshot, terminal: true, receiptStatus: receipt.statusName });
    } catch {
      /* optional */
    }
    return receipt;
  } finally {
    stopped = true;
    await poll.catch(() => {});
  }
}

export async function fetchConsensusSnapshot(txHash) {
  const client = getReadClient();
  const net = getNetwork(getActiveNetworkKey());
  const snapshot = {
    txHash,
    network: net.key,
    at: new Date().toISOString(),
    transaction: null,
    lastRound: null,
    canAppeal: null,
    rawErrors: [],
  };

  try {
    if (typeof client.getTransaction === "function") {
      snapshot.transaction = await client.getTransaction({ hash: txHash });
    }
  } catch (e) {
    snapshot.rawErrors.push(`getTransaction: ${e.message}`);
  }

  try {
    if (typeof client.getLastRoundData === "function") {
      snapshot.lastRound = await client.getLastRoundData({ txId: txHash });
    }
  } catch (e) {
    snapshot.rawErrors.push(`getLastRoundData: ${e.message}`);
  }

  try {
    if (typeof client.canAppeal === "function") {
      snapshot.canAppeal = await client.canAppeal({ txId: txHash });
    }
  } catch (e) {
    snapshot.rawErrors.push(`canAppeal: ${e.message}`);
  }

  return snapshot;
}

export async function appealTx(txHash, value = 0n) {
  const client = getWriteClient();
  return client.appealTransaction({ txId: txHash, value });
}

async function writeAndWait(address, functionName, args, { onProgress, value = 0n, label } = {}) {
  const client = getWriteClient();
  await initializeConsensus();
  onProgress?.({
    phase: "write_submit",
    message: `Submitting ${functionName} — validators will judge independently…`,
  });
  const txHash = await client.writeContract({
    address,
    functionName,
    args,
    value,
  });
  onProgress?.({
    phase: "write_wait",
    message: "In flight — watching Optimistic Democracy rounds…",
    txHash,
  });
  const receipt = await waitWithConsensus(txHash, {
    onRound: (info) => onProgress?.({ phase: "consensus", ...info, txHash }),
  });
  assertHealthyReceipt(receipt, label || functionName);
  const exec = receipt?.txExecutionResultName ?? receipt?.executionResult;
  if (exec && exec !== ExecutionResult.FINISHED_WITH_RETURN && exec !== "FINISHED_WITH_RETURN") {
    if (exec === ExecutionResult.FINISHED_WITH_ERROR || exec === "FINISHED_WITH_ERROR") {
      throw new Error(`${functionName} failed after consensus.`);
    }
  }
  onProgress?.({
    phase: "write_done",
    message: `${functionName} accepted`,
    txHash,
    receipt,
  });
  return { txHash, receipt };
}

export async function deployInstar({ constitution, onProgress } = {}) {
  const client = getWriteClient();
  await initializeConsensus();
  onProgress?.({ phase: "deploy_submit", message: "Hatching Instar (deployContract)…" });
  const txHash = await client.deployContract({
    code: instarSource,
    args: [constitution || DEFAULT_CONSTITUTION],
  });
  onProgress?.({
    phase: "deploy_wait",
    message: "Waiting for multi-validator acceptance…",
    txHash,
  });
  const receipt = await waitWithConsensus(txHash, {
    onRound: (info) => onProgress?.({ phase: "consensus", ...info, txHash }),
  });
  assertHealthyReceipt(receipt, "instar deploy");
  const address = extractContractAddress(receipt);
  if (!address) throw new Error("Instar deploy accepted but address missing.");
  saveGovernor(address);
  onProgress?.({ phase: "deploy_done", message: "Instar live", txHash, address, receipt });
  return { address, txHash, receipt };
}

export async function deployHemolymph(governorAddress, { onProgress } = {}) {
  const governor = requireAddress(governorAddress, "Instar");
  const client = getWriteClient();
  await initializeConsensus();
  onProgress?.({ phase: "deploy_submit", message: "Growing Hemolymph (the body)…" });
  const txHash = await client.deployContract({
    code: hemolymphSource,
    args: [governor],
  });
  onProgress?.({
    phase: "deploy_wait",
    message: "Waiting for Hemolymph acceptance…",
    txHash,
  });
  const receipt = await waitWithConsensus(txHash, {
    onRound: (info) => onProgress?.({ phase: "consensus", ...info, txHash }),
  });
  assertHealthyReceipt(receipt, "hemolymph deploy");
  const address = extractContractAddress(receipt);
  if (!address) throw new Error("Hemolymph deploy accepted but address missing.");
  saveHemolymph(address);
  onProgress?.({ phase: "deploy_done", message: "Hemolymph live", txHash, address, receipt });
  return { address, txHash, receipt };
}

export async function hatchOrganism({ constitution, onProgress } = {}) {
  const instar = await deployInstar({ constitution, onProgress });
  const body = await deployHemolymph(instar.address, { onProgress });
  const bind = await bindSubject(instar.address, body.address, { onProgress });
  return {
    instar: instar.address,
    hemolymph: body.address,
    deployTx: instar.txHash,
    hemolymphTx: body.txHash,
    bindTx: bind.txHash,
  };
}

export function bindSubject(governor, subject, opts) {
  return writeAndWait(requireAddress(governor), "bind_subject", [requireAddress(subject, "Hemolymph")], {
    ...opts,
    label: "bind_subject",
  });
}

export function fileThreat(governor, evidenceUrl, allegation, opts) {
  return writeAndWait(requireAddress(governor), "file_threat", [evidenceUrl || "", allegation], {
    ...opts,
    label: "file_threat",
  });
}

export function pulse(governor, opts) {
  return writeAndWait(requireAddress(governor), "pulse", [], { ...opts, label: "pulse" });
}

export function resumeProbe(governor, evidenceUrl, note, opts) {
  return writeAndWait(requireAddress(governor), "resume_probe", [evidenceUrl, note], {
    ...opts,
    label: "resume_probe",
  });
}

export function depositHemolymph(body, valueWei, opts) {
  return writeAndWait(requireAddress(body, "Hemolymph"), "deposit", [], {
    ...opts,
    value: BigInt(valueWei),
    label: "deposit",
  });
}

export function drawHemolymph(body, amountWei, opts) {
  return writeAndWait(requireAddress(body, "Hemolymph"), "draw", [String(amountWei)], {
    ...opts,
    label: "draw",
  });
}

function parseMaybeJson(value) {
  if (value == null) return value;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function readStatus(governor) {
  return getReadClient().readContract({
    address: requireAddress(governor),
    functionName: "get_status",
    args: [],
  });
}

export function readMeta(governor) {
  return getReadClient().readContract({
    address: requireAddress(governor),
    functionName: "get_meta",
    args: [],
  });
}

export function readDescribe(governor) {
  return getReadClient().readContract({
    address: requireAddress(governor),
    functionName: "describe_protocol",
    args: [],
  });
}

export async function readLineage(governor, offset = 0, limit = 20) {
  const raw = await getReadClient().readContract({
    address: requireAddress(governor),
    functionName: "get_lineage",
    args: [BigInt(offset), BigInt(limit)],
  });
  if (!Array.isArray(raw)) return raw ? [parseMaybeJson(raw)] : [];
  return raw.map(parseMaybeJson);
}

export async function readMolts(governor, offset = 0, limit = 10) {
  const raw = await getReadClient().readContract({
    address: requireAddress(governor),
    functionName: "get_molts",
    args: [BigInt(offset), BigInt(limit)],
  });
  if (!Array.isArray(raw)) return raw ? [parseMaybeJson(raw)] : [];
  return raw.map(parseMaybeJson);
}

export async function readIncident(governor, id) {
  const raw = await getReadClient().readContract({
    address: requireAddress(governor),
    functionName: "get_incident",
    args: [String(id)],
  });
  return parseMaybeJson(raw);
}

export function readHemolymphMeta(body) {
  return getReadClient().readContract({
    address: requireAddress(body, "Hemolymph"),
    functionName: "get_meta",
    args: [],
  });
}

export function readCredit(body, who) {
  return getReadClient().readContract({
    address: requireAddress(body, "Hemolymph"),
    functionName: "get_credit",
    args: [who],
  });
}

export async function previewDraw(body, who, amountWei) {
  const raw = await getReadClient().readContract({
    address: requireAddress(body, "Hemolymph"),
    functionName: "preview_draw",
    args: [who, String(amountWei)],
  });
  return parseMaybeJson(raw);
}

export function short(value, size = 6) {
  const s = String(value || "");
  if (s.length <= size * 2 + 3) return s;
  return `${s.slice(0, size)}…${s.slice(-size)}`;
}

export function summarizeConsensus(snapshot) {
  if (!snapshot) return { headline: "No data yet", details: [], votes: [] };

  const details = [];
  const votes = [];
  const tx = snapshot.transaction;
  if (tx) {
    const status = tx.statusName || tx.status || "unknown";
    details.push({ label: "Tx status", value: String(status) });
    const resultName = tx.result_name || tx.resultName;
    if (resultName) details.push({ label: "Result", value: String(resultName) });
    if (tx.from_address || tx.from)
      details.push({ label: "From", value: short(tx.from_address || tx.from) });

    const voteMap = tx.consensus_data?.votes;
    if (voteMap && typeof voteMap === "object") {
      const entries = Object.entries(voteMap);
      if (entries.length) {
        details.push({ label: "Validators", value: `${entries.length} nodes` });
        const tally = entries.reduce((acc, [, v]) => {
          acc[v] = (acc[v] || 0) + 1;
          return acc;
        }, {});
        details.push({
          label: "Tally",
          value: Object.entries(tally)
            .map(([k, n]) => `${k}=${n}`)
            .join(", "),
        });
        for (const [addr, v] of entries) {
          votes.push({ addr, vote: String(v) });
        }
      }
    }

    if (tx.num_of_rounds != null) {
      details.push({ label: "Rounds", value: String(tx.num_of_rounds) });
    }
  }

  const lr = snapshot.lastRound;
  if (lr) {
    if (lr.round != null) details.push({ label: "Round", value: String(lr.round) });
    if (lr.leader_address || lr.leader)
      details.push({ label: "Leader", value: short(lr.leader_address || lr.leader) });
  }

  if (snapshot.canAppeal != null) {
    details.push({ label: "Can appeal", value: String(snapshot.canAppeal) });
  }

  const headline = details.find((d) => d.label === "Tally")?.value
    ? `Validators: ${details.find((d) => d.label === "Tally").value}`
    : details.find((d) => d.label === "Tx status")?.value || "Waiting on chain…";

  return { headline, details, votes };
}
