const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

// Deployer address : 0x237906fd2884235ed0F32DfE84cc89A97bB76249
// MiniMeTokenFactory address : 0x453EbE03f42A6F8cF74976a0FeFb1fd7120B42C7
// LandMiniMeToken address : 0xB764Ef9e5F3a6BA4e0010b8Ab5C774CA27FfEC65
// EStateMiniMeToken address : 0x28B17EB32B79Cdb35fD49Ee790C6Cb0cf2C55b9b
// EStateRegistry address : 0x55c4849B9485C7927Dd62a6E36069F6D8D2d0e48
// LandRegistry address : 0xFE5C5E0384a060dCC72F5A9ce18e599829c63aa0


describe("DCL contracts deployment", async () => {
  let Gateway, gateway;
  let RNFT, rNFT;
  let owner, user, treasury, addrs;

  beforeEach(async () => {
    [owner, user, treasury, ...addrs] = await ethers.getSigners();

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
