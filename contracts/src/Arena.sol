// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";

/// @notice Holds per-target USDC bounty pools and settles findings.
/// Only `verifier` (the code4ai server's operator address) may call
/// slash/payout. Implements R2 (settle-once) and R3 (per-invariant pools).
contract Arena {
    IERC20 public immutable usdc;
    address public verifier;
    address public admin;

    struct Target {
        uint256 pool;
        bool exists;
    }

    mapping(bytes32 => Target) public targets;
    mapping(bytes32 => bool) public claimed; // keccak(targetKey, invariantId) => claimed

    event PoolFunded(bytes32 targetKey, uint256 amount);
    event Slashed(bytes32 targetKey, address agent, uint256 stakeAmount);
    event Paid(bytes32 targetKey, bytes32 invariantId, address agent, uint256 stakeAmount, uint256 bountyAmount);

    modifier onlyVerifier() {
        require(msg.sender == verifier, "not verifier");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    constructor(address _usdc, address _verifier) {
        usdc = IERC20(_usdc);
        verifier = _verifier;
        admin = msg.sender;
    }

    /// Admin funds a target's pool. Caller must have approved this contract
    /// for `amount` USDC beforehand.
    function fundPool(bytes32 targetKey, uint256 amount) external onlyAdmin {
        targets[targetKey].exists = true;
        targets[targetKey].pool += amount;
        usdc.transferFrom(msg.sender, address(this), amount);
        emit PoolFunded(targetKey, amount);
    }

    /// INVALID verdict: the stake (already moved into this contract by the
    /// x402 settlement leg, executed by the server before calling this) is
    /// folded into the pool.
    function slash(bytes32 targetKey, address agent, uint256 stakeAmount) external onlyVerifier {
        targets[targetKey].pool += stakeAmount;
        emit Slashed(targetKey, agent, stakeAmount);
    }

    /// VALID verdict: pays stake + bounty to the agent. `invariantId` dedups
    /// so the same invariant on the same target cannot be paid twice.
    function payout(
        bytes32 targetKey,
        bytes32 invariantId,
        address agent,
        uint256 stakeAmount,
        uint256 bountyAmount
    ) external onlyVerifier {
        bytes32 claimKey = keccak256(abi.encodePacked(targetKey, invariantId));
        require(!claimed[claimKey], "already claimed");
        claimed[claimKey] = true;

        require(targets[targetKey].pool >= bountyAmount, "pool underfunded");
        targets[targetKey].pool -= bountyAmount;

        usdc.transfer(agent, stakeAmount + bountyAmount);
        emit Paid(targetKey, invariantId, agent, stakeAmount, bountyAmount);
    }
}
