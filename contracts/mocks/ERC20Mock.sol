// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    constructor(uint256 _balance) ERC20("MyToken", "MT") {
        _mint(msg.sender, _balance);
    }
}
