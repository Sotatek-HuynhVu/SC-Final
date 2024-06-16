import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const market = await deploy("Marketplace", {
    from: deployer,
    log: true,
    proxy: {
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize",
          args: [process.env.TREASURY_ADDRESS],
        },
      },
    },
  });

  console.log(`Marketplace contract: `, market.address);
};
export default func;

func.id = "deploy_marketplace"; // id required to prevent reexecution
func.tags = ["Marketplace"];
