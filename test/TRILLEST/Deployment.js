const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Test on deployment of Gateway & RNFT on the blockchain", async () => {
  let Gateway, gateway;
  let RNFT, rNFT;
  let owner, hacker, treasury, addrs;

  beforeEach(async () => {
    [owner, hacker, treasury, ...addrs] = await ethers.getSigners();

    RNFT = await ethers.getContractFactory("RNFT");
    rNFT = await upgrades.deployProxy(RNFT);
    await rNFT.deployed();

    Gateway = await ethers.getContractFactory("Gateway");
    gateway = await upgrades.deployProxy(
      Gateway,
      [rNFT.address, treasury.address],
      { initializer: "initialize" }
    );
    await gateway.deployed();
  });

  describe("Deployment of Gateway", function () {
    it("The deployer should have the admin role, others not yet", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.utils.hexZeroPad("0x00", 32);
      expect(await gateway.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(
        true
      );
    });

    it("Other accounts are not admins yet", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.utils.hexZeroPad("0x00", 32);
      expect(
        await gateway.hasRole(DEFAULT_ADMIN_ROLE, hacker.address)
      ).to.equal(false);
    });

    it("USDC should be listed as the supported token", async () => {
      const USDC_ADDRESS = "0xeb8f08a975Ab53E34D8a0330E0D34de942C95926"; // rinkeby
      expect(await gateway.isSupportedPaymentToken(USDC_ADDRESS)).to.equal(
        true
      );
    });

    it("ETH should be listed as the supported token", async () => {
      const ETH_ADDRESS = ethers.utils.hexZeroPad("0x00", 20); // zero address for ETH
      expect(await gateway.isSupportedPaymentToken(ETH_ADDRESS)).to.equal(true);
    });

    it("Other tokens beyod MANA should not be listed as the supported token", async () => {
      const RAND_TOKEN_ADDRESS = "0x311fDA80a91f7773afaC2D0b776eC2676d02185E"; // TRILL ERC20 token
      expect(
        await gateway.isSupportedPaymentToken(RAND_TOKEN_ADDRESS)
      ).to.equal(false);
    });
  });
});
