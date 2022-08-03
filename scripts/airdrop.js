const { base64 } = require("ethers/lib/utils");
const { ethers } = require("hardhat");
const Moralis = require("moralis/node");

const CONTRACTS = require('./addresses.json');

// const CONTRACTS = {
//   LandRegistry: "0x3124438F829214a12B2a5786DdE52B2718546887",
// };
const WHITELIST = [
  "0x237906fd2884235ed0F32DfE84cc89A97bB76249",
  "0x5ca6Ff0784fcd11f2BA64B89f08404De56E8B2Fa",
  "0xFe42e5800276f7dF36140E996aF5C6Da363b0923",
  "0x0d2D0b339E153bf89964166E2740F1Fc495c03eE",
];

const login = async () => {
  Moralis.initialize(process.env.MORALIS_APP_ID);
  Moralis.serverURL = process.env.MORALIS_SERVER_URL;
  Moralis.Web3.authenticate().then((user) =>
    console.log(`logged in : ${user}`)
  );
};

const airdrop = async (amount) => {
  const LandRegistry = await ethers.getContractFactory(
    "contracts/DCL/LANDRegistry.sol:LANDRegistry"
  );
  const landRegistry = await LandRegistry.attach(CONTRACTS.LandRegistry);
  WHITELIST.forEach(async (beneficiary, x) => {
    console.log(
      `Assigning ${amount} parcels to ${beneficiary} at index ${index}...`
    );
    const promises = Array(amount).map((value, y) => {
      // compose json
      const metadata = {
        "description": "Decentraland test NFT", 
        "image": base64.encode(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                                  <text x="20" y="40">${x}</text>,
                                  <text x="60" y="40">${y}</text>
                                </svg>`
                              ), 
        "name": "Decentraland (DCL) LAND",
        "attributes": [
          {
            "display_type": "number", 
            "trait_type": "X", 
            "value": x,
          },
          {
            "display_type": "number", 
            "trait_type": "Y", 
            "value": y,
          },
          {
            "display_type": "number", 
            "trait_type": "Distance to road", 
            "value": Math.sqrt(x * x + y * y),
          },
        ], 
      };
      // upload json to IPFS
      const file = new Moralis.File(`${x}_${y}.json`, { base64: btoa(JSON.stringify(metadata)) });
      await file.saveIPFS();
      console.log(file.ipfs());
      // mint
      const txn = await landRegistry.assignNewParcel(
        x,
        y,
        beneficiary,
        file.ipfs()
      );
      await txn.wait();
    })

    Promise.all(promises);
  });
};

login()
  .then(() => airdrop)
  .catch((err) => console.log(err));
