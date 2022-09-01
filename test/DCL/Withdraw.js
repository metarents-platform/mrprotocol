const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Description
 * Terminate rent agreement 

withdrawRentFund
claimProtocolFee

 */

describe("Claim fee for renting / protocol", async () => {
  const NFT_ADDRESS = "0xC1436f5788eAeE05B9523A2051117992cF6e22d8"; // LANDRegistry
  const NFT_NAME = "contracts/DCL/LANDRegistry.sol:LANDRegistry";
  const ORIGINAL_NFT_ID = 64;
  const MAX_DURATION_IN_MONTHS = 3;
  const MIN_DURATION_IN_MONTHS = 1;
  const MAX_DURATION_IN_DAYS = 50;
  const MIN_DURATION_IN_DAYS = 60;
  const ONE_MONTH_IN_SECONDS = 2628000; // MONTH_IN_SECONDS
  const ONE_DAY_IN_SECONDS = 86400; // DAY_IN_SECONDS
  const RENT_PRICE_PER_TIMEUNIT_ETH = ethers.utils.parseEther("0.001");
  const RENT_PRICE_PER_TIMEUNIT_TRILL = ethers.utils.parseUnits("100", 9);
  const ETH_ADDRESS = ethers.utils.hexZeroPad("0x01", 20);
  const TRILL_ADDRESS = "0x311fDA80a91f7773afaC2D0b776eC2676d02185E";
  const TRILL_NAME = "TrillestERC20Token";
  const TREASURY_ADDRESS = "0xa7E67CD92c83Ab73638F2F7Da600685b2152597C";

  let Gateway, gateway;
  let RNFT, rNFT;
  let owner, other, renter;

  const test = async (
    LENDER,
    RENTER,
    NFT_ADDRESS,
    ORIGINAL_NFT_ID,
    MAX_DURATION,
    MIN_DURATION,
    TIME_UINT_IN_SECONDS,
    RENT_PRICE_PER_TIMEUNIT,
    PAYMENT_METHOD_ADDRESS
  ) => {
    // first of all, needs to list for lending
    await gateway
      .connect(LENDER)
      .createLendRecord(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * TIME_UINT_IN_SECONDS,
        MIN_DURATION * TIME_UINT_IN_SECONDS,
        TIME_UINT_IN_SECONDS,
        RENT_PRICE_PER_TIMEUNIT,
        PAYMENT_METHOD_ADDRESS
      );
    // approve & premint
    await gateway
      .connect(LENDER)
      .approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * TIME_UINT_IN_SECONDS,
        RENTER.address
      );
    // confirm payment
    await gateway
      .connect(RENTER)
      .confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID, {
        value: RENT_PRICE_PER_TIMEUNIT * MAX_DURATION,
      });

    // stimulate time
    await ethers.provider.send("evm_increaseTime", [
      MAX_DURATION * TIME_UINT_IN_SECONDS,
    ]);
    await ethers.provider.send("evm_mine");

    // terminate
    await gateway
      .connect(LENDER)
      .terminateRentAgreement(NFT_ADDRESS, ORIGINAL_NFT_ID);
    // redeem
    // console.log(`redeem`);
    // await gateway.connect(LENDER).redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
  };

  beforeEach(async () => {
    [owner, renter, other] = await ethers.getSigners();

    // deploy RNFT -> rNFT
    RNFT = await ethers.getContractFactory("RNFT");
    rNFT = await upgrades.deployProxy(RNFT);
    await rNFT.deployed();

    // deploy Gateway -> gateway
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
    // Set the RNFT contract as the manager
    await landRegistry.setUpdateManager(owner.address, rNFT.address, true);
    // set Gateway as the admin of RNFT
    await rNFT._setNewAdmin(gateway.address);
  });

  describe("ETH payment", () => {
    beforeEach(async () => {
      await test(
        owner,
        renter,
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION_IN_MONTHS,
        MIN_DURATION_IN_MONTHS,
        ONE_MONTH_IN_SECONDS,
        RENT_PRICE_PER_TIMEUNIT_ETH,
        ETH_ADDRESS
      );
    });
    it("should be reverted with message 'Funds for this lending are not claimed yet' if not withdrawn yet at the point of redeeming", async () => {
      await expect(
        gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID)
      ).to.be.revertedWith("Funds for this lending are not claimed yet");

      console.log(`withdrawing...`);
      await gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
      console.log(`redeeming...`);
      await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
    });
    // it("should withdraw appropriate amount", async () => {
    //   await expect(gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID))
    //     .to.emit(gateway, "Rent_Fee_Withdrawn")
    //     .withArgs(
    //       owner.address,
    //       NFT_ADDRESS,
    //       ORIGINAL_NFT_ID,
    //       ETH_ADDRESS,
    //       MAX_DURATION_IN_MONTHS * RENT_PRICE_PER_TIMEUNIT_ETH
    //     );
    //   console.log(`redeeming...`);
    //   await expect(gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID))
    //     .to.emit(gateway, "NFT_Lending_Removed")
    //     .withArgs(owner.address, NFT_ADDRESS, ORIGINAL_NFT_ID);
    // });
  });
});
