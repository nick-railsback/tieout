/// <reference types="vite/client" />

// The environment overrides the surface reads at build/runtime. All optional —
// each has a safe default in `config.ts`. The anchor target is env-driven so the
// maintainer can repoint it (Base mainnet ↔ Base Sepolia ↔ local Anvil) without
// a code change (Batch Open Question #3).
interface ImportMetaEnv {
  /** Mainnet WebSocket RPC for live wstETH positions (eth_subscribe). */
  readonly VITE_WSS_URL?: string;
  /** Chain the AttestationRegistry anchor is read on (default 8453, Base). */
  readonly VITE_ANCHOR_CHAIN_ID?: string;
  /** Optional RPC URL override for the anchor chain (else the chain default). */
  readonly VITE_ANCHOR_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
