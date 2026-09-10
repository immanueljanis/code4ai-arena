// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Arena.sol";
import "../src/interfaces/IERC20.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public transferFails;
    bool public transferFromFails;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setFailures(bool _transferFails, bool _transferFromFails) external {
        transferFails = _transferFails;
        transferFromFails = _transferFromFails;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (transferFails) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (transferFromFails) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract ArenaTest is Test {
    Arena arena;
    MockUSDC usdc;
    address admin = address(this);
    address verifier = address(0xBEEF);
    address agent = address(0xA11CE);
    bytes32 targetKey = keccak256("access-control-vault");
    bytes32 invariantId = keccak256("balance-preserved");
    bytes32 attemptId = keccak256("attempt-1");

    function setUp() public {
        usdc = new MockUSDC();
        arena = new Arena(address(usdc), verifier);

        usdc.mint(admin, 100e6);
        usdc.approve(address(arena), 100e6);
        arena.fundPool(targetKey, 20e6); // 20 USDC pool
    }

    function test_payoutPaysStakePlusBountyAndDebitsEntirePayout() public {
        vm.prank(verifier);
        assertTrue(arena.payout(targetKey, invariantId, agent, 1e6, 5e6, attemptId)); // stake=1, bounty=5

        assertEq(usdc.balanceOf(agent), 6e6, "agent should receive stake + bounty");
        (uint256 pool, ) = arena.targets(targetKey);
        assertEq(pool, 14e6, "pool should decrease by stake + bounty");
        assertEq(usdc.balanceOf(address(arena)), 14e6, "pool and token balance should agree");
    }

    function test_payoutCannotBeClaimedTwiceForSameInvariant() public {
        vm.prank(verifier);
        arena.payout(targetKey, invariantId, agent, 1e6, 5e6, attemptId);

        vm.prank(verifier);
        vm.expectRevert("already claimed");
        arena.payout(targetKey, invariantId, agent, 1e6, 5e6, keccak256("attempt-other"));
    }

    function test_payoutIsIdempotentPerAttempt() public {
        vm.prank(verifier);
        assertTrue(arena.payout(targetKey, invariantId, agent, 1e6, 5e6, attemptId));

        vm.prank(verifier);
        assertFalse(arena.payout(targetKey, keccak256("second-invariant"), agent, 1e6, 5e6, attemptId));

        (uint256 pool,) = arena.targets(targetKey);
        assertEq(pool, 14e6, "duplicate attempt must not debit the pool twice");
        assertEq(usdc.balanceOf(agent), 6e6, "duplicate attempt must not pay twice");
    }

    function test_attemptCannotBeBothSlashedAndPaid() public {
        usdc.mint(address(arena), 1e6);

        vm.prank(verifier);
        assertTrue(arena.slash(targetKey, agent, 1e6, attemptId));

        vm.prank(verifier);
        assertFalse(arena.payout(targetKey, invariantId, agent, 1e6, 5e6, attemptId));

        (uint256 pool,) = arena.targets(targetKey);
        assertEq(pool, 21e6, "settled attempt must not also pay out");
        assertEq(usdc.balanceOf(agent), 0, "settled attempt must not also pay out");
    }

    function test_payoutRejectsZeroAttemptId() public {
        vm.prank(verifier);
        vm.expectRevert("invalid attempt");
        arena.payout(targetKey, invariantId, agent, 1e6, 5e6, bytes32(0));
    }

    function test_slashWithAttemptIsIdempotent() public {
        usdc.mint(address(arena), 1e6);

        vm.prank(verifier);
        assertTrue(arena.slash(targetKey, agent, 1e6, attemptId));

        vm.prank(verifier);
        assertFalse(arena.slash(targetKey, agent, 1e6, attemptId));

        (uint256 pool,) = arena.targets(targetKey);
        assertEq(pool, 21e6, "duplicate attempt must not increase pool");
        assertTrue(arena.settledAttempts(attemptId), "attempt should be recorded");
    }

    function test_slashWithAttemptRejectsZeroAttemptId() public {
        vm.prank(verifier);
        vm.expectRevert("invalid attempt");
        arena.slash(targetKey, agent, 1e6, bytes32(0));
    }

    function test_multiplePoolsConserveTokenBalanceAcrossSlashAndPayout() public {
        bytes32 secondTarget = keccak256("rounding-vault");
        bytes32 secondInvariant = keccak256("rounding-loss");
        arena.fundPool(secondTarget, 30e6);
        usdc.mint(address(arena), 1e6);

        vm.prank(verifier);
        arena.slash(targetKey, agent, 1e6, keccak256("attempt-2"));

        vm.prank(verifier);
        arena.payout(targetKey, secondInvariant, agent, 2e6, 5e6, keccak256("attempt-3"));

        (uint256 firstPool,) = arena.targets(targetKey);
        (uint256 secondPool,) = arena.targets(secondTarget);
        assertEq(firstPool, 14e6, "first pool should include slash then full payout debit");
        assertEq(secondPool, 30e6, "second pool must remain isolated");
        assertEq(usdc.balanceOf(address(arena)), firstPool + secondPool, "token balance must equal all pools");
        assertEq(usdc.balanceOf(agent), 7e6, "payout amount should be unchanged");
    }

    function test_payoutRequiresFundsForStakeAndBounty() public {
        vm.prank(verifier);
        vm.expectRevert("pool underfunded");
        arena.payout(targetKey, invariantId, agent, 16e6, 5e6, attemptId);

        bytes32 claimKey = keccak256(abi.encodePacked(targetKey, invariantId));
        assertFalse(arena.claimed(claimKey), "failed payout must not consume claim");
    }

    function test_fundPoolRevertsWhenTokenTransferFails() public {
        bytes32 secondTarget = keccak256("failed-funding");
        usdc.setFailures(false, true);

        vm.expectRevert("transfer failed");
        arena.fundPool(secondTarget, 1e6);

        (uint256 pool, bool exists) = arena.targets(secondTarget);
        assertEq(pool, 0, "failed funding must not alter pool");
        assertFalse(exists, "failed funding must not create target");
    }

    function test_payoutRevertsWhenTokenTransferFailsWithoutClaiming() public {
        usdc.setFailures(true, false);

        vm.prank(verifier);
        vm.expectRevert("transfer failed");
        arena.payout(targetKey, invariantId, agent, 1e6, 5e6, attemptId);

        (uint256 pool,) = arena.targets(targetKey);
        bytes32 claimKey = keccak256(abi.encodePacked(targetKey, invariantId));
        assertEq(pool, 20e6, "failed payout must not debit pool");
        assertFalse(arena.claimed(claimKey), "failed payout must not consume claim");
    }

    function test_onlyVerifierCanSettle() public {
        vm.prank(agent);
        vm.expectRevert("not verifier");
        arena.payout(targetKey, invariantId, agent, 1e6, 5e6, attemptId);
    }
}
