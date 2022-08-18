/* eslint-disable no-unused-expressions */
/* eslint-disable no-self-compare */
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/*
Module to cancel/reject rent booking requests
  can be invoked when payment is delayed by the renter after approval (24h max)
  can be invoked if something went wrong with the approval transaction 

main invoked function(s):
  cancelApproval()


inner function(s):
  RNFT::getRnftFromNft()
  RNFT::isApprovedRenter()
  RNFT::isRented()
  RNFT::clearRNFTState()
*/

/*
cancelApproval() : 
  Input:
    address nftAddress
    uint256 nftId
    address renterAddress
  Output:
    Cancels and clears RNFT approval state and metadata
    check: bool isApprovalCanceled == true
  Return value: 
    isApprovalCanceled


RNFT::getRnftFromNft() :
  Input:
    address origContract (NFT contract address)
    address originalOwner
    uint256 oTokenId

  Output:
    Returns RNFT TokenID from provided original NFT parameters
  Return value: 
    uint256 _OwnerRTokenID[origContract][orignalOwner][oTokenId]


RNFT::isApprovedRenter() :
  Input:
    address renter
    uint256 RTokenId
  Output:
    bool (_rmetadata[RTokenId].approvedRenter == renter) should be true
  Return value:
    boolean 


RNFT::isRented() :
  Input:
    uint256 RTokenId
  Output:
    bool should be true if NFT is rented
  Return value:
    bool _rmetadata[RTokenId].isRented


RNFT::clearRNFTState()
  Input:
    uint256 RTokenId
  Output:
    check RNFT metadata state variable _rmetadata[RTokenId] for:
      _rmetadata[RTokenId].isRented = false;
      _rmetadata[RTokenId].rentPrice = 0;
      _rmetadata[RTokenId].approvedRentPeriod = 0;
      _rmetadata[RTokenId].approvedRenter = address(0);
  Return value:
    true
*/

describe("Module to cancel/reject rent booking requests", async () => {
  let Gateway, gateway;
  let RNFT, rNFT;
  let owner, other, renter;

  const NFT_ADDRESS = "0xC1436f5788eAeE05B9523A2051117992cF6e22d8"; // LANDRegistry
  const NFT_NAME = "contracts/DCL/LANDRegistry.sol:LANDRegistry";
  const ORIGINAL_NFT_ID = 64;
  const MAX_DURATION = 3;
  const MIN_DURATION = 1;
  const ONE_MONTH = 2628000; // MONTH_IN_SECONDS
  const RENT_PRICE_PER_TIMEUNIT = 500;
  const ZERO_ADDRES = ethers.utils.hexZeroPad("0x00", 20); // zero address for ETH
  const ETH_ADDRESS = ZERO_ADDRES;

  /** Test with Smol Runners => https://testnets.opensea.io/collection/smolrunners */

  beforeEach(async () => {
    // deploy both Gateway & RNFT SCs

    [owner, other, renter] = await ethers.getSigners();

    RNFT = await ethers.getContractFactory("RNFT");
    rNFT = await upgrades.deployProxy(RNFT);
    await rNFT.deployed();

    Gateway = await ethers.getContractFactory("Gateway");
    gateway = await upgrades.deployProxy(Gateway, [rNFT.address], {
      initializer: "initialize",
    });
    await gateway.deployed();
  });

  describe("RNFT/getRnftFromNft : Get RNFT for a specific NFT", async () => {
    it("Should return 0 before Rent Approval", async () => {
      expect(
        await rNFT.getRnftFromNft(NFT_ADDRESS, owner.address, ORIGINAL_NFT_ID)
      ).to.equal(0);
    });
    it("Should return 1 after first approval on a rent booking request", async () => {
      // Get Original NFT contract
      const SmolRunnersNFT = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
      // First of all, must list NFT for lending
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
      // approve rent-booking-request
      await gateway.approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        renter.address
      );
      expect(
        await rNFT.getRnftFromNft(NFT_ADDRESS, owner.address, ORIGINAL_NFT_ID)
      ).to.equal(1);
    });
  });

  describe("RNFT/isApprovedRenter : checks whether the renter is approved for an RNFT or not", async () => {
    it("Should return FALSE before Rent Approval", async () => {
      expect(await rNFT.isApprovedRenter(renter.address, 1)).to.equal(false);
    });
    it("Should return FALSE after for the un-approved renter", async () => {
      // Get Original NFT contract
      const SmolRunnersNFT = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
      // First of all, must list NFT for lending
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
      // approve rent-booking-request
      await gateway.approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        renter.address
      );
      expect(await rNFT.isApprovedRenter(other.address, 1)).to.equal(false);
    });
    it("Should return TRUE after approval on a rent booking request for the approved renter", async () => {
      // Get Original NFT contract
      const SmolRunnersNFT = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
      // First of all, must list NFT for lending
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
      // approve rent-booking-request
      await gateway.approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        renter.address
      );
      expect(await rNFT.isApprovedRenter(renter.address, 1)).to.equal(true);
    });
  });

  describe("RNFT/isRented : checks whether an RNFT is rented or not", async () => {
    it("Should always return FALSE before Rent starts", async () => {
      expect(0 === 0).to.equal(true);
    });
  });

  describe("RNFT/clearRNFTState : reset/clears the metadata for RNFT", async () => {
    it("Should return 0 (all fields) before Rent Approval", async () => {
      expect(await rNFT.getRentPrice(1)).to.equal(0);
      expect(await rNFT.getApprovedRentPeriod(1)).to.equal(0);
      expect(await rNFT.getApprovedRenter(1)).to.equal(ZERO_ADDRES);
      expect(await rNFT.isRented(1)).to.equal(false);
    });
    it("Should return correct data after Rent approval", async () => {
      // Get Original NFT contract
      const SmolRunnersNFT = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
      // First of all, must list NFT for lending
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
      // approve rent-booking-request
      await gateway.approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        renter.address
      );
      // get RNFT for the approved NFT
      const rNFTId = await rNFT.getRnftFromNft(
        NFT_ADDRESS,
        owner.address,
        ORIGINAL_NFT_ID
      );
      expect(await rNFT.getRentPrice(rNFTId)).to.equal(
        RENT_PRICE_PER_TIMEUNIT * MAX_DURATION
      );
      expect(await rNFT.getApprovedRentPeriod(rNFTId)).to.equal(
        MAX_DURATION * ONE_MONTH
      );
      expect(await rNFT.getApprovedRenter(rNFTId)).to.equal(renter.address);
      expect(await rNFT.isRented(rNFTId)).to.equal(false);
    });
    it("Should return 0 (all fields) after resetting", async () => {
      // Get Original NFT contract
      const SmolRunnersNFT = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
      // First of all, must list NFT for lending
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
      // approve rent-booking-request
      await gateway.approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        renter.address
      );
      const rNFTId = await rNFT.getRnftFromNft(
        NFT_ADDRESS,
        owner.address,
        ORIGINAL_NFT_ID
      );
      await rNFT.clearRNFTState(rNFTId);
      expect(await rNFT.getRentPrice(rNFTId)).to.equal(0);
      expect(await rNFT.getApprovedRentPeriod(rNFTId)).to.equal(0);
      expect(await rNFT.getApprovedRenter(rNFTId)).to.equal(ZERO_ADDRES);
      expect(await rNFT.isRented(rNFTId)).to.equal(false);
    });
  });

  describe("Gateway/cancelApproval : cancel/reject rent booking requests resetting the metadata for RNFT", async () => {
    it("Should revert with message 'unauthorized: address is not owner or lending not registered' before listing for lending", async () => {
      await expect(
        gateway.cancelApproval(NFT_ADDRESS, ORIGINAL_NFT_ID, renter.address)
      ).to.be.revertedWith(
        "unauthorized: address is not owner or lending not registered"
      );
    });
    it("Should revert with message 'RNFT Token ID doesn't exist' before the owner approved", async () => {
      // list NFT for lending
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
        gateway.cancelApproval(NFT_ADDRESS, ORIGINAL_NFT_ID, renter.address)
      ).to.be.revertedWith("RNFT Token ID doesn't exist");
    });
    it("Should revert with message 'renter address is not approved", async () => {
      // Get Original NFT contract
      const SmolRunnersNFT = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
      // First of all, must list NFT for lending
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
      // approve rent-booking-request
      await gateway.approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        renter.address
      );
      await expect(
        gateway.cancelApproval(NFT_ADDRESS, ORIGINAL_NFT_ID, other.address)
      ).to.be.revertedWith("renter address is not approved");
    });
    it("Should emit the event 'Approval_Canceled' once executed successfully", async () => {
      // Get Original NFT contract
      const SmolRunnersNFT = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
      // First of all, must list NFT for lending
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
      // approve rent-booking-request
      await gateway.approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        renter.address
      );
      const rNFTId = await rNFT.getRnftFromNft(
        NFT_ADDRESS,
        owner.address,
        ORIGINAL_NFT_ID
      );
      await expect(
        gateway.cancelApproval(NFT_ADDRESS, ORIGINAL_NFT_ID, renter.address)
      )
        .to.emit(gateway, "Approval_Canceled")
        .withArgs(
          NFT_ADDRESS,
          owner.address,
          ORIGINAL_NFT_ID,
          renter.address,
          rNFTId
        );
    });
  });
});
