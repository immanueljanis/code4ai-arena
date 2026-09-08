// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/TimeWindowVault.sol";

contract TimeWindowVaultTest is Test {
    TimeWindowVault vault;
    address beneficiary = address(0xA11CE);

    function setUp() public {
        vm.startPrank(beneficiary);
        vault = new TimeWindowVault(beneficiary);
        vm.stopPrank();
    }

    function test_invariantHoldsAtSeed() public {
        assertTrue(vault.invariantHolds());
    }

    /// The exploit: claim once at t=0 (fine), then advance only
    /// REFILL_BLOCKS blocks (far less real time than INTENDED_REFILL_SECONDS
    /// would require) and claim again. totalClaimed exceeds what the
    /// timestamp-based invariant thinks should be possible by now.
    function test_exploitBreaksInvariant() public {
        vm.startPrank(beneficiary);
        vault.claim(100e6); // uses initial allowance, invariant still holds

        // Advance exactly REFILL_BLOCKS blocks but only ~1s/block of real time
        // (the point is real time advances far less than INTENDED_REFILL_SECONDS).
        vm.roll(block.number + vault.REFILL_BLOCKS());
        vm.warp(block.timestamp + vault.REFILL_BLOCKS() * 1); // ~1s/block << 12s/block assumption

        vault.claim(100e6); // refillIfDue() fires on block count alone
        vm.stopPrank();

        assertFalse(vault.invariantHolds(), "block-speed mismatch must break the invariant");
    }

    function test_singleClaimKeepsInvariantIntact() public {
        vm.prank(beneficiary);
        vault.claim(100e6);

        assertTrue(vault.invariantHolds(), "a single claim within budget must hold");
    }
}
