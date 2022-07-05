const { ethers, upgrades } = require("hardhat");

let estateRegistry,
  landMiniMeToken,
  estateMiniMeToken,
  miniMeTokenFactory,
  landRegistry;

let owner, user, proxyAdmin;

async function initializeMiniMeTokens() {
  let txn, res;

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
  const event = res.events.find((event) => event.event === "TokenCreated");
  const [value] = event.args;
  landMiniMeToken = await MiniMeToken.attach(value);
  console.log(landMiniMeToken);

  console.log(`35`);
  estateMiniMeToken = await miniMeTokenFactory.createCloneToken(
    "0x0000000000000000000000000000000000000000",
    0,
    "Estate",
    18,
    "Estate",
    true
  );

  console.log("36");
  await landMiniMeToken.generateTokens(user.address, 1000000000000000000);
  await estateMiniMeToken.generateTokens(user.address, 2);
}

async function initializeLandRegistry() {
  const LandRegistry = await ethers.getContractFactory("LANDRegistry");
  landRegistry = await upgrades.deployProxy(LandRegistry, [""], {
    initializer: "initialize",
  });
  await landRegistry.deployed();

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
  await landRegistry.setEstateRegistry(estateRegistry.address);
  await landRegistry.authorizeDeploy(user.address);
  await landRegistry.assignMultipleParcels([0, 0, 0], [0, 1, 2], user.address);
}

async function main() {
  console.log("1");
  [owner, user] = await ethers.getSigners();

  console.log("2");
  proxyAdmin = await upgrades.admin.getInstance();

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
  .then(() => {
    console.log(`Deployer address : ${owner.address}`);
    console.log(`ProxyAdmin address : ${proxyAdmin.address}`);
    console.log(`MiniMeTokenFactory address : ${miniMeTokenFactory.address}`);
    console.log(`LandMiniMeToken address : ${landMiniMeToken.address}`);
    console.log(`EStateMiniMeToken address : ${estateMiniMeToken.address}`);
    console.log(`LandRegistry address : ${landMiniMeToken.address}`);
    console.log(`EStateRegistry address : ${estateRegistry.address}`);
    console.log(`LandRegistry address : ${landRegistry.address}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
