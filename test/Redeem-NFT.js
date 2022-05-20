const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

/**
 * Description
 * terminate rent and redeem original NFT (need to create a new lending to list the asset in the marketplace ++gas fees)

redeemNFT()
  terminateRentAgreement()
  _redeemNFT()

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
  });
  // describe("Gateway/terminateRentAgreement : Terminate rent agreement & clear rent metadata", async () => {
  //   beforeEach(async () => {
  //     // first of all, needs to list for lending
  //     await gateway.createLendRecord(
  //       NFT_ADDRESS,
  //       ORIGINAL_NFT_ID,
  //       MAX_DURATION * ONE_MONTH,
  //       MIN_DURATION * ONE_MONTH,
  //       ONE_MONTH,
  //       RENT_PRICE_PER_TIMEUNIT_ETH,
  //       ETH_ADDRESS
  //     );
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
  //     // confirm payment
  //     await gateway
  //       .connect(renter)
  //       .confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID, {
  //         value: RENT_PRICE_PER_TIMEUNIT_ETH * MAX_DURATION,
  //       });
  //   });
  //   it("Should revert with message 'unauthorized: address is not owner or lending not registered' unless caller's the lender", async () => {
  //     await expect(
  //       gateway
  //         .connect(other)
  //         .terminateRentAgreement(NFT_ADDRESS, ORIGINAL_NFT_ID)
  //     ).to.be.revertedWith(
  //       "unauthorized: address is not owner or lending not registered"
  //     );
  //   });
  //   it("Success : Should emit the event 'Rent_Agreemeng_Terminated'", async () => {
  //     // stimulate time
  //     await ethers.provider.send("evm_increaseTime", [
  //       ONE_MONTH * MAX_DURATION,
  //     ]);
  //     // check
  //     await expect(gateway.terminateRentAgreement(NFT_ADDRESS, ORIGINAL_NFT_ID))
  //       .to.emit(gateway, "Rent_Agreemeng_Terminated")
  //       .withArgs(NFT_ADDRESS, ORIGINAL_NFT_ID, rTokenId);
  //   });
  // });
});
