// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccessControlVault.sol";

contract AccessControlVaultTest is Test {
    AccessControlVault vault;
    address attacker = address(0xA11CE);

    function setUp() public {
        vault = new AccessControlVault();
    }

    function test_invariantHoldsAtSeed() public {
        assertTrue(vault.invariantHolds());
    }

    function test_exploitBreaksInvariant() public {
        vm.startPrank(attacker);
        vault.setOwner(attacker); // missing caller check — attacker seizes ownership
        vault.withdrawAll();      // now reachable — drains the vault
        vm.stopPrank();

        assertFalse(vault.invariantHolds(), "exploit should empty the vault");
    }

    function test_noopKeepsInvariantIntact() public {
        vm.prank(attacker);
        vm.expectRevert("not owner");
        vault.withdrawAll(); // did NOT seize ownership first

        assertTrue(vault.invariantHolds(), "invariant must survive a failed exploit");
    }
}
