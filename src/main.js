import "./style.css";
import deployed from "./deployed.json";
import { NETWORKS, getNetwork, explorerTxUrl, explorerAddressUrl } from "./genlayer/networks.js";
import {
  setNetwork,
  useEphemeralAccount,
  connectInjectedWallet,
  getActiveAccount,
  getWalletMode,
  getActiveNetworkKey,
  probeNetworkHealth,
} from "./genlayer/client.js";
import {
  loadSavedGovernor,
  loadSavedHemolymph,
  saveGovernor,
  saveHemolymph,
  hatchOrganism,
  fileThreat,
  pulse,
  resumeProbe,
  depositHemolymph,
  drawHemolymph,
  previewDraw,
  readCredit,
  readStatus,
  readLineage,
  readMolts,
  summarizeConsensus,
  appealTx,
  short,
  instarSource,
  hemolymphSource,
} from "./genlayer/instar.js";

const $ = (id) => document.getElementById(id);

const SAMPLE_HALT = {
  allegation:
    "Public post-mortem describes an infinite-mint / vault-drain mechanism against an owner-gated treasury of the same class as Hemolymph. If that mechanism is still unpatched, Instar should HALT draws on the bound subject.",
  url: "https://rekt.news/euler-rekt",
};

const SAMPLE_STAND = {
  allegation:
    "This page is protocol documentation, not an exploit write-up. Validators should STAND because no drain mechanism is demonstrated.",
  url: "https://docs.genlayer.com/developers/intelligent-contracts/introduction",
};

const el = {
  networkSelect: $("networkSelect"),
  netDot: $("netDot"),
  btnEphemeral: $("btnEphemeral"),
  btnWallet: $("btnWallet"),
  governorAddress: $("governorAddress"),
  hemolymphAddress: $("hemolymphAddress"),
  btnBindSaved: $("btnBindSaved"),
  btnHatch: $("btnHatch"),
  accountLine: $("accountLine"),
  rpcLine: $("rpcLine"),
  faucetLine: $("faucetLine"),
  stagePill: $("stagePill"),
  bugCaption: $("bugCaption"),
  vPaused: $("vPaused"),
  vGen: $("vGen"),
  vDraw: $("vDraw"),
  vTight: $("vTight"),
  vWounds: $("vWounds"),
  vMolts: $("vMolts"),
  constitutionText: $("constitutionText"),
  genomePre: $("genomePre"),
  consensusPulse: $("consensusPulse"),
  consensusText: $("consensusText"),
  voteRow: $("voteRow"),
  consensusKv: $("consensusKv"),
  consensusLog: $("consensusLog"),
  txExplorerLink: $("txExplorerLink"),
  btnAppeal: $("btnAppeal"),
  btnRefresh: $("btnRefresh"),
  threatForm: $("threatForm"),
  allegation: $("allegation"),
  evidenceUrl: $("evidenceUrl"),
  btnSampleHalt: $("btnSampleHalt"),
  btnSampleStand: $("btnSampleStand"),
  btnPulse: $("btnPulse"),
  resumeForm: $("resumeForm"),
  resumeNote: $("resumeNote"),
  resumeUrl: $("resumeUrl"),
  creditVal: $("creditVal"),
  capVal: $("capVal"),
  bodyPaused: $("bodyPaused"),
  depositWei: $("depositWei"),
  drawWei: $("drawWei"),
  btnDeposit: $("btnDeposit"),
  btnPreview: $("btnPreview"),
  btnDraw: $("btnDraw"),
  bodyNote: $("bodyNote"),
  lineageList: $("lineageList"),
  moltList: $("moltList"),
  toast: $("toast"),
  govExplorer: $("govExplorer"),
  hemoExplorer: $("hemoExplorer"),
  instarSrc: $("instarSrc"),
  hemoSrc: $("hemoSrc"),
};

let lastTxHash = null;
let busy = false;

function toast(message, kind = "") {
  el.toast.textContent = message;
  el.toast.className = `toast show ${kind}`.trim();
  setTimeout(() => el.toast.classList.remove("show"), 4200);
}

function setBusy(on) {
  busy = on;
  document.querySelectorAll("button, input, textarea, select").forEach((node) => {
    if (node.id === "networkSelect") return;
    if (node.tagName === "BUTTON") node.disabled = on;
  });
  if (!on && el.btnAppeal) el.btnAppeal.disabled = !lastTxHash;
}

function syncExplorerLinks() {
  const net = getNetwork(getActiveNetworkKey());
  const gov = el.governorAddress.value.trim();
  const hemo = el.hemolymphAddress.value.trim();
  if (el.govExplorer) {
    el.govExplorer.href = gov ? explorerAddressUrl(net, gov) : "#";
    el.govExplorer.textContent = gov ? `Instar ${short(gov)}` : "explorer";
  }
  if (el.hemoExplorer) {
    el.hemoExplorer.href = hemo ? explorerAddressUrl(net, hemo) : "#";
    el.hemoExplorer.textContent = hemo ? `Hemolymph ${short(hemo)}` : "explorer";
  }
}

function logLine(text) {
  const prev = el.consensusLog.textContent === "No transactions yet." ? "" : el.consensusLog.textContent;
  const line = `[${new Date().toISOString().slice(11, 19)}] ${text}`;
  el.consensusLog.textContent = prev ? `${line}\n${prev}` : line;
}

function accountAddress() {
  const acc = getActiveAccount();
  if (!acc) return "";
  if (typeof acc === "string") return acc;
  return acc.address || "";
}

function refreshStatusStrip() {
  const addr = accountAddress();
  const mode = getWalletMode();
  el.accountLine.textContent = addr
    ? `${mode} ${short(addr)}`
    : "not connected — ephemeral or wallet";
  const net = getNetwork(getActiveNetworkKey());
  el.faucetLine.innerHTML = net.faucet
    ? `Fund on <a href="${net.faucet}" target="_blank" rel="noreferrer">${net.label} faucet</a>`
    : "Localnet — use Studio faucet";
}

async function probeNet({ quiet } = {}) {
  const health = await probeNetworkHealth();
  el.netDot.className = `dot ${health.ok ? "ok" : "bad"}`;
  el.rpcLine.textContent = health.ok
    ? `${health.label} · ${health.latencyMs}ms · chain ${health.remoteChainId} · block ${health.blockNumber ?? "—"}`
    : `${health.label} unreachable: ${health.error}`;
  if (!quiet && !health.ok) toast(health.error || "RPC failed", "error");
}

function onProgress(info) {
  if (!info) return;
  if (info.txHash) {
    lastTxHash = info.txHash;
    const net = getNetwork(getActiveNetworkKey());
    el.txExplorerLink.href = explorerTxUrl(net, info.txHash);
    el.btnAppeal.disabled = false;
  }
  if (info.phase === "consensus") {
    const sum = summarizeConsensus(info);
    el.consensusPulse.className = "pulse live";
    el.consensusText.textContent = sum.headline;
    el.voteRow.innerHTML = sum.votes.length
      ? sum.votes
          .map(
            (v) =>
              `<span class="vote-chip ${String(v.vote).toLowerCase().includes("agree") ? "agree" : "disagree"}">${short(v.addr, 4)}:${v.vote}</span>`
          )
          .join("")
      : `<div class="vote-empty">Waiting for votes…</div>`;
    el.consensusKv.innerHTML = sum.details
      .map((d) => `<div><dt>${d.label}</dt><dd>${d.value}</dd></div>`)
      .join("");
    if (info.transaction?.statusName) logLine(`round ${info.transaction.statusName}`);
  } else if (info.message) {
    el.consensusText.textContent = info.message;
    el.consensusPulse.className = info.phase?.includes("done") ? "pulse idle" : "pulse live";
    logLine(info.message);
  }
}

function applyStatus(status) {
  if (!status || typeof status !== "object") return;
  const paused = String(status.paused) === "true";
  const stage = status.stage || "egg";
  document.body.dataset.stage = stage;
  document.body.dataset.halted = paused ? "true" : "false";
  el.stagePill.textContent = stage;
  el.vPaused.textContent = paused ? "YES" : "no";
  el.vGen.textContent = status.generation ?? "—";
  el.vDraw.textContent = status.max_draw_bps ? `${status.max_draw_bps} bps` : "—";
  el.vTight.textContent = status.tightness_bps ? `${status.tightness_bps} bps` : "—";
  el.vWounds.textContent = status.incident_count ?? "—";
  el.vMolts.textContent = status.molt_count ?? "—";
  el.constitutionText.textContent = status.constitution || "—";
  try {
    el.genomePre.textContent = JSON.stringify(JSON.parse(status.genome || "{}"), null, 2);
  } catch {
    el.genomePre.textContent = status.genome || "—";
  }
  el.bugCaption.textContent = paused
    ? `Halted at ${stage}. Draws on Hemolymph revert until a resume probe survives consensus.`
    : status.bound === "true"
      ? `${stage} · bound to ${short(status.subject)} · last ${status.last_action}`
      : `${stage} · unbound. Hatch to attach a body.`;
  el.bodyPaused.textContent = paused ? "halted" : "open";
  if (paused) el.consensusPulse.className = "pulse halt";
}

function renderLineage(items) {
  if (!items?.length) {
    el.lineageList.innerHTML = `<div class="empty">No wounds yet. A reflex writes the first scar.</div>`;
    return;
  }
  el.lineageList.innerHTML = items
    .map((w) => {
      const action = w.action_final || w.action || "?";
      return `<article class="wound">
        <header>
          <span>#${w.incident_id} · ${w.mode}</span>
          <span class="tag ${action}">${action} · ${w.confidence ?? "?"}</span>
        </header>
        <p>${escapeHtml(w.allegation || "")}</p>
        <p class="micro">${w.source_note || ""} ${w.evidence_url ? `· ${escapeHtml(w.evidence_url)}` : ""}</p>
        <p>${escapeHtml(w.rationale || "")}</p>
      </article>`;
    })
    .join("");
}

function renderMolts(items) {
  if (!items?.length) {
    el.moltList.innerHTML = `<div class="empty">Egg still wears its hatch constitution.</div>`;
    return;
  }
  el.moltList.innerHTML = items
    .map(
      (m) => `<article class="molt-card">
        <header>
          <span>gen ${m.from_generation} → ${m.to_generation}</span>
          <span class="tag MOLT">MOLT ${m.molt_id}</span>
        </header>
        <p>${escapeHtml((m.new_constitution || "").slice(0, 420))}</p>
      </article>`
    )
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function syncChain() {
  const gov = el.governorAddress.value.trim();
  const hemo = el.hemolymphAddress.value.trim();
  if (!gov) return;
  const status = await readStatus(gov);
  applyStatus(status);
  const [lineage, molts] = await Promise.all([
    readLineage(gov, 0, 20),
    readMolts(gov, 0, 10),
  ]);
  renderLineage(lineage);
  renderMolts(molts);
  const who = accountAddress();
  if (hemo && who) {
    try {
      const credit = await readCredit(hemo, who);
      el.creditVal.textContent = String(credit);
      const preview = await previewDraw(hemo, who, el.drawWei.value || "1");
      el.capVal.textContent = preview?.cap ?? "—";
      el.bodyNote.textContent = preview?.paused
        ? "Instar is halted — draws will revert."
        : `Cap ${preview?.cap ?? "—"} wei · tightness ${preview?.tightness_bps ?? "—"}`;
    } catch (e) {
      el.bodyNote.textContent = e.message || String(e);
    }
  }
}

async function run(label, fn) {
  if (busy) return;
  try {
    setBusy(true);
    el.consensusPulse.className = "pulse live";
    el.consensusText.textContent = label;
    logLine(label);
    const result = await fn();
    toast(`${label} accepted`, "ok");
    await syncChain().catch((e) => logLine(`sync: ${e.message}`));
    return result;
  } catch (e) {
    console.error(e);
    el.consensusPulse.className = "pulse halt";
    el.consensusText.textContent = e.message || String(e);
    logLine(e.message || String(e));
    toast(e.message || String(e), "error");
    throw e;
  } finally {
    setBusy(false);
  }
}

function init() {
  const gov = deployed.address || loadSavedGovernor() || "";
  const hemo = deployed.hemolymph || loadSavedHemolymph() || "";
  el.governorAddress.value = gov;
  el.hemolymphAddress.value = hemo;
  if (gov) saveGovernor(gov);
  if (hemo) saveHemolymph(hemo);
  if (deployed.network && NETWORKS[deployed.network]) {
    el.networkSelect.value = deployed.network;
  }
  setNetwork(el.networkSelect.value);
  refreshStatusStrip();
  syncExplorerLinks();
  if (el.instarSrc) el.instarSrc.textContent = instarSource;
  if (el.hemoSrc) el.hemoSrc.textContent = hemolymphSource;
  probeNet();
  if (gov) syncChain().catch((e) => logLine(`sync: ${e.message}`));

  el.networkSelect.addEventListener("change", () => {
    setNetwork(el.networkSelect.value);
    refreshStatusStrip();
    syncExplorerLinks();
    probeNet();
    toast(`Network → ${getNetwork(el.networkSelect.value).label}`);
  });

  el.btnEphemeral.addEventListener("click", () => {
    const { address } = useEphemeralAccount();
    refreshStatusStrip();
    toast(`Ephemeral ${short(address)} — fund it`, "ok");
  });

  el.btnWallet.addEventListener("click", async () => {
    try {
      setBusy(true);
      const { address } = await connectInjectedWallet();
      refreshStatusStrip();
      toast(`Wallet ${short(address)}`, "ok");
    } catch (e) {
      toast(e.message || String(e), "error");
    } finally {
      setBusy(false);
    }
  });

  el.btnBindSaved.addEventListener("click", () => {
    saveGovernor(el.governorAddress.value.trim());
    saveHemolymph(el.hemolymphAddress.value.trim());
    syncExplorerLinks();
    syncChain().then(() => toast("Bound local pointers", "ok")).catch((e) => toast(e.message, "error"));
  });

  el.btnHatch.addEventListener("click", () =>
    run("Hatching organism", async () => {
      const hatched = await hatchOrganism({ onProgress });
      el.governorAddress.value = hatched.instar;
      el.hemolymphAddress.value = hatched.hemolymph;
      saveGovernor(hatched.instar);
      saveHemolymph(hatched.hemolymph);
      syncExplorerLinks();
      const net = getNetwork(getActiveNetworkKey());
      logLine(`Instar ${hatched.instar}`);
      logLine(`Hemolymph ${hatched.hemolymph}`);
      el.txExplorerLink.href = explorerTxUrl(net, hatched.deployTx);
      return hatched;
    })
  );

  el.btnRefresh.addEventListener("click", () => {
    probeNet();
    syncChain().catch((e) => toast(e.message, "error"));
  });

  el.btnSampleHalt.addEventListener("click", () => {
    el.allegation.value = SAMPLE_HALT.allegation;
    el.evidenceUrl.value = SAMPLE_HALT.url;
  });
  el.btnSampleStand.addEventListener("click", () => {
    el.allegation.value = SAMPLE_STAND.allegation;
    el.evidenceUrl.value = SAMPLE_STAND.url;
  });

  el.threatForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const gov = el.governorAddress.value.trim();
    run("file_threat", () =>
      fileThreat(gov, el.evidenceUrl.value.trim(), el.allegation.value.trim(), { onProgress })
    );
  });

  el.btnPulse.addEventListener("click", () => {
    const gov = el.governorAddress.value.trim();
    run("pulse", () => pulse(gov, { onProgress }));
  });

  el.resumeForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const gov = el.governorAddress.value.trim();
    run("resume_probe", () =>
      resumeProbe(gov, el.resumeUrl.value.trim(), el.resumeNote.value.trim(), { onProgress })
    );
  });

  el.btnDeposit.addEventListener("click", () => {
    const hemo = el.hemolymphAddress.value.trim();
    run("deposit", () => depositHemolymph(hemo, el.depositWei.value.trim(), { onProgress }));
  });

  el.btnPreview.addEventListener("click", async () => {
    try {
      const hemo = el.hemolymphAddress.value.trim();
      const who = accountAddress();
      const preview = await previewDraw(hemo, who, el.drawWei.value.trim());
      el.capVal.textContent = preview?.cap ?? "—";
      el.bodyNote.textContent = JSON.stringify(preview);
      toast(preview?.ok ? "Draw would pass the genome" : preview?.reason || "blocked", preview?.ok ? "ok" : "error");
    } catch (e) {
      toast(e.message || String(e), "error");
    }
  });

  el.btnDraw.addEventListener("click", () => {
    const hemo = el.hemolymphAddress.value.trim();
    run("draw", () => drawHemolymph(hemo, el.drawWei.value.trim(), { onProgress }));
  });

  el.btnAppeal.addEventListener("click", async () => {
    if (!lastTxHash) return;
    try {
      setBusy(true);
      const hash = await appealTx(lastTxHash);
      logLine(`appeal ${hash}`);
      toast("Appeal submitted", "ok");
      const net = getNetwork(getActiveNetworkKey());
      el.txExplorerLink.href = explorerTxUrl(net, hash);
    } catch (e) {
      toast(e.message || String(e), "error");
    } finally {
      setBusy(false);
    }
  });

  logLine("Instar 1.0 — autonomic governor. No mock consensus.");
  logLine("Writes: genlayer-js writeContract → Optimistic Democracy.");
  setInterval(() => probeNet({ quiet: true }), 45000);
}

init();
