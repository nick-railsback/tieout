import assert from "node:assert/strict";
import { test } from "node:test";
import { getAddress, isAddress } from "viem";
import { ADDRESS_TABLE, getTokenAddress } from "../src/index.ts";
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
