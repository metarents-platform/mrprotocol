const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Description
 * Terminate rent agreement 

withdrawRentFund
claimProtocolFee

 */

describe("Claim fee for renting / protocol", async () => {
  const NFT_ADDRESS = "0xD369c3DfD5EbF11e154F096649e131A8BfAb2f7e"; // LANDRegistry
  const NFT_NAME = "contracts/DCL/LANDRegistry.sol:LANDRegistry";
  const ORIGINAL_NFT_ID = 64;
  const MAX_DURATION_IN_MONTHS = 3;
  const MIN_DURATION_IN_MONTHS = 1;
  const MAX_DURATION_IN_DAYS = 70;
  const MIN_DURATION_IN_DAYS = 30;
  const ONE_MONTH_IN_SECONDS = 2628000; // MONTH_IN_SECONDS
  const ONE_DAY_IN_SECONDS = 86400; // DAY_IN_SECONDS
  const RENT_PRICE_PER_TIMEUNIT_ETH = ethers.utils.parseEther("0.001");
  const RENT_PRICE_PER_TIMEUNIT_TRILL = ethers.utils.parseUnits("100", 9);
  const ETH_ADDRESS = ethers.utils.hexZeroPad("0x01", 20);
  const TRILL_ADDRESS = "0x6257E8dD2E049ccfFDC20043E22dB7aF9a815FdB";
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

    // Approve RNFT for all (required to call `setUpdateManager`)
    await landRegistry.setApprovalForAll(rNFT.address, true);
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

      await gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
      await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
    });
    it("should withdraw appropriate amount", async () => {
      // const prevTreasuryBalance = await ethers.provider.getBalance(
      //   TREASURY_ADDRESS
      // );
      const fee = await gateway.getFee();
      const totalRentPrice =
        MAX_DURATION_IN_MONTHS * RENT_PRICE_PER_TIMEUNIT_ETH;
      const serviceFee = (totalRentPrice * fee) / 100;
      const amountAfterFee = totalRentPrice - serviceFee;

      await expect(gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID))
        .to.emit(gateway, "Rent_Fee_Withdrawn")
        .withArgs(
          owner.address,
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          ETH_ADDRESS,
          amountAfterFee
        );
      await expect(gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID))
        .to.emit(gateway, "NFT_Lending_Removed")
        .withArgs(owner.address, NFT_ADDRESS, ORIGINAL_NFT_ID);

      // const afterTreasuryBalance = await ethers.provider.getBalance(
      //   owner.address
      // );
      // expect(afterTreasuryBalance).to.equal(
      //   prevTreasuryBalance.add(ethers.BigNumber.from(serviceFee))
      // );
    });
  });
  describe("ERC20 payment", () => {
    let trillToken;
    let prevRenterBalance, prevLenderBalance, prevTreasuryBalance;
    let currentRenterBalance, currentLenderBalance, currentTreasuryBalance;

    beforeEach(async () => {
      // Get Trill Token contract
      trillToken = await ethers.getContractAt(TRILL_NAME, TRILL_ADDRESS, owner);
      // Add TRILL as the supported payment method
      await gateway.setSupportedPaymentTokens(TRILL_ADDRESS);
      // approve Gateway to take token from the renter
      await trillToken.connect(renter).approve(
        gateway.address, // GATEWAY
        RENT_PRICE_PER_TIMEUNIT_TRILL * MAX_DURATION_IN_DAYS
      );
      // get current balances
      prevLenderBalance = await trillToken.balanceOf(owner.address);
      prevRenterBalance = await trillToken.balanceOf(renter.address);
      prevTreasuryBalance = await trillToken.balanceOf(TREASURY_ADDRESS);

      // test (except redeem)
      await test(
        owner,
        renter,
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION_IN_DAYS,
        MIN_DURATION_IN_DAYS,
        ONE_DAY_IN_SECONDS,
        RENT_PRICE_PER_TIMEUNIT_TRILL,
        TRILL_ADDRESS
      );
    });
    it("should be reverted with message 'Funds for this lending are not claimed yet' if not withdrawn yet at the point of redeeming", async () => {
      await expect(
        gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID)
      ).to.be.revertedWith("Funds for this lending are not claimed yet");

      const fee = await gateway.getFee();
      const totalRentPrice =
        RENT_PRICE_PER_TIMEUNIT_TRILL * MAX_DURATION_IN_DAYS;
      const serviceFee = (totalRentPrice * fee) / 100;
      const amountAfterFee = totalRentPrice - serviceFee;
      // approve lender to take token from the Gateway
      await trillToken.connect(owner).approve(
        owner.address, // LENDER
        amountAfterFee
      );
      // withdraw & redeem
      await gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
      await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
    });
    it("should withdraw appropriate amount", async () => {
      const fee = await gateway.getFee();
      const totalRentPrice =
        RENT_PRICE_PER_TIMEUNIT_TRILL * MAX_DURATION_IN_DAYS;
      const serviceFee = (totalRentPrice * fee) / 100;
      const amountAfterFee = totalRentPrice - serviceFee;
      // approve lender to take token from the Gateway
      await trillToken.connect(owner).approve(
        owner.address, // LENDER
        amountAfterFee
      );

      await expect(gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID))
        .to.emit(gateway, "Rent_Fee_Withdrawn")
        .withArgs(
          owner.address,
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          TRILL_ADDRESS,
          amountAfterFee
        );
      await expect(gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID))
        .to.emit(gateway, "NFT_Lending_Removed")
        .withArgs(owner.address, NFT_ADDRESS, ORIGINAL_NFT_ID);

      await expect(gateway.claimProtocolFee(TRILL_ADDRESS))
        .to.emit(gateway, "Protocol_Fee_Claimed")
        .withArgs(TREASURY_ADDRESS, TRILL_ADDRESS, serviceFee);

      // get current balances after payment
      currentLenderBalance = await trillToken.balanceOf(owner.address);
      currentRenterBalance = await trillToken.balanceOf(renter.address);
      currentTreasuryBalance = await trillToken.balanceOf(TREASURY_ADDRESS);
      // check if payment is done in the right manner
      expect(currentLenderBalance).to.equal(
        prevLenderBalance.add(amountAfterFee)
      );
      expect(currentTreasuryBalance).to.equal(
        prevTreasuryBalance.add(serviceFee)
      );
      expect(currentRenterBalance).to.equal(
        prevRenterBalance.sub(totalRentPrice)
      );
    });
  });
});
