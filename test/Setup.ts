import { BaseContract } from "ethers";
import { ethers, upgrades } from "hardhat";

import { ERC20Mock, ERC721Mock, ERC1155Mock, Marketplace } from "../types";

export const TOTAL_SUPPLY_ERC20 = BigInt(10e18);
export const ERC721_TOKEN_ID = 1;
export const ERC721_AUCTION_TOKEN_ID = 2;
export const ERC721_TOKEN_URI = "https://mocktoken.sotatek.com/1";
export const ERC1155_TOKEN_ID = 5;
export const ERC1155_QUANTITY = 100;
export const AUCTION_FLOOR_PRICE = BigInt(2e18);
export const AUCTION_BID_INCREMENT = BigInt(1e18);
export const AUCTION_DURATION = 60 * 60 * 24;
export const SELL_PRICE = BigInt(2e18);

export const getActualAmountUserHasToPay = (price: bigint, tax: bigint, base: bigint) => {
  const taxFee = (price * tax) / base;
  return price + taxFee;
};

export const getSellerProceeds = (price: bigint, tax: bigint, base: bigint) => {
  const taxFee = (price * tax) / base;
  return price - taxFee;
};

export async function deployMarketFixture() {
  const Market = await ethers.getContractFactory("Marketplace");
  const [owner, treasury, bannedUser, seller, buyer, autionCreator, bidder] = await ethers.getSigners();

  const market = (await upgrades.deployProxy(Market, [treasury.address])) as BaseContract as Marketplace;
  await market.waitForDeployment();

  const erc20Contract = await ethers.getContractFactory("ERC20Mock");
  const erc721Contract = await ethers.getContractFactory("ERC721Mock");
  const erc1155Contract = await ethers.getContractFactory("ERC1155Mock");

  const erc20Token = (await erc20Contract.deploy(TOTAL_SUPPLY_ERC20)) as BaseContract as ERC20Mock;
  const erc721Token = (await erc721Contract.deploy()) as BaseContract as ERC721Mock;
  const erc1155Token = (await erc1155Contract.deploy()) as BaseContract as ERC1155Mock;

  await erc20Token.transfer(buyer, TOTAL_SUPPLY_ERC20 / BigInt(2));
  await erc20Token.transfer(bidder, TOTAL_SUPPLY_ERC20 / BigInt(2));
  await erc721Token.safeMint(seller, ERC721_TOKEN_ID, ERC721_TOKEN_URI);
  await erc721Token.safeMint(autionCreator, ERC721_AUCTION_TOKEN_ID, ERC721_TOKEN_URI);
  await erc1155Token.mint(seller, ERC1155_TOKEN_ID, ERC1155_QUANTITY, "0x");
  await erc1155Token.mint(autionCreator, ERC1155_TOKEN_ID, ERC1155_QUANTITY, "0x");

  return {
    market,
    owner,
    treasury,
    seller,
    buyer,
    autionCreator,
    bidder,
    bannedUser,
    erc20Token,
    erc721Token,
    erc1155Token,
  };
}
