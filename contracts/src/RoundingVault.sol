// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deliberately vulnerable target — arithmetic/rounding bug class.
/// Share-based vault. `donate()` inflates share price without minting
/// shares, enabling a first-depositor share-price-manipulation attack that
/// lets an attacker withdraw more than was ever deposited.
/// Invariant: totalWithdrawn must never exceed totalDeposited.
contract RoundingVault {
    uint256 public constant FEE_BPS = 50; // 0.5%
    uint256 public constant FEE_DENOM = 10_000;
    uint256 public constant DEPOSIT_AMOUNT = 1_000;

    mapping(address => uint256) public shares;
    uint256 public totalShares;
    uint256 public totalAssets;
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    function deposit() external {
        uint256 amount = DEPOSIT_AMOUNT;
        uint256 mint = totalShares == 0 ? amount : (amount * totalShares) / totalAssets;

        shares[msg.sender] += mint;
        totalShares += mint;
        totalAssets += amount;
        totalDeposited += amount;
    }

    /// Injects assets without minting shares — the attack vector: inflates
    /// share price for existing holders at the next depositor's expense.
    function donate(uint256 amount) external {
        totalAssets += amount;
    }

    function transferShares(address to, uint256 shareCount) external {
        require(shares[msg.sender] >= shareCount, "insufficient shares");
        uint256 fee = (shareCount * FEE_BPS) / FEE_DENOM;
        uint256 net = shareCount - fee;

        shares[msg.sender] -= shareCount;
        shares[to] += net;
        totalShares -= fee;
    }

    function withdraw(uint256 shareCount) external returns (uint256 payout) {
        require(shares[msg.sender] >= shareCount, "insufficient shares");
        payout = totalShares == 0 ? 0 : (shareCount * totalAssets) / totalShares;

        shares[msg.sender] -= shareCount;
        totalShares -= shareCount;
        totalAssets -= payout;
        totalWithdrawn += payout;
    }

    /// @notice Checked by the verifier before and after a submitted exploit.
    function invariantHolds() external view returns (bool) {
        return totalWithdrawn <= totalDeposited;
    }
}
