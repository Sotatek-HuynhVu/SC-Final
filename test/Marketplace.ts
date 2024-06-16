import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { describe } from "mocha";

import {
  AUCTION_BID_INCREMENT,
  AUCTION_DURATION,
  AUCTION_FLOOR_PRICE,
  ERC721_AUCTION_TOKEN_ID,
  ERC721_TOKEN_ID,
  ERC721_TOKEN_URI,
  ERC1155_QUANTITY,
  ERC1155_TOKEN_ID,
  deployMarketFixture,
  getActualAmountUserHasToPay,
  getSellerProceeds,
} from "./Setup";

const BUY_PRICE = BigInt(3e18);
const TIME_LEFT_TO_START_AUCTION = 60 * 60;
const VALID_BID_PRICE = BigInt(3e18);

const INITIAL_SELL_TAX = BigInt(25);
const INITIAL_BUY_TAX = BigInt(25);
const TAX_BASE = BigInt(1e4);

const ACTUAL_AMOUNT_USER_HAS_TO_PAY = getActualAmountUserHasToPay(
  BUY_PRICE,
  INITIAL_BUY_TAX,
  TAX_BASE
);
const SELLER_PROCEEDS = getSellerProceeds(
  BUY_PRICE,
  INITIAL_SELL_TAX,
  TAX_BASE
);

describe("Market", function () {
  before(async function () {
    this.loadFixture = loadFixture;
  });

  describe("Deployment", function () {
    beforeEach(async function () {
      const { market, treasury, owner, erc721Token } =
        await this.loadFixture(deployMarketFixture);
      this.market = market;
      this.treasury = treasury;
      this.owner = owner;
      this.erc721Token = erc721Token;
    });

    it("Should deploy the right owner", async function () {
      expect(await this.market.owner()).to.equal(this.owner.address);
    });

    it("Should deploy the right treasury", async function () {
      expect(await this.market.treasury()).to.equal(this.treasury.address);
    });

    it("Should deploy the right tax fee value", async function () {
      expect(await this.market.buyTax()).to.equal(25);
      expect(await this.market.sellTax()).to.equal(25);
    });

    it("Mock ERC721 token should be deployed", async function () {
      // check tokenURI function works
      expect(await this.erc721Token.tokenURI(ERC721_TOKEN_ID)).to.equal(
        ERC721_TOKEN_URI
      );
    });
  });

  describe("Functions", async function () {
    beforeEach(async function () {
      const {
        market,
        treasury,
        owner,
        bannedUser,
        autionCreator,
        bidder,
        buyer,
        seller,
        erc1155Token,
        erc20Token,
        erc721Token,
      } = await this.loadFixture(deployMarketFixture);

      this.market = market;
      this.treasury = treasury;
      this.owner = owner;
      this.bannedUser = bannedUser;
      this.auctionCreator = autionCreator;
      this.bidder = bidder;
      this.buyer = buyer;
      this.seller = seller;
      this.erc1155Token = erc1155Token;
      this.erc20Token = erc20Token;
      this.erc721Token = erc721Token;
      this.startAuction = (await time.latest()) + TIME_LEFT_TO_START_AUCTION;
    });

    describe("Setup tax fee", async function () {
      it("Should revert if not owner", async function () {
        await expect(
          this.market.connect(this.treasury).setTaxFee(5, 5)
        ).to.be.revertedWithCustomError(
          this.market,
          "OwnableUnauthorizedAccount"
        );
      });

      it("Should revert if sell tax fee is invalid", async function () {
        await expect(
          this.market.setTaxFee(101, 5)
        ).to.be.revertedWithCustomError(this.market, "InvalidSellTax");
      });

      it("Should revert if buy tax fee is invalid", async function () {
        await expect(
          this.market.setTaxFee(5, 101)
        ).to.be.revertedWithCustomError(this.market, "InvalidBuyTax");
      });

      it("Should set the right tax fee", async function () {
        const SELL_TAX_FEE = 5;
        const BUY_TAX_FEE = 10;

        await this.market.setTaxFee(SELL_TAX_FEE, BUY_TAX_FEE);
        expect(await this.market.sellTax()).to.equal(SELL_TAX_FEE);
        expect(await this.market.buyTax()).to.equal(BUY_TAX_FEE);
      });
    });

    describe("Blacklist", function () {
      it("Should revert if not owner", async function () {
        await expect(
          this.market
            .connect(this.treasury)
            .addBlackList(this.bannedUser.address)
        ).to.be.revertedWithCustomError(
          this.market,
          "OwnableUnauthorizedAccount"
        );
      });

      it("Should blacklist an address", async function () {
        await this.market.addBlackList(this.bannedUser.address);
        expect(await this.market.blacklist(this.bannedUser.address)).to.be.true;
      });

      it("Should unblacklist an address", async function () {
        await this.market.addBlackList(this.bannedUser.address);
        expect(await this.market.blacklist(this.bannedUser.address)).to.be.true;

        await this.market.removeBlackList(this.bannedUser.address);
        expect(await this.market.blacklist(this.bannedUser.address)).to.be
          .false;
      });
    });

    describe("Trade", function () {
      beforeEach(async function () {
        this.sellTax = await this.market.sellTax();
        this.buyTax = await this.market.buyTax();
        this.taxBase = await this.market.getTaxBase();
        await this.market.addBlackList(this.bannedUser.address);
      });

      describe("Direct sale validation", function () {
        it("Should revert if blacklisted", async function () {
          await expect(
            this.market
              .connect(this.bannedUser)
              .listForSale(
                ethers.ZeroAddress,
                await this.erc721Token.getAddress(),
                ERC721_TOKEN_ID,
                0,
                BigInt(1e18)
              )
          ).to.be.revertedWithCustomError(this.market, "Unauthorized");

          await expect(
            this.market.connect(this.bannedUser).buyItem(0)
          ).to.be.revertedWithCustomError(this.market, "Unauthorized");
        });

        it("Should revert if price is 0", async function () {
          await this.erc721Token
            .connect(this.seller)
            .approve(await this.market.getAddress(), ERC721_TOKEN_ID);

          await expect(
            this.market
              .connect(this.seller)
              .listForSale(
                ethers.ZeroAddress,
                await this.erc721Token.getAddress(),
                ERC721_TOKEN_ID,
                0,
                0
              )
          ).to.be.revertedWithCustomError(this.market, "InvalidPrice");
        });

        it("Should revert if the token is not erc721 or erc1155", async function () {
          await expect(
            this.market
              .connect(this.seller)
              .listForSale(
                ethers.ZeroAddress,
                await this.erc20Token.getAddress(),
                ERC721_TOKEN_ID,
                0,
                BigInt(1e18)
              )
          ).to.be.reverted;
        });

        it("Should revert if sale not exist", async function () {
          await expect(
            this.market.connect(this.buyer).buyItem(0)
          ).to.be.revertedWithCustomError(this.market, "SaleNotExists");
        });

        it("Should revert if the item is already sold", async function () {
          await this.erc721Token
            .connect(this.seller)
            .approve(await this.market.getAddress(), ERC721_TOKEN_ID);
          await this.market
            .connect(this.seller)
            .listForSale(
              ethers.ZeroAddress,
              await this.erc721Token.getAddress(),
              ERC721_TOKEN_ID,
              0,
              BUY_PRICE
            );
          await this.market
            .connect(this.buyer)
            .buyItem(0, { value: ACTUAL_AMOUNT_USER_HAS_TO_PAY });

          await expect(
            this.market.connect(this.buyer).buyItem(0)
          ).to.be.revertedWithCustomError(this.market, "ItemAlreadySold");
        });

        it("Should revert if the ETH is not enough", async function () {
          await this.erc721Token
            .connect(this.seller)
            .approve(await this.market.getAddress(), ERC721_TOKEN_ID);
          await this.market
            .connect(this.seller)
            .listForSale(
              ethers.ZeroAddress,
              await this.erc721Token.getAddress(),
              ERC721_TOKEN_ID,
              0,
              BigInt(1e18)
            );

          await expect(
            this.market.connect(this.buyer).buyItem(0)
          ).to.be.revertedWithCustomError(this.market, "PriceNotMet");
        });
      });

      describe("Listing and Buy item", function () {
        it("Should list an erc721 token for sale", async function () {
          await this.erc721Token
            .connect(this.seller)
            .approve(await this.market.getAddress(), ERC721_TOKEN_ID);

          await this.market
            .connect(this.seller)
            .listForSale(
              ethers.ZeroAddress,
              await this.erc721Token.getAddress(),
              ERC721_TOKEN_ID,
              0,
              BigInt(1e18)
            );

          const item = await this.market.directSales(0);
          expect(item.tokenId).to.equal(ERC721_TOKEN_ID);
          expect(item.nftAddress).to.equal(await this.erc721Token.getAddress());
          expect(item.erc1155Quantity).to.equal(0);
          expect(item.paymentToken).to.equal(ethers.ZeroAddress);
          expect(item.seller).to.equal(this.seller.address);
          expect(item.price).to.equal(BigInt(1e18));
          expect(item.isSold).to.be.false;
        });

        it("Should list an erc1155 token for sale", async function () {
          await this.erc1155Token
            .connect(this.seller)
            .setApprovalForAll(await this.market.getAddress(), true);

          await this.market
            .connect(this.seller)
            .listForSale(
              ethers.ZeroAddress,
              await this.erc1155Token.getAddress(),
              ERC1155_TOKEN_ID,
              ERC1155_QUANTITY,
              BigInt(1e18)
            );

          const item = await this.market.directSales(0);
          expect(item.tokenId).to.equal(ERC1155_TOKEN_ID);
          expect(item.nftAddress).to.equal(
            await this.erc1155Token.getAddress()
          );
          expect(item.erc1155Quantity).to.equal(ERC1155_QUANTITY);
          expect(item.paymentToken).to.equal(ethers.ZeroAddress);
          expect(item.seller).to.equal(this.seller.address);
          expect(item.price).to.equal(BigInt(1e18));
          expect(item.isSold).to.be.false;
        });

        it("Should buy an erc721 token with ETH", async function () {
          await this.erc721Token
            .connect(this.seller)
            .approve(await this.market.getAddress(), ERC721_TOKEN_ID);
          await this.market
            .connect(this.seller)
            .listForSale(
              ethers.ZeroAddress,
              await this.erc721Token.getAddress(),
              ERC721_TOKEN_ID,
              0,
              BUY_PRICE
            );

          await this.market
            .connect(this.buyer)
            .buyItem(0, { value: ACTUAL_AMOUNT_USER_HAS_TO_PAY });

          const item = await this.market.directSales(0);
          expect(item.isSold).to.be.true;
        });

        it("Should buy an erc1155 token with ETH", async function () {
          await this.erc1155Token
            .connect(this.seller)
            .setApprovalForAll(await this.market.getAddress(), true);
          await this.market
            .connect(this.seller)
            .listForSale(
              ethers.ZeroAddress,
              await this.erc1155Token.getAddress(),
              ERC1155_TOKEN_ID,
              ERC1155_QUANTITY,
              BUY_PRICE
            );

          await this.market
            .connect(this.buyer)
            .buyItem(0, { value: ACTUAL_AMOUNT_USER_HAS_TO_PAY });

          const item = await this.market.directSales(0);
          expect(item.isSold).to.be.true;
        });

        it("Should buy an erc721 token with ERC20", async function () {
          await this.erc721Token
            .connect(this.seller)
            .approve(await this.market.getAddress(), ERC721_TOKEN_ID);
          await this.market
            .connect(this.seller)
            .listForSale(
              this.erc20Token,
              await this.erc721Token.getAddress(),
              ERC721_TOKEN_ID,
              0,
              BigInt(1e18)
            );

          await this.erc20Token
            .connect(this.buyer)
            .approve(await this.market.getAddress(), BigInt(1e18));
          await this.market.connect(this.buyer).buyItem(0);

          const item = await this.market.directSales(0);
          expect(item.isSold).to.be.true;
        });

        it("Should update the right amount of ETH procceeds", async function () {
          await this.erc721Token
            .connect(this.seller)
            .approve(await this.market.getAddress(), ERC721_TOKEN_ID);
          await this.market
            .connect(this.seller)
            .listForSale(
              ethers.ZeroAddress,
              await this.erc721Token.getAddress(),
              ERC721_TOKEN_ID,
              0,
              BUY_PRICE
            );

          const sellerBalanceBefore = await this.market.getProceeds(
            await this.seller.getAddress(),
            ethers.ZeroAddress
          );
          await this.market
            .connect(this.buyer)
            .buyItem(0, { value: ACTUAL_AMOUNT_USER_HAS_TO_PAY });
          const sellerBalanceAfter = await this.market.getProceeds(
            await this.seller.getAddress(),
            ethers.ZeroAddress
          );

          expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(
            SELLER_PROCEEDS
          );
        });
      });

      describe("Cancel listing", function () {
        beforeEach(async function () {
          await this.erc721Token
            .connect(this.seller)
            .approve(await this.market.getAddress(), ERC721_TOKEN_ID);

          await this.market
            .connect(this.seller)
            .listForSale(
              ethers.ZeroAddress,
              await this.erc721Token.getAddress(),
              ERC721_TOKEN_ID,
              0,
              BigInt(1e18)
            );
        });

        it("Should revert if saleId is invalid", async function () {
          await expect(
            this.market.connect(this.seller).cancelListing(1)
          ).to.be.revertedWithCustomError(this.market, "SaleNotExists");
        });

        it("Should revert if not the seller", async function () {
          await expect(
            this.market.connect(this.buyer).cancelListing(0)
          ).to.be.revertedWithCustomError(this.market, "SellerOnly");
        });

        it("Should revert if the item is already sold", async function () {
          await this.market
            .connect(this.buyer)
            .buyItem(0, { value: ACTUAL_AMOUNT_USER_HAS_TO_PAY });

          await expect(
            this.market.connect(this.seller).cancelListing(0)
          ).to.be.revertedWithCustomError(this.market, "ItemAlreadySold");
        });

        it("Should send the erc1155 nft back to the seller", async function () {
          await this.erc1155Token
            .connect(this.seller)
            .setApprovalForAll(await this.market.getAddress(), true);
          await this.market
            .connect(this.seller)
            .listForSale(
              ethers.ZeroAddress,
              await this.erc1155Token.getAddress(),
              ERC1155_TOKEN_ID,
              ERC1155_QUANTITY,
              BigInt(1e18)
            );

          await this.market.connect(this.seller).cancelListing(1);
          expect(
            await this.erc1155Token.balanceOf(
              this.seller.address,
              ERC1155_TOKEN_ID
            )
          ).to.equal(ERC1155_QUANTITY);
        });

        it("Should emit event when cancel listing", async function () {
          await expect(this.market.connect(this.seller).cancelListing(0))
            .to.emit(this.market, "ItemCanceled")
            .withArgs(0);
        });
      });

      describe("Auction validation", function () {
        it("Should revert place new bid if blacklisted", async function () {
          await expect(
            this.market
              .connect(this.bannedUser)
              .createAuction(
                ethers.ZeroAddress,
                await this.erc721Token.getAddress(),
                ERC721_AUCTION_TOKEN_ID,
                AUCTION_FLOOR_PRICE,
                this.startAuction,
                this.startAuction + AUCTION_DURATION,
                0,
                BigInt(1e18)
              )
          ).to.be.revertedWithCustomError(this.market, "Unauthorized");

          await expect(
            this.market
              .connect(this.bannedUser)
              .placeNewBid(0, 0, { value: BigInt(1e18) })
          ).to.be.revertedWithCustomError(this.market, "Unauthorized");
        });

        it("Should revert if the token is not erc721 or erc1155", async function () {
          await expect(
            this.market
              .connect(this.bannedUser)
              .createAuction(
                ethers.ZeroAddress,
                await this.erc20Token.getAddress(),
                ERC721_AUCTION_TOKEN_ID,
                AUCTION_FLOOR_PRICE,
                this.startAuction,
                this.startAuction + AUCTION_DURATION,
                0,
                BigInt(1e18)
              )
          ).to.be.reverted;
        });
      });

      describe("Create auction", function () {
        it("Should create an auction for erc721 token", async function () {
          await this.erc721Token
            .connect(this.auctionCreator)
            .approve(await this.market.getAddress(), ERC721_AUCTION_TOKEN_ID);

          await this.market
            .connect(this.auctionCreator)
            .createAuction(
              ethers.ZeroAddress,
              await this.erc721Token.getAddress(),
              ERC721_AUCTION_TOKEN_ID,
              AUCTION_FLOOR_PRICE,
              this.startAuction,
              this.startAuction + AUCTION_DURATION,
              0,
              BigInt(1e18)
            );

          const auction = await this.market.auctions(0);
          expect(auction.tokenId).to.equal(ERC721_AUCTION_TOKEN_ID);
          expect(auction.nftAddress).to.equal(
            await this.erc721Token.getAddress()
          );
          expect(auction.priceToken).to.equal(ethers.ZeroAddress);
          expect(auction.seller).to.equal(this.auctionCreator.address);
          expect(auction.floorPrice).to.equal(BigInt(2e18));
          expect(auction.startAuction).to.equal(this.startAuction);
          expect(auction.bidCount).to.equal(0);
          expect(auction.currentBidOwner).to.equal(ethers.ZeroAddress);
          expect(auction.currentBidPrice).to.equal(0);
          expect(auction.isEnded).to.be.false;
        });

        it("Should create an auction for erc1155 token", async function () {
          await this.erc1155Token
            .connect(this.auctionCreator)
            .setApprovalForAll(await this.market.getAddress(), true);

          await this.market
            .connect(this.auctionCreator)
            .createAuction(
              ethers.ZeroAddress,
              await this.erc1155Token.getAddress(),
              ERC1155_TOKEN_ID,
              AUCTION_FLOOR_PRICE,
              this.startAuction,
              this.startAuction + AUCTION_DURATION,
              ERC1155_QUANTITY,
              BigInt(1e18)
            );

          const auction = await this.market.auctions(0);
          expect(auction.tokenId).to.equal(ERC1155_TOKEN_ID);
          expect(auction.nftAddress).to.equal(
            await this.erc1155Token.getAddress()
          );
          expect(auction.priceToken).to.equal(ethers.ZeroAddress);
          expect(auction.seller).to.equal(this.auctionCreator.address);
          expect(auction.floorPrice).to.equal(BigInt(2e18));
          expect(auction.erc1155Quantity).to.equal(ERC1155_QUANTITY);
          // expect(auction.startTime).to.equal(this.startAuction);
          // expect(auction.duration).to.equal(1 * 60 * 60);
          expect(auction.bidCount).to.equal(0);
          expect(auction.currentBidOwner).to.equal(ethers.ZeroAddress);
          expect(auction.currentBidPrice).to.equal(0);
          expect(auction.isEnded).to.be.false;
        });

        it("Should emit event when create auction", async function () {
          await this.erc721Token
            .connect(this.auctionCreator)
            .approve(await this.market.getAddress(), ERC721_AUCTION_TOKEN_ID);

          await expect(
            this.market
              .connect(this.auctionCreator)
              .createAuction(
                ethers.ZeroAddress,
                await this.erc721Token.getAddress(),
                ERC721_AUCTION_TOKEN_ID,
                AUCTION_FLOOR_PRICE,
                this.startAuction,
                this.startAuction + AUCTION_DURATION,
                0,
                AUCTION_BID_INCREMENT
              )
          )
            .to.emit(this.market, "AuctionCreated")
            .withArgs(
              this.auctionCreator.address,
              await this.erc721Token.getAddress(),
              ERC721_AUCTION_TOKEN_ID,
              0,
              BigInt(2e18),
              AUCTION_BID_INCREMENT,
              this.startAuction,
              this.startAuction + AUCTION_DURATION
            );
        });
      });

      describe("Place a new bid", function () {
        it("Should revert if auction not exist", async function () {
          await expect(
            this.market.connect(this.bidder).placeNewBid(0, 0, { value: 0 })
          ).to.be.revertedWithCustomError(this.market, "AuctionNotExists");
        });

        describe("ETH bid", function () {
          beforeEach(async function () {
            await this.erc721Token
              .connect(this.auctionCreator)
              .approve(await this.market.getAddress(), ERC721_AUCTION_TOKEN_ID);

            await this.market
              .connect(this.auctionCreator)
              .createAuction(
                ethers.ZeroAddress,
                await this.erc721Token.getAddress(),
                ERC721_AUCTION_TOKEN_ID,
                AUCTION_FLOOR_PRICE,
                this.startAuction,
                this.startAuction + AUCTION_DURATION,
                0,
                BigInt(1e18)
              );
          });

          it("Should revert place new bid if the auction is already ended", async function () {
            await ethers.provider.send("evm_increaseTime", [
              AUCTION_DURATION + TIME_LEFT_TO_START_AUCTION,
            ]);
            await ethers.provider.send("evm_mine");

            await expect(
              this.market
                .connect(this.bidder)
                .placeNewBid(0, 0, { value: VALID_BID_PRICE })
            ).to.be.revertedWithCustomError(this.market, "AuctionNotEnded");
          });

          it("Should revert if the bid ETH price is less than the floor price", async function () {
            await expect(
              this.market.connect(this.bidder).placeNewBid(0, 0)
            ).to.be.revertedWith(
              "PlaceBid: Bid price must be above floor price"
            );
          });

          it("Should revert if the bid ETH price is less than the current bid price plus bid increment", async function () {
            const bidPrice = getActualAmountUserHasToPay(
              BigInt(2e18),
              this.buyTax,
              this.taxBase
            );
            await this.market
              .connect(this.bidder)
              .placeNewBid(0, 0, { value: bidPrice });
            await expect(
              this.market
                .connect(this.bidder)
                .placeNewBid(0, 0, { value: bidPrice })
            ).to.be.revertedWith(
              "PlaceBid: New bid price need to greater than minimum price"
            );
          });

          it("Should place a new bid with ETH", async function () {
            const actualPrice = getActualAmountUserHasToPay(
              VALID_BID_PRICE,
              this.buyTax,
              this.taxBase
            );
            await this.market
              .connect(this.bidder)
              .placeNewBid(0, 0, { value: actualPrice });

            const auction = await this.market.auctions(0);

            expect(auction.bidCount).to.equal(1);
            expect(auction.currentBidOwner).to.equal(this.bidder.address);
            expect(auction.currentBidPrice).to.equal(VALID_BID_PRICE);
          });
        });
      });

      describe("ERC20 bid", function () {
        beforeEach(async function () {
          await this.erc1155Token
            .connect(this.auctionCreator)
            .setApprovalForAll(await this.market.getAddress(), true);

          await this.market
            .connect(this.auctionCreator)
            .createAuction(
              this.erc20Token.getAddress(),
              await this.erc1155Token.getAddress(),
              ERC1155_TOKEN_ID,
              AUCTION_FLOOR_PRICE,
              this.startAuction,
              this.startAuction + AUCTION_DURATION,
              ERC1155_QUANTITY,
              BigInt(1e18)
            );
        });

        it("Should revert if the bid ERC20 price is less than the floor price", async function () {
          await this.erc20Token
            .connect(this.bidder)
            .approve(await this.market.getAddress(), BigInt(2e18));
          await expect(
            this.market.connect(this.bidder).placeNewBid(0, 0)
          ).to.be.revertedWith("PlaceBid: Bid price must be above floor price");
        });

        it("Should revert if the bid ERC20 price is less than the current bid price plus bid increment", async function () {
          const bidPrice = getActualAmountUserHasToPay(
            BigInt(2e18),
            this.buyTax,
            this.taxBase
          );
          await this.erc20Token
            .connect(this.bidder)
            .approve(await this.market.getAddress(), bidPrice);

          // Place first bid first
          await this.market.connect(this.bidder).placeNewBid(0, bidPrice);
          await expect(
            this.market.connect(this.bidder).placeNewBid(0, bidPrice)
          ).to.be.revertedWith(
            "PlaceBid: New bid price need to greater than minimum price"
          );
        });
        it("Should place a new bid with ERC20", async function () {
          const actualPayAmount = getActualAmountUserHasToPay(
            VALID_BID_PRICE,
            this.buyTax,
            this.taxBase
          );
          await this.erc20Token
            .connect(this.bidder)
            .approve(await this.market.getAddress(), actualPayAmount);
          await this.market
            .connect(this.bidder)
            .placeNewBid(0, actualPayAmount);

          const auction = await this.market.auctions(0);
          expect(auction.bidCount).to.equal(1);
          expect(auction.currentBidOwner).to.equal(this.bidder.address);
          expect(auction.currentBidPrice).to.equal(VALID_BID_PRICE);
        });
      });

      describe("Cancel auction", function () {
        beforeEach(async function () {
          await this.erc721Token
            .connect(this.auctionCreator)
            .approve(await this.market.getAddress(), ERC721_AUCTION_TOKEN_ID);

          await this.market
            .connect(this.auctionCreator)
            .createAuction(
              ethers.ZeroAddress,
              await this.erc721Token.getAddress(),
              ERC721_AUCTION_TOKEN_ID,
              AUCTION_FLOOR_PRICE,
              this.startAuction,
              this.startAuction + AUCTION_DURATION,
              0,
              BigInt(1e18)
            );
        });

        it("Should revert if auctionId is invalid", async function () {
          await expect(
            this.market.connect(this.auctionCreator).cancelAuction(1)
          ).to.be.revertedWithCustomError(this.market, "AuctionNotExists");
        });

        it("Should revert if user has bid", async function () {
          await this.market
            .connect(this.bidder)
            .placeNewBid(0, 0, { value: VALID_BID_PRICE });

          await expect(
            this.market.connect(this.auctionCreator).cancelAuction(0)
          ).to.be.revertedWith("CancelAuction: User already bidded");
        });

        it("Should revert if not the auction creator", async function () {
          await expect(
            this.market.cancelAuction(0)
          ).to.be.revertedWithCustomError(this.market, "NotAuctionCreator");
        });

        it("Should revert if the auction is already ended", async function () {
          await ethers.provider.send("evm_increaseTime", [
            TIME_LEFT_TO_START_AUCTION,
          ]);
          await ethers.provider.send("evm_mine");

          await expect(
            this.market.connect(this.auctionCreator).cancelAuction(0)
          ).to.be.revertedWith("CancelAuction: Auction already started");
        });

        it("Should emit event when cancel auction", async function () {
          await expect(
            this.market.connect(this.auctionCreator).cancelAuction(0)
          )
            .to.emit(this.market, "AuctionCanceled")
            .withArgs(0);
        });
      });

      describe("End auction", function () {
        beforeEach(async function () {
          this.sellTax = await this.market.sellTax();
          this.buyTax = await this.market.buyTax();
          this.taxBase = await this.market.getTaxBase();

          await this.erc721Token
            .connect(this.auctionCreator)
            .approve(await this.market.getAddress(), ERC721_AUCTION_TOKEN_ID);

          await this.market
            .connect(this.auctionCreator)
            .createAuction(
              ethers.ZeroAddress,
              await this.erc721Token.getAddress(),
              ERC721_AUCTION_TOKEN_ID,
              AUCTION_FLOOR_PRICE,
              this.startAuction,
              this.startAuction + AUCTION_DURATION,
              0,
              BigInt(1e18)
            );
        });

        it("Should revert if auctionId is invalid", async function () {
          await expect(
            this.market.connect(this.auctionCreator).endAuction(1)
          ).to.be.revertedWithCustomError(this.market, "AuctionNotExists");
        });

        it("Should revert if the auction is not ended", async function () {
          await expect(
            this.market.connect(this.auctionCreator).endAuction(0)
          ).to.be.revertedWith("EndAuction: Not end yet");
        });

        it("Should end the auction", async function () {
          await this.market
            .connect(this.bidder)
            .placeNewBid(0, 0, { value: VALID_BID_PRICE });

          await ethers.provider.send("evm_increaseTime", [
            TIME_LEFT_TO_START_AUCTION + AUCTION_DURATION,
          ]);
          await ethers.provider.send("evm_mine");

          await this.market.connect(this.auctionCreator).endAuction(0);

          const auction = await this.market.auctions(0);
          expect(auction.isEnded).to.be.true;
        });

        it("Should send nft back to the seller if no bid", async function () {
          await ethers.provider.send("evm_increaseTime", [
            TIME_LEFT_TO_START_AUCTION + AUCTION_DURATION,
          ]);
          await ethers.provider.send("evm_mine");

          await this.market.connect(this.auctionCreator).endAuction(0);

          const auction = await this.market.auctions(0);

          expect(auction.isEnded).to.be.true;
          expect(
            await this.erc721Token.ownerOf(ERC721_AUCTION_TOKEN_ID)
          ).to.equal(this.auctionCreator.address);
        });

        it("Should send nft to the highest bidder", async function () {
          await this.market
            .connect(this.bidder)
            .placeNewBid(0, 0, { value: VALID_BID_PRICE });

          await ethers.provider.send("evm_increaseTime", [
            TIME_LEFT_TO_START_AUCTION + AUCTION_DURATION,
          ]);
          await ethers.provider.send("evm_mine");

          await this.market.connect(this.auctionCreator).endAuction(0);

          const auction = await this.market.auctions(0);
          expect(auction.isEnded).to.be.true;
          expect(
            await this.erc721Token.ownerOf(ERC721_AUCTION_TOKEN_ID)
          ).to.equal(this.bidder.address);
        });

        it("Should send the right amount of ERC20 to the seller", async function () {
          // Create auction for ERC20 and ERC1155 token
          await this.erc1155Token
            .connect(this.auctionCreator)
            .setApprovalForAll(await this.market.getAddress(), true);

          await this.market
            .connect(this.auctionCreator)
            .createAuction(
              this.erc20Token.getAddress(),
              await this.erc1155Token.getAddress(),
              ERC1155_TOKEN_ID,
              AUCTION_FLOOR_PRICE,
              this.startAuction,
              this.startAuction + AUCTION_DURATION,
              ERC1155_QUANTITY,
              BigInt(1e18)
            );

          const bidPrice = VALID_BID_PRICE;
          const acutualPrice = getActualAmountUserHasToPay(
            bidPrice,
            this.buyTax,
            this.taxBase
          );

          // Approve erc20
          await this.erc20Token
            .connect(this.bidder)
            .approve(await this.market.getAddress(), acutualPrice);
          // The next auction after first one for ETH
          await this.market.connect(this.bidder).placeNewBid(1, acutualPrice);

          const sellerBalanceBefore = await this.market.getProceeds(
            await this.auctionCreator.getAddress(),
            ethers.ZeroAddress
          );
          await ethers.provider.send("evm_increaseTime", [
            TIME_LEFT_TO_START_AUCTION + AUCTION_DURATION,
          ]);
          await ethers.provider.send("evm_mine");

          // The next auction after first one for ETH
          await this.market.connect(this.auctionCreator).endAuction(1);
          const sellerBalanceAfter = await this.market.getProceeds(
            await this.auctionCreator.getAddress(),
            await this.erc20Token.getAddress()
          );

          expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(
            getSellerProceeds(bidPrice, this.sellTax, this.taxBase)
          );
          // expect erc1155 token is transfered to the highest bidder
          expect(
            await this.erc1155Token.balanceOf(
              this.bidder.address,
              ERC1155_TOKEN_ID
            )
          ).to.equal(ERC1155_QUANTITY);
        });

        it("Should emit event when end auction", async function () {
          await this.market
            .connect(this.bidder)
            .placeNewBid(0, 0, { value: VALID_BID_PRICE });

          await ethers.provider.send("evm_increaseTime", [
            TIME_LEFT_TO_START_AUCTION + AUCTION_DURATION,
          ]);
          await ethers.provider.send("evm_mine");

          await expect(
            this.market.connect(this.auctionCreator).endAuction(0)
          ).to.emit(this.market, "AuctionEnded");
        });
      });
    });

    describe("Withdrawals", function () {
      beforeEach(async function () {
        this.sellTax = await this.market.sellTax();
        this.buyTax = await this.market.buyTax();
        this.taxBase = await this.market.getTaxBase();
      });

      it("Should withdraw the right amount of ETH", async function () {
        await this.erc721Token
          .connect(this.auctionCreator)
          .approve(await this.market.getAddress(), ERC721_AUCTION_TOKEN_ID);

        await this.market
          .connect(this.auctionCreator)
          .createAuction(
            ethers.ZeroAddress,
            await this.erc721Token.getAddress(),
            ERC721_AUCTION_TOKEN_ID,
            AUCTION_FLOOR_PRICE,
            this.startAuction,
            this.startAuction + AUCTION_DURATION,
            0,
            BigInt(1e18)
          );

        const bidPrice = VALID_BID_PRICE;
        const acutualPrice = getActualAmountUserHasToPay(
          bidPrice,
          this.buyTax,
          this.taxBase
        );
        await this.market
          .connect(this.bidder)
          .placeNewBid(0, 0, { value: acutualPrice });

        await ethers.provider.send("evm_increaseTime", [
          TIME_LEFT_TO_START_AUCTION + AUCTION_DURATION,
        ]);
        await ethers.provider.send("evm_mine");

        await this.market.connect(this.auctionCreator).endAuction(0);

        const sellerBalanceBefore = await this.market.getProceeds(
          await this.auctionCreator.getAddress(),
          ethers.ZeroAddress
        );
        await this.market
          .connect(this.auctionCreator)
          .withdraw([ethers.ZeroAddress]);
        const sellerBalanceAfter = await this.market.getProceeds(
          await this.auctionCreator.getAddress(),
          ethers.ZeroAddress
        );

        expect(sellerBalanceBefore - sellerBalanceAfter).to.equal(
          getSellerProceeds(bidPrice, this.sellTax, this.taxBase)
        );
      });

      it("Should withdraw the right amount of ERC20", async function () {
        await this.erc1155Token
          .connect(this.auctionCreator)
          .setApprovalForAll(await this.market.getAddress(), true);

        await this.market
          .connect(this.auctionCreator)
          .createAuction(
            this.erc20Token.getAddress(),
            await this.erc1155Token.getAddress(),
            ERC1155_TOKEN_ID,
            AUCTION_FLOOR_PRICE,
            this.startAuction,
            this.startAuction + AUCTION_DURATION,
            ERC1155_QUANTITY,
            BigInt(1e18)
          );

        const acutualPrice = getActualAmountUserHasToPay(
          VALID_BID_PRICE,
          this.buyTax,
          this.taxBase
        );

        // Approve erc20
        await this.erc20Token
          .connect(this.bidder)
          .approve(await this.market.getAddress(), acutualPrice);
        // The next auction after first one for ETH
        await this.market.connect(this.bidder).placeNewBid(0, acutualPrice);

        await ethers.provider.send("evm_increaseTime", [
          TIME_LEFT_TO_START_AUCTION + AUCTION_DURATION,
        ]);
        await ethers.provider.send("evm_mine");

        // The next auction after first one for ETH
        await this.market.connect(this.auctionCreator).endAuction(0);

        const sellerBalanceBefore = await this.market.getProceeds(
          await this.auctionCreator.getAddress(),
          await this.erc20Token.getAddress()
        );
        await this.market
          .connect(this.auctionCreator)
          .withdraw([this.erc20Token.getAddress()]);
        const sellerBalanceAfter = await this.market.getProceeds(
          await this.auctionCreator.getAddress(),
          await this.erc20Token.getAddress()
        );

        expect(sellerBalanceBefore - sellerBalanceAfter).to.equal(
          SELLER_PROCEEDS
        );
      });
    });
  });
});
