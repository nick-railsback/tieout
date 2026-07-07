// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {DeployAttestationRegistry} from "../script/DeployAttestationRegistry.s.sol";

/// @notice Unit + fuzz tests for the identity-free AttestationRegistry (Story 3.2).
/// Runs under the pinned `[fuzz] seed = 0x7469656f7574` in foundry.toml — do not
/// change the seed (random-per-run fuzzing is at odds with NFR-0 determinism).
///
/// The properties under test (AD-14): first-write-wins, an idempotent no-op on a
/// duplicate attest (no overwrite, no revert, no second event), and identity-free
/// permissionless access (`submitter` is a recorded fact, never authorship).
contract AttestationRegistryTest is Test {
    AttestationRegistry internal registry;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    // Mirror of the contract event, for vm.expectEmit matching.
    event Attested(bytes32 indexed reportHash, address indexed submitter, uint64 timestamp);

    function setUp() public {
        registry = new AttestationRegistry();
    }

    // AC-3.1.a — a first attest stores {blockNumber, timestamp} keyed by reportHash,
    // emits Attested(reportHash, submitter, timestamp), and the record is readable in
    // one eth_call (the public mapping getter returns the full tuple).
    function test_attest_firstWrite_storesEmitsAndReadsInOneCall() public {
        bytes32 reportHash = keccak256("report-1");
        // Declared uint64 to match the stored width — no truncating downcast needed.
        uint64 bn = 123;
        uint64 ts = 1_700_000_000;
        vm.roll(bn);
        vm.warp(ts);

        // Check both indexed topics (reportHash, submitter) + the timestamp data field.
        vm.expectEmit(true, true, false, true, address(registry));
        emit Attested(reportHash, ALICE, ts);

        vm.prank(ALICE);
        registry.attest(reportHash);

        // One eth_call read of the full record via the public getter.
        (uint64 storedBn, uint64 storedTs) = registry.attestations(reportHash);
        assertEq(storedBn, bn, "blockNumber");
        assertEq(storedTs, ts, "timestamp");

        // Convenience views agree and are each one call.
        assertTrue(registry.isAttested(reportHash), "isAttested");
        (uint64 viewBn, uint64 viewTs) = registry.getAttestation(reportHash);
        assertEq(viewBn, bn, "getAttestation.blockNumber");
        assertEq(viewTs, ts, "getAttestation.timestamp");
    }

    // AC-3.1.a — bytes32(0) is an ordinary key, anchored and read like any other
    // (no special-casing); the fuzz exercises the full range, this pins the edge.
    function test_attest_zeroHash_isOrdinaryKey() public {
        vm.roll(7);
        vm.warp(1_700_000_000);
        vm.prank(ALICE);
        registry.attest(bytes32(0));

        assertTrue(registry.isAttested(bytes32(0)));
        (uint64 bn,) = registry.attestations(bytes32(0));
        assertEq(bn, 7);
    }

    // AC-3.1.b — a repeat attest of an already-anchored hash is an idempotent no-op
    // success: the original record is NOT overwritten (even by a later block and a
    // different submitter), the call does NOT revert, and NO second Attested fires.
    function test_attest_duplicate_isIdempotentNoOp() public {
        bytes32 reportHash = keccak256("report-2");
        uint64 bn1 = 100;
        uint64 ts1 = 1_700_000_000;
        vm.roll(bn1);
        vm.warp(ts1);
        vm.prank(ALICE);
        registry.attest(reportHash);

        // Advance to a later block/time and switch submitter for the repeat.
        vm.roll(200);
        vm.warp(1_800_000_000);

        // Assert the repeat emits NO event (a no-op is not a new anchoring).
        vm.recordLogs();
        vm.prank(BOB);
        registry.attest(reportHash); // must not revert
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 0, "no-op must not emit");

        // Record is unchanged — the original (bn1, ts1) stands, not BOB's later values.
        (uint64 storedBn, uint64 storedTs) = registry.attestations(reportHash);
        assertEq(storedBn, bn1, "blockNumber immutable");
        assertEq(storedTs, ts1, "timestamp immutable");
    }

    // AC-3.1.c — access is permissionless: an arbitrary caller (here BOB, not the
    // deployer) can anchor a fresh hash with no owner/authz gate in the way.
    function test_attest_isPermissionless() public {
        bytes32 reportHash = keccak256("report-3");
        vm.roll(5);
        vm.warp(1_700_000_000);
        vm.prank(BOB);
        registry.attest(reportHash);
        assertTrue(registry.isAttested(reportHash));
    }

    // Guards the sentinel's FALSE branch: a never-attested hash reads empty
    // everywhere. Without this, a regression that made `isAttested` always-true
    // (or misread the empty slot) would pass every other test — they all read
    // AFTER a write. [AI-Review]
    function test_reads_unanchoredHash_areEmpty() public view {
        bytes32 unknown = keccak256("never-attested");
        assertFalse(registry.isAttested(unknown), "isAttested must be false");
        (uint64 bn, uint64 ts) = registry.attestations(unknown);
        assertEq(bn, 0, "blockNumber must be 0");
        assertEq(ts, 0, "timestamp must be 0");
        (uint64 viewBn, uint64 viewTs) = registry.getAttestation(unknown);
        assertEq(viewBn, 0, "getAttestation.blockNumber must be 0");
        assertEq(viewTs, 0, "getAttestation.timestamp must be 0");
    }

    // AC-3.1.b for the bytes32(0) key specifically: the idempotent no-op holds
    // for the zero key exactly as for any other, since the sentinel is keyed on
    // the record's blockNumber, independent of the key's value. [AI-Review]
    function test_attest_zeroHash_duplicateIsNoOp() public {
        vm.roll(7);
        vm.warp(1_700_000_000);
        vm.prank(ALICE);
        registry.attest(bytes32(0));

        vm.roll(99);
        vm.warp(1_900_000_000);
        vm.recordLogs();
        vm.prank(BOB);
        registry.attest(bytes32(0)); // must not revert
        assertEq(vm.getRecordedLogs().length, 0, "no-op must not emit");

        (uint64 bn, uint64 ts) = registry.attestations(bytes32(0));
        assertEq(bn, 7, "blockNumber immutable");
        assertEq(ts, 1_700_000_000, "timestamp immutable");
    }

    // The deploy script's chain guard reverts before any broadcast when the
    // resolved chain isn't a rung of the ladder — a wrong --rpc-url can't mint a
    // bogus "canonical" anchor on the wrong network. [AI-Review]
    function test_deployScript_revertsOnUnexpectedChain() public {
        DeployAttestationRegistry deployer = new DeployAttestationRegistry();
        vm.chainId(1); // Ethereum mainnet — not Base/Base Sepolia/Anvil
        vm.expectRevert(
            abi.encodeWithSelector(DeployAttestationRegistry.UnexpectedChain.selector, uint256(1))
        );
        deployer.run();
    }

    // TEST-7: prove the OTHER side of the allow-list — run() succeeds on each rung
    // of the ladder (Base mainnet, Base Sepolia, local Anvil) and returns a live
    // registry. Without this, an inverted guard (reverting on the allowed chains)
    // would pass the suite; this gates a real-money broadcast.
    function test_deployScript_succeedsOnEveryAllowedChain() public {
        uint256[3] memory chains = [uint256(8453), uint256(84_532), uint256(31_337)];
        for (uint256 i = 0; i < chains.length; i++) {
            DeployAttestationRegistry deployer = new DeployAttestationRegistry();
            vm.chainId(chains[i]);
            AttestationRegistry deployed = deployer.run();
            assertTrue(address(deployed) != address(0), "run() must return a live registry");
            // The freshly deployed registry is functional: an unknown hash reads empty.
            assertFalse(deployed.isAttested(bytes32(uint256(1))), "fresh registry must be empty");
        }
    }

    // AC-3.2.a — first-write-wins holds for arbitrary reportHash (including
    // bytes32(0)) under arbitrary blocks/timestamps/submitters; a repeat at a
    // strictly-later (block, time) by a different submitter is an idempotent no-op.
    function testFuzz_firstWriteWins(
        bytes32 reportHash,
        uint64 bn1,
        uint64 bn2,
        uint64 t1,
        uint64 t2,
        address a,
        address b
    ) public {
        // bn1 >= 1 so the blockNumber existence sentinel is never falsely tripped
        // (a fuzzed vm.roll(0) must be excluded); bn2 strictly later than bn1.
        bn1 = uint64(bound(bn1, 1, uint256(type(uint64).max) - 1));
        bn2 = uint64(bound(bn2, uint256(bn1) + 1, type(uint64).max));
        // t1 spans the full uint64 range INCLUDING 0 — the vm.warp(0) case the
        // blockNumber sentinel must survive (a timestamp sentinel would misread it as
        // unanchored). t2 is strictly later, so an accidental overwrite to (bn2, t2)
        // would be caught by the equality asserts below.
        t1 = uint64(bound(t1, 0, uint256(type(uint64).max) - 1));
        t2 = uint64(bound(t2, uint256(t1) + 1, type(uint64).max));

        // First attest at (bn1, t1) by submitter a.
        vm.roll(bn1);
        vm.warp(t1);
        vm.prank(a);
        registry.attest(reportHash);

        (uint64 bnAfter1, uint64 tsAfter1) = registry.attestations(reportHash);
        assertEq(bnAfter1, bn1, "first write blockNumber");
        assertEq(tsAfter1, t1, "first write timestamp");
        assertTrue(registry.isAttested(reportHash), "anchored after first write");

        // Repeat at a strictly-later (bn2, t2) by a DIFFERENT submitter b — no-op.
        vm.roll(bn2);
        vm.warp(t2);
        vm.prank(b);
        registry.attest(reportHash); // idempotent no-op success — must not revert

        // The original record stands: (bn1, t1), never the front-runner's (bn2, t2).
        (uint64 bnAfter2, uint64 tsAfter2) = registry.attestations(reportHash);
        assertEq(bnAfter2, bn1, "first-write-wins blockNumber");
        assertEq(tsAfter2, t1, "first-write-wins timestamp");
    }
}
