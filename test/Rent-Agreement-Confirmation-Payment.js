/* eslint-disable no-unused-expressions */
/* eslint-disable no-self-compare */
const { expect } = require("chai");
const { BigNumber } = require("ethers");
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
  const RENT_PRICE_PER_TIMEUNIT_ETH = ethers.utils.parseEther("0.001");
  const RENT_PRICE_PER_TIMEUNIT_TRILL = ethers.utils.parseUnits("100", 9);
  const ZERO_ADDRES = ethers.utils.hexZeroPad("0x00", 20); // zero address for ETH
  const ETH_ADDRESS = ZERO_ADDRES;
  const TRILL_ADDRESS = "0x311fDA80a91f7773afaC2D0b776eC2676d02185E";

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
        RENT_PRICE_PER_TIMEUNIT_ETH,
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
        RENT_PRICE_PER_TIMEUNIT_ETH,
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
      await expect(rNFT.startRent(rTokenId)).to.be.revertedWith(
        "RNFT Token ID doesn't exist"
      );
    });
    it("Success : Should emit an event 'Rent_Started'", async () => {
      // Get Original NFT contract
      const SmolRunnersNFT = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
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
      const txn = await rNFT.startRent(rTokenId);
      expect(txn).to.emit(rNFT, "Rent_Started");

      const res = await txn.wait();
      const args = res.events[0].args;

      expect(args.rEndTime - args.rStartTime).to.equal(
        MAX_DURATION * ONE_MONTH
      );
      expect(args.isRented).to.be.true;
      expect(args.rTokenId).to.equal(rTokenId);
    });
    it("Should revert with message 'NFT rental status: already rented' if already rented", async () => {
      // Get Original NFT contract
      const SmolRunnersNFT = await ethers.getContractAt(
        NFT_NAME,
        NFT_ADDRESS,
        owner
      );
      // Approve the RNFT contract to operate NFTs
      await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
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
      const txn = await rNFT.startRent(rTokenId);
      await txn.wait();
      // rent twice
      await expect(rNFT.startRent(rTokenId)).to.be.revertedWith(
        "NFT rental status: already rented"
      );
    });
  });
  // describe("Gateway/setSupportedPaymentTokens : Modules to add a new payment method", async () => {
  //   it("Should revert with message 'token already supported' if the token is already supported!", async () => {
  //     await expect(gateway.setSupportedPaymentTokens(ZERO_ADDRES)).
  //   })
  // })
  describe("Gateway/distributePaymentTransactions : Executes payment distribution (treasury & beneficiary/lender)", async () => {
    describe("ETH payment", async () => {
      let rTokenId;

      beforeEach(async () => {
        // Get Original NFT contract
        const SmolRunnersNFT = await ethers.getContractAt(
          NFT_NAME,
          NFT_ADDRESS,
          owner
        );
        // Approve the RNFT contract to operate NFTs
        await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
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
        rTokenId = await rNFT.getRnftFromNft(
          NFT_ADDRESS,
          owner.address,
          ORIGINAL_NFT_ID
        );
      });

      it("Should revert with 'Not enough ETH paid to execute transaction' if transferred balance is not enough", async () => {
        await expect(
          gateway
            .connect(renter)
            .distributePaymentTransactions(
              NFT_ADDRESS,
              ORIGINAL_NFT_ID,
              rTokenId,
              renter.address,
              {
                value: RENT_PRICE_PER_TIMEUNIT_ETH, // should be (RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION)
              }
            )
        ).to.be.revertedWith("Not enough ETH paid to execute transaction");
      });
      it("Should revert with 'sender doesn't have enough funds to send tx.' if renter does not have enough ETH", async () => {
        let err = "";
        try {
          await gateway
            .connect(renter)
            .distributePaymentTransactions(
              NFT_ADDRESS,
              ORIGINAL_NFT_ID,
              rTokenId,
              renter.address,
              {
                value:
                  RENT_PRICE_PER_TIMEUNIT_ETH.mul(MAX_DURATION).mul(100000),
              }
            );
        } catch (e) {
          err = e.message;
        }
        expect(err).to.matches(
          /sender doesn't have enough funds to send tx. The max upfront cost is:*/
        );
        // revert error message should be in this format
        // "sender doesn't have enough funds to send tx.
        // The max upfront cost is: xxxx  and the sender's account only has: xxxx"
      });
      it("Success : Should emit event 'Payment_Distributed' with perfect payment distribution", async () => {
        // store current balance before the payment
        const prevLenderBalance = await ethers.provider.getBalance(
          owner.address
        );
        const prevRenterBalance = await ethers.provider.getBalance(
          renter.address
        );
        const prevTreasuryBalance = await ethers.provider.getBalance(
          gateway.address
        );
        // execute payment distribution
        const fee = await gateway.getFee();
        const totalRentPrice = RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION;
        const serviceFee = (totalRentPrice * fee) / 100;
        const amountAfterFee = totalRentPrice - serviceFee;
        const txn = await gateway
          .connect(renter)
          .distributePaymentTransactions(
            NFT_ADDRESS,
            ORIGINAL_NFT_ID,
            rTokenId,
            renter.address,
            {
              value: RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION,
            }
          );
        // check event
        expect(txn)
          .to.emit(gateway, "Payment_Distributed")
          .withArgs(
            rTokenId,
            RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION,
            serviceFee,
            amountAfterFee,
            0
          );
        // get current balances after payment
        const currentLenderBalance = await ethers.provider.getBalance(
          owner.address
        );
        const currentRenterBalance = await ethers.provider.getBalance(
          renter.address
        );
        const currentTreasuryBalance = await ethers.provider.getBalance(
          gateway.address
        );
        // check if payment is done in the right manner
        expect(currentLenderBalance).to.equal(
          prevLenderBalance.add(amountAfterFee)
        );
        expect(currentTreasuryBalance).to.equal(
          prevTreasuryBalance.add(serviceFee)
        );

        const res = await txn.wait();
        const gasFee = res.cumulativeGasUsed.mul(res.effectiveGasPrice);
        expect(currentRenterBalance).to.equal(
          prevRenterBalance.sub(totalRentPrice).sub(gasFee)
        );
      });
    });
    // describe("ERC20 token payment", async () => {
    //   // Test with Trill
    //   let rTokenId;

    //   beforeEach(async () => {
    //     // Get Original NFT contract
    //     const SmolRunnersNFT = await ethers.getContractAt(
    //       NFT_NAME,
    //       NFT_ADDRESS,
    //       owner
    //     );
    //     // Approve the RNFT contract to operate NFTs
    //     await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
    //     // first of all, needs to list for lending
    //     await gateway.createLendRecord(
    //       NFT_ADDRESS,
    //       ORIGINAL_NFT_ID,
    //       MAX_DURATION * ONE_MONTH,
    //       MIN_DURATION * ONE_MONTH,
    //       ONE_MONTH,
    //       RENT_PRICE_PER_TIMEUNIT_ETH,
    //       TRILL_ADDRESS
    //     );
    //     // set Gateway as the admin of RNFT
    //     await rNFT._setNewAdmin(gateway.address);
    //     // approve & premint
    //     await gateway.approveAndPreMintRNFT(
    //       NFT_ADDRESS,
    //       ORIGINAL_NFT_ID,
    //       MAX_DURATION * ONE_MONTH,
    //       renter.address
    //     );
    //     // get RTokenId
    //     rTokenId = await rNFT.getRnftFromNft(
    //       NFT_ADDRESS,
    //       owner.address,
    //       ORIGINAL_NFT_ID
    //     );
    //   });

    //   it("Should revert with 'Not enough ETH paid to execute transaction' if transferred balance is not enough", async () => {
    //     await expect(
    //       gateway
    //         .connect(renter)
    //         .distributePaymentTransactions(
    //           NFT_ADDRESS,
    //           ORIGINAL_NFT_ID,
    //           rTokenId,
    //           renter.address,
    //           {
    //             value: RENT_PRICE_PER_TIMEUNIT_ETH, // should be (RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION)
    //           }
    //         )
    //     ).to.be.revertedWith("Not enough ETH paid to execute transaction");
    //   });
    //   it("Should revert with 'sender doesn't have enough funds to send tx.' if renter does not have enough ETH", async () => {
    //     let err = "";
    //     try {
    //       await gateway
    //         .connect(renter)
    //         .distributePaymentTransactions(
    //           NFT_ADDRESS,
    //           ORIGINAL_NFT_ID,
    //           rTokenId,
    //           renter.address,
    //           {
    //             value:
    //               RENT_PRICE_PER_TIMEUNIT_ETH.mul(MAX_DURATION).mul(100000),
    //           }
    //         );
    //     } catch (e) {
    //       err = e.message;
    //     }
    //     expect(err).to.matches(
    //       /sender doesn't have enough funds to send tx. The max upfront cost is:*/
    //     );
    //     // revert error message should be in this format
    //     // "sender doesn't have enough funds to send tx.
    //     // The max upfront cost is: xxxx  and the sender's account only has: xxxx"
    //   });
    //   it("Success : Should emit event 'Payment_Distributed' with perfect payment distribution", async () => {
    //     // store current balance before the payment
    //     const prevLenderBalance = await ethers.provider.getBalance(
    //       owner.address
    //     );
    //     const prevRenterBalance = await ethers.provider.getBalance(
    //       renter.address
    //     );
    //     const prevTreasuryBalance = await ethers.provider.getBalance(
    //       gateway.address
    //     );
    //     // execute payment distribution
    //     const fee = await gateway.getFee();
    //     const totalRentPrice = RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION;
    //     const serviceFee = (totalRentPrice * fee) / 100;
    //     const amountAfterFee = totalRentPrice - serviceFee;
    //     const txn = await gateway
    //       .connect(renter)
    //       .distributePaymentTransactions(
    //         NFT_ADDRESS,
    //         ORIGINAL_NFT_ID,
    //         rTokenId,
    //         renter.address,
    //         {
    //           value: RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION,
    //         }
    //       );
    //     // check event
    //     expect(txn)
    //       .to.emit(gateway, "Payment_Distributed")
    //       .withArgs(
    //         rTokenId,
    //         RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION,
    //         serviceFee,
    //         amountAfterFee,
    //         0
    //       );
    //     // get current balances after payment
    //     const currentLenderBalance = await ethers.provider.getBalance(
    //       owner.address
    //     );
    //     const currentRenterBalance = await ethers.provider.getBalance(
    //       renter.address
    //     );
    //     const currentTreasuryBalance = await ethers.provider.getBalance(
    //       gateway.address
    //     );
    //     // check if payment is done in the right manner
    //     expect(currentLenderBalance).to.equal(
    //       prevLenderBalance.add(amountAfterFee)
    //     );
    //     expect(currentTreasuryBalance).to.equal(
    //       prevTreasuryBalance.add(serviceFee)
    //     );

    //     const res = await txn.wait();
    //     const gasFee = res.cumulativeGasUsed.mul(res.effectiveGasPrice);
    //     expect(currentRenterBalance).to.equal(
    //       prevRenterBalance.sub(totalRentPrice).sub(gasFee)
    //     );
    //   });
    // });
  });
  // describe("Gateway/confirmRentAgreementAndPay : Confirms rental agreement & executes payment distribution (treasury & beneficiary/lender)", async () => {
  //   it("Should revert with message 'RNFT Token ID doesn't exist' until the NFT is listed for lending", async () => {
  //     await expect(
  //       gateway.confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID)
  //     ).to.be.revertedWith("RNFT Token ID doesn't exist");
  //   });
  //   it("Should revert with message 'Renter address not approved' until the renter is not approved (NFT's already listed for lending)", async () => {
  //     await gateway.createLendRecord(
  //       NFT_ADDRESS,
  //       ORIGINAL_NFT_ID,
  //       MAX_DURATION * ONE_MONTH,
  //       MIN_DURATION * ONE_MONTH,
  //       ONE_MONTH,
  //       RENT_PRICE_PER_TIMEUNIT_ETH,
  //       ETH_ADDRESS
  //     );
  //     await expect(
  //       gateway.confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID)
  //     ).to.be.revertedWith("RNFT Token ID doesn't exist");
  //   });
  // });
});
