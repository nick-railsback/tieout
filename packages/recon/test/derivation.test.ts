import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { derive, type DerivationInput } from "../src/derivation.ts";
import { TOKEN_REBASED_EVENT, TRANSFER_EVENT } from "../src/events.ts";
import { manifestHash } from "../src/manifest.ts";
import { type RawLog } from "../src/rawlog.ts";

// T3 / AC-2.2.a-c — the ONE shared derivation: normalize + total-order + dedup +
// range-filter, byte-identical from either adapter's raw logs.

const WSTETH = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0" as const;
const STETH = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84" as const;
const FEED = "0xcfe54b5cd566ab89272946f602d76ea879cab4a8" as const;
const FROM = "0x1111111111111111111111111111111111111111" as const;
const TO = "0x2222222222222222222222222222222222222222" as const;
const BH = `0x${"bb".repeat(32)}` as Hex;
const TH = `0x${"cc".repeat(32)}` as Hex;
const START_HASH = `0x${"11".repeat(32)}`;
const END_HASH = `0x${"22".repeat(32)}`;

function transferLog(o: {
  from?: `0x${string}`;
  to?: `0x${string}`;
  value: bigint;
  blockNumber: bigint;
  txIndex: bigint;
  logIndex: bigint;
  address?: `0x${string}`;
}): RawLog {
  const topics = encodeEventTopics({
    abi: [TRANSFER_EVENT],
    eventName: "Transfer",
    args: { from: o.from ?? FROM, to: o.to ?? TO },
  });
  const data = encodeAbiParameters([{ type: "uint256" }], [o.value]);
  return {
    address: o.address ?? WSTETH,
    topics: topics as Hex[],
    data,
    blockNumber: o.blockNumber,
    txIndex: o.txIndex,
    logIndex: o.logIndex,
    blockHash: BH,
    txHash: TH,
  };
}

function rebaseLog(o: {
  postTotalShares: bigint;
  postTotalEther: bigint;
  blockNumber: bigint;
  txIndex: bigint;
  logIndex: bigint;
  address?: `0x${string}`;
}): RawLog {
  const topics = encodeEventTopics({
    abi: [TOKEN_REBASED_EVENT],
    eventName: "TokenRebased",
    args: { reportTimestamp: o.blockNumber },
  });
  const data = encodeAbiParameters(
    [
      { type: "uint256" }, // timeElapsed
      { type: "uint256" }, // preTotalShares
      { type: "uint256" }, // preTotalEther
      { type: "uint256" }, // postTotalShares
      { type: "uint256" }, // postTotalEther
      { type: "uint256" }, // sharesMintedAsFees
    ],
    [86400n, o.postTotalShares - 1n, o.postTotalEther - 1n, o.postTotalShares, o.postTotalEther, 0n],
  );
  return {
    address: o.address ?? STETH,
    topics: topics as Hex[],
    data,
    blockNumber: o.blockNumber,
    txIndex: o.txIndex,
    logIndex: o.logIndex,
    blockHash: BH,
    txHash: TH,
  };
}

function makeInput(rawLogs: RawLog[], over: Partial<DerivationInput> = {}): DerivationInput {
  return {
    rawLogs,
    startBlock: 100n,
    startHash: START_HASH,
    endBlock: 200n,
    endHash: END_HASH,
    addressTable: [
      { chainId: 1n, symbol: "wstETH", address: WSTETH },
      { chainId: 1n, symbol: "stETH", address: STETH },
    ],
    engineVersion: "0.1.0",
    priceObservation: { feedAddress: FEED, roundId: 1n, answer: 1n, decimals: 8n, observedBlock: 200n },
    rateCurve: [],
    ...over,
  };
}

test("decodes + totally orders events by (blockNumber, txIndex, logIndex)", () => {
  const logs = [
    transferLog({ value: 5n, blockNumber: 150n, txIndex: 2n, logIndex: 0n }),
    rebaseLog({ postTotalShares: 100n, postTotalEther: 123n, blockNumber: 120n, txIndex: 0n, logIndex: 4n }),
    transferLog({ value: 9n, blockNumber: 150n, txIndex: 1n, logIndex: 7n }),
  ];
  const result = derive(makeInput(logs));
  assert.ok(result.ok, JSON.stringify(!result.ok && result.error));
  const events = result.value.events;
  assert.equal(events.length, 3);
  // Ascending (block, txi, logi): (120,0,4) < (150,1,7) < (150,2,0)
  assert.deepEqual(
    events.map((e) => [e.blockNumber, e.txIndex, e.logIndex]),
    [
      [120n, 0n, 4n],
      [150n, 1n, 7n],
      [150n, 2n, 0n],
    ],
  );
  assert.equal(events[0]!.type, "TokenRebased");
  const t = events[1]!;
  assert.equal(t.type, "Transfer");
  if (t.type === "Transfer") {
    assert.equal(t.from, FROM);
    assert.equal(t.to, TO);
    assert.equal(t.value, 9n);
    assert.equal(t.txHash, TH); // txHash attached from the raw log
  }
});

test("dedups on (blockNumber, txIndex, logIndex) — keeps the first (AD-4)", () => {
  const a = transferLog({ value: 5n, blockNumber: 150n, txIndex: 2n, logIndex: 0n });
  const dup = transferLog({ value: 999n, blockNumber: 150n, txIndex: 2n, logIndex: 0n });
  const result = derive(makeInput([a, dup]));
  assert.ok(result.ok);
  assert.equal(result.value.events.length, 1);
  const e = result.value.events[0]!;
  assert.equal(e.type === "Transfer" && e.value, 5n); // first kept, not 999
});

test("includes only logs inside the pinned [startBlock, endBlock] (both inclusive)", () => {
  const logs = [
    transferLog({ value: 1n, blockNumber: 99n, txIndex: 0n, logIndex: 0n }), // below
    transferLog({ value: 2n, blockNumber: 100n, txIndex: 0n, logIndex: 0n }), // start (inclusive)
    transferLog({ value: 3n, blockNumber: 200n, txIndex: 0n, logIndex: 0n }), // end (inclusive)
    transferLog({ value: 4n, blockNumber: 201n, txIndex: 0n, logIndex: 0n }), // above
  ];
  const result = derive(makeInput(logs));
  assert.ok(result.ok);
  assert.deepEqual(
    result.value.events.map((e) => e.blockNumber),
    [100n, 200n],
  );
});

test("filters logs whose emitting address is not the expected token (D4 defense)", () => {
  const wrong = "0x9999999999999999999999999999999999999999" as const;
  const logs = [
    transferLog({ value: 1n, blockNumber: 150n, txIndex: 0n, logIndex: 0n, address: wrong }), // dropped
    transferLog({ value: 2n, blockNumber: 150n, txIndex: 0n, logIndex: 1n }), // kept (wstETH)
  ];
  const result = derive(makeInput(logs));
  assert.ok(result.ok);
  assert.equal(result.value.events.length, 1);
  assert.equal(result.value.events[0]!.type === "Transfer" && result.value.events[0]!.value, 2n);
});

test("AD-9: shuffled raw-log order yields a BYTE-IDENTICAL manifest (both adapters)", () => {
  const logs = [
    transferLog({ value: 5n, blockNumber: 150n, txIndex: 2n, logIndex: 0n }),
    rebaseLog({ postTotalShares: 100n, postTotalEther: 123n, blockNumber: 120n, txIndex: 0n, logIndex: 4n }),
    transferLog({ value: 9n, blockNumber: 150n, txIndex: 1n, logIndex: 7n }),
    transferLog({ value: 1n, blockNumber: 130n, txIndex: 5n, logIndex: 2n }),
  ];
  const forward = derive(makeInput([...logs]));
  const reversed = derive(makeInput([...logs].reverse()));
  assert.ok(forward.ok && reversed.ok);
  assert.equal(manifestHash(forward.value), manifestHash(reversed.value));
  assert.deepEqual(forward.value, reversed.value);
});

test("returns a typed error when a required token address is absent from the table", () => {
  const result = derive(
    makeInput([], { addressTable: [{ chainId: 1n, symbol: "stETH", address: STETH }] }),
  );
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "missing-address");
  assert.equal(result.error.kind === "missing-address" && result.error.symbol, "wstETH");
});
