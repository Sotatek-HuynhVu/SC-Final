// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IError {
    error Unauthorized(address user);

    error InvalidSellTax(uint256 tax);
    error InvalidBuyTax(uint256 tax);

    error InvalidPrice(uint256 price);
    error InvalidBidIncrement(uint256 bidIncrement);
    error AuctionNotExists(uint256 auctionId);
    error NotAuctionCreator(uint256 auctionId);
    error AuctionNotEnded(uint256 auctionId);
    error AuctionAlreadyEnded(uint256 auctionId);

    error SellerOnly(address sender);
    error SaleNotExists(uint256 saleId);
    error ItemAlreadySold(uint256 saleId);
    error PriceNotMet(address nftAddress, uint256 tokenId, uint256 price);
    error SaleNotEnded(uint256 saleId);

    error InvalidQuantity(uint256 quantity);
}
