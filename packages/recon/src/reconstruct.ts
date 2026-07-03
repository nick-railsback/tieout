import { type PublicClient } from "viem";
import { getFeedAddress, getTokenAddress } from "@tieout/addresses";
import { TOKEN_REBASED_EVENT, TOKEN_REBASED_TOPIC0 } from "./events.ts";
import { type RawLog } from "./rawlog.ts";
import {
  capturePins,
  crossCheckRateCurveArchive,
  fetchRawLogs,
  fetchRebaseAt,
  findSeedRebaseBlock,
  type PinCapture,
  resolvePriceObservation,
} from "./l0fetch.ts";
import { type Manifest, type ManifestAddress, type PriceObservation, type RatePoint } from "./manifest.ts";
import { buildRateCurve, type RebaseObservation } from "./ratecurve.ts";
import { decodeArgs, derive } from "./derivation.ts";
import { ENGINE_VERSION } from "./version.ts";
import { type Result, err, ok } from "./result.ts";

/**
 * Reconstruct the manifest from public chain data over a pinned range — the
 * shared spine of both golden generation and `verify` (AD-8/AD-10). It fetches
 * raw logs (L0), derives the in-window rebases + the seed rebase into the
 * canonical rate curve (AD-6), resolves the AD-18 price observation, captures
 * the endpoint hashes from chain, and runs the ONE shared pure `derive`.
 */

/** The embedded AD-5 token rows (feed lives in `priceObservation`, not here). */
export function mainnetTokenTable(): ManifestAddress[] {
  return [
    { chainId: 1n, symbol: "wstETH", address: getTokenAddress(1, "wstETH") },
    { chainId: 1n, symbol: "stETH", address: getTokenAddress(1, "stETH") },
  ];
}

export type ReconstructParams = {
  readonly startBlock: bigint;
  readonly endBlock: bigint;
  readonly blocksPerChunk: bigint;
};

export type ReconstructError =
  | { readonly kind: "no-seed-rebase"; readonly block: bigint }
  | { readonly kind: "rate-curve"; readonly detail: string }
  | { readonly kind: "rate-crosscheck"; readonly detail: string }
  | { readonly kind: "price"; readonly detail: string }
  | { readonly kind: "rebase-decode"; readonly block: bigint; readonly detail: string }
  | { readonly kind: "derive"; readonly detail: string };

export type Reconstruction = {
  readonly manifest: Manifest;
  readonly pins: PinCapture;
  readonly rateCurve: readonly RatePoint[];
  readonly priceObservation: PriceObservation;
};

/**
 * Collect the in-window `TokenRebased` observations from already-fetched raw
 * logs. Uses the SAME guarded `decodeArgs` as the shared derivation, so a
 * malformed rebase log returns a typed `rebase-decode` error rather than
 * escaping `reconstructManifest` as an uncaught throw (the design promises a
 * typed `Result`, and `verify` must fail legibly on a hostile report).
 */
export function collectInWindowRebases(
  rawLogs: readonly RawLog[],
  stETHAddress: string,
): Result<RebaseObservation[], ReconstructError> {
  const stETH = stETHAddress.toLowerCase();
  const inWindowRebases: RebaseObservation[] = [];
  for (const log of rawLogs) {
    if (log.topics[0] === TOKEN_REBASED_TOPIC0 && log.address.toLowerCase() === stETH) {
      const decoded = decodeArgs(TOKEN_REBASED_EVENT, log);
      if (!decoded.ok) {
        return err({ kind: "rebase-decode", block: log.blockNumber, detail: decoded.error });
      }
      inWindowRebases.push({
        rebaseBlock: log.blockNumber,
        postTotalEther: decoded.value["postTotalEther"] as bigint,
        postTotalShares: decoded.value["postTotalShares"] as bigint,
      });
    }
  }
  return ok(inWindowRebases);
}

export async function reconstructManifest(
  client: PublicClient,
  params: ReconstructParams,
): Promise<Result<Reconstruction, ReconstructError>> {
  const rawLogs = await fetchRawLogs(client, params.startBlock, params.endBlock, params.blocksPerChunk);

  // In-window rebase observations (decoded from the raw logs we already fetched).
  const inWindow = collectInWindowRebases(rawLogs, getTokenAddress(1, "stETH"));
  if (!inWindow.ok) return inWindow;
  const inWindowRebases = inWindow.value;

  // Seed the rate curve from the last rebase at/before startBlock (AD-6),
  // discovered from public data — no out-of-band config (keeps verify trustless).
  const seedBlock = await findSeedRebaseBlock(client, params.startBlock);
  const seed = await fetchRebaseAt(client, seedBlock);
  if (seed === null) return err({ kind: "no-seed-rebase", block: seedBlock });
  const curve = buildRateCurve([seed, ...inWindowRebases], params.startBlock, params.endBlock);
  if (!curve.ok) return err({ kind: "rate-curve", detail: JSON.stringify(curve.error) });

  // AD-6 cross-check on the canonical path: each curve rate must EXACTLY equal
  // the archive stEthPerToken() at its rebase block (FR7 — never a tolerance).
  const crossChecked = await crossCheckRateCurveArchive(client, curve.value);
  if (!crossChecked.ok) return err({ kind: "rate-crosscheck", detail: JSON.stringify(crossChecked.error) });

  const pins = await capturePins(client, params.startBlock, params.endBlock);
  const price = await resolvePriceObservation(
    client,
    getFeedAddress(1, "stETH/USD"),
    params.endBlock,
    pins.endTimestamp,
  );
  if (!price.ok) return err({ kind: "price", detail: JSON.stringify(price.error) });

  const manifest = derive({
    rawLogs,
    startBlock: params.startBlock,
    startHash: pins.startHash,
    endBlock: params.endBlock,
    endHash: pins.endHash,
    addressTable: mainnetTokenTable(),
    engineVersion: ENGINE_VERSION,
    priceObservation: price.value,
    rateCurve: curve.value,
  });
  if (!manifest.ok) return err({ kind: "derive", detail: JSON.stringify(manifest.error) });

  return ok({ manifest: manifest.value, pins, rateCurve: curve.value, priceObservation: price.value });
}
