pragma solidity ^0.8.24;

contract ReentrancyVault {
    uint256 public constant DEPOSIT_AMOUNT = 1;
    uint256 public constant INITIAL_BALANCE = 2;

    mapping(address => uint256) public credits;
    uint256 public vaultBalance = INITIAL_BALANCE;
    uint256 public accountedDeposits = INITIAL_BALANCE;
    address public receiver;
    address private activeAccount;
    bool private entered;

    function deposit() external {
        credits[msg.sender] += DEPOSIT_AMOUNT;
        vaultBalance += DEPOSIT_AMOUNT;
        accountedDeposits += DEPOSIT_AMOUNT;
    }

    function armSelfReentry() external {
        receiver = address(this);
    }

    function withdraw(uint256 amount) external {
        _withdraw(msg.sender, amount);
    }

    function _withdraw(address account, uint256 amount) internal {
        uint256 credit = credits[account];
        uint256 accounted = accountedDeposits;
        require(credit >= amount, "insufficient credit");
        require(vaultBalance >= amount, "insufficient balance");

        activeAccount = account;
        (bool success,) = receiver.call("");
        require(success, "receiver failed");

        credits[account] = credit - amount;
        vaultBalance -= amount;
        accountedDeposits = accounted - amount;
        activeAccount = address(0);
    }

    receive() external payable {
        if (msg.sender == address(this) && !entered && activeAccount != address(0)) {
            entered = true;
            _withdraw(activeAccount, DEPOSIT_AMOUNT);
        }
    }

    function invariantHolds() external view returns (bool) {
        return vaultBalance >= accountedDeposits;
    }
}
