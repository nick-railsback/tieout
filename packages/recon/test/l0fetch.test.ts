import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicClient } from "viem";
import {
  FETCH_CONCURRENCY,
  capturePins,
  fetchRawLogs,
  findSeedRebaseBlock,
  resolvePriceObservation,
} from "../src/l0fetch.ts";

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

// Health-audit Testing finding (TEST-6): findSeedRebaseBlock — the exponential
// backoff + binary search that seeds the AD-6 rate curve — was the most
// algorithmically subtle function in the shell and had zero tests. stEthPerToken
// is a step function that jumps only at rebases, so a fake read client models it
// as `value(block)`; the seed block is the first block whose value equals the
// value at startBlock.

/** Minimal read stub — findSeedRebaseBlock/resolvePriceObservation only
 * `readContract`. `value` models stEthPerToken as a monotone step function. */
function fakeReadClient(value: (block: bigint) => bigint): PublicClient {
  return {
    readContract: async ({ blockNumber }: { blockNumber: bigint }) => value(blockNumber),
  } as unknown as PublicClient;
}

test("findSeedRebaseBlock binary-searches to a rebase inside the initial lookback", async () => {
  const R = 21_000_500n;
  const client = fakeReadClient((b) => (b >= R ? 1_100n : 1_000n));
  assert.equal(await findSeedRebaseBlock(client, 21_001_000n), R);
});

test("findSeedRebaseBlock returns startBlock when the rebase is exactly at startBlock", async () => {
  const start = 21_001_000n;
  const client = fakeReadClient((b) => (b >= start ? 1_100n : 1_000n));
  assert.equal(await findSeedRebaseBlock(client, start), start);
});

test("findSeedRebaseBlock doubles the lookback to reach a rebase beyond it (never reads @0)", async () => {
  const start = 21_001_000n;
  const R = start - 20_000n; // beyond the default 8000-block first window
  const client = fakeReadClient((b) => {
    if (b === 0n) throw new Error("stEthPerToken()@genesis reverts — must not be read (L1 guard)");
    return b >= R ? 1_100n : 1_000n;
  });
  assert.equal(await findSeedRebaseBlock(client, start), R);
});

test("findSeedRebaseBlock converges to 0 when the rate is constant back to genesis (lo===0n guard)", async () => {
  // A constant rate everywhere: the backoff clamps lo at 0 (never negative) and
  // the search returns 0 without the expansion ever reading below genesis.
  const client = fakeReadClient(() => 1_000n);
  assert.equal(await findSeedRebaseBlock(client, 5_000n), 0n);
});

// Health-audit Testing finding (TEST-6): resolvePriceObservation is the one L0
// call that wraps its RPC in try/catch — but the rpc-error branch was unexercised.
test("resolvePriceObservation maps an RPC throw to a typed rpc error (never throws)", async () => {
  const client = {
    readContract: async () => {
      throw new Error("HTTP 500");
    },
  } as unknown as PublicClient;
  const feed = "0xcfe54b5cd566ab89272946f602d76ea879cab4a8";
  let result: Awaited<ReturnType<typeof resolvePriceObservation>>;
  await assert.doesNotReject(async () => {
    result = await resolvePriceObservation(client, feed, 21_000_000n, 1_700_000_000n);
  });
  assert.ok(!result!.ok);
  assert.equal(result!.error.kind, "rpc");
});

// Health-audit Performance finding (PERF-1): fetchRawLogs was strictly
// sequential (~48k awaits for a 30-day window). It now fetches with bounded
// concurrency; determinism is chunk-independent so completion order is
// irrelevant. This pins that every chunk is still collected AND that the pool
// stays within FETCH_CONCURRENCY (never an unbounded fan-out).
test("fetchRawLogs fetches with bounded concurrency yet collects every chunk (PERF-1)", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const client = {
    getLogs: async ({ fromBlock, address }: { fromBlock: bigint; address: `0x${string}` }) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5)); // hold so requests overlap
      inFlight--;
      return [
        {
          address,
          topics: [`0x${"00".repeat(32)}`],
          data: "0x",
          blockNumber: fromBlock,
          transactionIndex: 0,
          logIndex: 0,
          blockHash: `0x${"bb".repeat(32)}`,
          transactionHash: `0x${"cc".repeat(32)}`,
        },
      ];
    },
  } as unknown as PublicClient;

  // 20 chunks of 9 blocks × 2 filters (wstETH Transfer, stETH TokenRebased) = 40 calls.
  const logs = await fetchRawLogs(client, 0n, 179n, 9n);
  assert.equal(logs.length, 40, "every (chunk, filter) log must be collected");
  assert.ok(maxInFlight > 1, "expected concurrent fetching, not sequential");
  assert.ok(
    maxInFlight <= FETCH_CONCURRENCY,
    `in-flight ${maxInFlight} exceeded the ${FETCH_CONCURRENCY} bound`,
  );
});
