// beta version : v0.1
// deployed on Goerli using Hardhat

const { ethers } = require("hardhat");

require("dotenv").config();

let token;

const deploy = async () => {
  const MRNT = await ethers.getContractFactory("MRNT");
  token = await MRNT.deploy();
  await token.deployed();

  console.log(`MRNT deployed successfully: ${token.address}`);
}

deploy();