// beta version : v0.1
// deployed on Goerli using Hardhat

const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("ethers");

require("dotenv").config();

let rNFT, gateway;

const deploy = async () => {
  const RNFT = await ethers.getContractFactory("RNFT");
  rNFT = await upgrades.deployProxy(RNFT);
  await rNFT.deployed();

  console.log(`RNFT (proxy) address : ${rNFT.address}`);
  console.log(`RNFT (implementation) address : ${await upgrades.erc1967.getImplementationAddress(rNFT.address)}`);
  console.log(`RNFT (admin) address : ${await upgrades.erc1967.getAdminAddress(rNFT.address)}`);
  
  const Gateway = await ethers.getContractFactory("Gateway");
  gateway = await upgrades.deployProxy(Gateway, [rNFT.address], {
    initializer: "initialize",
  });
  await gateway.deployed();

  console.log(`Gateway (proxy) address : ${gateway.address}`);
  console.log(`Gateway (implementation) address : ${await upgrades.erc1967.getImplementationAddress(gateway.address)}`);
  console.log(`Gateway (admin) address : ${await upgrades.erc1967.getAdminAddress(gateway.address)}`);
}

const setup = async () => {
  const NFT_ADDRESS = "0xD369c3DfD5EbF11e154F096649e131A8BfAb2f7e"; // LANDRegistry
  const NFT_NAME = "contracts/DCL/LANDRegistry.sol:LANDRegistry";

  console.log(`Setting up....`);
  // Get Original NFT contract
  const landRegistry = await ethers.getContractAt(
    NFT_NAME,
    NFT_ADDRESS,
  );

  console.log(`Approvaing RNFT to operate all my lands....`);
  // Approve RNFT for all (required to call `setUpdateManager`)
  await landRegistry.setApprovalForAll(rNFT.address, true);
  // set Gateway as the admin of RNFT
  console.log(`Setting Gateway as the admin of RNFT`);
  await rNFT._setNewAdmin(gateway.address);
  // set MR team wallet as the admin of Gateway
  console.log(`Setting team wallet as the admin of Gateway`);
  await gateway.setNewAdmin(`${process.env.TEAM_ADDRESS}`);
}

deploy()
  .then(() => setup())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
