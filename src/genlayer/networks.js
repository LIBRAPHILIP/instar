import { studionet, testnetBradbury, localnet } from "genlayer-js/chains";

export const NETWORKS = {
  studionet: {
    key: "studionet",
    label: "Studionet",
    blurb: "Hosted dev · real LLM validators",
    chain: studionet,
    rpc: "https://studio.genlayer.com/api",
    explorer: "https://explorer-studio.genlayer.com",
    faucet: "https://studio.genlayer.com",
    connectName: "studionet",
  },
  bradbury: {
    key: "bradbury",
    label: "Testnet Bradbury",
    blurb: "Production-like · real AI consensus",
    chain: testnetBradbury,
    rpc: "https://rpc-bradbury.genlayer.com",
    explorer: "https://explorer-bradbury.genlayer.com",
    faucet: "https://testnet-faucet.genlayer.foundation",
    connectName: "testnetBradbury",
  },
  localnet: {
    key: "localnet",
    label: "Localnet",
    blurb: "localhost:4000 · your Studio stack",
    chain: localnet,
    rpc: "http://localhost:4000/api",
    explorer: "http://localhost:8080",
    faucet: null,
    connectName: "localnet",
  },
};

export function getNetwork(key) {
  return NETWORKS[key] || NETWORKS.studionet;
}

export function explorerTxUrl(network, hash) {
  if (!hash) return "#";
  const base = (network.explorer || "").replace(/\/$/, "");
  return `${base}/tx/${hash}`;
}

export function explorerAddressUrl(network, address) {
  if (!address) return "#";
  const base = (network.explorer || "").replace(/\/$/, "");
  return `${base}/address/${address}`;
}
