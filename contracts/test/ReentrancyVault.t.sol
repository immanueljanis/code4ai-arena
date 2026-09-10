pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ReentrancyVault.sol";

contract ReentrancyVaultTest is Test {
    ReentrancyVault vault;
    address attacker = address(0xA11CE);

    function setUp() public {
        vault = new ReentrancyVault();
    }

    function test_invariantHoldsAtSeed() public view {
        assertTrue(vault.invariantHolds());
    }

    function test_reentryBreaksInvariant() public {
        vm.startPrank(attacker);
        vault.deposit();
        vault.armSelfReentry();
        vault.withdraw(1);
        vm.stopPrank();

        assertFalse(vault.invariantHolds());
        assertEq(vault.vaultBalance(), 1);
        assertEq(vault.accountedDeposits(), 2);
    }

    function test_directWithdrawalKeepsInvariant() public {
        vm.startPrank(attacker);
        vault.deposit();
        vault.withdraw(1);
        vm.stopPrank();

        assertTrue(vault.invariantHolds());
    }
}
