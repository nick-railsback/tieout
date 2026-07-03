import assert from "node:assert/strict";
import { test } from "node:test";
import { startLivePositions, type LivePositionsDeps } from "../src/live.ts";
import { LIVE_READ_FAILURE_LIMIT } from "../src/config.ts";

// Health-audit Product/UX finding: a healthy socket whose multicall reads keep
// failing pinned the live panel at "connecting…" forever — the terminal-state
// logic lived only in the socket path; the read path just console.error'd. The
// shell now takes an injectable deps seam so this escalation is testable headless
// (the real viem client is the default).

const SUBJECT = "0x00000000000000000000000000000000000000da" as const;
const tick = () => new Promise((r) => setTimeout(r, 0));

function harness(read: LivePositionsDeps["read"]) {
  const statuses: string[] = [];
  const errors: unknown[] = [];
  let onBlock: (() => void) | undefined;
  let onError: ((e: unknown) => void) | undefined;
  const deps: LivePositionsDeps = {
    read,
    watch: (h) => {
      onBlock = h.onBlock;
      onError = h.onError;
      return () => {};
    },
  };
  startLivePositions(
    {
      subject: SUBJECT,
      onUpdate: () => {},
      onStatus: (s) => statuses.push(s),
      onError: (e) => errors.push(e),
    },
    deps,
  );
  return {
    statuses,
    errors,
    fireBlock: () => onBlock!(),
    fireSocketError: (e: unknown) => onError!(e),
  };
}

test("read failures on a healthy socket escalate to a terminal 'disconnected'", async () => {
  const h = harness(async () => {
    throw new Error("eth_call rate limited");
  });
  await tick(); // the initial refetch rejects
  for (let i = 0; i < LIVE_READ_FAILURE_LIMIT; i++) {
    h.fireBlock();
    await tick();
  }
  assert.ok(h.statuses.includes("disconnected"), "must reach a terminal disconnected state");
  assert.equal(h.statuses.at(-1), "disconnected");
  assert.ok(!h.statuses.slice(-1).includes("connecting"), "must not pin on connecting");
  assert.ok(h.errors.length >= LIVE_READ_FAILURE_LIMIT, "each failure is surfaced, not swallowed");
});

test("a successful read recovers to 'live' and resets the failure count", async () => {
  let fail = true;
  const h = harness(async () => {
    if (fail) throw new Error("transient");
    return { balanceWstEth: 1n, stEthPerToken: 2n };
  });
  await tick();
  fail = false;
  h.fireBlock();
  await tick();
  assert.equal(h.statuses.at(-1), "live");
  // After recovery, a fresh failure starts the count over (not already terminal).
  fail = true;
  h.fireBlock();
  await tick();
  assert.equal(h.statuses.at(-1), "reconnecting");
});
