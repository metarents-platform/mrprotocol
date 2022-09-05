require("dotenv").config();

// eslint-disable-next-line node/no-extraneous-require
require("@openzeppelin/hardhat-upgrades");
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
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 20,
          },
        },
      },
      {
        version: "0.4.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 20,
          },
        },
      },
    ],
  },
  // defaultNetwork: "rinkeby",
  defaultNetwork: "local",
  networks: {
    hardhat: {
      forking: {
        id: 420,
        url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}` || "",
      },
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
    },
    local: {
      url: "http://127.0.0.1:8545",
      allowUnlimitedContractSize: true,
      // accounts: {
      //   mnemonic: process.env.MNEMONIC,
      // },
    },

    ethereum: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}` || "",
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}` || "",
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}` || "",
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}` || "",
      accounts: {
        mnemonic: process.env.MNEMONIC,
      },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    // apiKey: process.env.BSCSCAN_API_KEY,
    // apiKey: process.env.SHOWTRACE_API_KEY
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    scripts: "./scripts",
  },
  chai: {
    enableTimeouts: false,
    timeout: 200000,
    before_timeout: 120000, // Here is 2min but can be whatever timeout is suitable for you.
  },
  mocha: {
    enableTimeouts: false,
    timeout: 200000,
    before_timeout: 120000, // Here is 2min but can be whatever timeout is suitable for you.
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
  },
};
