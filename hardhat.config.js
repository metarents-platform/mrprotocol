require("dotenv").config();

require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.10",
  // defaultNetwork: "rinkeby",
  defaultNetwork: "local",
  networks: {
    // hardhat: {
    //   forking: {
    //     url: "https://eth-mainnet.alchemyapi.io/v2/4Nu360lG-eoGjVS3kzRAGHVtGScbOYVv",
    //   }
    // },
    
    local: {
      url: "http://127.0.0.1:8545",
    },

    ethereum: {
      url: process.env.ETHEREUM_URL || "",
      accounts: [process.env.PRIVATE_KEY],
    },
    ropsten: {
      url: process.env.ROPSTEN_URL || "",
      accounts: [process.env.PRIVATE_KEY],
    },
    rinkeby: {
      url: process.env.RINKEBY_URL || "",
      accounts: [process.env.PRIVATE_KEY],
    },
    goerli: {
      url: process.env.GOERLI_URL || "",
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
    // apiKey: process.env.BSCSCAN_API_KEY,
    // apiKey: process.env.SHOWTRACE_API_KEY
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  chai: {
    enableTimeouts: false,
    timeout: 200000,
    before_timeout: 120000 // Here is 2min but can be whatever timeout is suitable for you.
  },
  mocha: {
    enableTimeouts: false,
    timeout: 200000,
    before_timeout: 120000 // Here is 2min but can be whatever timeout is suitable for you.
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true
  },
};
