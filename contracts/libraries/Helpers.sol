// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

library Helpers {
    address constant ETH_ADDRESS = address(0);
    bytes4 constant ID_ERC721 = 0x80ac58cd;
    bytes4 constant ID_ERC1155 = 0xd9b67a26;

    function isERC721(address nft) internal view returns (bool) {
        return IERC165(nft).supportsInterface(ID_ERC721);
    }

    function isERC1155(address nft) internal view returns (bool) {
        return IERC165(nft).supportsInterface(ID_ERC1155);
    }

    function isETH(address token) internal pure returns (bool) {
        return token == ETH_ADDRESS;
    }
}
