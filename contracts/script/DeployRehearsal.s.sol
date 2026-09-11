// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AccessControlVault.sol";
import "../src/RoundingVault.sol";
import "../src/TimeWindowVault.sol";
import "../src/RehearsalToken.sol";
import "../src/Arena.sol";

/// Rehearsal deployment: a plain ERC-20 stands in for the HTS settlement token
/// so Arena accounting can be proven on testnet before the HTS token exists.
/// No HTS association is performed — the token is not an HTS token.
contract DeployRehearsal is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        address existing = vm.envOr("REHEARSAL_TOKEN_ADDRESS", address(0));
        RehearsalToken token = existing == address(0)
            ? new RehearsalToken()
            : RehearsalToken(existing);
        AccessControlVault accessTarget = new AccessControlVault();
        RoundingVault roundingTarget = new RoundingVault();
        TimeWindowVault timeTarget = new TimeWindowVault(deployer);
        Arena arena = new Arena(address(token), verifier);

        token.mint(deployer, 1_000_000e6);
        token.approve(address(arena), 1_000_000e6);
        arena.fundPool(keccak256("access-control-vault"), 20e6);
        arena.fundPool(keccak256("rounding-vault"), 30e6);
        arena.fundPool(keccak256("time-window-vault"), 25e6);

        vm.stopBroadcast();

        console.log("RehearsalToken:", address(token));
        console.log("AccessControlVault:", address(accessTarget));
        console.log("RoundingVault:", address(roundingTarget));
        console.log("TimeWindowVault:", address(timeTarget));
        console.log("Arena:", address(arena));
    }
}
