import { ERC20Mock, ERC721Mock, ERC1155Mock, type Marketplace } from "../types";

type Fixture<T> = () => Promise<T>;

declare module "mocha" {
  export interface Context {
    market: Marketplace;
    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
    erc20Token: ERC20Mock;
    erc721Token: ERC721Mock;
    erc1155Token: ERC1155Mock;
  }
}
