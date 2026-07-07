import { type Hex } from "viem";
import { type CanonicalValue, canonicalHash, compareCodeUnits } from "./canonical.ts";
import { type Result, ok } from "./result.ts";
import {
  type FieldError,
  fail,
  isPlainObject,
  parseBytes32,
  parseLowerAddress,
  parseNonNegInt,
} from "./validate.ts";

/**
 * The manifest boundary contract (AD-7) — the sole core input beside the
 * ledger. The schema is fixed *from the start*, including `txHash` on every
 * event and the AD-18 price-observation slot, so `manifestHash` never moves
 * when those fields are populated for real in Epic 2 (Batch 2).
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-7]
 */
export type Manifest = {
  readonly startBlock: bigint;
  readonly startHash: string;
  readonly endBlock: bigint;
  readonly endHash: string;
  readonly events: readonly ManifestEvent[];
  readonly rateCurve: readonly RatePoint[];
  readonly addressTable: readonly ManifestAddress[];
  readonly engineVersion: string;
  readonly priceObservation: PriceObservation;
};

export type ManifestEvent = TransferEvent | RebaseEvent;

type EventBase = {
  readonly address: string;
  readonly blockNumber: bigint;
  readonly txIndex: bigint;
  readonly logIndex: bigint;
  readonly blockHash: string;
  /** Carried on EVERY event: the report names a discrepancy's breaking event
   * as `(txHash, block, logIndex)` and a pure core cannot derive `txHash` from
   * `txIndex` — it must arrive in the manifest (AD-7/AC-1.5.c). */
  readonly txHash: string;
};

/** A normalized wstETH `Transfer` — drives the closing-shares axis. */
export type TransferEvent = EventBase & {
  readonly type: "Transfer";
  readonly from: string;
  readonly to: string;
  readonly value: bigint;
};

/** A Lido `TokenRebased` — anchors a rate-curve point and can be a reward-axis
 * breaking event. In Batch 1 the rate curve is supplied directly; these carry
 * the coordinates the report needs to name the breaking rebase. */
export type RebaseEvent = EventBase & {
  readonly type: "TokenRebased";
  readonly preTotalShares: bigint;
  readonly preTotalEther: bigint;
  readonly postTotalShares: bigint;
  readonly postTotalEther: bigint;
};

/** A step in the stETH-per-wstETH rate curve: `rate1e18` in effect from
 * `rebaseBlock` onward (AD-6). */
export type RatePoint = {
  readonly rebaseBlock: bigint;
  readonly rate1e18: bigint;
};

/** One row of the embedded, cast-checked address table (AD-5), keyed by
 * `chainId`; the manifest binds the report to the exact addresses used. */
export type ManifestAddress = {
  readonly chainId: bigint;
  readonly symbol: string;
  readonly address: string;
};

/** The AD-18 price-observation slot: present from the start, consumed in
 * Batch 4. Its presence (not its value) is what keeps `manifestHash` stable. */
export type PriceObservation = {
  readonly feedAddress: string;
  readonly roundId: bigint;
  readonly answer: bigint;
  readonly decimals: bigint;
  readonly observedBlock: bigint;
};

const EVENT_TYPES: readonly string[] = ["Transfer", "TokenRebased"];

function validateEvent(raw: unknown, path: string): Result<ManifestEvent, FieldError> {
  if (!isPlainObject(raw)) return fail("bad-type", `${path}: expected an object`, path);
  const type = raw["type"];
  if (typeof type !== "string" || !EVENT_TYPES.includes(type)) {
    return fail(
      "bad-event-type",
      `${path}.type: must be one of ${EVENT_TYPES.join(", ")}`,
      `${path}.type`,
    );
  }

  const address = parseLowerAddress(raw["address"], `${path}.address`);
  if (!address.ok) return address;
  const blockNumber = parseNonNegInt(raw["blockNumber"], `${path}.blockNumber`);
  if (!blockNumber.ok) return blockNumber;
  const txIndex = parseNonNegInt(raw["txIndex"], `${path}.txIndex`);
  if (!txIndex.ok) return txIndex;
  const logIndex = parseNonNegInt(raw["logIndex"], `${path}.logIndex`);
  if (!logIndex.ok) return logIndex;
  const blockHash = parseBytes32(raw["blockHash"], `${path}.blockHash`);
  if (!blockHash.ok) return blockHash;
  const txHash = parseBytes32(raw["txHash"], `${path}.txHash`);
  if (!txHash.ok) return txHash;

  const base: EventBase = {
    address: address.value,
    blockNumber: blockNumber.value,
    txIndex: txIndex.value,
    logIndex: logIndex.value,
    blockHash: blockHash.value,
    txHash: txHash.value,
  };

  if (type === "Transfer") {
    const from = parseLowerAddress(raw["from"], `${path}.from`);
    if (!from.ok) return from;
    const to = parseLowerAddress(raw["to"], `${path}.to`);
    if (!to.ok) return to;
    const value = parseNonNegInt(raw["value"], `${path}.value`);
    if (!value.ok) return value;
    return ok({ type: "Transfer", ...base, from: from.value, to: to.value, value: value.value });
  }

  const preTotalShares = parseNonNegInt(raw["preTotalShares"], `${path}.preTotalShares`);
  if (!preTotalShares.ok) return preTotalShares;
  const preTotalEther = parseNonNegInt(raw["preTotalEther"], `${path}.preTotalEther`);
  if (!preTotalEther.ok) return preTotalEther;
  const postTotalShares = parseNonNegInt(raw["postTotalShares"], `${path}.postTotalShares`);
  if (!postTotalShares.ok) return postTotalShares;
  const postTotalEther = parseNonNegInt(raw["postTotalEther"], `${path}.postTotalEther`);
  if (!postTotalEther.ok) return postTotalEther;
  return ok({
    type: "TokenRebased",
    ...base,
    preTotalShares: preTotalShares.value,
    preTotalEther: preTotalEther.value,
    postTotalShares: postTotalShares.value,
    postTotalEther: postTotalEther.value,
  });
}

/**
 * Validate an untrusted, JSON-parsed manifest into a typed {@link Manifest}.
 * Enforces every array's declared total order (AD-4/AD-13/AC-1.4.b): events by
 * `(blockNumber, txIndex, logIndex)`, the rate curve by `rebaseBlock`, and the
 * address table by `(chainId, address)` — each strictly increasing.
 */
export function validateManifest(input: unknown): Result<Manifest, FieldError> {
  if (!isPlainObject(input)) return fail("not-object", "manifest: expected a JSON object", "");

  const startBlock = parseNonNegInt(input["startBlock"], "startBlock");
  if (!startBlock.ok) return startBlock;
  const startHash = parseBytes32(input["startHash"], "startHash");
  if (!startHash.ok) return startHash;
  const endBlock = parseNonNegInt(input["endBlock"], "endBlock");
  if (!endBlock.ok) return endBlock;
  const endHash = parseBytes32(input["endHash"], "endHash");
  if (!endHash.ok) return endHash;
  if (startBlock.value > endBlock.value) {
    return fail("bad-window", "startBlock must be <= endBlock (AD-3)", "");
  }

  if (typeof input["engineVersion"] !== "string" || input["engineVersion"].length === 0) {
    return fail("bad-type", "engineVersion: expected a non-empty string", "engineVersion");
  }
  const engineVersion = input["engineVersion"];

  // events[]
  const eventsInput = input["events"];
  if (!Array.isArray(eventsInput)) return fail("bad-type", "events: expected an array", "events");
  const events: ManifestEvent[] = [];
  for (let i = 0; i < eventsInput.length; i++) {
    const event = validateEvent(eventsInput[i], `events[${i}]`);
    if (!event.ok) return event;
    events.push(event.value);
  }
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1]!;
    const curr = events[i]!;
    const ordered =
      prev.blockNumber < curr.blockNumber ||
      (prev.blockNumber === curr.blockNumber &&
        (prev.txIndex < curr.txIndex ||
          (prev.txIndex === curr.txIndex && prev.logIndex < curr.logIndex)));
    if (!ordered) {
      return fail(
        "event-order",
        `events[${i}]: must be strictly ordered by (blockNumber, txIndex, logIndex) (AD-4)`,
        `events[${i}]`,
      );
    }
  }

  // rateCurve[]
  const rateInput = input["rateCurve"];
  if (!Array.isArray(rateInput))
    return fail("bad-type", "rateCurve: expected an array", "rateCurve");
  const rateCurve: RatePoint[] = [];
  for (let i = 0; i < rateInput.length; i++) {
    const path = `rateCurve[${i}]`;
    const raw = rateInput[i];
    if (!isPlainObject(raw)) return fail("bad-type", `${path}: expected an object`, path);
    const rebaseBlock = parseNonNegInt(raw["rebaseBlock"], `${path}.rebaseBlock`);
    if (!rebaseBlock.ok) return rebaseBlock;
    const rate1e18 = parseNonNegInt(raw["rate1e18"], `${path}.rate1e18`);
    if (!rate1e18.ok) return rate1e18;
    rateCurve.push({ rebaseBlock: rebaseBlock.value, rate1e18: rate1e18.value });
  }
  for (let i = 1; i < rateCurve.length; i++) {
    if (rateCurve[i - 1]!.rebaseBlock >= rateCurve[i]!.rebaseBlock) {
      return fail(
        "rate-order",
        `rateCurve[${i}]: must be strictly ordered by rebaseBlock (AD-4)`,
        `rateCurve[${i}]`,
      );
    }
  }

  // addressTable[]
  const tableInput = input["addressTable"];
  if (!Array.isArray(tableInput))
    return fail("bad-type", "addressTable: expected an array", "addressTable");
  const addressTable: ManifestAddress[] = [];
  for (let i = 0; i < tableInput.length; i++) {
    const path = `addressTable[${i}]`;
    const raw = tableInput[i];
    if (!isPlainObject(raw)) return fail("bad-type", `${path}: expected an object`, path);
    const chainId = parseNonNegInt(raw["chainId"], `${path}.chainId`);
    if (!chainId.ok) return chainId;
    if (typeof raw["symbol"] !== "string" || raw["symbol"].length === 0) {
      return fail("bad-type", `${path}.symbol: expected a non-empty string`, `${path}.symbol`);
    }
    const address = parseLowerAddress(raw["address"], `${path}.address`);
    if (!address.ok) return address;
    addressTable.push({ chainId: chainId.value, symbol: raw["symbol"], address: address.value });
  }
  for (let i = 1; i < addressTable.length; i++) {
    const prev = addressTable[i - 1]!;
    const curr = addressTable[i]!;
    const ordered =
      prev.chainId < curr.chainId ||
      (prev.chainId === curr.chainId && compareCodeUnits(prev.address, curr.address) < 0);
    if (!ordered) {
      return fail(
        "table-order",
        `addressTable[${i}]: must be ordered by (chainId, address) (AD-4/AD-5)`,
        `addressTable[${i}]`,
      );
    }
  }

  // priceObservation (AD-18) — present from the start.
  const priceInput = input["priceObservation"];
  if (!isPlainObject(priceInput)) {
    return fail("bad-type", "priceObservation: expected an object", "priceObservation");
  }
  const feedAddress = parseLowerAddress(priceInput["feedAddress"], "priceObservation.feedAddress");
  if (!feedAddress.ok) return feedAddress;
  const roundId = parseNonNegInt(priceInput["roundId"], "priceObservation.roundId");
  if (!roundId.ok) return roundId;
  const answer = parseNonNegInt(priceInput["answer"], "priceObservation.answer");
  if (!answer.ok) return answer;
  const decimals = parseNonNegInt(priceInput["decimals"], "priceObservation.decimals");
  if (!decimals.ok) return decimals;
  const observedBlock = parseNonNegInt(
    priceInput["observedBlock"],
    "priceObservation.observedBlock",
  );
  if (!observedBlock.ok) return observedBlock;

  return ok({
    startBlock: startBlock.value,
    startHash: startHash.value,
    endBlock: endBlock.value,
    endHash: endHash.value,
    events,
    rateCurve,
    addressTable,
    engineVersion,
    priceObservation: {
      feedAddress: feedAddress.value,
      roundId: roundId.value,
      answer: answer.value,
      decimals: decimals.value,
      observedBlock: observedBlock.value,
    },
  });
}

function canonicalEvent(event: ManifestEvent): CanonicalValue {
  const base = {
    type: event.type,
    address: event.address,
    blockNumber: event.blockNumber,
    txIndex: event.txIndex,
    logIndex: event.logIndex,
    blockHash: event.blockHash,
    txHash: event.txHash,
  };
  if (event.type === "Transfer") {
    return { ...base, from: event.from, to: event.to, value: event.value };
  }
  return {
    ...base,
    preTotalShares: event.preTotalShares,
    preTotalEther: event.preTotalEther,
    postTotalShares: event.postTotalShares,
    postTotalEther: event.postTotalEther,
  };
}

/** Project a validated manifest onto its canonical (hashable) form. */
export function canonicalManifest(manifest: Manifest): CanonicalValue {
  return {
    startBlock: manifest.startBlock,
    startHash: manifest.startHash,
    endBlock: manifest.endBlock,
    endHash: manifest.endHash,
    events: manifest.events.map(canonicalEvent),
    rateCurve: manifest.rateCurve.map((point) => ({
      rebaseBlock: point.rebaseBlock,
      rate1e18: point.rate1e18,
    })),
    addressTable: manifest.addressTable.map((row) => ({
      chainId: row.chainId,
      symbol: row.symbol,
      address: row.address,
    })),
    engineVersion: manifest.engineVersion,
    priceObservation: {
      feedAddress: manifest.priceObservation.feedAddress,
      roundId: manifest.priceObservation.roundId,
      answer: manifest.priceObservation.answer,
      decimals: manifest.priceObservation.decimals,
      observedBlock: manifest.priceObservation.observedBlock,
    },
  };
}

/** `manifestHash = keccak256(canonicalBytes(manifest))` (AD-12). */
export function manifestHash(manifest: Manifest): Hex {
  return canonicalHash(canonicalManifest(manifest));
}
