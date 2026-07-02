import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { canonicalBytes } from "../canonical.ts";
import { type Ledger, canonicalLedger, ledgerHash } from "../ledger.ts";
import { canonicalManifest, manifestHash } from "../manifest.ts";
import { canonicalReport, recon } from "../recon.ts";
import { reconstructManifest } from "../reconstruct.ts";
import { LEDGER_SCHEMA_VERSION } from "../version.ts";

/**
 * Generate the real-window golden for the Batch 2 discrepancy slice (Story 2.8).
 * Re-fetches the pinned mainnet slice over L0, derives the manifest, crafts an
 * on-schema ledger whose `bookedReward` DISAGREES with the chain-derived reward
 * (the injected discrepancy — the chain can't be perturbed, the books can),
 * runs `recon`, and writes the byte-exact fixtures. The chain side is real; only
 * the ledger is crafted (AD-20 — constructed through the typed schema).
 *
 *   node src/bin/pin-slice.ts   (ETH_RPC_URL in env; writes fixtures/slice/)
 */
const START_BLOCK = 25444667n;
const END_BLOCK = 25444922n;
const BLOCKS_PER_CHUNK = 9n; // free-tier eth_getLogs cap
const SUBJECT = "0xd0558b2f0f0a00cbc6176c15fec82ebb8e7bb696";
/** The injected discrepancy: the books under-report the reward by this many wei. */
const INJECTED_REWARD_DELTA = 1_000_000_000n;

async function main(): Promise<number> {
  const rpc = process.env.ETH_RPC_URL;
  if (rpc === undefined) {
    process.stderr.write("ETH_RPC_URL not set\n");
    return 2;
  }
  // High retryCount lets viem absorb the free-tier 25 req/min limit (429 → backoff).
  const client = createPublicClient({ chain: mainnet, transport: http(rpc, { retryCount: 12 }) });

  const reconstructed = await reconstructManifest(client, {
    startBlock: START_BLOCK,
    endBlock: END_BLOCK,
    blocksPerChunk: BLOCKS_PER_CHUNK,
  });
  if (!reconstructed.ok) {
    process.stderr.write(`reconstruct failed: ${JSON.stringify(reconstructed.error)}\n`);
    return 1;
  }
  const { manifest } = reconstructed.value;

  // Subject's chain-derived closing shares + first acquisition block.
  let onchainShares = 0n;
  let firstAcq = END_BLOCK;
  for (const event of manifest.events) {
    if (event.type !== "Transfer") continue;
    if (event.to === SUBJECT) {
      onchainShares += event.value;
      if (event.blockNumber < firstAcq) firstAcq = event.blockNumber;
    }
    if (event.from === SUBJECT) onchainShares -= event.value;
  }

  // Provisional recon (books tie out) to read the chain-derived reward.
  const provisional: Ledger = {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    subject: SUBJECT,
    asset: "wstETH",
    window: { startBlock: START_BLOCK, endBlock: END_BLOCK },
    lots: [{ lotId: "lot-1", acquisitionBlock: firstAcq, shares: onchainShares, costBasisUsd: 0n }],
    bookedReward: 0n,
  };
  const prov = recon(manifest, provisional);
  if (!prov.ok) {
    process.stderr.write(`provisional recon failed: [${prov.error.code}] ${prov.error.message}\n`);
    return 1;
  }
  const onchainReward = prov.value.report.axes.reward.onchain;

  // Inject the reward discrepancy: the books UNDER-report the reward. Clamp
  // bookedReward to non-negative — when onchainReward <= the delta (e.g. a
  // rebase-free window with onchainReward == 0), book 0, still an under-report.
  // reward.delta is therefore always >= 0 (never a mislabeled over-report). [Review L2]
  const bookedReward =
    onchainReward > INJECTED_REWARD_DELTA ? onchainReward - INJECTED_REWARD_DELTA : 0n;
  const injectedDelta = onchainReward - bookedReward; // the actual discrepancy (>= 0)
  const ledger: Ledger = { ...provisional, bookedReward };

  const result = recon(manifest, ledger);
  if (!result.ok) {
    process.stderr.write(`recon failed: [${result.error.code}] ${result.error.message}\n`);
    return 1;
  }

  const outDir = new URL("../../fixtures/slice/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(new URL("manifest.json", outDir), canonicalBytes(canonicalManifest(manifest)));
  writeFileSync(new URL("ledger.json", outDir), canonicalBytes(canonicalLedger(ledger)));
  writeFileSync(new URL("report.json", outDir), canonicalBytes(canonicalReport(result.value.report)));

  process.stdout.write(
    [
      `subject:          ${SUBJECT}`,
      `onchainShares:    ${onchainShares}`,
      `onchainReward:    ${onchainReward}`,
      `bookedReward:     ${bookedReward}  (under-reported by ${injectedDelta})`,
      `sharesTieOut:     ${result.value.report.axes.closingShares.tieOut}`,
      `rewardTieOut:     ${result.value.report.axes.reward.tieOut}  (breaks by ${result.value.report.axes.reward.delta})`,
      `manifestHash:     ${manifestHash(manifest)}`,
      `ledgerHash:       ${ledgerHash(ledger)}`,
      `reportHash:       ${result.value.reportHash}`,
      `wrote:            packages/recon/fixtures/slice/{manifest,ledger,report}.json`,
    ].join("\n") + "\n",
  );
  return 0;
}

process.exit(await main());
