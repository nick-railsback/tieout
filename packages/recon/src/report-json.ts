/**
 * Presentational hydration: `report.json` (on disk) → `Report` (in memory).
 *
 * The web loads the committed `report.json` as a static asset (AD-13: it renders
 * the immutable artifact, never re-hashes it). Canonical JSON encodes every
 * integer as a decimal string (RFC-8785); the in-memory `Report` uses `bigint`.
 * `parseReportJson` is the pure, field-aware inverse of `canonicalReport` that
 * re-hydrates those strings — it lives here, beside its documented inverse's
 * `Report` type (in `recon.ts`), so no consumer hand-rolls the coercion and
 * drifts from the shape. It reads only its argument; it does not hash,
 * re-serialize, or mutate anything. (`roundtrip.test.ts` pins it as the exact
 * inverse of `canonicalReport`.)
 *
 * PURE (AD-1): no I/O, no network, no wall-clock, no float. Throws on a malformed
 * report; the shell (the web) owns that error state.
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#AD-13, #AD-17]
 */
import { type Hex } from "viem";
import {
  type AxisResult,
  type BreakingEvent,
  type Discrepancy,
  type DiscrepancyAxis,
  type Report,
  type ReportLot,
  type ReportPins,
  type ReportValuation,
} from "./recon.ts";
import { DECIMAL_INT } from "./validate.ts";

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`report.${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(object: Record<string, unknown>, key: string, path: string): string {
  const value = object[key];
  if (typeof value !== "string") throw new Error(`report.${path}${key} must be a string`);
  return value;
}

function asBigint(object: Record<string, unknown>, key: string, path: string): bigint {
  const value = object[key];
  if (typeof value !== "string" || !DECIMAL_INT.test(value)) {
    throw new Error(`report.${path}${key} must be a decimal-string integer`);
  }
  return BigInt(value);
}

function asBoolean(object: Record<string, unknown>, key: string, path: string): boolean {
  const value = object[key];
  if (typeof value !== "boolean") throw new Error(`report.${path}${key} must be a boolean`);
  return value;
}

function parsePins(value: unknown): ReportPins {
  const object = asRecord(value, "pins");
  return {
    startBlock: asBigint(object, "startBlock", "pins."),
    startHash: asString(object, "startHash", "pins."),
    endBlock: asBigint(object, "endBlock", "pins."),
    endHash: asString(object, "endHash", "pins."),
  };
}

function parseAxis(value: unknown, name: string): AxisResult {
  const object = asRecord(value, `axes.${name}`);
  const path = `axes.${name}.`;
  return {
    onchain: asBigint(object, "onchain", path),
    ledger: asBigint(object, "ledger", path),
    delta: asBigint(object, "delta", path),
    tieOut: asBoolean(object, "tieOut", path),
  };
}

function parseLot(value: unknown): ReportLot {
  const object = asRecord(value, "lots[]");
  return {
    lotId: asString(object, "lotId", "lots[]."),
    acquisitionBlock: asBigint(object, "acquisitionBlock", "lots[]."),
    shares: asBigint(object, "shares", "lots[]."),
    costBasisUsd: asBigint(object, "costBasisUsd", "lots[]."),
  };
}

function parseDiscrepancyAxis(value: string): DiscrepancyAxis {
  if (value === "closingShares" || value === "reward") return value;
  throw new Error(`report.discrepancies[].axis "${value}" is not a known axis`);
}

function parseDiscrepancy(value: unknown): Discrepancy {
  const object = asRecord(value, "discrepancies[]");
  const rawEvent = object["breakingEvent"];
  let breakingEvent: BreakingEvent | null;
  if (rawEvent === null) {
    breakingEvent = null;
  } else {
    const event = asRecord(rawEvent, "discrepancies[].breakingEvent");
    breakingEvent = {
      txHash: asString(event, "txHash", "discrepancies[].breakingEvent."),
      blockNumber: asBigint(event, "blockNumber", "discrepancies[].breakingEvent."),
      logIndex: asBigint(event, "logIndex", "discrepancies[].breakingEvent."),
    };
  }
  return {
    axis: parseDiscrepancyAxis(asString(object, "axis", "discrepancies[].")),
    delta: asBigint(object, "delta", "discrepancies[]."),
    breakingEvent,
  };
}

function parseValuation(value: unknown): ReportValuation {
  const object = asRecord(value, "valuation");
  const path = "valuation.";
  return {
    usdDecimals: asBigint(object, "usdDecimals", path),
    currentValueUsd: asBigint(object, "currentValueUsd", path),
    costBasisUsd: asBigint(object, "costBasisUsd", path),
    unrealizedPnl: asBigint(object, "unrealizedPnl", path),
    sharesValued: asBigint(object, "sharesValued", path),
    rate1e18: asBigint(object, "rate1e18", path),
    roundId: asBigint(object, "roundId", path),
    answer: asBigint(object, "answer", path),
    priceDecimals: asBigint(object, "priceDecimals", path),
  };
}

/** Hydrate a canonical `report.json` value (string-encoded bigints) into the
 * exact `Report` the engine produces — the inverse of `canonicalReport`. Throws
 * on a malformed report; the shell (the web) owns that error state. */
export function parseReportJson(value: unknown): Report {
  const object = asRecord(value, "");
  const axes = asRecord(object["axes"], "axes");
  const lots = object["lots"];
  const discrepancies = object["discrepancies"];
  if (!Array.isArray(lots)) throw new Error("report.lots must be an array");
  if (!Array.isArray(discrepancies)) throw new Error("report.discrepancies must be an array");

  return {
    schemaVersion: asString(object, "schemaVersion", ""),
    engineVersion: asString(object, "engineVersion", ""),
    subject: asString(object, "subject", ""),
    asset: asString(object, "asset", ""),
    pins: parsePins(object["pins"]),
    manifestHash: asString(object, "manifestHash", "") as Hex,
    ledgerHash: asString(object, "ledgerHash", "") as Hex,
    axes: {
      closingShares: parseAxis(axes["closingShares"], "closingShares"),
      reward: parseAxis(axes["reward"], "reward"),
    },
    lots: lots.map(parseLot),
    discrepancies: discrepancies.map(parseDiscrepancy),
    valuation: parseValuation(object["valuation"]),
  };
}
