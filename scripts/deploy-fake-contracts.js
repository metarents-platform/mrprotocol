const { ethers, upgrades } = require("hardhat");

let rNFT, gateway, proxyAdmin;
let owner, hacker, treasury;

async function main() {
  [owner, hacker, treasury] = await ethers.getSigners();

  proxyAdmin = await upgrades.admin.getInstance();
  
  const RNFT = await ethers.getContractFactory("RNFT");
  rNFT = await upgrades.deployProxy(RNFT);
  await rNFT.deployed();

  const Gateway = await ethers.getContractFactory("Gateway");
  gateway = await upgrades.deployProxy(
    Gateway,
    [rNFT.address, treasury.address],
    { initializer: "initialize" }
  );
  await gateway.deployed();
}

main()
  .then(() => {
    console.log(`Deployer address : ${owner.address}`);
    console.log(`ProxyAdmin address : ${proxyAdmin.address}`);
    console.log(`RNFT address : ${rNFT.address}`);
    console.log(`Gateway address : ${gateway.address}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
