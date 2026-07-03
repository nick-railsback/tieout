import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicClient } from "viem";
import { capturePins } from "../src/l0fetch.ts";

// Health-audit Reliability finding: capturePins coalesced a null block hash to
// "" ((start.hash ?? "").toLowerCase()), deferring the failure to a distant
// BYTES32 validation with a vaguer message — while viemLogToRawLog in the same
// file throws a pointed error for the same impossibility (a pending block over a
// finalized pinned range). This pins the pointed throw at the source.

/** Minimal getBlock stub — capturePins only reads `hash` and `timestamp`. The
 * cast is test-local mocking of viem's heavy client type. */
function fakeClient(hashByBlock: (n: bigint) => `0x${string}` | null): PublicClient {
  return {
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
      hash: hashByBlock(blockNumber),
      timestamp: 1_700_000_000n,
    }),
  } as unknown as PublicClient;
}

test("capturePins returns lowercased endpoint hashes for concrete blocks", async () => {
  const client = fakeClient((n) => (n === 100n ? "0xAABB" : "0xCCDD"));
  const pins = await capturePins(client, 100n, 200n);
  assert.deepEqual(pins, { startHash: "0xaabb", endHash: "0xccdd", endTimestamp: 1_700_000_000n });
});

test("capturePins throws a pointed error when the start block hash is null (pending)", async () => {
  const client = fakeClient((n) => (n === 100n ? null : "0xccdd"));
  await assert.rejects(() => capturePins(client, 100n, 200n), /null blockHash|pending/);
});

test("capturePins throws a pointed error when the end block hash is null (pending)", async () => {
  const client = fakeClient((n) => (n === 200n ? null : "0xaabb"));
  await assert.rejects(() => capturePins(client, 100n, 200n), /null blockHash|pending/);
});
