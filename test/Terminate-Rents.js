const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Description
 * Terminate rent agreement 

terminateRentAgreement()
  RNFT::terminateRent()

 */

describe("Terminate rent agreement and reset lending metadata", async () => {
  const NFT_ADDRESS = "0xD369c3DfD5EbF11e154F096649e131A8BfAb2f7e"; // LANDRegistry
  const NFT_NAME = "contracts/DCL/LANDRegistry.sol:LANDRegistry";
  const ORIGINAL_NFT_ID = 14;
  const MAX_DURATION = 3;
  const MIN_DURATION = 1;
  const ONE_MONTH = 2628000; // MONTH_IN_SECONDS
  const RENT_PRICE_PER_TIMEUNIT_ETH = ethers.utils.parseEther("0.001");
  const ETH_ADDRESS = ethers.utils.hexZeroPad("0x01", 20);

  let Gateway, gateway;
  let RNFT, rNFT;
  let owner, other, renter;
  let rTokenId;

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

  describe("RNFT/_terminateRent : reset rent metadata", async () => {
    describe("Test cases before renting", async () => {
      it("Should revert with messsage 'RNFT Token ID doesn't exist' if not pre-minted!", async () => {
        await expect(
          rNFT._terminateRent(NFT_ADDRESS, 0, ORIGINAL_NFT_ID, owner.address)
        ).to.be.revertedWith("RNFT Token ID doesn't exist");
      });
      it("Should revert with messsage 'NFT rental status: not rented' if rented yet!", async () => {
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
        // check
        await expect(
          rNFT._terminateRent(
            NFT_ADDRESS,
            rTokenId,
            ORIGINAL_NFT_ID,
            owner.address
          )
        ).to.be.revertedWith("NFT rental status: not rented");
      });
    });
    describe("Test cases after renting", async () => {
      beforeEach(async () => {
        // await ethers.provider.send("hardhat_reset");
        // first of all, needs to list for lending
        await gateway
          // .connect(other)
          .createLendRecord(
            NFT_ADDRESS,
            ORIGINAL_NFT_ID,
            MAX_DURATION * ONE_MONTH,
            MIN_DURATION * ONE_MONTH,
            ONE_MONTH,
            RENT_PRICE_PER_TIMEUNIT_ETH,
            ETH_ADDRESS
          );
        // approve & premint
        await gateway
          // .connect(other)
          .approveAndPreMintRNFT(
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
      it("Should revert with messsage 'Restricted to admins' when _terminateRent() is directly called!", async () => {
        // stimulate time
        await ethers.provider.send("evm_increaseTime", [
          ONE_MONTH * MAX_DURATION,
        ]);
        await ethers.provider.send("evm_mine");

        // check
        await expect(
          rNFT
            .connect(other)
            ._terminateRent(
              NFT_ADDRESS,
              rTokenId,
              ORIGINAL_NFT_ID,
              other.address
            )
        ).to.be.revertedWith("Restricted to admins");

        // withdraw & redeem
        await gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
        await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
      });
      it("Should revert with messsage 'ERROR: Rent not expired, ongoing rent duration' when rent is not over!", async () => {
        // check
        await expect(
          rNFT._terminateRent(
            NFT_ADDRESS,
            rTokenId,
            ORIGINAL_NFT_ID,
            owner.address
          )
        ).to.be.revertedWith("ERROR: Rent not expired, ongoing rent duration");

        // stimulate time
        await ethers.provider.send("evm_increaseTime", [
          ONE_MONTH * MAX_DURATION,
        ]);
        await ethers.provider.send("evm_mine");
        // withdraw & redeem
        await gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
        await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
      });
      it("Success : Should emit the event 'Rent_Terminated' with params null!", async () => {
        // stimulate time
        await ethers.provider.send("evm_increaseTime", [
          ONE_MONTH * MAX_DURATION,
        ]);
        await ethers.provider.send("evm_mine");
        // check
        await expect(
          rNFT._terminateRent(
            NFT_ADDRESS,
            rTokenId,
            ORIGINAL_NFT_ID,
            owner.address
          )
        )
          .to.emit(rNFT, "Rent_Terminated")
          .withArgs(rTokenId, false, 0);
        // withdraw & redeem
        await gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
        await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
      });
    });
  });
  describe("Gateway/terminateRentAgreement : Terminate rent agreement & clear rent metadata", async () => {
    beforeEach(async () => {
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
    it("Should revert with message 'unauthorized: address is not owner or lending not registered' unless caller's the lender", async () => {
      await expect(
        gateway
          .connect(other)
          .terminateRentAgreement(NFT_ADDRESS, ORIGINAL_NFT_ID)
      ).to.be.revertedWith(
        "unauthorized: address is not owner or lending not registered"
      );

      // stimulate time
      await ethers.provider.send("evm_increaseTime", [
        ONE_MONTH * MAX_DURATION,
      ]);
      await ethers.provider.send("evm_mine");
      // withdraw & redeem
      await gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
      await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
    });
    it("Success : Should emit the event 'Rent_Agreemeng_Terminated'", async () => {
      // stimulate time
      await ethers.provider.send("evm_increaseTime", [
        ONE_MONTH * MAX_DURATION,
      ]);
      await ethers.provider.send("evm_mine");
      // check
      await expect(gateway.terminateRentAgreement(NFT_ADDRESS, ORIGINAL_NFT_ID))
        .to.emit(gateway, "Rent_Agreemeng_Terminated")
        .withArgs(NFT_ADDRESS, ORIGINAL_NFT_ID, rTokenId);

      // withdraw & redeem
      await gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
      await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
    });
  });
});
