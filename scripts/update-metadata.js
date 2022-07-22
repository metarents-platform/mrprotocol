const { ethers } = require("hardhat");

const team = {
  Robert: "0x237906fd2884235ed0F32DfE84cc89A97bB76249",
  Moughite: "0x5ca6Ff0784fcd11f2BA64B89f08404De56E8B2Fa",
  Amine: "0xFe42e5800276f7dF36140E996aF5C6Da363b0923",
};

const addresses = {
  LandRegistry: "0xDDf5C5Ff1f0A6404D2F96f1b0466d51EE96A807D", // "0x944599a5AB0eEf518c1Bc7894a37B4B9C50069aC"
  // EstateRegistry: "0x55c4849B9485C7927Dd62a6E36069F6D8D2d0e48",
  MiniMeTokenFactory: "0x48f0E7274d92DFF436C8bba7a320DB08841b7825",
  LandMiniMeToken: "0xD5aDF0D595D030176B6331efD1E8599b7A804861",
  // EStateMiniMeToken: "0x28B17EB32B79Cdb35fD49Ee790C6Cb0cf2C55b9b",
};

const main = async () => {
  const LandRegistry = await ethers.getContractFactory(
    "contracts/DCL/LANDRegistry.sol:LANDRegistry"
  );
  const landRegistry = await LandRegistry.attach(addresses.LandRegistry);
//   const gas = await landRegistry.estimateGas.updateManyLandData(
//     [1, 1, 1],
//     [0, 1, 2],
//     '"Test DCL LANDs", "Here description goes..."'
//   );
//   console.log(`Estimated Gas: ${gas}`);
  const txn = await landRegistry.updateManyLandData(
    [1, 1, 1],
    [0, 1, 2],
    '"Test DCL LANDs", "Here description goes..."'
    //, {
    //   gasLimit: gas,
    // }
  );
  console.log(txn);
  await txn.wait();
};

main();
