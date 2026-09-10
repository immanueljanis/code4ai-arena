// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC20.sol";
import "./interfaces/IHederaTokenService.sol";

/// @notice Holds per-target USDC bounty pools and settles findings.
/// Only `verifier` (the code4ai server's operator address) may call
/// slash/payout. Implements R2 (settle-once) and R3 (per-invariant pools).
contract Arena {
    address private constant HTS_PRECOMPILE = address(0x167);
    int64 private constant HTS_SUCCESS = 22;
    int64 private constant HTS_ALREADY_ASSOCIATED = 194;

    IERC20 public immutable usdc;
    address public verifier;
    address public admin;

    struct Target {
        uint256 pool;
        bool exists;
    }

    mapping(bytes32 => Target) public targets;
    mapping(bytes32 => bool) public claimed; // keccak(targetKey, invariantId) => claimed
    mapping(bytes32 => bool) public settledAttempts;

    event PoolFunded(bytes32 targetKey, uint256 amount);
    event Slashed(bytes32 targetKey, address agent, uint256 stakeAmount, bytes32 attemptId);
    event Paid(
        bytes32 targetKey,
        bytes32 invariantId,
        address agent,
        uint256 stakeAmount,
        uint256 bountyAmount,
        bytes32 attemptId
    );
    event UsdcAssociated(int64 responseCode);

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

    function associateUsdc() external onlyAdmin returns (int64 responseCode) {
        responseCode = IHederaTokenService(HTS_PRECOMPILE).associateToken(address(this), address(usdc));
        require(
            responseCode == HTS_SUCCESS || responseCode == HTS_ALREADY_ASSOCIATED,
            "HTS association failed"
        );
        emit UsdcAssociated(responseCode);
    }

    /// Admin funds a target's pool. Caller must have approved this contract
    /// for `amount` USDC beforehand.
    function fundPool(bytes32 targetKey, uint256 amount) external onlyAdmin {
        require(usdc.transferFrom(msg.sender, address(this), amount), "transfer failed");
        targets[targetKey].exists = true;
        targets[targetKey].pool += amount;
        emit PoolFunded(targetKey, amount);
    }

    /// INVALID verdict: the stake (already moved into this contract by the
    /// x402 settlement leg, executed by the server before calling this) is
    /// folded into the pool.
    function slash(bytes32 targetKey, address agent, uint256 stakeAmount, bytes32 attemptId)
        external
        onlyVerifier
        returns (bool)
    {
        require(attemptId != bytes32(0), "invalid attempt");
        if (settledAttempts[attemptId]) {
            return false;
        }

        settledAttempts[attemptId] = true;
        targets[targetKey].pool += stakeAmount;
        emit Slashed(targetKey, agent, stakeAmount, attemptId);
        return true;
    }

    /// VALID verdict: pays stake + bounty to the agent. `invariantId` dedups
    /// so the same invariant on the same target cannot be paid twice.
    function payout(
        bytes32 targetKey,
        bytes32 invariantId,
        address agent,
        uint256 stakeAmount,
        uint256 bountyAmount,
        bytes32 attemptId
    ) external onlyVerifier returns (bool) {
        require(attemptId != bytes32(0), "invalid attempt");
        if (settledAttempts[attemptId]) {
            return false;
        }

        bytes32 claimKey = keccak256(abi.encodePacked(targetKey, invariantId));
        require(!claimed[claimKey], "already claimed");
        claimed[claimKey] = true;
        settledAttempts[attemptId] = true;

        uint256 paymentAmount = stakeAmount + bountyAmount;
        require(targets[targetKey].pool >= paymentAmount, "pool underfunded");
        targets[targetKey].pool -= paymentAmount;

        require(usdc.transfer(agent, paymentAmount), "transfer failed");
        emit Paid(targetKey, invariantId, agent, stakeAmount, bountyAmount, attemptId);
        return true;
    }
}
