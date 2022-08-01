const { ethers } = require("hardhat");

const beneficiary = "0x0d2D0b339E153bf89964166E2740F1Fc495c03eE";

const addresses = {
  LandRegistry: "0x3124438F829214a12B2a5786DdE52B2718546887",
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
  const txn = await landRegistry.assignMultipleParcels(
    [4, 4, 4, 4, 4, 4],
    [0, 1, 2, 3, 4, 5],
    beneficiary
  );
  console.log(txn);
  await txn.wait();
};

main();
