import assert from "node:assert/strict";
import { test } from "node:test";
import { type Hex, encodeAbiParameters, encodeEventTopics } from "viem";
import { collectInWindowRebases } from "../src/reconstruct.ts";
import { TOKEN_REBASED_EVENT, TOKEN_REBASED_TOPIC0, TRANSFER_TOPIC0 } from "../src/events.ts";
import { type RawLog } from "../src/rawlog.ts";

// Health-audit Reliability finding: reconstruct's in-window rebase decode used a
// bare `decodeEventLog` + `as unknown as` cast with no try/catch, so a malformed
// rebase log escaped `reconstructManifest` as an UNCAUGHT throw despite its
// `Result` signature — a failure-contract break in the tool whose credibility
// rests on failing legibly. It now shares the guarded `decodeArgs`; these tests
// pin that a hostile log yields a typed error, never an exception.

const STETH = "0x0000000000000000000000000000000000000abc";
const B32 = `0x${"11".repeat(32)}` as const;

function rebaseLog(over: Partial<RawLog> = {}): RawLog {
  const topics = encodeEventTopics({
    abi: [TOKEN_REBASED_EVENT],
    eventName: "TokenRebased",
    args: { reportTimestamp: 1_700_000_000n },
  }) as Hex[];
  // timeElapsed, preTotalShares, preTotalEther, postTotalShares, postTotalEther, sharesMintedAsFees
  const data = encodeAbiParameters(
    Array.from({ length: 6 }, () => ({ type: "uint256" as const })),
    [10n, 100n, 200n, 300n, 400n, 5n],
  );
  return {
    address: STETH,
    topics,
    data,
    blockNumber: 150n,
    txIndex: 0n,
    logIndex: 0n,
    blockHash: B32,
    txHash: B32,
    ...over,
  };
}

test("collectInWindowRebases decodes a well-formed rebase into the rate fields", () => {
  const result = collectInWindowRebases([rebaseLog({ blockNumber: 150n })], STETH);
  assert.ok(result.ok);
  assert.deepEqual(result.value, [
    { rebaseBlock: 150n, postTotalEther: 400n, postTotalShares: 300n },
  ]);
});

test("collectInWindowRebases returns a typed error (never throws) on a malformed rebase log", () => {
  // topic0 matches and the address is stETH, but the indexed topic + data are
  // missing — the exact hostile shape that previously threw uncaught.
  const malformed = rebaseLog({ topics: [TOKEN_REBASED_TOPIC0], data: "0x" });
  let result: ReturnType<typeof collectInWindowRebases>;
  assert.doesNotThrow(() => {
    result = collectInWindowRebases([malformed], STETH);
  });
  assert.ok(!result!.ok);
  assert.equal(result!.error.kind, "rebase-decode");
  assert.equal(result!.error.block, 150n);
});

test("collectInWindowRebases ignores non-rebase and non-stETH logs", () => {
  const transfer = rebaseLog({ topics: [TRANSFER_TOPIC0] });
  const otherToken = rebaseLog({ address: "0x000000000000000000000000000000000000dEaD" });
  const result = collectInWindowRebases([transfer, otherToken], STETH);
  assert.ok(result.ok);
  assert.deepEqual(result.value, []);
});
