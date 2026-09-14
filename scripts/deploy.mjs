/**
 * Deploy Instar, then Hemolymph, then bind the body.
 *
 *   node scripts/deploy.mjs studionet
 *   PRIVATE_KEY=0x… node scripts/deploy.mjs bradbury
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient, createAccount } from "genlayer-js";
import { studionet, testnetBradbury, localnet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const NETWORKS = {
  studionet,
  bradbury: testnetBradbury,
  testnetBradbury,
  localnet,
};

const DEFAULT_CONSTITUTION = (
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

function extractAddress(receipt) {
  return (
    receipt?.data?.contract_address ||
    receipt?.to_address ||
    receipt?.txDataDecoded?.contractAddress ||
    receipt?.contractAddress ||
    receipt?.data?.contractAddress ||
    null
  );
}

async function wait(client, hash) {
  return client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 400,
    interval: 4000,
    fullTransaction: true,
  });
}

async function main() {
  const netName = (process.argv[2] || "studionet").toLowerCase();
  const chain = NETWORKS[netName];
  if (!chain) {
    console.error("Unknown network:", netName);
    process.exit(1);
  }

  let account;
  const pk = process.env.PRIVATE_KEY || process.env.GENLAYER_PRIVATE_KEY;
  if (pk) {
    const { privateKeyToAccount: pka } = await import("viem/accounts");
    account = pka(pk.startsWith("0x") ? pk : `0x${pk}`);
    console.log("Using PRIVATE_KEY account:", account.address);
  } else {
    account = createAccount();
    console.log("Using ephemeral account:", account.address);
  }

  const client = createClient({ chain, account });
  await client.initializeConsensusSmartContract();

  const instarCode = new Uint8Array(readFileSync(path.join(root, "contracts/instar.py")));
  const hemoCode = new Uint8Array(readFileSync(path.join(root, "contracts/hemolymph.py")));

  console.log(`Deploying Instar → ${chain.name} (id ${chain.id})…`);
  const instarTx = await client.deployContract({
    code: instarCode,
    args: [DEFAULT_CONSTITUTION],
  });
  console.log("Instar tx:", instarTx);
  const instarReceipt = await wait(client, instarTx);
  const instarAddress = extractAddress(instarReceipt);
  if (!instarAddress) {
    console.error(JSON.stringify(instarReceipt, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    throw new Error("Instar address missing");
  }
  console.log("Instar:", instarAddress, instarReceipt.result_name || instarReceipt.result);

  console.log("Deploying Hemolymph…");
  const hemoTx = await client.deployContract({
    code: hemoCode,
    args: [instarAddress],
  });
  console.log("Hemolymph tx:", hemoTx);
  const hemoReceipt = await wait(client, hemoTx);
  const hemoAddress = extractAddress(hemoReceipt);
  if (!hemoAddress) throw new Error("Hemolymph address missing");
  console.log("Hemolymph:", hemoAddress, hemoReceipt.result_name || hemoReceipt.result);

  console.log("Binding subject…");
  const bindTx = await client.writeContract({
    address: instarAddress,
    functionName: "bind_subject",
    args: [hemoAddress],
    value: 0n,
  });
  console.log("Bind tx:", bindTx);
  const bindReceipt = await wait(client, bindTx);
  console.log("Bind:", bindReceipt.result_name || bindReceipt.result);

  const payload = {
    contract: "Instar",
    address: instarAddress,
    hemolymph: hemoAddress,
    chainId: chain.id,
    network: netName === "testnetBradbury" ? "bradbury" : netName,
    deployTx: instarTx,
    hemolymphTx: hemoTx,
    bindTx,
    deployedAt: new Date().toISOString(),
  };

  mkdirSync(path.join(root, "deployments"), { recursive: true });
  writeFileSync(
    path.join(root, "deployments", `instar-${chain.id}.json`),
    JSON.stringify(payload, null, 2)
  );
  writeFileSync(path.join(root, "src", "deployed.json"), JSON.stringify(payload, null, 2));
  console.log("\nInstar live at", instarAddress);
  console.log("Hemolymph live at", hemoAddress);
}

main().catch((err) => {
  console.error("Deploy failed:", err);
  process.exit(1);
});
