/* eslint-disable no-unused-expressions */
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Description
 * READ/DELETE lending metadata from Market Gateway contract

main invoked function(s):
  getLending()
  removeLending()

 */

/**
  * State variable CRUD:
getLending() :
  Input:
    address nftAddress
    uint256 nftId
  Output:
    Returns lending metadata: lendRegistry[nftAddress].lendingMap[nftId]
    Return value: Lending memory lendingData

removeLending() :
  Input:
    address nftAddress
    uint256 nftId
  Output:
    Delete lending metadata: lendRegistry[nftAddress].lendingMap[nftId]
    Return value: N/A
  */

const compareTwoObjects = (obj1, obj2) => {
  if (!obj1 && !obj2) return true;
  if (!obj1) return false;
  if (!obj2) return false;

  const key1 = Object.keys(obj1).filter(
    (key) => parseInt(key).toString() !== key
  );
  const key2 = Object.keys(obj2).filter(
    (key) => parseInt(key).toString() !== key
  );

  if (key1.length !== key2.length) return false;
  for (let i = 0; i < key1.length; i++) {
    const k1 = key1[i];
    const k2 = key2[i];
    if (k1 !== k2) return false;
    // if (obj1[k1].toString() !== obj2[k2].toString()) return false;
    if (parseInt(obj1[k1], 16) !== parseInt(obj2[k2], 16)) return false;
  }
  return true;
};

describe("READ/DELETE lending metadata from Market Gateway contract", async () => {
  let Gateway, gateway;
  let RNFT, rNFT;
  let owner, other;

  const NFT_ADDRESS = "0xC1436f5788eAeE05B9523A2051117992cF6e22d8"; // LANDRegistry
  const NFT_NAME = "contracts/DCL/LANDRegistry.sol:LANDRegistry";
  const ORIGINAL_NFT_ID = 64;
  const MAX_DURATION = 3;
  const MIN_DURATION = 1;
  const ONE_MONTH = 2628000; // MONTH_IN_SECONDS
  const RENT_PRICE_PER_TIMEUNIT = 500;
  const ETH_ADDRESS = ethers.utils.hexZeroPad("0x01", 20); // zero address for ETH

  /** Test with Smol Runners => https://testnets.opensea.io/collection/smolrunners */

  beforeEach(async () => {
    // deploy both Gateway & RNFT SCs

    [owner, other] = await ethers.getSigners();

    RNFT = await ethers.getContractFactory("RNFT");
    rNFT = await upgrades.deployProxy(RNFT);
    await rNFT.deployed();

    Gateway = await ethers.getContractFactory("Gateway");
    gateway = await upgrades.deployProxy(Gateway, [rNFT.address], {
      initializer: "initialize",
    });
    await gateway.deployed();

    // Get Original NFT contract
    const landRegistry = await ethers.getContractAt(
      NFT_NAME,
      NFT_ADDRESS,
      owner
    );
    // Approve the RNFT contract to operate NFTs
    await landRegistry.approve(rNFT.address, ORIGINAL_NFT_ID);
    // Approve Gateway for all (required to call `setUpdateManager`)
    await landRegistry.setApprovalForAll(gateway.address, true);
  });

  describe("READ lending metadata from Market Gateway contract", () => {
    it("Should return an empty lending data if the NFT is not listed for Lending yet", async () => {
      const returnValue = await gateway.getLending(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID
      );
      const emptyLending = {
        lender: "0x0000000000000000000000000000000000000000",
        nftId: 0,
        nftAddress: "0x0000000000000000000000000000000000000000",
        maxDuration: 0,
        minDuration: 0,
        timeUnit: 0,
        rentPricePerTimeUnit: 0,
        acceptedPaymentMethod: 0,
      };
      // eslint-disable-next-line no-unused-expressions
      expect(compareTwoObjects(returnValue, emptyLending)).to.be.true;
    });

    it("Should return the lending metadata if the owner asks", async () => {
      await gateway.createLendRecord(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        MIN_DURATION * ONE_MONTH,
        ONE_MONTH,
        RENT_PRICE_PER_TIMEUNIT,
        ETH_ADDRESS
      );

      const returnValue = await gateway.getLending(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID
      );

      const expectedValue = {
        lender: owner.address,
        nftId: ORIGINAL_NFT_ID,
        nftAddress: NFT_ADDRESS,
        maxDuration: MAX_DURATION * ONE_MONTH,
        minDuration: MIN_DURATION * ONE_MONTH,
        timeUnit: ONE_MONTH,
        rentPricePerTimeUnit: RENT_PRICE_PER_TIMEUNIT,
        acceptedPaymentMethod: ETH_ADDRESS,
      };
      expect(compareTwoObjects(returnValue, expectedValue)).to.be.true;
    });

    it("Should return the lending metadata though others ask", async () => {
      await gateway.createLendRecord(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        MIN_DURATION * ONE_MONTH,
        ONE_MONTH,
        RENT_PRICE_PER_TIMEUNIT,
        ETH_ADDRESS
      );

      const returnValue = await gateway
        .connect(other)
        .getLending(NFT_ADDRESS, ORIGINAL_NFT_ID);

      const expectedValue = {
        lender: owner.address,
        nftId: ORIGINAL_NFT_ID,
        nftAddress: NFT_ADDRESS,
        maxDuration: MAX_DURATION * ONE_MONTH,
        minDuration: MIN_DURATION * ONE_MONTH,
        timeUnit: ONE_MONTH,
        rentPricePerTimeUnit: RENT_PRICE_PER_TIMEUNIT,
        acceptedPaymentMethod: ETH_ADDRESS,
      };
      // eslint-disable-next-line no-unused-expressions
      expect(compareTwoObjects(returnValue, expectedValue)).to.be.true;
    });
  });

  describe("Remove lending metadata from Market Gateway contract", () => {
    it("Should be reverted with message 'unauthorized: address is not owner or lending not registered' if the NFT is not listed for Lending yet", async () => {
      await expect(
        gateway.removeLending(NFT_ADDRESS, ORIGINAL_NFT_ID)
      ).to.be.revertedWith(
        "unauthorized: address is not owner or lending not registered"
      );
    });

    it("Should be reverted with message 'unauthorized: address is not owner or lending not registered' if others try to remove", async () => {
      await gateway.createLendRecord(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        MIN_DURATION * ONE_MONTH,
        ONE_MONTH,
        RENT_PRICE_PER_TIMEUNIT,
        ETH_ADDRESS
      );

      await expect(
        gateway.connect(other).removeLending(NFT_ADDRESS, ORIGINAL_NFT_ID)
      ).to.be.revertedWith(
        "unauthorized: address is not owner or lending not registered"
      );
    });

    it("Should emit the event 'NFT_Lending_Removed' if the owner/lender tries to remove", async () => {
      await gateway.createLendRecord(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        MIN_DURATION * ONE_MONTH,
        ONE_MONTH,
        RENT_PRICE_PER_TIMEUNIT,
        ETH_ADDRESS
      );

      await expect(gateway.removeLending(NFT_ADDRESS, ORIGINAL_NFT_ID))
        .to.emit(gateway, "NFT_Lending_Removed")
        .withArgs(owner.address, NFT_ADDRESS, ORIGINAL_NFT_ID);
    });

    it("Should return undefined/empty lending data after removal", async () => {
      await gateway.createLendRecord(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        MIN_DURATION * ONE_MONTH,
        ONE_MONTH,
        RENT_PRICE_PER_TIMEUNIT,
        ETH_ADDRESS
      );
      await gateway.removeLending(NFT_ADDRESS, ORIGINAL_NFT_ID);

      const returnValue = await gateway.getLending(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID
      );
      const emptyLending = {
        lender: "0x0000000000000000000000000000000000000000",
        nftId: 0,
        nftAddress: "0x0000000000000000000000000000000000000000",
        maxDuration: 0,
        minDuration: 0,
        timeUnit: 0,
        rentPricePerTimeUnit: 0,
        acceptedPaymentMethod: 0,
      };
      // eslint-disable-next-line no-unused-expressions
      expect(compareTwoObjects(returnValue, emptyLending)).to.be.true;
    });
  });
});
