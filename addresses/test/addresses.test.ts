import assert from "node:assert/strict";
import { test } from "node:test";
import { getAddress, isAddress } from "viem";
import {
  ADDRESS_TABLE,
  ADDRESS_KINDS,
  getTokenAddress,
  getFeedAddress,
  getUtilityAddress,
  getRegistryAddress,
  findRegistryAddress,
  type TokenSymbol,
} from "../src/index.ts";
import { checkAddressTable } from "../src/guard.ts";
import type { AddressEntry } from "../src/index.ts";

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

// SEC-1 — the guard must carry EIP-55's actual error detection, not a tautology.
// The stored `checksummed` form is what a maintainer transcribes from cast; a
// single mistyped nibble breaks its case-checksum and MUST fail the build. The
// lowercase `address` alone cannot detect this (getAddress(x).toLowerCase()===x
// holds for any well-formed lowercase hex, wrong address included).

test("SEC-1: a mistyped nibble in an entry's checksummed form is rejected by the guard", () => {
  const good = ADDRESS_TABLE[0]!;
  // Corrupt exactly one hex nibble of the checksummed form (F -> A at index 9).
  // Still 20 well-formed bytes, but no longer a valid EIP-55 checksum.
  const corrupted = (good.checksummed.slice(0, 9) + "A" + good.checksummed.slice(10)) as `0x${string}`;
  assert.notEqual(corrupted, good.checksummed, "test setup: corruption must change the string");
  const badEntry: AddressEntry = { ...good, checksummed: corrupted, address: corrupted.toLowerCase() as `0x${string}` };
  const errors = checkAddressTable([badEntry]);
  assert.ok(
    errors.length > 0,
    "guard accepted a checksum-corrupted entry — EIP-55 error detection is a no-op",
  );
});

test("SEC-1: an address that disagrees with its checksummed sibling is rejected", () => {
  const good = ADDRESS_TABLE[0]!;
  // A wrong-but-well-formed lowercase address that no longer matches checksummed.
  const wrongAddress = (good.address.slice(0, 41) + (good.address[41] === "0" ? "1" : "0")) as `0x${string}`;
  const badEntry: AddressEntry = { ...good, address: wrongAddress };
  const errors = checkAddressTable([badEntry]);
  assert.ok(errors.length > 0, "guard accepted an address that disagrees with its checksummed form");
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

test("every entry carries a valid kind discriminator (token | priceFeed | utility | registry)", () => {
  for (const entry of ADDRESS_TABLE) {
    assert.ok(
      (ADDRESS_KINDS as readonly string[]).includes(entry.kind),
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

// T2 / AC-5.2.a — the AD-5 table grows for the web shell: Multicall3 (utility)
// and the AttestationRegistry anchor (registry). No address is inlined in apps/web.

test("Multicall3 is present as a utility entry on mainnet, lowercase-stored (AC-5.2.a, AD-5)", () => {
  const mc = ADDRESS_TABLE.find((e) => e.chainId === 1 && e.symbol === "Multicall3");
  assert.ok(mc, "Multicall3 missing from the AD-5 table");
  assert.equal(mc.kind, "utility");
  // cast to-check-sum-address 0xca11…ca11 → 0xcA11bde05977b3631167028862bE2a173976CA11;
  // stored form is its lowercase (AD-5).
  assert.equal(mc.address, "0xca11bde05977b3631167028862be2a173976ca11");
});

test("getUtilityAddress resolves Multicall3 by kind and throws for the unknown (AC-5.2.a)", () => {
  assert.equal(getUtilityAddress(1, "Multicall3"), "0xca11bde05977b3631167028862be2a173976ca11");
  assert.throws(() => getUtilityAddress(999, "Multicall3"), /no utility for Multicall3 on chainId 999/);
});

test("the AttestationRegistry entry is table-driven, never inlined (AC-5.2.a, AD-5)", () => {
  const reg = ADDRESS_TABLE.find((e) => e.kind === "registry" && e.symbol === "AttestationRegistry");
  assert.ok(reg, "AttestationRegistry missing from the AD-5 table");
  // Only a REAL deploy is recorded. Batch 3's maintainer-gated ladder has run
  // only on local Anvil (31337) so far; Base (8453) is intentionally ABSENT
  // until its rung runs — the web must degrade gracefully, never show a fake
  // mainnet record (AD-14).
  assert.equal(reg.chainId, 31337);
  assert.equal(reg.address, "0x5fbdb2315678afecb367f032d93f642f64180aa3");
});

test("getRegistryAddress resolves the local registry and throws for an undeployed chain", () => {
  assert.equal(
    getRegistryAddress(31337, "AttestationRegistry"),
    "0x5fbdb2315678afecb367f032d93f642f64180aa3",
  );
  assert.throws(
    () => getRegistryAddress(8453, "AttestationRegistry"),
    /no registry for AttestationRegistry on chainId 8453/,
  );
});

test("findRegistryAddress is the non-throwing lookup the web degrades on (undeployed → undefined)", () => {
  assert.equal(
    findRegistryAddress(31337, "AttestationRegistry"),
    "0x5fbdb2315678afecb367f032d93f642f64180aa3",
  );
  // Base mainnet: not yet anchored → undefined (the web shows "not yet anchored", AD-14).
  assert.equal(findRegistryAddress(8453, "AttestationRegistry"), undefined);
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
