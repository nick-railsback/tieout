import assert from "node:assert/strict";
import { test } from "node:test";
import { getAddress, isAddress } from "viem";
import { ADDRESS_TABLE, getTokenAddress, getFeedAddress, type TokenSymbol } from "../src/index.ts";
import { checkAddressTable } from "../src/guard.ts";

// T2 / AC-1.1.b, AC-1.1.c — cast-checked address table + build guard.

test("the address table passes the AD-5 guard (getAddress round-trip, ordered, lowercase)", () => {
  assert.deepEqual(checkAddressTable(), []);
});

test("every stored address is the lowercase of its EIP-55 checksum (AC-1.1.c)", () => {
  for (const entry of ADDRESS_TABLE) {
    // getAddress never receives the EIP-1191 chainId argument.
    assert.equal(entry.address, getAddress(entry.address).toLowerCase());
  }
});

test("stored addresses are lowercase, 0x-prefixed, fixed-width (AC-1.1.b)", () => {
  for (const entry of ADDRESS_TABLE) {
    assert.match(entry.address, /^0x[0-9a-f]{40}$/);
  }
});

test("table is ordered by (chainId, address) (AC-1.1.b)", () => {
  for (let i = 1; i < ADDRESS_TABLE.length; i++) {
    const prev = ADDRESS_TABLE[i - 1]!;
    const curr = ADDRESS_TABLE[i]!;
    assert.ok(
      prev.chainId < curr.chainId || (prev.chainId === curr.chainId && prev.address < curr.address),
    );
  }
});

test("getTokenAddress resolves known tokens and throws for the unknown", () => {
  assert.equal(getTokenAddress(1, "wstETH"), "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0");
  assert.equal(getTokenAddress(1, "stETH"), "0xae7ab96520de3a18e5e111b5eaab095312d7fe84");
  assert.throws(() => getTokenAddress(8453, "wstETH"), /no address for wstETH on chainId 8453/);
});

// T1 / AC-2.5.a — AD-5 table generalized (kind discriminator) so a price feed
// is representable without lying about its kind. wstETH + stETH stay tokens;
// the Chainlink stETH/USD feed joins as a priceFeed.

test("every entry carries a valid kind discriminator (token | priceFeed)", () => {
  for (const entry of ADDRESS_TABLE) {
    assert.ok(
      entry.kind === "token" || entry.kind === "priceFeed",
      `entry ${entry.symbol}@${entry.chainId} has invalid kind ${String(entry.kind)}`,
    );
  }
});

test("the Chainlink stETH/USD feed is present as a priceFeed entry (AC-2.5.a)", () => {
  const feed = ADDRESS_TABLE.find((e) => e.chainId === 1 && e.symbol === "stETH/USD");
  assert.ok(feed, "stETH/USD feed missing from the AD-5 table");
  assert.equal(feed.kind, "priceFeed");
  // `cast to-check-sum-address 0xcfe5…4a8` → 0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8;
  // stored form is its lowercase (AD-5).
  assert.equal(feed.address, "0xcfe54b5cd566ab89272946f602d76ea879cab4a8");
});

test("getFeedAddress resolves known feeds by kind and throws for the unknown (AC-2.5.a)", () => {
  assert.equal(getFeedAddress(1, "stETH/USD"), "0xcfe54b5cd566ab89272946f602d76ea879cab4a8");
  assert.throws(
    () => getFeedAddress(8453, "stETH/USD"),
    /no priceFeed for stETH\/USD on chainId 8453/,
  );
});

test("token and feed lookups are kind-scoped (a feed is not a token)", () => {
  // getTokenAddress only resolves kind==="token"; asking it for the feed symbol
  // must not accidentally return the feed address.
  assert.throws(() => getTokenAddress(1, "stETH/USD" as unknown as TokenSymbol));
});

test("viem 2.54.1 isAddress/getAddress behaviour the guard depends on", () => {
  const lower = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
  // Live-verified against the installed viem 2.54.1 source: an all-lowercase
  // address short-circuits to `true` under EITHER strict mode — the strict
  // default only rejects *mixed-case* inputs that fail their own checksum.
  // (This corrects the provisional viem-context pack, which claimed the strict
  // default rejects lowercase.)
  assert.equal(isAddress(lower, { strict: false }), true);
  assert.equal(isAddress(lower), true);

  // A mixed-case address that is NOT the correct checksum: strict rejects it,
  // non-strict accepts the well-formed hex.
  const badMixed = "0x7f39C581f595b53c5cb19bd0b3f8da6c935e2ca0";
  assert.equal(isAddress(badMixed), false);
  assert.equal(isAddress(badMixed, { strict: false }), true);

  // getAddress validates and throws on malformed input (a throw = guard failure).
  assert.throws(() => getAddress("0xzz39c581f595b53c5cb19bd0b3f8da6c935e2ca0"));
});
