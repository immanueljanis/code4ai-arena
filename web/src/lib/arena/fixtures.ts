/* Seed data for the arena. Used by MockArenaClient until the server is
   reachable; HttpArenaClient replaces this — the UI is untouched. */

import type { ContestDetail, StateResponse, Submission } from './types'

const ACCESS_CONTROL_SOURCE = `// SPDX-License-Identifier: MIT
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

    /// VULNERABLE: missing \`require(msg.sender == owner)\`.
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
}`

const ROUNDING_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deliberately vulnerable target — arithmetic/rounding bug class.
/// Share-based vault. donate() inflates share price without minting shares,
/// enabling a first-depositor share-price-manipulation attack.
/// Invariant: totalWithdrawn must never exceed totalDeposited.
contract RoundingVault {
    uint256 public constant FEE_BPS = 50; // 0.5%
    uint256 public constant FEE_DENOM = 10_000;
    uint256 public constant DEPOSIT_AMOUNT = 1_000;

    mapping(address => uint256) public shares;
    uint256 public totalShares;
    uint256 public totalAssets;
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    function deposit() external {
        uint256 amount = DEPOSIT_AMOUNT;
        uint256 mint = totalShares == 0 ? amount : (amount * totalShares) / totalAssets;
        shares[msg.sender] += mint;
        totalShares += mint;
        totalAssets += amount;
        totalDeposited += amount;
    }

    /// Injects assets without minting shares — the attack vector.
    function donate(uint256 amount) external {
        totalAssets += amount;
    }

    function transferShares(address to, uint256 shareCount) external {
        require(shares[msg.sender] >= shareCount, "insufficient shares");
        uint256 fee = (shareCount * FEE_BPS) / FEE_DENOM;
        shares[msg.sender] -= shareCount;
        shares[to] += shareCount - fee;
        totalShares -= fee;
    }

    function withdraw(uint256 shareCount) external returns (uint256 payout) {
        require(shares[msg.sender] >= shareCount, "insufficient shares");
        payout = totalShares == 0 ? 0 : (shareCount * totalAssets) / totalShares;
        shares[msg.sender] -= shareCount;
        totalShares -= shareCount;
        totalAssets -= payout;
        totalWithdrawn += payout;
    }

    /// @notice Checked by the verifier before and after a submitted exploit.
    function invariantHolds() external view returns (bool) {
        return totalWithdrawn <= totalDeposited;
    }
}`

const TIME_WINDOW_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deliberately vulnerable target — "time-window drift" bug class,
/// the refill keys on block count under a fixed seconds-per-block assumption.
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
    /// Uses block.timestamp (real elapsed time), not block count.
    function invariantHolds() external view returns (bool) {
        uint256 realElapsed = block.timestamp - deployedAt;
        uint256 intendedRefills = (realElapsed / INTENDED_REFILL_SECONDS) + 1;
        return totalClaimed <= intendedRefills * DAILY_ALLOWANCE;
    }
}`

export const SEED_CONTESTS: ContestDetail[] = [
  {
    key: 'access-control-vault',
    objective: 'Seize ownership of the vault and drain its balance.',
    invariantCount: 1,
    stakeAmount: '1000000',
    poolRemaining: '20000000',
    source: ACCESS_CONTROL_SOURCE,
  },
  {
    key: 'rounding-vault',
    objective: 'Extract more from the share vault than was ever deposited.',
    invariantCount: 1,
    stakeAmount: '1000000',
    poolRemaining: '15000000',
    source: ROUNDING_SOURCE,
  },
  {
    key: 'time-window-vault',
    objective: 'Drain the allowance faster than the budget was sized for.',
    invariantCount: 1,
    stakeAmount: '1000000',
    poolRemaining: '10000000',
    source: TIME_WINDOW_SOURCE,
  },
]

export const SEED_STATE: StateResponse = {
  submissions: [
    {
      id: 'sub_mock_1',
      agentId: 'agent_sentinel',
      targetKey: 'access-control-vault',
      mode: 'real',
      verdict: 'VALID',
      exploitTxHash: '0x' + 'ab'.repeat(32),
      settlementTxHash: '0x' + 'cd'.repeat(32),
      reputationTxHash: '0x' + 'ef'.repeat(32),
      createdAt: new Date(Date.now() - 60_000).toISOString(),
    },
    {
      id: 'sub_mock_2',
      agentId: 'agent_slop',
      targetKey: 'rounding-vault',
      mode: 'real',
      verdict: 'INVALID',
      exploitTxHash: '0x' + '11'.repeat(32),
      settlementTxHash: '0x' + '22'.repeat(32),
      reputationTxHash: '0x' + '33'.repeat(32),
      createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    },
  ] as Submission[],
  targets: SEED_CONTESTS.map(({ source: _s, ...rest }) => rest),
}
