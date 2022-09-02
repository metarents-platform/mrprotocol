/* eslint-disable no-unused-expressions */
/* eslint-disable no-self-compare */
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/*
Module to approve a renter by supplying 'renter_address' and 'rent_duration' to RNFT Contract. RNFT contract maps the RNFT to its metadata

main invoked function(s):
  _approveAndPreMintRNFT()

inner function(s):
  RNFT::initializeRentMetadata()
  RNFT::preMintRNFT()
  approveRenterRequest()
  RNFT::approveRenter()

modifiers:
  onlyAdmin()

*/

/*
Call initializeRentMetadata() to set initial NFT metadata and check NFT status before final approval
  RNFT::initializeRentMetadata() :
  Input:
    address originalOwner
    address nftAddress (NFT contract address)
    uint256 oTokenId (original NFT token Id)
  Output:
    Return value: RTokenId (should !=0)
    _rmetadata[RTokenId].originalOwner == originalOwner (input)

Generate a new RNFTtokenId for minting
  RNFT::preMintRNFT() :
  Input:
    no arguments
  Output:
    A new RTokenId is generated (first time should be 1)
    _RtokenIds.current() == RTokenId
    Return value: RTokenId

  supply NFT metadata to map it to its owner
  approveRenterRequest() :
  Input:
    address _renterAddress
    address nftAddress 
    uint256 oNftId (original NFT token Id)
    uint256 rentDuration
    uint256 _rNftId
  Output:
    Return value: _RNFT_tokenId


create RNFT metadata, and approve renter
  RNFT::approveRenter() :
  Input:
    uint256 timeUnitSec (seconds)
    uint256 rentDuration (seconds)
    uint256 timeUnitPrice (seconds)
    address approvedRenter
    uint256 _RTokenId (previously preminted)

  Output:
    Check the rmetadata mapping approval state values:
    _rmetadata[_RTokenId].isRented = false;
    _rmetadata[_RTokenId].rentPrice = SafeCastUpgradeable.touint256(rentingPrice);
    _rmetadata[_RTokenId].approvedRentPeriod =    SafeCastUpgradeable.touint256(approvedRentPeriod);
    _rmetadata[_RTokenId].approvedRenter = approvedRenter;
    -----------------------------------
    Return value: _RTokenId
*/

describe("Module to approve a renter by supplying 'renter_address' and 'rent_duration' to RNFT Contract. RNFT contract maps the RNFT to its metadata", async () => {
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
  const ETH_ADDRESS = ethers.utils.hexZeroPad("0x01", 20); // zero address for ETH

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

  describe("RNFT/approveRenter : create RNFT metadata, and approve renter", async () => {
    it("Should revert with message 'Restricted to admins' when annonymous accounts call", async () => {
      await expect(
        rNFT
          .connect(other)
          .approveRenter(ONE_MONTH, MAX_DURATION, 1e15, renter.address, 1)
      ).to.be.revertedWith("Restricted to admins");
    });

    it("Should update metadata emitting the event 'Renter_Approved' when the admin calls", async () => {
      await expect(
        rNFT.approveRenter(
          ONE_MONTH,
          MAX_DURATION * ONE_MONTH,
          RENT_PRICE_PER_TIMEUNIT,
          renter.address,
          1
        )
      )
        .to.emit(rNFT, "Renter_Approved")
        .withArgs(
          1,
          renter.address,
          MAX_DURATION * ONE_MONTH,
          MAX_DURATION * RENT_PRICE_PER_TIMEUNIT,
          false
        );
    });
  });

  describe("RNFT/initializeRentMetadata, RNFT/preMintNFT : set initial NFT metadata and check NFT status before final approval", async () => {
    it("Should revert with message 'Not the NFT owner' when an annonymous account calls", async () => {
      await expect(
        rNFT.initializeRentMetadata(other.address, NFT_ADDRESS, ORIGINAL_NFT_ID)
      ).to.be.revertedWith("Not the NFT owner");
    });
    it("Should revert with message 'Contract not approved to operate NFT' if not approved though the owner calls", async () => {
      await expect(
        rNFT.initializeRentMetadata(owner.address, NFT_ADDRESS, ORIGINAL_NFT_ID)
      ).to.be.revertedWith("Contract not approved to operate NFT");
    });
    it("Should generate metadata emitting the event 'Metadata_Generated'", async () => {
      // Get Original NFT contract
      const LandRegistry = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await LandRegistry.approve(rNFT.address, ORIGINAL_NFT_ID);

      await expect(
        rNFT.initializeRentMetadata(owner.address, NFT_ADDRESS, ORIGINAL_NFT_ID)
      )
        .to.emit(rNFT, "Metadata_Generated")
        .withArgs(owner.address, "1");
    });
  });

  // this is now internal function
  // describe("Gateway/_approveRenterRequest : supply NFT metadata to map it to its owner", async () => {
  //   it("Should revert with message 'not listed for lending yet' when the owner has not listed for lending yet", async () => {
  //     await expect(
  //       gateway._approveRenterRequest(
  //         renter.address,
  //         NFT_ADDRESS,
  //         ORIGINAL_NFT_ID,
  //         MAX_DURATION * ONE_MONTH,
  //         1
  //       )
  //     ).to.be.revertedWith("not listed for lending yet");
  //   });
  //   it("Should revert with message 'Invalid rent duration: not seconds' when rentDuration is not times of rentTimeUnit", async () => {
  //     // first of all, needs to list for lending
  //     await gateway.createLendRecord(
  //       NFT_ADDRESS,
  //       ORIGINAL_NFT_ID,
  //       MAX_DURATION * ONE_MONTH,
  //       MIN_DURATION * ONE_MONTH,
  //       ONE_MONTH,
  //       RENT_PRICE_PER_TIMEUNIT,
  //       ETH_ADDRESS
  //     );
  //     // check
  //     await expect(
  //       gateway._approveRenterRequest(
  //         renter.address,
  //         NFT_ADDRESS,
  //         ORIGINAL_NFT_ID,
  //         MAX_DURATION * ONE_MONTH + 1, // rentDuration is not times of rentTimeUnit
  //         1
  //       )
  //     ).to.be.revertedWith("Invalid rent duration: not seconds");
  //   });
  //   it("Should revert with message 'Restricted to admins' before the Gateway contract is the admin of RNFT contract", async () => {
  //     // first of all, needs to list for lending
  //     await gateway.createLendRecord(
  //       NFT_ADDRESS,
  //       ORIGINAL_NFT_ID,
  //       MAX_DURATION * ONE_MONTH,
  //       MIN_DURATION * ONE_MONTH,
  //       ONE_MONTH,
  //       RENT_PRICE_PER_TIMEUNIT,
  //       ETH_ADDRESS
  //     );
  //     // check
  //     await expect(
  //       gateway._approveRenterRequest(
  //         renter.address,
  //         NFT_ADDRESS,
  //         ORIGINAL_NFT_ID,
  //         MAX_DURATION * ONE_MONTH, // rentDuration < minDuration
  //         1
  //       )
  //     ).to.be.revertedWith("Restricted to admins");
  //   });
  //   it("Should emit the event 'Renter_Request_Approved' once approved the request successfuly", async () => {
  //     // first of all, needs to list for lending
  //     await gateway.createLendRecord(
  //       NFT_ADDRESS,
  //       ORIGINAL_NFT_ID,
  //       MAX_DURATION * ONE_MONTH,
  //       MIN_DURATION * ONE_MONTH,
  //       ONE_MONTH,
  //       RENT_PRICE_PER_TIMEUNIT,
  //       ETH_ADDRESS
  //     );
  //     // set Gateway as the admin of RNFT
  //     await rNFT._setNewAdmin(gateway.address);
  //     // check
  //     await expect(
  //       gateway._approveRenterRequest(
  //         renter.address,
  //         NFT_ADDRESS,
  //         ORIGINAL_NFT_ID,
  //         MAX_DURATION * ONE_MONTH,
  //         1
  //       )
  //     )
  //       .to.emit(gateway, "Renter_Request_Approved")
  //       .withArgs(
  //         owner.address,
  //         NFT_ADDRESS,
  //         ORIGINAL_NFT_ID,
  //         1,
  //         renter.address,
  //         MAX_DURATION * ONE_MONTH,
  //         RENT_PRICE_PER_TIMEUNIT
  //       );
  //   });
  // });

  describe("Gateway/approveAndPreMintRNFT : Approve the renter and generate a new RNFT", () => {
    it("Should be reverted with message 'Invalid renter address: zero address' when a zero address", async () => {
      // no private key for zero address - no body can sign the txn with zero address
      expect(0 === 0).to.be.true;
    });

    it("Should be reverted with message 'unauthorized: address is not owner or lending not registered' when an annonymous account requests", async () => {
      await expect(
        gateway
          .connect(other)
          .approveAndPreMintRNFT(
            NFT_ADDRESS,
            ORIGINAL_NFT_ID,
            MIN_DURATION * ONE_MONTH,
            renter.address
          )
      ).to.be.revertedWith(
        "unauthorized: address is not owner or lending not registered"
      );
    });

    it("Should be reverted with message 'unauthorized: address is not owner or lending not registered' when NFT is not listed for Lending", async () => {
      await expect(
        gateway.approveAndPreMintRNFT(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MIN_DURATION * ONE_MONTH,
          renter.address
        )
      ).to.be.revertedWith(
        "unauthorized: address is not owner or lending not registered"
      );
    });

    it("Should be reverted with message 'Lender cannot be a renter' when the lender requests renting", async () => {
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

      // when the lender tries to approve ...
      await expect(
        gateway.approveAndPreMintRNFT(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MIN_DURATION * ONE_MONTH,
          owner.address
        )
      ).to.be.revertedWith("Lender cannot be a renter");
    });
    it("Should emit the event 'RenterApproved_And_RNFTPreMinted' once request approved successfuly", async () => {
      // Get Original NFT contract
      const LandRegistry = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await LandRegistry.approve(rNFT.address, ORIGINAL_NFT_ID);
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
      // check
      await expect(
        gateway.approveAndPreMintRNFT(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MAX_DURATION * ONE_MONTH,
          renter.address
        )
      )
        .to.emit(gateway, "RenterApproved_And_RNFTPreMinted")
        .withArgs(
          owner.address,
          renter.address,
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          1, // first RNFT
          MAX_DURATION * ONE_MONTH
        );
    });
  });
});
