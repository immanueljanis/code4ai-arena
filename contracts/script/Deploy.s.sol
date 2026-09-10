// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AccessControlVault.sol";
import "../src/RoundingVault.sol";
import "../src/TimeWindowVault.sol";
import "../src/Arena.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdc = vm.envAddress("HEDERA_USDC_TESTNET_ADDRESS");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");

        vm.startBroadcast(deployerKey);

        AccessControlVault accessTarget = new AccessControlVault();
        RoundingVault roundingTarget = new RoundingVault();
        TimeWindowVault timeTarget = new TimeWindowVault(vm.addr(deployerKey));
        Arena arena = new Arena(usdc, verifier);
        arena.associateUsdc();

        vm.stopBroadcast();

        console.log("AccessControlVault:", address(accessTarget));
        console.log("RoundingVault:", address(roundingTarget));
        console.log("TimeWindowVault:", address(timeTarget));
        console.log("Arena:", address(arena));
        console.log("Arena USDC association: complete");
    }
}
