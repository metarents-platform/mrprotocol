const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Description
 * terminate rent and redeem original NFT (need to create a new lending to list the asset in the marketplace ++gas fees)

redeemNFT()
  terminateRentAgreement()
  _redeemNFT()

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

describe("Terminate rent agreement and reset lending metadata", async () => {
  const NFT_ADDRESS = "0xF8764D543ae563A0B42761DCd31bE102603b722E"; // Smol Runners
  const NFT_NAME = "SmolRunners";
  const ORIGINAL_NFT_ID = 1;
  const MAX_DURATION = 3;
  const MIN_DURATION = 1;
  const ONE_MONTH = 2628000; // MONTH_IN_SECONDS
  const RENT_PRICE_PER_TIMEUNIT_ETH = ethers.utils.parseEther("0.001");
  const ZERO_ADDRES = ethers.utils.hexZeroPad("0x00", 20); // zero address for ETH
  const ETH_ADDRESS = ZERO_ADDRES;

  let Gateway, gateway;
  let RNFT, rNFT;
  let owner, other, treasury, renter, addrs;
  let rTokenId;
  let SmolRunnersNFT;

  /** Test with Smol Runners => https://testnets.opensea.io/collection/smolrunners */

  beforeEach(async () => {
    [owner, other, treasury, renter, ...addrs] = await ethers.getSigners();

    // deploy RNFT -> rNFT
    RNFT = await ethers.getContractFactory("RNFT");
    rNFT = await upgrades.deployProxy(RNFT);
    await rNFT.deployed();

    // deploy Gateway -> gateway
    Gateway = await ethers.getContractFactory("Gateway");
    gateway = await upgrades.deployProxy(
      Gateway,
      [rNFT.address, treasury.address],
      { initializer: "initialize" }
    );
    await gateway.deployed();

    // set treasury
    await gateway.setMarketGatewayTreasury(treasury.address);

    // Get Original NFT contract
    SmolRunnersNFT = await ethers.getContractAt(NFT_NAME, NFT_ADDRESS, owner);
    // Approve the RNFT contract to operate NFTs
    await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
    // set Gateway as the admin of RNFT
    await rNFT._setNewAdmin(gateway.address);

    // first of all, needs to list for lending
    await gateway.createLendRecord(
      NFT_ADDRESS,
      ORIGINAL_NFT_ID,
      MAX_DURATION * ONE_MONTH,
      MIN_DURATION * ONE_MONTH,
      ONE_MONTH,
      RENT_PRICE_PER_TIMEUNIT_ETH,
      ETH_ADDRESS
    );
    // approve & premint
    await gateway.approveAndPreMintRNFT(
      NFT_ADDRESS,
      ORIGINAL_NFT_ID,
      MAX_DURATION * ONE_MONTH,
      renter.address
    );
    // get RTokenId
    rTokenId = await rNFT.getRnftFromNft(
      NFT_ADDRESS,
      owner.address,
      ORIGINAL_NFT_ID
    );
    // confirm payment
    await gateway
      .connect(renter)
      .confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID, {
        value: RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION,
      });
  });
  it("The NFT should be still owned by the RNFT before termination", async () => {
    const currentOwner = await SmolRunnersNFT.ownerOf(ORIGINAL_NFT_ID);
    expect(currentOwner).to.equal(rNFT.address);

    // stimulate time
    await ethers.provider.send("evm_increaseTime", [ONE_MONTH * MAX_DURATION]);
    await ethers.provider.send("evm_mine");
    // redeem for further test cases
    await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
  });
  describe("RNFT/_redeemNFT : Terminate rent agreement & burn RNFT", async () => {
    beforeEach(async () => {
      // stimulate time
      await ethers.provider.send("evm_increaseTime", [
        ONE_MONTH * MAX_DURATION,
      ]);
      await ethers.provider.send("evm_mine");
      // redeem
      await rNFT._redeemNFT(
        rTokenId,
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        owner.address
      );
    });
    it("The ownership of the NFT should be returned to the owner (from the RNFT)", async () => {
      const currentOwner = await SmolRunnersNFT.ownerOf(ORIGINAL_NFT_ID);
      expect(currentOwner).to.equal(owner.address);
    });
    it("Metadata for rTokenId should be reset", async () => {
      expect(
        await rNFT.getRnftFromNft(NFT_ADDRESS, owner.address, ORIGINAL_NFT_ID)
      ).to.equal(0);
    });
  });
  describe("Gateway/redeemNFT : redeems NFT from listing/lending & takes ownership back", async () => {
    it("Should revert with message 'unauthorized: address is not owner or lending not registered' when an annonymous accounts calls", async () => {
      await expect(
        gateway.connect(other).redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID)
      ).to.be.revertedWith(
        "unauthorized: address is not owner or lending not registered"
      );

      // stimulate time
      await ethers.provider.send("evm_increaseTime", [
        ONE_MONTH * MAX_DURATION,
      ]);
      await ethers.provider.send("evm_mine");
      // redeem
      await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
    });
    it("Should revert with message 'RNFT Token ID doesn't exist' for an pre-minted NFT", async () => {
      await gateway.createLendRecord(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID + 1,
        MAX_DURATION * ONE_MONTH,
        MIN_DURATION * ONE_MONTH,
        ONE_MONTH,
        RENT_PRICE_PER_TIMEUNIT_ETH,
        ETH_ADDRESS
      );

      await expect(
        gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID + 1)
      ).to.be.revertedWith("RNFT Token ID doesn't exist");

      // stimulate time
      await ethers.provider.send("evm_increaseTime", [
        ONE_MONTH * MAX_DURATION,
      ]);
      await ethers.provider.send("evm_mine");
      // redeem
      await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
      // remove lending
      await gateway.removeLending(NFT_ADDRESS, ORIGINAL_NFT_ID + 1);
    });
    it("Success : redeems NFT from listing", async () => {
      // stimulate time
      await ethers.provider.send("evm_increaseTime", [
        ONE_MONTH * MAX_DURATION,
      ]);
      await ethers.provider.send("evm_mine");
      // redeem
      await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
    });
  });
});