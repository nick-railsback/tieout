import assert from "node:assert/strict";
import { test } from "node:test";
import { getTokenAddress } from "@tieout/addresses";
import { encodeEventTopics } from "viem";
import { LOG_FILTERS } from "../src/filter.ts";
import { TOKEN_REBASED_EVENT, TRANSFER_EVENT } from "../src/events.ts";

// T3 / AC-2.2.c — the single shared filter, derived from the AD-5 table.

test("LOG_FILTERS covers exactly wstETH.Transfer and stETH.TokenRebased", () => {
  assert.equal(LOG_FILTERS.length, 2);
  assert.deepEqual(
    LOG_FILTERS.map((f) => f.label),
    ["wstETH.Transfer", "stETH.TokenRebased"],
  );
});

test("filter addresses come from the AD-5 table (lowercase), not hardcoded", () => {
  assert.equal(LOG_FILTERS[0]!.address, getTokenAddress(1, "wstETH"));
  assert.equal(LOG_FILTERS[1]!.address, getTokenAddress(1, "stETH"));
  for (const f of LOG_FILTERS) {
    assert.match(f.address, /^0x[0-9a-f]{40}$/);
  }
});

test("each filter's topic0 matches its event signature", () => {
  assert.equal(
    LOG_FILTERS[0]!.topic0,
    encodeEventTopics({ abi: [TRANSFER_EVENT], eventName: "Transfer" })[0],
  );
  assert.equal(
    LOG_FILTERS[1]!.topic0,
    encodeEventTopics({ abi: [TOKEN_REBASED_EVENT], eventName: "TokenRebased" })[0],
  );
});
