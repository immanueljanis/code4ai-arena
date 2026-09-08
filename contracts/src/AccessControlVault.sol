// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deliberately vulnerable target — access-control bug class.
/// Invariant: the seeded balance must never leave the vault.
/// Bug: setOwner() has no caller check — anyone can seize ownership, then
/// drain via withdrawAll().
contract AccessControlVault {
    uint256 public constant INITIAL_BALANCE = 1_000e6; // 1000 USDC-equivalent units

    address public owner;
    uint256 public balance;

    constructor() {
        owner = msg.sender;
        balance = INITIAL_BALANCE;
    }

    /// VULNERABLE: missing `require(msg.sender == owner)`.
    function setOwner(address newOwner) external {
        owner = newOwner;
    }

    function withdrawAll() external {
        require(msg.sender == owner, "not owner");
        balance = 0;
    }

    /// @notice Checked by the verifier before and after a submitted exploit.
    function invariantHolds() external view returns (bool) {
        return balance == INITIAL_BALANCE;
    }
}
