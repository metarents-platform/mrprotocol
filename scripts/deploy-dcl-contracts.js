const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("ethers");

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

let owner, user;

async function initializeMiniMeTokens() {
  let txn, res, event, value;

  console.log("31");
  const MiniMeTokenFactory = await ethers.getContractFactory(
    "MiniMeTokenFactory"
  );
  const MiniMeToken = await ethers.getContractFactory("MiniMeToken");

  console.log("32");
  miniMeTokenFactory = await MiniMeTokenFactory.deploy();

  console.log("33");
  await miniMeTokenFactory.deployed();

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

  console.log("44");
  // await landRegistry.initialize(0x00);

  console.log("45");
  await landRegistry.setLandBalanceToken(landMiniMeToken.address);
}

async function initializeEStateRegistry() {
  const EstateRegistry = await ethers.getContractFactory("EstateRegistry");
  estateRegistry = await upgrades.deployProxy(
    EstateRegistry,
    ["Estate", "EST", landRegistry.address],
    { initializer: "initialize" }
  );
  await estateRegistry.deployed();

  await estateRegistry.setEstateLandBalanceToken(estateMiniMeToken.address);
}

async function setupContracts() {
  // generate meme tokens
  // await landMiniMeToken.generateTokens(
  //   user.address,
  //   BigNumber.from("1000000000000000000")
  // );
  console.log("6.1");
  await landMiniMeToken.generateTokens(
    team.Robert,
    BigNumber.from("1000000000000000000")
  );
  console.log("6.2");
  await landMiniMeToken.generateTokens(
    team.Moughite,
    BigNumber.from("1000000000000000000")
  );
  console.log("6.3");
  await landMiniMeToken.generateTokens(
    team.Amine,
    BigNumber.from("1000000000000000000")
  );

  // await estateMiniMeToken.generateTokens(user.address, BigNumber.from("2"));
  console.log("6.4");
  await estateMiniMeToken.generateTokens(team.Robert, BigNumber.from("2"));
  console.log("6.5");
  await estateMiniMeToken.generateTokens(team.Moughite, BigNumber.from("2"));
  console.log("6.6");
  await estateMiniMeToken.generateTokens(team.Amine, BigNumber.from("2"));

  // land registry setup
  console.log("6.7");
  await landRegistry.setEstateRegistry(estateRegistry.address);
  console.log("6.8");
  await landRegistry.authorizeDeploy(owner.address);

  console.log("6.9");
  for (let index = 0; index < 6; index++) {
    console.log("6.9.1");
    await landRegistry.assignNewParcel(0, index, team.Robert);
    console.log("6.9.2");
    await landRegistry.assignNewParcel(1, index, team.Moughite);
    console.log("6.9.3");
    await landRegistry.assignNewParcel(2, index, team.Amine);
    // await landRegistry.assignMultipleParcels([0, 0, 0], [0, 1, 2], team.Robert);
    // // await landRegistry.authorizeDeploy(team.Moughite);
    // await landRegistry.assignMultipleParcels([1, 1, 1], [0, 1, 2], team.Moughite);
    // // await landRegistry.authorizeDeploy(team.Amine);
    // await landRegistry.assignMultipleParcels([2, 2, 2], [0, 1, 2], team.Amine);
  }

  // register balances
  // console.log("6.10");
  // await estateRegistry.registerBalance();
  // console.log("6.11");
  // await landRegistry.registerBalance();
}

async function main() {
  console.log("1");
  [owner, user] = await ethers.getSigners();

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

async function check() {
  const metadata = await landRegistry.landData(0, 1);
  console.log("\n\n\n\n", metadata, "\n\n\n\n");
}

main()
  .then(() => {
    console.log(`Deployer address : ${owner.address}`);
    console.log(`MiniMeTokenFactory address : ${miniMeTokenFactory.address}`);
    console.log(`LandMiniMeToken address : ${landMiniMeToken.address}`);
    console.log(`EStateMiniMeToken address : ${estateMiniMeToken.address}`);
    console.log(`EStateRegistry address : ${estateRegistry.address}`);
    console.log(`LandRegistry address : ${landRegistry.address}`);
  })
  .then(() => check())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
