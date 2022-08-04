const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("ethers");

let txn;

const team = {
  Robert: "0x237906fd2884235ed0F32DfE84cc89A97bB76249",
  Moughite: "0x5ca6Ff0784fcd11f2BA64B89f08404De56E8B2Fa",
  Amine: "0xFe42e5800276f7dF36140E996aF5C6Da363b0923",
};

let estateRegistry,
  landMiniMeToken,
  estateMiniMeToken,
  miniMeTokenFactory,
  landRegistry;

let owner;

async function initializeMiniMeTokens() {
  let res, event, value;

  console.log("31");
  const MiniMeTokenFactory = await ethers.getContractFactory(
    "MiniMeTokenFactory"
  );
  const MiniMeToken = await ethers.getContractFactory("MiniMeToken");

  console.log("32");
  miniMeTokenFactory = await MiniMeTokenFactory.deploy();

  console.log("33");
  await miniMeTokenFactory.deployed();

  console.log(`MiniMeTokenFactory address : ${miniMeTokenFactory.address}`);

  console.log("34");
  txn = await miniMeTokenFactory.createCloneToken(
    "0x0000000000000000000000000000000000000000",
    0,
    "LAND",
    18,
    "LAND",
    true
  );
  res = await txn.wait();
  event = res.events.find((event) => event.event === "TokenCreated");
  [value] = event.args;
  landMiniMeToken = await MiniMeToken.attach(value);

  console.log(`LandMiniMeToken address : ${landMiniMeToken.address}`);

  console.log(`35`);
  txn = await miniMeTokenFactory.createCloneToken(
    "0x0000000000000000000000000000000000000000",
    0,
    "Estate",
    18,
    "Estate",
    true
  );
  res = await txn.wait();
  event = res.events.find((event) => event.event === "TokenCreated");
  [value] = event.args;
  estateMiniMeToken = await MiniMeToken.attach(value);

  console.log(`EStateMiniMeToken address : ${estateMiniMeToken.address}`);
}

async function initializeLandRegistry() {
  console.log("41");
  const LandRegistry = await ethers.getContractFactory(
    "contracts/DCL/LANDRegistry.sol:LANDRegistry"
  );
  console.log("42");
  landRegistry = await upgrades.deployProxy(LandRegistry, [0x0], {
    initializer: "initialize",
  });
  // landRegistry = await LandRegistry.deploy();

  console.log("43");
  await landRegistry.deployed();

  console.log(`LandRegistry address : ${landRegistry.address}`);

  console.log("44");
  // await landRegistry.initialize(0x00);

  console.log("45");
  txn = await landRegistry.setLandBalanceToken(landMiniMeToken.address);
  await txn.wait();
}

async function initializeEStateRegistry() {
  const EstateRegistry = await ethers.getContractFactory("EstateRegistry");
  estateRegistry = await upgrades.deployProxy(
    EstateRegistry,
    ["Estate", "EST", landRegistry.address],
    { initializer: "initialize" }
  );
  await estateRegistry.deployed();

  console.log(`EStateRegistry address : ${estateRegistry.address}`);

  txn = await estateRegistry.setEstateLandBalanceToken(
    estateMiniMeToken.address
  );
  await txn.wait();
}

async function setupContracts() {
  // generate meme tokens
  // await landMiniMeToken.generateTokens(
  //   user.address,
  //   BigNumber.from("1000000000000000000")
  // );
  // console.log("6.1");
  // txn = await landMiniMeToken.generateTokens(
  //   team.Robert,
  //   BigNumber.from("1000000000000000000")
  // );
  // await txn.wait();
  // console.log("6.2");
  // txn = await landMiniMeToken.generateTokens(
  //   team.Moughite,
  //   BigNumber.from("1000000000000000000")
  // );
  // await txn.wait();
  // console.log("6.3");
  // txn = await landMiniMeToken.generateTokens(
  //   team.Amine,
  //   BigNumber.from("1000000000000000000")
  // );
  // await txn.wait();

  // // await estateMiniMeToken.generateTokens(user.address, BigNumber.from("2"));
  // console.log("6.4");
  // txn = await estateMiniMeToken.generateTokens(
  //   team.Robert,
  //   BigNumber.from("2")
  // );
  // await txn.wait();
  // console.log("6.5");
  // txn = await estateMiniMeToken.generateTokens(
  //   team.Moughite,
  //   BigNumber.from("2")
  // );
  // await txn.wait();
  // console.log("6.6");
  // txn = await estateMiniMeToken.generateTokens(team.Amine, BigNumber.from("2"));
  // await txn.wait();

  // land registry setup
  console.log("6.7");
  txn = await landRegistry.setEstateRegistry(estateRegistry.address);
  await txn.wait();
  console.log("6.8");
  txn = await landRegistry.authorizeDeploy(owner.address);
  await txn.wait();

  // console.log("6.9");
  // for (let index = 0; index < 6; index++) {
  //   console.log("6.9.1");
  //   await landRegistry.assignNewParcel(0, index, team.Robert);
  //   console.log("6.9.2");
  //   await landRegistry.assignNewParcel(1, index, team.Moughite);
  //   console.log("6.9.3");
  //   await landRegistry.assignNewParcel(2, index, team.Amine);
  // }

  // register balances
  // console.log("6.10");
  // await estateRegistry.registerBalance();
  // console.log("6.11");
  // await landRegistry.registerBalance();
}

async function saveAddresses() {
  console.log("SAVING ADDRESSES NOW...");
  const fs = require("fs");

  const addresses = {
    Deployer: owner.address,
    MiniMeTokenFactory: miniMeTokenFactory.address,
    LandMiniMeToken: landMiniMeToken.address,
    EStateMiniMeToken: estateMiniMeToken.address,
    EStateRegistry: estateRegistry.address,
    LandRegistry: landRegistry.address,
  };
  fs.writeFile("./addresses.json", JSON.stringify(addresses), function (err) {
    if (err) {
      console.log(err);
    }
  });
}

async function main() {

  console.log("1");
  [owner] = await ethers.getSigners();

  console.log(`Deployer address : ${owner.address}`);

  // console.log("2");
  // proxyAdmin = await upgrades.admin.getInstance();

  console.log("3");
  await initializeMiniMeTokens();

  console.log("4");
  await initializeLandRegistry();

  console.log("5");
  await initializeEStateRegistry();

  console.log("6");
  await setupContracts();
}

main()
  .then(() => saveAddresses())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
