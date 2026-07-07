// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @title MockStakedVault — a TEST-ONLY ERC-4626-shaped rate surface
/// @author tieout (Batch 2, Story 2.1)
///
/// ██  TEST-ONLY — MUST NOT BE DEPLOYED TO HOLD VALUE  ██
///
/// @notice A deliberately minimal, controllable ERC-4626-shaped vault used only
/// to give the AD-6 rate cross-check and the injected-discrepancy harness a
/// deterministic, reproducible test surface. It exposes the **bare-floor**
/// exchange rate
///
///     convertToAssets(shares) = totalAssets * shares / totalSupply
///
/// with **no** OpenZeppelin virtual-shares / decimals offset (AD-15). Omitting
/// the offset is only safe because this contract never custodies real value:
/// the offset exists in production ERC-4626s to blunt inflation/donation share
/// attacks, and dropping it here is what lets the AD-6 exact-equality
/// cross-check (`convertToAssets(1e18)` vs the event-derived rate) hold to the
/// wei. Deploying this to hold value would reintroduce that attack.
///
/// It intentionally omits the ERC-20 transfer/allowance and the
/// withdraw/redeem/mint machinery a real vault needs — the rate cross-check only
/// reads the exchange rate and share/asset totals. Balances move only through
/// the explicit test helpers below.
///
/// [Source: docs/ARCHITECTURE-SPINE.md#AD-15]
contract MockStakedVault {
    /// @notice The (nominal) underlying asset. TEST-ONLY: never actually held.
    address public immutable asset;

    /// @notice Total assets managed by the vault (grows via {accrueRewards}).
    uint256 public totalAssets;

    /// @notice Total shares outstanding (ERC-20 `totalSupply` of the share token).
    uint256 public totalSupply;

    /// @notice Share balances.
    mapping(address => uint256) public balanceOf;

    /// @notice ERC-20 share-token cosmetics.
    string public constant name = "Mock Staked Vault (TEST-ONLY)";
    string public constant symbol = "mstVAULT";
    uint8 public constant decimals = 18;

    /// @notice Emitted by {deposit} (ERC-4626 semantics).
    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);

    /// @notice The explicit rate-accrual event (AC-2.1.a): emitted whenever
    /// {accrueRewards} grows totalAssets, carrying the post-accrual bare-floor rate.
    event RewardAccrued(uint256 addedAssets, uint256 newTotalAssets, uint256 newRate1e18);

    /// @notice Thrown when rewards are accrued before any shares exist.
    error NoShares();

    constructor(address asset_) {
        asset = asset_;
    }

    /// @notice ERC-4626 `convertToShares`. First deposit (no shares yet) mints 1:1.
    function convertToShares(uint256 assets) public view returns (uint256) {
        if (totalSupply == 0) return assets;
        if (totalAssets == 0) return 0;
        return (assets * totalSupply) / totalAssets;
    }

    /// @notice ERC-4626 `convertToAssets`, bare floor, no virtual offset (AD-15).
    /// The pre-first-deposit state (totalSupply == 0) returns 0 deterministically
    /// rather than dividing by zero (AC-2.1.b). One truncating division.
    function convertToAssets(uint256 shares) public view returns (uint256) {
        if (totalSupply == 0) return 0;
        return (totalAssets * shares) / totalSupply;
    }

    /// @notice Deterministic test helper: deposit `assets`, minting shares to
    /// `receiver` at the current (pre-deposit) rate. First deposit mints 1:1.
    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        shares = convertToShares(assets);
        totalAssets += assets;
        totalSupply += shares;
        balanceOf[receiver] += shares;
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /// @notice Deterministic test helper: grow totalAssets by `addedAssets`
    /// (a reward/rebase), raising the exchange rate and emitting the explicit
    /// rate-accrual event. Reverts if no shares exist to accrue to.
    function accrueRewards(uint256 addedAssets) external {
        if (totalSupply == 0) revert NoShares();
        totalAssets += addedAssets;
        uint256 newRate1e18 = (totalAssets * 1e18) / totalSupply;
        emit RewardAccrued(addedAssets, totalAssets, newRate1e18);
    }
}
