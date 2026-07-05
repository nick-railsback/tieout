/**
 * Fail fast on a missing mainnet archive RPC endpoint.
 *
 * `http(process.env.PONDER_RPC_URL_1)` does NOT throw on `undefined` — viem
 * silently falls back to the chain's default *public, non-archive* RPC, which
 * rate-limits `eth_getLogs`/`eth_call` and returns incomplete historical logs,
 * quietly breaking the byte-identical-manifest guarantee. foundry.toml makes a
 * missing `${VAR}` "a hard error, never a silent default"; the indexer holds the
 * same line here.
 */
export function requirePonderRpcUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.PONDER_RPC_URL_1;
  if (!url) {
    throw new Error("PONDER_RPC_URL_1 required (mainnet archive endpoint — see .env.example)");
  }
  return url;
}
