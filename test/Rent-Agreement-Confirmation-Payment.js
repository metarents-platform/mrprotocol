/* eslint-disable no-unused-expressions */
/* eslint-disable no-self-compare */
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/*
Module to confirm rent booking requests & pay
*/

describe("Module to confirm rent booking requests & distribute payment", async () => {
  let Gateway, gateway;
  let RNFT, rNFT;
  let owner, other, treasury, renter, addrs;

  const NFT_ADDRESS = "0xF8764D543ae563A0B42761DCd31bE102603b722E"; // Smol Runners
  const NFT_NAME = "SmolRunners";
  const ORIGINAL_NFT_ID = 1;
  const MAX_DURATION = 3;
  const MIN_DURATION = 1;
  const ONE_MONTH = 2628000; // MONTH_IN_SECONDS
  const RENT_PRICE_PER_TIMEUNIT = 500;
  const ZERO_ADDRES = ethers.utils.hexZeroPad("0x00", 20); // zero address for ETH
  const ETH_ADDRESS = ZERO_ADDRES;

  /** Test with Smol Runners => https://testnets.opensea.io/collection/smolrunners */

  beforeEach(async () => {
    // deploy both Gateway & RNFT SCs

    [owner, other, treasury, renter, ...addrs] = await ethers.getSigners();

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

  describe("RNFT/getRentPrice : Return the total price for renting", async () => {
    it("Should return 0 unless the NFT is listed for lending", async () => {
      const rentPrice = await rNFT.getRentPrice(0);
      expect(rentPrice).to.equal(0);
    });
    it("Should return 0 until the rent is not approved (though the NFT is listed for lending)", async () => {
      await gateway.createLendRecord(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        MIN_DURATION * ONE_MONTH,
        ONE_MONTH,
        RENT_PRICE_PER_TIMEUNIT,
        ETH_ADDRESS
      );
      const rentPrice = await rNFT.getRentPrice(0);
      expect(rentPrice).to.equal(0);
    });
    it("Should return the rent price if the rent-request is approved", async () => {
      // first of all, needs to list for lending
      await gateway.createLendRecord(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        MIN_DURATION * ONE_MONTH,
        ONE_MONTH,
        RENT_PRICE_PER_TIMEUNIT,
        ETH_ADDRESS
      );
      // set Gateway as the admin of RNFT
      await rNFT._setNewAdmin(gateway.address);
      // get RTokenId
      const rTokenId = await rNFT.getRnftFromNft(
        NFT_ADDRESS,
        owner.address,
        ORIGINAL_NFT_ID
      );
      // approe rent request
      await gateway._approveRenterRequest(
        renter.address,
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        rTokenId
      );
      // check
      const rentPrice = await rNFT.getRentPrice(0);
      expect(rentPrice).to.equal(RENT_PRICE_PER_TIMEUNIT * MAX_DURATION);
    });
  });
});
