import { type AbiEvent, decodeEventLog, type Hex } from "viem";
import {
  type Manifest,
  type ManifestAddress,
  type PriceObservation,
  type RatePoint,
  validateManifest,
} from "./manifest.ts";
import { type RawLog } from "./rawlog.ts";
import {
  TOKEN_REBASED_EVENT,
  TOKEN_REBASED_TOPIC0,
  TRANSFER_EVENT,
  TRANSFER_TOPIC0,
} from "./events.ts";
import { type Result, err, ok } from "./result.ts";
import { type FieldError } from "./validate.ts";

/**
 * The ONE shared derivation (AD-9): raw logs → manifest. It is a pure function
 * (AD-1) — no I/O — invoked by BOTH the `verify` `eth_getLogs` adapter and the
 * Ponder live adapter, so identical raw logs yield a byte-identical manifest.
 *
 * It normalizes each relevant log (decode `Transfer` / `TokenRebased`, attach
 * `txHash`), **totally orders** by `(blockNumber, txIndex, logIndex)`, **dedups**
 * on that same triple (AD-4), and **includes only** logs inside the pinned
 * `[startBlock, endBlock]` (both inclusive — AD-3). Classification is by
 * `topic0`; the emitting address is validated against the manifest's embedded
 * table (a data-only filter — does not violate AD-1; carried-forward D4).
 *
 * The output is proven-conformant by reusing {@link validateManifest} (AD-7):
 * the manifest is assembled in the untrusted decimal-string form and validated,
 * which both parses it to a typed {@link Manifest} and re-checks every array's
 * declared total order. Hashing happens only through `canonical.ts` (AD-11).
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-9]
 */
export type DerivationInput = {
  readonly rawLogs: readonly RawLog[];
  readonly startBlock: bigint;
  readonly startHash: string;
  readonly endBlock: bigint;
  readonly endHash: string;
  /** The AD-5 token rows to embed (wstETH, stETH). The price feed is NOT here —
   * it lives in `priceObservation` (adding it would move `manifestHash`). */
  readonly addressTable: readonly ManifestAddress[];
  readonly engineVersion: string;
  readonly priceObservation: PriceObservation;
  readonly rateCurve: readonly RatePoint[];
};

export type DerivationError =
  | { readonly kind: "missing-address"; readonly symbol: string }
  | {
      readonly kind: "decode-failed";
      readonly index: number;
      readonly eventType: string;
      readonly detail: string;
    }
  | { readonly kind: "invalid-manifest"; readonly error: FieldError };

type NormalizedEvent = {
  readonly block: bigint;
  readonly txi: bigint;
  readonly logi: bigint;
  readonly obj: Record<string, string>;
};

function findTokenAddress(table: readonly ManifestAddress[], symbol: string): string | null {
  const row = table.find((entry) => entry.symbol === symbol);
  return row ? row.address.toLowerCase() : null;
}

/**
 * Decode one raw log against a single-event ABI, never throwing: a malformed log
 * becomes an `err(message)`, not an exception. This is the ONE guarded decode
 * shared by `derive` (here) and `reconstruct`'s in-window rebase collection, so
 * neither site can drift into an untyped throw on hostile input (AD-9).
 */
export function decodeArgs(
  event: AbiEvent,
  log: RawLog,
): Result<Record<string, unknown>, string> {
  try {
    const decoded = decodeEventLog({
      abi: [event],
      data: log.data,
      topics: [...log.topics] as [Hex, ...Hex[]],
    });
    return ok(decoded.args as Record<string, unknown>);
  } catch (caught) {
    return err((caught as Error).message);
  }
}

function baseFields(log: RawLog): Record<string, string> {
  return {
    address: log.address.toLowerCase(),
    blockNumber: log.blockNumber.toString(10),
    txIndex: log.txIndex.toString(10),
    logIndex: log.logIndex.toString(10),
    blockHash: log.blockHash.toLowerCase(),
    txHash: log.txHash.toLowerCase(),
  };
}

function compareTriple(a: NormalizedEvent, b: NormalizedEvent): number {
  if (a.block !== b.block) return a.block < b.block ? -1 : 1;
  if (a.txi !== b.txi) return a.txi < b.txi ? -1 : 1;
  if (a.logi !== b.logi) return a.logi < b.logi ? -1 : 1;
  return 0;
}

export function derive(input: DerivationInput): Result<Manifest, DerivationError> {
  const wstETH = findTokenAddress(input.addressTable, "wstETH");
  if (wstETH === null) return err({ kind: "missing-address", symbol: "wstETH" });
  const stETH = findTokenAddress(input.addressTable, "stETH");
  if (stETH === null) return err({ kind: "missing-address", symbol: "stETH" });

  const normalized: NormalizedEvent[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < input.rawLogs.length; i++) {
    const log = input.rawLogs[i]!;

    // Range filter: only the pinned finalized window, both endpoints inclusive.
    if (log.blockNumber < input.startBlock || log.blockNumber > input.endBlock) continue;

    const topic0 = log.topics[0];
    const address = log.address.toLowerCase();
    let obj: Record<string, string> | null = null;

    if (topic0 === TRANSFER_TOPIC0 && address === wstETH) {
      const decoded = decodeArgs(TRANSFER_EVENT, log);
      if (!decoded.ok) {
        return err({ kind: "decode-failed", index: i, eventType: "Transfer", detail: decoded.error });
      }
      const args = decoded.value;
      obj = {
        type: "Transfer",
        ...baseFields(log),
        from: (args["from"] as string).toLowerCase(),
        to: (args["to"] as string).toLowerCase(),
        value: (args["value"] as bigint).toString(10),
      };
    } else if (topic0 === TOKEN_REBASED_TOPIC0 && address === stETH) {
      const decoded = decodeArgs(TOKEN_REBASED_EVENT, log);
      if (!decoded.ok) {
        return err({ kind: "decode-failed", index: i, eventType: "TokenRebased", detail: decoded.error });
      }
      const args = decoded.value;
      obj = {
        type: "TokenRebased",
        ...baseFields(log),
        preTotalShares: (args["preTotalShares"] as bigint).toString(10),
        preTotalEther: (args["preTotalEther"] as bigint).toString(10),
        postTotalShares: (args["postTotalShares"] as bigint).toString(10),
        postTotalEther: (args["postTotalEther"] as bigint).toString(10),
      };
    } else {
      // Not a relevant log (defense-in-depth; the fetch filter already scopes).
      continue;
    }

    // Dedup on (blockNumber, txIndex, logIndex) — AD-4. Keep the first delivery.
    const key = `${log.blockNumber}-${log.txIndex}-${log.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ block: log.blockNumber, txi: log.txIndex, logi: log.logIndex, obj });
  }

  normalized.sort(compareTriple);

  // Assemble in the untrusted decimal-string form, then reuse validateManifest
  // as the single shape-prover + typed parser (AD-7). No second serializer.
  const untrusted = {
    startBlock: input.startBlock.toString(10),
    startHash: input.startHash.toLowerCase(),
    endBlock: input.endBlock.toString(10),
    endHash: input.endHash.toLowerCase(),
    events: normalized.map((n) => n.obj),
    rateCurve: input.rateCurve.map((point) => ({
      rebaseBlock: point.rebaseBlock.toString(10),
      rate1e18: point.rate1e18.toString(10),
    })),
    addressTable: input.addressTable.map((row) => ({
      chainId: row.chainId.toString(10),
      symbol: row.symbol,
      address: row.address.toLowerCase(),
    })),
    engineVersion: input.engineVersion,
    priceObservation: {
      feedAddress: input.priceObservation.feedAddress.toLowerCase(),
      roundId: input.priceObservation.roundId.toString(10),
      answer: input.priceObservation.answer.toString(10),
      decimals: input.priceObservation.decimals.toString(10),
      observedBlock: input.priceObservation.observedBlock.toString(10),
    },
  };

  const validated = validateManifest(untrusted);
  if (!validated.ok) return err({ kind: "invalid-manifest", error: validated.error });
  return ok(validated.value);
}
