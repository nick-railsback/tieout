import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import {
  type DerivationInput,
  TRANSFER_EVENT,
  derive,
  mainnetTokenTable,
  manifestHash,
  viemLogToRawLog,
} from "@tieout/recon";
import { type PonderLogEvent, ponderEventToRawLog } from "../src/adapter.ts";

// T8 / AC-2.2.d — identical raw logs through the Ponder-assembled path and the
// verify eth_getLogs path produce a BYTE-IDENTICAL manifest.

const WSTETH = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0" as const;
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
  assert.equal(manifestHash(fromPonder.value), manifestHash(fromVerify.value));
  assert.deepEqual(fromPonder.value, fromVerify.value);
});
