const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

// Deployer address : 0x237906fd2884235ed0F32DfE84cc89A97bB76249
// MiniMeTokenFactory address : 0x7E816b1B15b31b2584be3aE4481e86a013AB471F
// LandMiniMeToken address : 0xBC97367F579F60a495a016435D6B540792b00966
// EStateMiniMeToken address : 0xF600e2A3cCc21731181409122896B09597672636
// EStateRegistry address : 0x67930269eC4f51DD118b5998Ee338bC11B515d95
// LandRegistry address : 0x473279aBbc630d2Cc0b7d5019A1E5f3Ee139755E

/**
 * Description
 * Add a new lending to list the NFT in the marketplace and store lending metadata

main invoked function(s):
    createLendRecord()
inner function(s):
    isSupportedPaymentToken()
modifiers: 
    _onlyApprovedOrOwner()

 */

/**
  * State variable CRUD:
_lendRecord: lendRegistry[nftAddress].lendingMap[original_nftId];

Input:
   address nftAddress (ERC721 NFT Land address),
   uint256 original_nftId,
   uint256 maxDuration,
   uint256 minDuration,
   uint256 timeUnit,
   uint256 _rentPricePerTimeUnit,
   address _paymentMethoRNFT::preMintRNFT()d ( isSupportedPaymentToken() == true ) 

Output:
New lending created:

Modifier checks if msg.sender == NFT owner by calling the ERC721 ownerOf()
Check if lending metadata are stored in _lendRecord :
Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[original_nftId];
        _lendRecord.lender = owner;
        _lendRecord.nftAddress = nftAddress;
        _lendRecord.NftId = original_nftId;
        _lendRecord.maxDuration = maxDuration;
        _lendRecord.minDuration = minDuration;
        _lendRecord.timeUnit = timeUnit;
        _lendRecord.rentPricePerTimeUnit = _rentPricePerTimeUnit;
        _lendRecord.acceptedPaymentMethod = _paymentMethod
  */

describe("Add a new lending to list the NFT in the marketplace and store lending metadata", async () => {
  let Gateway, gateway;
  let RNFT, rNFT;
  let owner, other;

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
  });

  describe("Listing should be added to the registry!", () => {
    const NFT_ADDRESS = "0xC1436f5788eAeE05B9523A2051117992cF6e22d8"; // LANDRegistry
    const NFT_NAME = "contracts/DCL/LANDRegistry.sol:LANDRegistry";
    const ORIGINAL_NFT_ID = 64;  
    const MAX_DURATION = 3;
    const MIN_DURATION = 1;
    const ONE_MONTH = 2628000; // MONTH_IN_SECONDS
    const RENT_PRICE_PER_TIMEUNIT = 500;
    const ETH_ADDRESS = ethers.utils.hexZeroPad("0x01", 20); // zero address for ETH

    // it("Should be reverted with message 'Contract is not ERC721-compatible' unless the given contract is ERC721", async () => {
    //   await expect(
    //     gateway
    //       .connect(other) // sign the txn with another wallet
    //       .createLendRecord(
    //         ETH_ADDRESS,
    //         ORIGINAL_NFT_ID,
    //         MAX_DURATION * ONE_MONTH,
    //         MIN_DURATION * ONE_MONTH,
    //         ONE_MONTH,
    //         RENT_PRICE_PER_TIMEUNIT,
    //         ETH_ADDRESS
    //       )
    //   ).to.be.revertedWith("Contract is not ERC721-compatible");
    // });

    it("Should be reverted with message 'Only owner or operator is allowed' unless you're the owner/operator", async () => {
      await expect(
        gateway
          .connect(other) // sign the txn with another wallet
          .createLendRecord(
            NFT_ADDRESS,
            ORIGINAL_NFT_ID,
            MAX_DURATION * ONE_MONTH,
            MIN_DURATION * ONE_MONTH,
            ONE_MONTH,
            RENT_PRICE_PER_TIMEUNIT,
            ETH_ADDRESS
          )
      ).to.be.revertedWith("Only owner or operator is allowed");
    });

    it("Should be reverted with message 'invalid time unit' in case of wrong time-unit", async () => {
      await expect(
        gateway.createLendRecord(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MAX_DURATION * ONE_MONTH,
          MIN_DURATION * ONE_MONTH,
          ONE_MONTH + 1, // time-unit
          RENT_PRICE_PER_TIMEUNIT,
          ETH_ADDRESS
        )
      ).to.be.revertedWith("invalid time unit");
    });

    it("Should be reverted with message 'max or min duration should be > 0' in case any of min/max duration is not positive", async () => {
      await expect(
        gateway.createLendRecord(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          0, // max duration
          MIN_DURATION * ONE_MONTH,
          ONE_MONTH,
          RENT_PRICE_PER_TIMEUNIT,
          ETH_ADDRESS
        )
      ).to.be.revertedWith("max or min duration should be > 0");

      await expect(
        gateway.createLendRecord(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MAX_DURATION * ONE_MONTH,
          0, // min duration
          ONE_MONTH,
          RENT_PRICE_PER_TIMEUNIT,
          ETH_ADDRESS
        )
      ).to.be.revertedWith("max or min duration should be > 0");
    });

    it("Should be reverted with message 'invalid duration' in case min > max", async () => {
      await expect(
        gateway.createLendRecord(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MAX_DURATION * ONE_MONTH, // max duration
          MAX_DURATION * ONE_MONTH + 1, // min duration
          ONE_MONTH,
          RENT_PRICE_PER_TIMEUNIT,
          ETH_ADDRESS
        )
      ).to.be.revertedWith("invalid duration");
    });

    it("Should be reverted with message 'max rent duration exceeds allowed limit' if max duration exceeds 1 year", async () => {
      await expect(
        gateway.createLendRecord(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          13 * ONE_MONTH, // max duration ; limit is 1 year => 13 months is not allowed
          MIN_DURATION * ONE_MONTH,
          ONE_MONTH,
          RENT_PRICE_PER_TIMEUNIT,
          ETH_ADDRESS
        )
      ).to.be.revertedWith("max rent duration exceeds allowed limit");
    });

    it("Should be reverted with message 'duration must be in seconds; multiple of time units' if the token is not supported", async () => {
      await expect(
        gateway.createLendRecord(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MAX_DURATION * ONE_MONTH + 1,
          MIN_DURATION * ONE_MONTH,
          ONE_MONTH,
          RENT_PRICE_PER_TIMEUNIT,
          ETH_ADDRESS
        )
      ).to.be.revertedWith(
        "duration must be in seconds; multiple of time units"
      );

      await expect(
        gateway.createLendRecord(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MAX_DURATION * ONE_MONTH,
          MIN_DURATION * ONE_MONTH + 1,
          ONE_MONTH,
          RENT_PRICE_PER_TIMEUNIT,
          ETH_ADDRESS
        )
      ).to.be.revertedWith(
        "duration must be in seconds; multiple of time units"
      );
    });

    it("Should be reverted with message 'ERC20 Token not supported as payment method by market gateway' if the token is not supported", async () => {
      const LANDMiniMeToken = "0x576c4577aAd561EA79acbd49215a0cC1473BfCCA"; // rinkeby
      await expect(
        gateway.createLendRecord(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MAX_DURATION * ONE_MONTH,
          MIN_DURATION * ONE_MONTH,
          ONE_MONTH,
          RENT_PRICE_PER_TIMEUNIT,
          LANDMiniMeToken
        )
      ).to.be.revertedWith(
        "ERC20 Token not supported as payment method by market gateway"
      );
    });

    it("Should work fine with the event 'NFT_Listed' emitted", async () => {
      // Get Original NFT contract
      const landRegistry = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve RNFT for all (required to call `setUpdateManager`)
      await landRegistry.setApprovalForAll(rNFT.address, true);

      await expect(
        gateway.createLendRecord(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MAX_DURATION * ONE_MONTH,
          MIN_DURATION * ONE_MONTH,
          ONE_MONTH,
          RENT_PRICE_PER_TIMEUNIT,
          ETH_ADDRESS
        )
      )
        .to.emit(gateway, "NFT_Lending_Added")
        .withArgs(
          owner.address,
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MAX_DURATION * ONE_MONTH,
          MIN_DURATION * ONE_MONTH,
          ETH_ADDRESS
        );
    });
  });
});
