const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Description
 * Terminate rent agreement 

terminateRentAgreement()
  RNFT::terminateRent()

 */

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
    const SmolRunnersNFT = await ethers.getContractAt(
      NFT_NAME,
      NFT_ADDRESS,
      owner
    );
    // Approve the RNFT contract to operate NFTs
    await SmolRunnersNFT.approve(rNFT.address, ORIGINAL_NFT_ID);
    // set Gateway as the admin of RNFT
    await rNFT._setNewAdmin(gateway.address);
  });
  describe("RNFT/_terminateRent : reset rent metadata", async () => {
    describe("Test cases before renting", async () => {
      it("Should revert with messsage 'RNFT Token ID doesn't exist' if not pre-minted!", async () => {
        await expect(rNFT._terminateRent(0, owner.address)).to.be.revertedWith(
          "RNFT Token ID doesn't exist"
        );
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
          rNFT._terminateRent(rTokenId, owner.address)
        ).to.be.revertedWith("NFT rental status: not rented");
      });
    });
    describe("Test cases ater renting", async () => {
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
      // it("Should revert with messsage 'Caller is not original NFT Owner' if an annonymous account calls!", async () => {
      //   // check
      //   await expect(
      //     rNFT._terminateRent(rTokenId, other.address)
      //   ).to.be.revertedWith("Caller is not original NFT Owner");
      // });
      // it("Should revert with messsage 'ERROR: Rent not expired, ongoing rent duration' when rent is not over!", async () => {
      //   // check
      //   await expect(
      //     rNFT._terminateRent(rTokenId, owner.address)
      //   ).to.be.revertedWith("ERROR: Rent not expired, ongoing rent duration");
      // });
      it("Success : Should emit the event 'Rent_Terminated' with params null!", async () => {
        // stimulate time
        await ethers.provider.send("evm_increaseTime", [
          ONE_MONTH * MAX_DURATION,
        ]);
        await ethers.provider.send("evm_mine");
        // check
        await expect(rNFT._terminateRent(rTokenId, owner.address))
          .to.emit(rNFT, "Rent_Terminated")
          .withArgs(rTokenId, false, 0);
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
    });
    it("Success : Should emit the event 'Rent_Agreemeng_Terminated'", async () => {
      // stimulate time
      await ethers.provider.send("evm_increaseTime", [
        ONE_MONTH * MAX_DURATION,
      ]);
      // check
      await expect(gateway.terminateRentAgreement(NFT_ADDRESS, ORIGINAL_NFT_ID))
        .to.emit(gateway, "Rent_Agreemeng_Terminated")
        .withArgs(NFT_ADDRESS, ORIGINAL_NFT_ID, rTokenId);
    });
  });
});
