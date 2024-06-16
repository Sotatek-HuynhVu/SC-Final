require("dotenv").config();
const { ethers, deployments } = require("hardhat");

async function main() {
  const contractFactory = await hre.ethers.getContractFactory("Marketplace");

  const contractProxy = await hre.upgrades.deployProxy(contractFactory, [
    process.env.TREASURY_ADDRESS,
  ]);
  await contractProxy.waitForDeployment();
}

main().catch(console.log);

// module.exports = main;
// module.exports.tags = ["marketplace"];
