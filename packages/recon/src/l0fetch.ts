import { type Address, type PublicClient } from "viem";
import { chunkRange } from "./chunks.ts";
import { LOG_FILTERS } from "./filter.ts";
import { getTokenAddress } from "@tieout/addresses";
import { TOKEN_REBASED_EVENT } from "./events.ts";
import { type PriceObservation, type RatePoint } from "./manifest.ts";
import {
  type RateDivergence,
  type RateObservation,
  crossCheckRates,
} from "./crosscheck.ts";
import { DEFAULT_PRICE_MAX_STALENESS_SECS, guardPriceRound, toPriceObservation } from "./priceobs.ts";
import { type RebaseObservation } from "./ratecurve.ts";
import { type RawLog } from "./rawlog.ts";
import { type Result, err, ok } from "./result.ts";

/**
 * The L0 auditor-RPC fetch layer (AD-10) — the canonical trustless input. This
 * is the SHELL side of the derivation (AD-1): all I/O lives here; it assembles
 * the declared `RawLog` shape and hands it to the pure `derive`. It fetches over
 * the pinned range only, chunked deterministically (AC-2.6.c), converting every
 * client-returned JS `number`/nullable field to `bigint` at THIS boundary (AD-2)
 * so nothing but `bigint` crosses into the canonical path.
 *
 * Ponder is NOT on this path — `verify` uses L0 `eth_getLogs` exclusively
 * (AD-8/AD-9/AD-10).
 */

const WSTETH_ABI = [
  {
    type: "function",
    name: "stEthPerToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const FEED_ABI = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

/** Assemble the declared `RawLog` from a viem `eth_getLogs` log — number/nullable
 * → bigint at the boundary (AD-2). Exported so the Ponder adapter's parity test
 * can assert both adapters map identical underlying logs to the same RawLog. */
export function viemLogToRawLog(log: {
  address: Address;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
  blockNumber: bigint | null;
  transactionIndex: number | null;
  logIndex: number | null;
  blockHash: `0x${string}` | null;
  transactionHash: `0x${string}` | null;
}): RawLog {
  if (
    log.blockNumber === null ||
    log.transactionIndex === null ||
    log.logIndex === null ||
    log.blockHash === null ||
    log.transactionHash === null
  ) {
    throw new Error("L0 fetch: unexpected pending log (null block/tx fields) over a finalized range");
  }
  return {
    address: log.address.toLowerCase() as `0x${string}`,
    topics: log.topics,
    data: log.data,
    blockNumber: log.blockNumber,
    txIndex: BigInt(log.transactionIndex),
    logIndex: BigInt(log.logIndex),
    blockHash: log.blockHash.toLowerCase() as `0x${string}`,
    txHash: log.transactionHash.toLowerCase() as `0x${string}`,
  };
}

/** Fetch every relevant raw log over `[startBlock, endBlock]` via the shared
 * filter, chunked deterministically. Order is irrelevant — `derive` totally
 * orders + dedups. */
export async function fetchRawLogs(
  client: PublicClient,
  startBlock: bigint,
  endBlock: bigint,
  blocksPerChunk: bigint,
): Promise<RawLog[]> {
  const raw: RawLog[] = [];
  for (const { fromBlock, toBlock } of chunkRange(startBlock, endBlock, blocksPerChunk)) {
    for (const filter of LOG_FILTERS) {
      const logs = await client.getLogs({
        address: filter.address,
        event: filter.event,
        strict: true,
        fromBlock,
        toBlock,
      });
      for (const log of logs) raw.push(viemLogToRawLog(log));
    }
  }
  return raw;
}

/** Fetch a single Lido `TokenRebased` at an exact block (e.g. the seed rebase
 * before the window, for the rate-curve seed). */
export async function fetchRebaseAt(
  client: PublicClient,
  block: bigint,
): Promise<RebaseObservation | null> {
  const stETH = getTokenAddress(1, "stETH");
  const logs = await client.getLogs({
    address: stETH,
    event: TOKEN_REBASED_EVENT,
    strict: true,
    fromBlock: block,
    toBlock: block,
  });
  const log = logs[logs.length - 1];
  if (log === undefined) return null;
  const args = log.args as { postTotalShares: bigint; postTotalEther: bigint };
  return { rebaseBlock: block, postTotalEther: args.postTotalEther, postTotalShares: args.postTotalShares };
}

/** Read `wstETH.stEthPerToken()` at a pinned block (archive). */
async function stEthPerTokenAt(client: PublicClient, block: bigint): Promise<bigint> {
  return client.readContract({
    address: getTokenAddress(1, "wstETH"),
    abi: WSTETH_ABI,
    functionName: "stEthPerToken",
    blockNumber: block,
  });
}

/**
 * Discover the seed rebase block (the last Lido rebase at or before
 * `startBlock`) with NO out-of-band config — `stEthPerToken()` is a step
 * function that jumps only at rebases, so binary-search for the first block
 * whose value equals the value at `startBlock`. This keeps `verify` trustless:
 * it derives the rate-curve seed from the pins + public data alone.
 */
export async function findSeedRebaseBlock(
  client: PublicClient,
  startBlock: bigint,
  lookback = 8000n,
): Promise<bigint> {
  const target = await stEthPerTokenAt(client, startBlock);
  let span = lookback;
  let lo = startBlock > span ? startBlock - span : 0n;
  // Guard `lo > 0n` BEFORE the read so we never call stEthPerToken()@0 (which
  // reverts — wstETH has no code at genesis). [Review L1]
  while (lo > 0n && (await stEthPerTokenAt(client, lo)) === target) {
    span *= 2n;
    lo = startBlock > span ? startBlock - span : 0n;
  }
  let hi = startBlock;
  while (lo < hi) {
    const mid = lo + (hi - lo) / 2n;
    if ((await stEthPerTokenAt(client, mid)) === target) hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

/**
 * The AD-6 dual-derivation cross-check on the canonical path: at each rebase in
 * the curve, read the archive `stEthPerToken()` and assert it EXACTLY equals the
 * event-derived rate (FR7 — never a tolerance). A doctored `TokenRebased` whose
 * totals don't match the contract's own accounting fails here.
 */
export async function crossCheckRateCurveArchive(
  client: PublicClient,
  rateCurve: readonly RatePoint[],
): Promise<Result<readonly bigint[], RateDivergence>> {
  const observations: RateObservation[] = [];
  for (const point of rateCurve) {
    const archiveRate1e18 = await stEthPerTokenAt(client, point.rebaseBlock);
    observations.push({ rebaseBlock: point.rebaseBlock, eventRate1e18: point.rate1e18, archiveRate1e18 });
  }
  return crossCheckRates(observations);
}

export type PinCapture = { readonly startHash: string; readonly endHash: string; readonly endTimestamp: bigint };

/** Read the concrete `(blockNumber, blockHash)` at both endpoints (never
 * `latest`), plus the endBlock timestamp for the AD-18 resolution. */
export async function capturePins(
  client: PublicClient,
  startBlock: bigint,
  endBlock: bigint,
): Promise<PinCapture> {
  const start = await client.getBlock({ blockNumber: startBlock });
  const end = await client.getBlock({ blockNumber: endBlock });
  // A null hash is a pending block — impossible over a finalized pinned range.
  // Throw the pointed error at the source (mirroring viemLogToRawLog) rather than
  // coalescing to "" and deferring to a distant, vaguer BYTES32 validation.
  if (start.hash === null || end.hash === null) {
    throw new Error("L0 fetch: pending block (null blockHash) over a finalized pinned range");
  }
  return {
    startHash: start.hash.toLowerCase(),
    endHash: end.hash.toLowerCase(),
    endTimestamp: end.timestamp,
  };
}

export type PriceResolveError =
  | { readonly kind: "price-guard"; readonly detail: string }
  | { readonly kind: "rpc"; readonly detail: string };

/** Resolve the AD-18 price observation phase-aware at the pinned `endBlock`
 * (reads `latestRoundData` AT endBlock — pinned, not chain-head `latest`; and
 * `decimals` FROM the feed), guarding against a stale/invalid round. */
export async function resolvePriceObservation(
  client: PublicClient,
  feedAddress: Address,
  endBlock: bigint,
  endTimestamp: bigint,
  maxStalenessSecs: bigint = DEFAULT_PRICE_MAX_STALENESS_SECS,
): Promise<Result<PriceObservation, PriceResolveError>> {
  let decimals: number;
  let round: readonly [bigint, bigint, bigint, bigint, bigint];
  try {
    // Pin `decimals` to endBlock too — every input to the canonical hash must be
    // pinned to the report's window (NFR-0), even a value that is immutable in
    // practice. [Review M1]
    decimals = await client.readContract({
      address: feedAddress,
      abi: FEED_ABI,
      functionName: "decimals",
      blockNumber: endBlock,
    });
    round = await client.readContract({
      address: feedAddress,
      abi: FEED_ABI,
      functionName: "latestRoundData",
      blockNumber: endBlock,
    });
  } catch (caught) {
    return err({ kind: "rpc", detail: (caught as Error).message });
  }
  const [roundId, answer, , updatedAt] = round;
  const guarded = guardPriceRound(
    { roundId, answer, updatedAt, decimals: BigInt(decimals) },
    endTimestamp,
    maxStalenessSecs,
  );
  if (!guarded.ok) return err({ kind: "price-guard", detail: JSON.stringify(guarded.error) });
  return ok(toPriceObservation(feedAddress, guarded.value, endBlock));
}
