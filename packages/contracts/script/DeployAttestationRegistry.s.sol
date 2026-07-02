// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";

/// @title DeployAttestationRegistry — staged, source-verified deploy of the anchor
/// @author tieout (Batch 3, Story 3.3)
///
/// ██  LEAVES THE MACHINE — EVERY NON-LOCAL RUNG HALTS FOR APPROVAL  ██
///
/// @notice Deploys **only** {AttestationRegistry} (no constructor args). It never
/// references or deploys `MockStakedVault` — that contract is TEST-ONLY and MUST
/// NOT be deployed to any network (AD-15).
///
/// **The ladder (each non-local rung pauses for explicit approval):**
///   1. local Anvil — simulate/deploy locally, nothing leaves the machine:
///        anvil &
///        forge script script/DeployAttestationRegistry.s.sol:DeployAttestationRegistry \
///          --rpc-url http://127.0.0.1:8545 --broadcast \
///          --private-key <anvil-dev-key>
///   2. Base Sepolia (84532) rehearsal — HALT for approval, then:
///        forge script script/DeployAttestationRegistry.s.sol:DeployAttestationRegistry \
///          --rpc-url base_sepolia --account tieout-deployer --broadcast \
///          --verify --verifier etherscan --etherscan-api-key "$ETHERSCAN_API_KEY"
///   3. single Base mainnet (8453) canonical anchor — HALT for approval, same
///      invocation with `--rpc-url base`.
///
/// **Simulation-by-default (the AC-3.3.a "dry run" trap).** `forge script` runs
/// the EVM simulation and does NOT send anything unless `--broadcast` is passed;
/// `--verify` and `--resume` also imply broadcast intent. Foundry's "dry run"
/// vocabulary means the un-broadcast simulation, not the Sepolia rung. Treat any
/// of those three flags as an onchain action that must clear the approval gate.
///
/// **A real signer is required to broadcast.** `forge script` refuses Foundry's
/// default sender when broadcasting; supply a keystore account (`--account`,
/// preferred — no raw key on disk or in shell history) or a `--private-key`.
///
/// **Verify on the Etherscan verifier — not Sourcify.** Pass
/// `--verifier etherscan --etherscan-api-key <key>` explicitly (or rely on the
/// `[etherscan]` alias in foundry.toml); without a key `forge verify-contract`
/// silently falls back to Sourcify, and an unverified anchor is indistinguishable
/// from a scam (AC-3.3.b).
///
/// [Source: docs/ARCHITECTURE-SPINE.md#AD-15]
/// [Source: docs/ARCHITECTURE-SPINE.md — Operational envelope]
contract DeployAttestationRegistry is Script {
    /// @notice The only chains this ladder may deploy to — Base mainnet (the
    /// single canonical anchor), Base Sepolia (the rehearsal), and local Anvil.
    uint256 internal constant BASE_MAINNET = 8453;
    uint256 internal constant BASE_SEPOLIA = 84_532;
    uint256 internal constant ANVIL_LOCAL = 31_337;

    /// @notice Thrown when the resolved `--rpc-url` targets an unexpected chain.
    error UnexpectedChain(uint256 chainId);

    /// @notice Deploy the single, unparameterized {AttestationRegistry}.
    /// @return registry The freshly deployed anchor.
    function run() external returns (AttestationRegistry registry) {
        // Chain guard: a wrong `--rpc-url` or stale env must not silently mint a
        // bogus "canonical" anchor on the wrong network. Reverts before any
        // broadcast if the resolved chain isn't a rung of the ladder.
        if (
            block.chainid != BASE_MAINNET && block.chainid != BASE_SEPOLIA
                && block.chainid != ANVIL_LOCAL
        ) {
            revert UnexpectedChain(block.chainid);
        }

        vm.startBroadcast();
        registry = new AttestationRegistry();
        vm.stopBroadcast();

        console2.log("AttestationRegistry deployed at:", address(registry));
        console2.log("  chain id:", block.chainid);
    }
}
