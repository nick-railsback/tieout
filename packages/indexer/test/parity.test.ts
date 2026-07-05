import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import {
  type DerivationInput,
  TRANSFER_EVENT,
  TOKEN_REBASED_EVENT,
  derive,
  mainnetTokenTable,
  manifestHash,
  viemLogToRawLog,
} from "@tieout/recon";
import { SLICE_END_BLOCK, SLICE_START_BLOCK } from "@tieout/recon";
import { type PonderLogEvent, ponderEventToRawLog } from "../src/adapter.ts";

// T8 / AC-2.2.d — identical raw logs through the Ponder-assembled path and the
// verify eth_getLogs path produce a BYTE-IDENTICAL manifest.

const WSTETH = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0" as const;
const STETH = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84" as const;
const FROM = "0x1111111111111111111111111111111111111111" as const;
const TO = "0x2222222222222222222222222222222222222222" as const;
const BLOCK_HASH = `0x${"bb".repeat(32)}` as Hex;
const TX_HASH = `0x${"cc".repeat(32)}` as Hex;

// One underlying wstETH Transfer, expressed in both source shapes.
const topics = encodeEventTopics({
  abi: [TRANSFER_EVENT],
  eventName: "Transfer",
  args: { from: FROM, to: TO },
}) as Hex[];
const data = encodeAbiParameters([{ type: "uint256" }], [123n]);

// eth_getLogs shape (viem): blockNumber bigint, tx/log index numbers.
const viemLog = {
  address: WSTETH,
  topics,
  data,
  blockNumber: 150n,
  transactionIndex: 2,
  logIndex: 7,
  blockHash: BLOCK_HASH,
  transactionHash: TX_HASH,
};

// Ponder event shape: event.log has only {address,topics,data,logIndex}; the
// block/tx fields come from event.block / event.transaction.
const ponderEvent: PonderLogEvent = {
  log: { address: WSTETH, topics, data, logIndex: 7 },
  block: { number: 150n, hash: BLOCK_HASH },
  transaction: { transactionIndex: 2, hash: TX_HASH },
};

// One underlying stETH TokenRebased (7 fields — 4 non-indexed data words vs
// Transfer's 1), in both source shapes, at a distinct (block, logIndex).
const rebaseTopics = encodeEventTopics({
  abi: [TOKEN_REBASED_EVENT],
  eventName: "TokenRebased",
  args: { reportTimestamp: 1_700_000_000n },
}) as Hex[];
// timeElapsed, preTotalShares, preTotalEther, postTotalShares, postTotalEther, sharesMintedAsFees
const rebaseData = encodeAbiParameters(
  Array.from({ length: 6 }, () => ({ type: "uint256" as const })),
  [10n, 100n, 200n, 300n, 400n, 5n],
);
const rebaseViemLog = {
  address: STETH,
  topics: rebaseTopics,
  data: rebaseData,
  blockNumber: 160n,
  transactionIndex: 0,
  logIndex: 3,
  blockHash: BLOCK_HASH,
  transactionHash: TX_HASH,
};
const rebasePonderEvent: PonderLogEvent = {
  log: { address: STETH, topics: rebaseTopics, data: rebaseData, logIndex: 3 },
  block: { number: 160n, hash: BLOCK_HASH },
  transaction: { transactionIndex: 0, hash: TX_HASH },
};

function makeInput(rawLogs: DerivationInput["rawLogs"]): DerivationInput {
  return {
    rawLogs,
    startBlock: 100n,
    startHash: `0x${"11".repeat(32)}`,
    endBlock: 200n,
    endHash: `0x${"22".repeat(32)}`,
    addressTable: mainnetTokenTable(),
    engineVersion: "0.1.0",
    priceObservation: {
      feedAddress: "0xcfe54b5cd566ab89272946f602d76ea879cab4a8",
      roundId: 1n,
      answer: 1n,
      decimals: 8n,
      observedBlock: 200n,
    },
    rateCurve: [],
  };
}

test("both adapters assemble the identical RawLog from the same underlying log", () => {
  assert.deepEqual(ponderEventToRawLog(ponderEvent), viemLogToRawLog(viemLog));
});

test("AD-9/AC-2.2.d: Ponder path and eth_getLogs path yield a byte-identical manifest", () => {
  const fromPonder = derive(makeInput([ponderEventToRawLog(ponderEvent)]));
  const fromVerify = derive(makeInput([viemLogToRawLog(viemLog)]));
  assert.ok(fromPonder.ok && fromVerify.ok);
  // Assert the log actually SURVIVED classification before comparing outputs
  // (TEST-3): `derive` silently skips any log whose (topic0, address) misses the
  // table, so if WSTETH here ever drifts from mainnetTokenTable() both manifests
  // go identically empty and hash-equality "proves" AC-2.2.d vacuously. Pin the
  // non-trivial content so a dropped Transfer fails loudly, not silently.
  assert.equal(fromPonder.value.events.length, 1, "the Transfer was dropped, not derived");
  assert.equal(fromPonder.value.events[0]!.type, "Transfer");
  assert.equal(manifestHash(fromPonder.value), manifestHash(fromVerify.value));
  assert.deepEqual(fromPonder.value, fromVerify.value);
});

// Health-audit Testing finding (TEST-4): parity only exercised Transfer, so a
// TokenRebased-specific decode divergence between the two source shapes (its 7
// fields / 4 non-indexed data words vs Transfer's 1) would pass CI. Run BOTH
// event types together through both adapters and assert cross-source ordering +
// byte-identity survive.
test("AD-9/AC-2.2.d: TokenRebased + Transfer flow byte-identically through both adapters", () => {
  const bothPonder = [ponderEventToRawLog(ponderEvent), ponderEventToRawLog(rebasePonderEvent)];
  const bothVerify = [viemLogToRawLog(viemLog), viemLogToRawLog(rebaseViemLog)];

  assert.deepEqual(ponderEventToRawLog(rebasePonderEvent), viemLogToRawLog(rebaseViemLog));

  const fromPonder = derive(makeInput(bothPonder));
  const fromVerify = derive(makeInput(bothVerify));
  assert.ok(fromPonder.ok && fromVerify.ok);
  // Both events must survive classification (not a vacuous pass) and be ordered.
  assert.equal(fromPonder.value.events.length, 2, "a Transfer or TokenRebased was dropped");
  assert.deepEqual(
    fromPonder.value.events.map((e) => e.type),
    ["Transfer", "TokenRebased"],
  );
  assert.equal(manifestHash(fromPonder.value), manifestHash(fromVerify.value));
  assert.deepEqual(fromPonder.value, fromVerify.value);
});

// Health-audit DRY finding: the Ponder config's indexed window must be the SAME
// pinned slice `verify`/`pin-slice` reconstruct — single-sourced from
// `@tieout/recon`. This binds it, so re-hardcoding a literal here fails loudly.
test("AD-9: the Ponder config indexes exactly the shared pinned slice", async () => {
  // The config now fails fast on a missing PONDER_RPC_URL_1 (see env.test.ts),
  // so provide one and import it dynamically — the static import would throw at
  // module-eval time in any environment without the var (e.g. CI).
  process.env.PONDER_RPC_URL_1 ??= "https://archive.example/key";
  const { default: config } = await import("../ponder.config.ts");
  const start = Number(SLICE_START_BLOCK);
  const end = Number(SLICE_END_BLOCK);
  for (const source of [config.contracts.WstETH, config.contracts.StETH]) {
    assert.equal(source.startBlock, start);
    assert.equal(source.endBlock, end);
  }
});
