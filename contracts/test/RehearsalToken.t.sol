// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/RehearsalToken.sol";

contract RehearsalTokenTest is Test {
    RehearsalToken token;
    address holder = address(0xA11CE);
    address spender = address(0xB0B);

    function setUp() public {
        token = new RehearsalToken();
        token.mint(holder, 100e6);
    }

    function test_isLabelledAsATestTokenNotUsdc() public view {
        assertEq(token.decimals(), 6);
        assertEq(token.symbol(), "RHRSL");
        assertEq(token.name(), "code4ai Rehearsal Test Token");
    }

    function test_onlyMinterCanMint() public {
        vm.prank(holder);
        vm.expectRevert("not minter");
        token.mint(holder, 1e6);
    }

    function test_transferMovesBalanceAndConservesSupply() public {
        vm.prank(holder);
        assertTrue(token.transfer(spender, 40e6));
        assertEq(token.balanceOf(holder), 60e6);
        assertEq(token.balanceOf(spender), 40e6);
        assertEq(token.balanceOf(holder) + token.balanceOf(spender), token.totalSupply());
    }

    function test_transferRevertsRatherThanReturningFalseWhenShort() public {
        vm.prank(holder);
        vm.expectRevert("insufficient balance");
        token.transfer(spender, 101e6);
    }

    function test_transferFromRespectsAllowance() public {
        vm.prank(holder);
        token.approve(spender, 30e6);

        vm.prank(spender);
        assertTrue(token.transferFrom(holder, spender, 30e6));
        assertEq(token.allowance(holder, spender), 0);

        vm.prank(spender);
        vm.expectRevert("insufficient allowance");
        token.transferFrom(holder, spender, 1);
    }
}
