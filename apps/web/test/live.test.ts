import assert from "node:assert/strict";
import { test } from "node:test";
import { startLivePositions, type LivePositionsDeps } from "../src/live.ts";
import { LIVE_READ_FAILURE_LIMIT, WS_RECONNECT_ATTEMPTS } from "../src/config.ts";

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

// Health-audit Testing finding (TEST-5): the socket-error escalation branch (the
// file's own headline AC-5.2.c behavior) had zero coverage despite the harness
// exposing fireSocketError — a threshold/counter-reset regression would ship green.
test("socket errors escalate to a terminal 'disconnected' at the reconnect budget (TEST-5)", async () => {
  const h = harness(async () => ({ balanceWstEth: 1n, stEthPerToken: 2n }));
  await tick(); // initial read succeeds → live
  for (let i = 0; i < WS_RECONNECT_ATTEMPTS; i++) {
    h.fireSocketError(new Error("ws drop"));
  }
  assert.equal(h.statuses.at(-1), "disconnected", "must go terminal at the reconnect budget");
  assert.ok(
    h.errors.length >= WS_RECONNECT_ATTEMPTS,
    "each socket error is surfaced, not swallowed",
  );
  // A successful read resets the socket-error count (mirrors the read path).
  h.fireBlock();
  await tick();
  assert.equal(h.statuses.at(-1), "live");
});

// Health-audit Reliability finding (REL-5): each new head fired an independent
// refetch with no in-flight de-dup and no blockNumber pin, so a slow older read
// could paint over a newer one. Overlapping refetches must be skipped.
test("REL-5: a new-block refetch is skipped while a read is already in flight", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const h = harness(async () => {
    calls++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { balanceWstEth: 1n, stEthPerToken: 2n };
  });
  await tick(); // initial refetch is now in flight (awaiting release); calls === 1

  h.fireBlock(); // must be skipped — a read is in flight
  h.fireBlock();
  await tick();
  assert.equal(calls, 1, "overlapping refetches must not start a second read");

  release!(); // let the in-flight read resolve
  await tick();
  h.fireBlock(); // now free to read again
  await tick();
  assert.equal(calls, 2, "a new block after completion reads again");
  release!(); // settle the trailing read
});
