// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import {Test} from "forge-std/Test.sol";
import {MockStakedVault} from "../src/MockStakedVault.sol";

/// @notice Fuzz + unit tests for the TEST-ONLY MockStakedVault (Story 2.1).
/// Runs under the pinned `[fuzz] seed = 0x7469656f7574` in foundry.toml — do not
/// change the seed (random-per-run fuzzing is at odds with NFR-0 determinism).
contract MockStakedVaultTest is Test {
    MockStakedVault internal vault;

    address internal constant ASSET = address(0xA55E7);
    address internal constant HOLDER = address(0xB0B);

    // Mirror of the contract event, for vm.expectEmit matching.
    event RewardAccrued(uint256 addedAssets, uint256 newTotalAssets, uint256 newRate1e18);

    function setUp() public {
        vault = new MockStakedVault(ASSET);
    }

    // AC-2.1.b — the pre-first-deposit state totalSupply == 0 is handled
    // deterministically: convertToAssets returns 0, never divides by zero.
    function test_convertToAssets_zeroSupply_returnsZeroNeverReverts() public view {
        assertEq(vault.totalSupply(), 0);
        assertEq(vault.convertToAssets(1e18), 0);
    }

    // AC-2.1.a — convertToAssets(1e18) == totalAssets*1e18/totalSupply (bare floor).
    function test_convertToAssets_bareFloor_afterDepositAndReward() public {
        vault.deposit(100e18, HOLDER); // first deposit mints shares 1:1
        vault.accrueRewards(50e18); // totalAssets 100e18 -> 150e18
        uint256 expected = (vault.totalAssets() * 1e18) / vault.totalSupply();
        assertEq(vault.convertToAssets(1e18), expected);
        assertEq(expected, 1.5e18); // 150e18 * 1e18 / 100e18
    }

    // AC-2.1.a/b — the teeth against an OZ-style virtual offset. At large
    // magnitudes a +1 offset truncates away; at these small values it does not.
    // Bare floor: 2*1/1 = 2. A (totalAssets+1)*shares/(totalSupply+1) offset
    // would give 3*1/2 = 1. This asserts the offset is absent (AD-15).
    function test_convertToAssets_smallValues_noVirtualOffset() public {
        vault.deposit(1, HOLDER); // totalAssets=1, totalSupply=1
        vault.accrueRewards(1); // totalAssets=2, totalSupply=1
        assertEq(vault.convertToAssets(1), 2);
    }

    // convertToShares — first deposit (no shares yet) mints 1:1.
    function test_convertToShares_firstDepositMints1to1() public view {
        assertEq(vault.totalSupply(), 0);
        assertEq(vault.convertToShares(7e18), 7e18);
    }

    // convertToShares — proportional at the current rate once shares exist.
    function test_convertToShares_proportionalAfterReward() public {
        vault.deposit(100e18, HOLDER); // totalAssets=100e18, totalSupply=100e18
        vault.accrueRewards(50e18); // totalAssets=150e18
        // 30e18 * 100e18 / 150e18 = 20e18
        assertEq(vault.convertToShares(30e18), 20e18);
    }

    // convertToShares — the defensive totalAssets == 0 (with shares outstanding)
    // branch returns 0 rather than dividing by zero. This state is UNREACHABLE
    // through the public API (there is no burn/withdraw, and deposit couples the
    // two totals), so it is forced via vm.store to cover the guard directly —
    // symmetric with convertToAssets's totalSupply == 0 guard. totalAssets is
    // storage slot 0 (asset is immutable, so it occupies no slot).
    function test_convertToShares_zeroAssetsWithSupply_returnsZero() public {
        vault.deposit(100e18, HOLDER); // totalSupply=100e18, totalAssets=100e18
        vm.store(address(vault), bytes32(uint256(0)), bytes32(uint256(0))); // totalAssets := 0
        assertEq(vault.totalAssets(), 0); // confirms the poked slot
        assertEq(vault.totalSupply(), 100e18); // shares untouched
        assertEq(vault.convertToShares(50e18), 0); // guard fires, no div-by-zero
    }

    // AC-2.1.a — the reward helper emits an explicit rate-accrual event.
    function test_accrueRewards_emitsExplicitRateEvent() public {
        vault.deposit(100e18, HOLDER);
        uint256 newRate = (150e18 * 1e18) / 100e18;
        vm.expectEmit(false, false, false, true, address(vault));
        emit RewardAccrued(50e18, 150e18, newRate);
        vault.accrueRewards(50e18);
    }

    // AC-2.1.a — accruing before any shares exist has nothing to grow: the guard
    // reverts NoShares rather than dividing by zero or silently accruing at a 0
    // rate in the deterministic harness. Pinning the specific NoShares selector
    // (not a generic panic) is what makes this catch a dropped guard.
    function test_accrueRewards_beforeAnyDeposit_revertsNoShares() public {
        assertEq(vault.totalSupply(), 0);
        vm.expectRevert(MockStakedVault.NoShares.selector);
        vault.accrueRewards(50e18);
    }

    // AC-2.4.a — the AD-6 dual-derivation identity ON THE MOCK: the event-derived
    // rate (what RewardAccrued carries: totalAssets*1e18/totalSupply) must EXACTLY
    // equal the archive read convertToAssets(1e18). This is the mock (Story 2.1)
    // deterministic side of the rate cross-check — exact equality, never a
    // tolerance (mirrors the TS `crossCheckRate` guard against real wstETH). [Review L7]
    function testFuzz_ad6_eventRate_equals_convertToAssetsRead(
        uint256 depositAssets,
        uint256 reward
    ) public {
        depositAssets = bound(depositAssets, 1, 1e33);
        reward = bound(reward, 0, 1e33);
        vault.deposit(depositAssets, HOLDER);
        if (reward > 0) vault.accrueRewards(reward);
        uint256 eventDerivedRate = (vault.totalAssets() * 1e18) / vault.totalSupply();
        assertEq(eventDerivedRate, vault.convertToAssets(1e18));
    }

    // AC-2.1.b — property: convertToAssets equals the bare floor for ALL fuzzed
    // states, with no rounding drift from a virtual offset. `bound` keeps
    // totalSupply > 0 on this equality property; the == 0 branch is covered above.
    function testFuzz_convertToAssets_equalsBareFloor(
        uint256 depositAssets,
        uint256 reward1,
        uint256 reward2,
        uint256 shares
    ) public {
        depositAssets = bound(depositAssets, 1, 1e33);
        reward1 = bound(reward1, 0, 1e33);
        reward2 = bound(reward2, 0, 1e33);
        shares = bound(shares, 0, 1e33);

        vault.deposit(depositAssets, HOLDER);
        if (reward1 > 0) vault.accrueRewards(reward1);
        if (reward2 > 0) vault.accrueRewards(reward2);

        assertGt(vault.totalSupply(), 0);
        uint256 bareFloor = (vault.totalAssets() * shares) / vault.totalSupply();
        assertEq(vault.convertToAssets(shares), bareFloor);
    }
}
