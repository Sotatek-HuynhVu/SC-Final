// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEvent {
    event UserBanned(address user);
    event UserUnbanned(address user);
    event TaxChanged(uint256 newSellTax, uint256 newBuyTax);

    event ItemListed(
        address seller,
        address nftAddress,
        uint256 tokenId,
        uint256 erc1155Quantity,
        uint256 price,
        address paymentToken
    );
    event ItemCanceled(uint256 listingId);
    event ItemBought(uint256 listingId, address buyer);

    event AuctionCreated(
        address creator,
        address nftAddress,
        uint256 tokenId,
        uint256 erc1155Quantity,
        uint256 floorPrice,
        uint256 bidIncrement,
        uint256 startTime,
        uint256 endTime
    );
    event AuctionCanceled(uint256 auctionId);
    event NewBidPlaced(uint256 auctionId, address bidder, uint256 price);
    event AuctionEnded(uint256 auctionId, address winner, uint256 price);

    event ETHReceived(address sender, uint256 value);
}
