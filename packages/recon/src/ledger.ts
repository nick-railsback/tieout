import { type Hex } from "viem";
import { type CanonicalValue, canonicalHash, compareCodeUnits } from "./canonical.ts";
import { type Result, ok } from "./result.ts";
import { LEDGER_SCHEMA_VERSION } from "./version.ts";
import {
  type FieldError,
  fail,
  isPlainObject,
  parseLowerAddress,
  parseNonEmptyString,
  parseNonNegInt,
} from "./validate.ts";

/**
 * The fixed ledger input schema (AD-20). Every integer is a non-negative
 * `bigint`; `subject` is a lowercase address; `shares` is wstETH wei (18 dp)
 * and `bookedReward` is wei of stETH. Two axes tie out against this: closing
 * shares and reward (the axis the injected discrepancy breaks).
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-20]
 */
export type Ledger = {
  readonly schemaVersion: string;
  readonly subject: string;
  readonly asset: string;
  readonly window: LedgerWindow;
  readonly lots: readonly Lot[];
  readonly bookedReward: bigint;
};

export type LedgerWindow = {
  readonly startBlock: bigint;
  readonly endBlock: bigint;
};

export type Lot = {
  readonly lotId: string;
  readonly acquisitionBlock: bigint;
  readonly shares: bigint;
  readonly costBasisUsd: bigint;
};

/** The reconciled-token identifier is a fixed constant set for the MVP. */
export const ALLOWED_ASSETS: readonly string[] = ["wstETH"];

/**
 * Validate an untrusted, JSON-parsed ledger into a typed {@link Ledger}. This
 * is the *ledger-only* validator (AC-1.2.a/b): it rejects a duplicate `lotId`,
 * a non-lowercase `subject`, a float, a JSON-number integer, and any lot whose
 * `acquisitionBlock` is after `endBlock`, and it enforces `(acquisitionBlock,
 * lotId)` lot ordering (AD-4/AD-20).
 *
 * The `ledger.window == report pins` equality (AC-1.2.b, AD-3) is deliberately
 * NOT here — it needs the *manifest's* pins and so is a recon-boundary
 * precondition, checked where manifest and ledger first meet ({@link recon}).
 */
export function validateLedger(input: unknown): Result<Ledger, FieldError> {
  if (!isPlainObject(input)) {
    return fail("not-object", "ledger: expected a JSON object", "");
  }

  if (input["schemaVersion"] !== LEDGER_SCHEMA_VERSION) {
    return fail(
      "bad-schema-version",
      `ledger.schemaVersion: expected "${LEDGER_SCHEMA_VERSION}"`,
      "schemaVersion",
    );
  }

  const subject = parseLowerAddress(input["subject"], "subject");
  if (!subject.ok) return subject;

  if (typeof input["asset"] !== "string" || !ALLOWED_ASSETS.includes(input["asset"])) {
    return fail("bad-asset", `asset: must be one of ${ALLOWED_ASSETS.join(", ")}`, "asset");
  }
  const asset = input["asset"];

  const windowInput = input["window"];
  if (!isPlainObject(windowInput)) {
    return fail("bad-type", "window: expected an object", "window");
  }
  const startBlock = parseNonNegInt(windowInput["startBlock"], "window.startBlock");
  if (!startBlock.ok) return startBlock;
  const endBlock = parseNonNegInt(windowInput["endBlock"], "window.endBlock");
  if (!endBlock.ok) return endBlock;
  if (startBlock.value > endBlock.value) {
    return fail("bad-window", "window: startBlock must be <= endBlock (AD-3)", "window");
  }

  const bookedReward = parseNonNegInt(input["bookedReward"], "bookedReward");
  if (!bookedReward.ok) return bookedReward;

  const lotsInput = input["lots"];
  if (!Array.isArray(lotsInput)) {
    return fail("bad-type", "lots: expected an array", "lots");
  }

  const lots: Lot[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lotsInput.length; i++) {
    const path = `lots[${i}]`;
    const raw = lotsInput[i];
    if (!isPlainObject(raw)) {
      return fail("bad-type", `${path}: expected an object`, path);
    }
    const lotId = parseNonEmptyString(raw["lotId"], `${path}.lotId`);
    if (!lotId.ok) return lotId;
    const acquisitionBlock = parseNonNegInt(raw["acquisitionBlock"], `${path}.acquisitionBlock`);
    if (!acquisitionBlock.ok) return acquisitionBlock;
    const shares = parseNonNegInt(raw["shares"], `${path}.shares`);
    if (!shares.ok) return shares;
    const costBasisUsd = parseNonNegInt(raw["costBasisUsd"], `${path}.costBasisUsd`);
    if (!costBasisUsd.ok) return costBasisUsd;

    if (seen.has(lotId.value)) {
      return fail("duplicate-lot", `${path}.lotId: duplicate lotId "${lotId.value}"`, `${path}.lotId`);
    }
    seen.add(lotId.value);

    if (acquisitionBlock.value > endBlock.value) {
      return fail(
        "acquisition-after-window",
        `${path}.acquisitionBlock: a lot cannot be acquired after the window closes (AD-20)`,
        `${path}.acquisitionBlock`,
      );
    }

    lots.push({
      lotId: lotId.value,
      acquisitionBlock: acquisitionBlock.value,
      shares: shares.value,
      costBasisUsd: costBasisUsd.value,
    });
  }

  // Enforce the declared total order: (acquisitionBlock, lotId), strictly
  // increasing since lotId is unique (AD-4/AD-20).
  for (let i = 1; i < lots.length; i++) {
    const prev = lots[i - 1]!;
    const curr = lots[i]!;
    const ordered =
      prev.acquisitionBlock < curr.acquisitionBlock ||
      (prev.acquisitionBlock === curr.acquisitionBlock &&
        compareCodeUnits(prev.lotId, curr.lotId) < 0);
    if (!ordered) {
      return fail(
        "lot-order",
        `lots[${i}]: lots must be ordered by (acquisitionBlock, lotId) (AD-4/AD-20)`,
        `lots[${i}]`,
      );
    }
  }

  return ok({
    schemaVersion: LEDGER_SCHEMA_VERSION,
    subject: subject.value,
    asset,
    window: { startBlock: startBlock.value, endBlock: endBlock.value },
    lots,
    bookedReward: bookedReward.value,
  });
}

/** Project a validated ledger onto its canonical (hashable) form. */
export function canonicalLedger(ledger: Ledger): CanonicalValue {
  return {
    schemaVersion: ledger.schemaVersion,
    subject: ledger.subject,
    asset: ledger.asset,
    window: {
      startBlock: ledger.window.startBlock,
      endBlock: ledger.window.endBlock,
    },
    lots: ledger.lots.map((lot) => ({
      lotId: lot.lotId,
      acquisitionBlock: lot.acquisitionBlock,
      shares: lot.shares,
      costBasisUsd: lot.costBasisUsd,
    })),
    bookedReward: ledger.bookedReward,
  };
}

/**
 * `ledgerHash = keccak256(canonicalBytes(ledger))` (AC-1.2.c). Stable across
 * runs and independent of input key order — the canonicalizer sorts keys, and
 * this projection reads fields by name.
 */
export function ledgerHash(ledger: Ledger): Hex {
  return canonicalHash(canonicalLedger(ledger));
}
