// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deliberately vulnerable target — "time-window drift" bug class:
/// the refill keys on block count under a fixed seconds-per-block assumption,
/// so on chains whose real block time is faster the allowance refills sooner
/// in wall-clock time than the budget was sized for.
contract TimeWindowVault {
    uint256 public constant REFILL_BLOCKS = 60;
    uint256 public constant INTENDED_REFILL_SECONDS = REFILL_BLOCKS * 12; // author's model: 12s/block
    uint256 public constant DAILY_ALLOWANCE = 100e6;

    address public immutable beneficiary;
    uint256 public immutable deployedAt;
    uint256 public lastRefillBlock;
    uint256 public available;
    uint256 public totalClaimed;

    constructor(address _beneficiary) {
        beneficiary = _beneficiary;
        deployedAt = block.timestamp;
        lastRefillBlock = block.number;
        available = DAILY_ALLOWANCE;
    }

    function refillIfDue() public {
        if (block.number - lastRefillBlock >= REFILL_BLOCKS) {
            lastRefillBlock = block.number;
            available += DAILY_ALLOWANCE;
        }
    }

    function claim(uint256 amount) external {
        require(msg.sender == beneficiary, "not beneficiary");
        refillIfDue();
        require(amount <= available, "exceeds available allowance");
        available -= amount;
        totalClaimed += amount;
    }

    /// @notice Checked by the verifier before and after a submitted exploit.
    /// Uses block.timestamp (real elapsed time), not block count, to compute
    /// what should have been claimable by now.
    function invariantHolds() external view returns (bool) {
        uint256 realElapsed = block.timestamp - deployedAt;
        uint256 intendedRefills = (realElapsed / INTENDED_REFILL_SECONDS) + 1;
        return totalClaimed <= intendedRefills * DAILY_ALLOWANCE;
    }
}
