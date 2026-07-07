import assert from "node:assert/strict";
import { test } from "node:test";
import { requirePonderRpcUrl } from "../src/env.ts";

// Health-audit Reliability finding: http(process.env.PONDER_RPC_URL_1) does not
// throw when the var is unset — viem silently falls back to the chain's default
// public (non-archive) RPC, which rate-limits or returns incomplete historical
// logs and quietly breaks the byte-identical-manifest guarantee. foundry.toml
// makes a missing ${VAR} a hard error; the indexer must hold the same line.

test("requirePonderRpcUrl throws a pointed error when the var is unset", () => {
  assert.throws(() => requirePonderRpcUrl({}), /PONDER_RPC_URL_1 required/);
  assert.throws(() => requirePonderRpcUrl({ PONDER_RPC_URL_1: "" }), /PONDER_RPC_URL_1 required/);
});

test("requirePonderRpcUrl returns the archive endpoint when set", () => {
  assert.equal(
    requirePonderRpcUrl({ PONDER_RPC_URL_1: "https://archive.example/key" }),
    "https://archive.example/key",
  );
});
