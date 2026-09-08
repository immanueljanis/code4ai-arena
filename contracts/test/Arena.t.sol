// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Arena.sol";
import "../src/interfaces/IERC20.sol";

contract MockUSDC is IERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
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

    function setUp() public {
        usdc = new MockUSDC();
        arena = new Arena(address(usdc), verifier);

        usdc.mint(admin, 100e6);
        usdc.approve(address(arena), 100e6);
        arena.fundPool(targetKey, 20e6); // 20 USDC pool
    }

    function test_payoutPaysStakePlusBountyAndDrainsOnlyBounty() public {
        vm.prank(verifier);
        arena.payout(targetKey, invariantId, agent, 1e6, 5e6); // stake=1, bounty=5

        assertEq(usdc.balanceOf(agent), 6e6, "agent should receive stake + bounty");
        (uint256 pool, ) = arena.targets(targetKey);
        assertEq(pool, 15e6, "pool should decrease by bounty only");
    }

    function test_payoutCannotBeClaimedTwiceForSameInvariant() public {
        vm.prank(verifier);
        arena.payout(targetKey, invariantId, agent, 1e6, 5e6);

        vm.prank(verifier);
        vm.expectRevert("already claimed");
        arena.payout(targetKey, invariantId, agent, 1e6, 5e6);
    }

    function test_slashAddsStakeToPool() public {
        usdc.mint(address(arena), 1e6); // simulate x402 having already moved the stake in

        vm.prank(verifier);
        arena.slash(targetKey, agent, 1e6);

        (uint256 pool, ) = arena.targets(targetKey);
        assertEq(pool, 21e6, "pool should grow by the slashed stake");
    }

    function test_onlyVerifierCanSettle() public {
        vm.prank(agent);
        vm.expectRevert("not verifier");
        arena.payout(targetKey, invariantId, agent, 1e6, 5e6);
    }
}
