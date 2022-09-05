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
  let owner, renter, other;

  const NFT_ADDRESS = "0xD369c3DfD5EbF11e154F096649e131A8BfAb2f7e"; // LANDRegistry
  const NFT_NAME = "contracts/DCL/LANDRegistry.sol:LANDRegistry";
  const ORIGINAL_NFT_ID = 64;
  const MAX_DURATION = 3;
  const MIN_DURATION = 1;
  const ONE_MONTH = 2628000; // MONTH_IN_SECONDS
  const RENT_PRICE_PER_TIMEUNIT_ETH = ethers.utils.parseEther("0.001");
  const RENT_PRICE_PER_TIMEUNIT_TRILL = ethers.utils.parseUnits("100", 9);
  const ETH_ADDRESS = ethers.utils.hexZeroPad("0x01", 20);
  const TRILL_ADDRESS = "0x6257E8dD2E049ccfFDC20043E22dB7aF9a815FdB";
  const TRILL_NAME = "TrillestERC20Token";

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

    const landRegistry = await ethers.getContractAt(NFT_NAME, NFT_ADDRESS);
    // Approve RNFT for all (required to call `setUpdateManager`)
    await landRegistry.setApprovalForAll(rNFT.address, true);
    // add Gateway as admin
    await rNFT._setNewAdmin(gateway.address);
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
        RENT_PRICE_PER_TIMEUNIT_ETH,
        ETH_ADDRESS
      );
      const rentPrice = await rNFT.getRentPrice(0);
      expect(rentPrice).to.equal(0);
    });
    it("Should return the rent price if the rent-request is approved", async () => {
      // Get Original NFT contract
      const LandRegistry = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await LandRegistry.approve(rNFT.address, ORIGINAL_NFT_ID);
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
      // set Gateway as the admin of RNFT
      await rNFT._setNewAdmin(gateway.address);

      // approve rent request
      const txn = await gateway.approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        renter.address
      );
      expect(txn).to.emit(gateway, "RenterApproved_And_RNFTPreMinted");

      const res = await txn.wait();
      const args = res.events[2].args;

      const rNftId = args._RNFT_tokenId;

      // check
      const rentPrice = await rNFT.getRentPrice(rNftId);
      expect(rentPrice).to.equal(RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION);
    });
  });
  describe("RNFT/startRent : Set Metadata to start renting", async () => {
    it("Should revert with message 'RNFT Token ID doesn't exist' until the NFT is listed for lending", async () => {
      // get RTokenId
      const rTokenId = await rNFT.getRnftFromNft(
        NFT_ADDRESS,
        owner.address,
        ORIGINAL_NFT_ID
      );
      await expect(
        rNFT.startRent(NFT_ADDRESS, ORIGINAL_NFT_ID, rTokenId)
      ).to.be.revertedWith("RNFT Token ID doesn't exist");
    });
    it("Success : Should emit an event 'Rent_Started'", async () => {
      // Get Original NFT contract
      const LandRegistry = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await LandRegistry.approve(rNFT.address, ORIGINAL_NFT_ID);
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
      // set Gateway as the admin of RNFT
      await rNFT._setNewAdmin(gateway.address);
      // approve & premint
      await gateway.approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        renter.address
      );
      // get RTokenId
      const rTokenId = await rNFT.getRnftFromNft(
        NFT_ADDRESS,
        owner.address,
        ORIGINAL_NFT_ID
      );

      // check
      const txn = await rNFT.startRent(NFT_ADDRESS, ORIGINAL_NFT_ID, rTokenId);
      expect(txn).to.emit(rNFT, "Rent_Started");

      const res = await txn.wait();
      const args = res.events[1].args;

      expect(args.rEndTime - args.rStartTime).to.equal(
        MAX_DURATION * ONE_MONTH
      );
      expect(args.isRented).to.be.true;
      expect(args.rTokenId).to.equal(rTokenId);
    });
    it("Should revert with message 'NFT rental status: already rented' if already rented", async () => {
      // Get Original NFT contract
      const LandRegistry = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await LandRegistry.approve(rNFT.address, ORIGINAL_NFT_ID);
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
      // set Gateway as the admin of RNFT
      await rNFT._setNewAdmin(gateway.address);
      // approve & premint
      await gateway.approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        renter.address
      );
      // get RTokenId
      const rTokenId = await rNFT.getRnftFromNft(
        NFT_ADDRESS,
        owner.address,
        ORIGINAL_NFT_ID
      );
      // rent once
      const txn = await rNFT.startRent(NFT_ADDRESS, ORIGINAL_NFT_ID, rTokenId);
      await txn.wait();
      // rent twice
      await expect(
        rNFT.startRent(NFT_ADDRESS, ORIGINAL_NFT_ID, rTokenId)
      ).to.be.revertedWith("NFT rental status: already rented");
    });
  });
  describe("Gateway/setSupportedPaymentTokens : Modules to add a new payment method", async () => {
    it("Should revert with message 'token already supported' if the token is already supported!", async () => {
      await expect(
        gateway.setSupportedPaymentTokens(ETH_ADDRESS)
      ).to.be.revertedWith("token already supported");
    });
    it("Should emit the event 'Supported_Payment_Method_Added' if the token is already supported!", async () => {
      await expect(gateway.setSupportedPaymentTokens(TRILL_ADDRESS))
        .to.emit(gateway, "Supported_Payment_Method_Added")
        .withArgs(TRILL_ADDRESS, "TRILL");
      expect(await gateway.isSupportedPaymentToken(TRILL_ADDRESS)).to.be.true;
    });
  });
  // describe("Gateway/distributePaymentTransactions : Executes payment distribution (treasury & beneficiary/lender)", async () => {
  //   describe("ETH payment", async () => {
  //     let rTokenId;
  //     beforeEach(async () => {
  //       // Get Original NFT contract
  //       const LandRegistry = await ethers.getContractAt(
  //         NFT_NAME,
  //         NFT_ADDRESS,
  //         owner
  //       );
  //       // Approve the RNFT contract to operate NFTs
  //       await LandRegistry.approve(rNFT.address, ORIGINAL_NFT_ID);
  //       // first of all, needs to list for lending
  //       await gateway.createLendRecord(
  //         NFT_ADDRESS,
  //         ORIGINAL_NFT_ID,
  //         MAX_DURATION * ONE_MONTH,
  //         MIN_DURATION * ONE_MONTH,
  //         ONE_MONTH,
  //         RENT_PRICE_PER_TIMEUNIT_ETH,
  //         ETH_ADDRESS
  //       );
  //       // set Gateway as the admin of RNFT
  //       await rNFT._setNewAdmin(gateway.address);
  //       // approve & premint
  //       await gateway.approveAndPreMintRNFT(
  //         NFT_ADDRESS,
  //         ORIGINAL_NFT_ID,
  //         MAX_DURATION * ONE_MONTH,
  //         renter.address
  //       );
  //       // get RTokenId
  //       rTokenId = await rNFT.getRnftFromNft(
  //         NFT_ADDRESS,
  //         owner.address,
  //         ORIGINAL_NFT_ID
  //       );
  //       console.log(`RNFTtokenId ; ${rTokenId}`);
  //     });
  //     it("Should revert with 'Not enough ETH paid to execute transaction' if transferred balance is not enough", async () => {
  //       await expect(
  //         gateway
  //           .connect(renter)
  //           .confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID, {
  //             value: RENT_PRICE_PER_TIMEUNIT_ETH, // should be (RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION)
  //           })
  //       ).to.be.revertedWith("Not enough ETH paid to execute transaction");
  //     });
  //     it("Should revert with 'sender doesn't have enough funds to send tx.' if renter does not have enough ETH", async () => {
  //       let err = "";
  //       try {
  //         await gateway
  //           .connect(renter)
  //           .confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID, {
  //             value: RENT_PRICE_PER_TIMEUNIT_ETH.mul(MAX_DURATION).mul(100000),
  //           });
  //       } catch (e) {
  //         err = e.message;
  //       }
  //       expect(err).to.matches(
  //         /sender doesn't have enough funds to send tx. The max upfront cost is:*/
  //       );
  //       // revert error message should be in this format
  //       // "sender doesn't have enough funds to send tx.
  //       // The max upfront cost is: xxxx  and the sender's account only has: xxxx"
  //     });
  //     it("Success : Should emit event 'Payment_Distributed' with perfect payment distribution", async () => {
  //       // store current balance before the payment
  //       const prevRenterBalance = await ethers.provider.getBalance(
  //         renter.address
  //       );
  //       console.log(prevRenterBalance);
  //       // execute payment distribution
  //       const fee = await gateway.getFee();
  //       const totalRentPrice = RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION;
  //       const serviceFee = (totalRentPrice * fee) / 100;
  //       const amountAfterFee = totalRentPrice - serviceFee;
  //       const txn = await gateway
  //         .connect(renter)
  //         .distributePaymentTransactions(
  //           NFT_ADDRESS,
  //           ORIGINAL_NFT_ID,
  //           rTokenId,
  //           renter.address,
  //           {
  //             value: RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION,
  //           }
  //         );
  //       // check event
  //       expect(txn)
  //         .to.emit(gateway, "Payment_Distributed")
  //         .withArgs(
  //           rTokenId,
  //           RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION,
  //           serviceFee,
  //           amountAfterFee,
  //           0
  //         );
  //       // get current balances after payment
  //       const currentLenderBalance = await ethers.provider.getBalance(
  //         owner.address
  //       );
  //       const currentRenterBalance = await ethers.provider.getBalance(
  //         renter.address
  //       );
  //       const currentTreasuryBalance = await ethers.provider.getBalance(
  //         TREASURY_ADDRESS
  //       );
  //       // check if payment is done in the right manner
  //       expect(currentLenderBalance).to.equal(
  //         prevLenderBalance.add(amountAfterFee)
  //       );
  //       expect(currentTreasuryBalance).to.equal(
  //         prevTreasuryBalance.add(serviceFee)
  //       );
  //       const res = await txn.wait();
  //       const gasFee = res.cumulativeGasUsed.mul(res.effectiveGasPrice);
  //       expect(currentRenterBalance).to.equal(
  //         prevRenterBalance.sub(totalRentPrice).sub(gasFee)
  //       );
  //     });
  //   });
  //   // describe("ERC20 token payment", async () => {
  //   //   // Test with Trill
  //   //   let rTokenId;
  //   //   let trillToken;
  //   //   beforeEach(async () => {
  //   //     // Get Trill Token contract
  //   //     trillToken = await ethers.getContractAt(
  //   //       TRILL_NAME,
  //   //       TRILL_ADDRESS,
  //   //       owner
  //   //     );
  //   //     // Get Original NFT contract
  //   //     const LandRegistry = await ethers.getContractAt(
  //   //       NFT_NAME,
  //   //       NFT_ADDRESS,
  //   //       owner
  //   //     );
  //   //     // Approve the RNFT contract to operate NFTs
  //   //     await LandRegistry.approve(rNFT.address, ORIGINAL_NFT_ID);
  //   //     // Add TRILL as the supported payment method
  //   //     await gateway.setSupportedPaymentTokens(TRILL_ADDRESS);
  //   //     // first of all, needs to list for lending
  //   //     await gateway.createLendRecord(
  //   //       NFT_ADDRESS,
  //   //       ORIGINAL_NFT_ID,
  //   //       MAX_DURATION * ONE_MONTH,
  //   //       MIN_DURATION * ONE_MONTH,
  //   //       ONE_MONTH,
  //   //       RENT_PRICE_PER_TIMEUNIT_TRILL,
  //   //       TRILL_ADDRESS
  //   //     );
  //   //     // set Gateway as the admin of RNFT
  //   //     await rNFT._setNewAdmin(gateway.address);
  //   //     // approve & premint
  //   //     await gateway.approveAndPreMintRNFT(
  //   //       NFT_ADDRESS,
  //   //       ORIGINAL_NFT_ID,
  //   //       MAX_DURATION * ONE_MONTH,
  //   //       renter.address
  //   //     );
  //   //     // get RTokenId
  //   //     rTokenId = await rNFT.getRnftFromNft(
  //   //       NFT_ADDRESS,
  //   //       owner.address,
  //   //       ORIGINAL_NFT_ID
  //   //     );
  //   //   });
  //   //   it("Should revert with 'Not enough balance to execute payment transaction' if transferred balance is not enough", async () => {
  //   //     await expect(
  //   //       gateway
  //   //         .connect(other)
  //   //         .distributePaymentTransactions(
  //   //           NFT_ADDRESS,
  //   //           ORIGINAL_NFT_ID,
  //   //           rTokenId,
  //   //           other.address
  //   //         )
  //   //     ).to.be.revertedWith(
  //   //       "Not enough balance to execute payment transaction"
  //   //     );
  //   //   });
  //   //   it("Should revert with message 'Gateway not approved yet!' unless it's approved", async () => {
  //   //     await expect(
  //   //       gateway
  //   //         .connect(renter)
  //   //         .distributePaymentTransactions(
  //   //           NFT_ADDRESS,
  //   //           ORIGINAL_NFT_ID,
  //   //           rTokenId,
  //   //           renter.address
  //   //         )
  //   //     ).to.be.revertedWith("Gateway not approved yet!");
  //   //   });
  //   //   it("Success : Should emit event 'Payment_Distributed' with perfect payment distribution", async () => {
  //   //     // store current balance before the payment
  //   //     const prevLenderBalance = await trillToken.balanceOf(owner.address);
  //   //     const prevRenterBalance = await trillToken.balanceOf(renter.address);
  //   //     const prevTreasuryBalance = await trillToken.balanceOf(
  //   //       TREASURY_ADDRESS
  //   //     );
  //   //     // execute payment distribution
  //   //     const fee = await gateway.getFee();
  //   //     const totalRentPrice = RENT_PRICE_PER_TIMEUNIT_TRILL * MAX_DURATION;
  //   //     const serviceFee = (totalRentPrice * fee) / 100;
  //   //     const amountAfterFee = totalRentPrice - serviceFee;
  //   //     // approve Gateway to take token from the renter
  //   //     await trillToken
  //   //       .connect(renter)
  //   //       .approve(gateway.address, totalRentPrice);
  //   //     // check event
  //   //     await expect(
  //   //       gateway
  //   //         .connect(renter)
  //   //         .distributePaymentTransactions(
  //   //           NFT_ADDRESS,
  //   //           ORIGINAL_NFT_ID,
  //   //           rTokenId,
  //   //           renter.address
  //   //         )
  //   //     )
  //   //       .to.emit(gateway, "Payment_Distributed")
  //   //       .withArgs(
  //   //         rTokenId,
  //   //         RENT_PRICE_PER_TIMEUNIT_TRILL * MAX_DURATION,
  //   //         serviceFee,
  //   //         amountAfterFee,
  //   //         0
  //   //       );
  //   //     // get current balances after payment
  //   //     const currentLenderBalance = await trillToken.balanceOf(owner.address);
  //   //     const currentRenterBalance = await trillToken.balanceOf(renter.address);
  //   //     const currentTreasuryBalance = await trillToken.balanceOf(
  //   //       TREASURY_ADDRESS
  //   //     );
  //   //     // check if payment is done in the right manner
  //   //     expect(currentLenderBalance).to.equal(
  //   //       prevLenderBalance.add(amountAfterFee)
  //   //     );
  //   //     expect(currentTreasuryBalance).to.equal(
  //   //       prevTreasuryBalance.add(serviceFee)
  //   //     );
  //   //     expect(currentRenterBalance).to.equal(
  //   //       prevRenterBalance.sub(totalRentPrice)
  //   //     );
  //   //   });
  //   // });
  // });
  describe("Gateway/confirmRentAgreementAndPay : Confirms rental agreement & executes payment distribution (treasury & beneficiary/lender)", async () => {
    it("Should revert with message 'RNFT Token ID doesn't exist' until the NFT is listed for lending", async () => {
      await expect(
        gateway.confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID)
      ).to.be.revertedWith("RNFT Token ID doesn't exist");
    });
    it("Should revert with message 'Renter address not approved' until the renter is not approved (NFT's already listed for lending)", async () => {
      await gateway.createLendRecord(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MAX_DURATION * ONE_MONTH,
        MIN_DURATION * ONE_MONTH,
        ONE_MONTH,
        RENT_PRICE_PER_TIMEUNIT_ETH,
        ETH_ADDRESS
      );
      await expect(
        gateway
          .connect(renter)
          .confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID)
      ).to.be.revertedWith("RNFT Token ID doesn't exist");
    });
    describe("Success : Should emit the event 'Rent_Confirmed_Paid'", async () => {
      let rTokenId;
      it("ETH payment", async () => {
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
          gateway
            .connect(renter)
            .confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID, {
              value: RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION,
            })
        )
          .to.emit(gateway, "Rent_Confirmed_Paid")
          .withArgs(NFT_ADDRESS, ORIGINAL_NFT_ID, rTokenId);

        // stimulate time
        await ethers.provider.send("evm_increaseTime", [
          ONE_MONTH * MAX_DURATION,
        ]);
        await ethers.provider.send("evm_mine");
        // withdraw & redeem
        await gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
        await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
      });
      it("ERC20 token payment", async () => {
        // Get Trill Token contract
        const trillToken = await ethers.getContractAt(
          TRILL_NAME,
          TRILL_ADDRESS,
          owner
        );
        // Add TRILL as the supported payment method
        await gateway.setSupportedPaymentTokens(TRILL_ADDRESS);
        // LIFT nft for lending
        await gateway.createLendRecord(
          NFT_ADDRESS,
          ORIGINAL_NFT_ID,
          MAX_DURATION * ONE_MONTH,
          MIN_DURATION * ONE_MONTH,
          ONE_MONTH,
          RENT_PRICE_PER_TIMEUNIT_TRILL,
          TRILL_ADDRESS
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
        // approve Gateway to take token from the renter
        await trillToken
          .connect(renter)
          .approve(
            gateway.address,
            RENT_PRICE_PER_TIMEUNIT_TRILL * MAX_DURATION
          );
        // check
        await expect(
          gateway
            .connect(renter)
            .confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID, {
              value: RENT_PRICE_PER_TIMEUNIT_TRILL * MAX_DURATION,
            })
        )
          .to.emit(gateway, "Rent_Confirmed_Paid")
          .withArgs(NFT_ADDRESS, ORIGINAL_NFT_ID, rTokenId);

        // stimulate time
        await ethers.provider.send("evm_increaseTime", [
          ONE_MONTH * MAX_DURATION,
        ]);
        await ethers.provider.send("evm_mine");
        // withdraw & redeem
        await gateway.withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
        await gateway.redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
      });
    });
  });
});
