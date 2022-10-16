const { ethers } = require("hardhat");

/*
RNFT (proxy) address : 0xE79a633Ec4a5BAFF8b25093CC44C32800565a1a0
RNFT (implementation) address : 0x5ea497d72C7aD950913c1e322308752e1c1Ff3e6
RNFT (admin) address : 0x118323edce4757177D30bcC20D3D990Ff2bD1B05
Gateway (proxy) address : 0x03Dafc6bBF74675432624F184cb52d2AF492F6F6
Gateway (implementation) address : 0xCB03eefDdeF41C8cA09d26cE25A734a39583f4B1
Gateway (admin) address : 0x118323edce4757177D30bcC20D3D990Ff2bD1B05
*/

const RNFT_ADDRESS = "0xE79a633Ec4a5BAFF8b25093CC44C32800565a1a0";
const RNFT_NAME = "RNFT";
const GATEWAY_ADDRESS = "0x03Dafc6bBF74675432624F184cb52d2AF492F6F6";
const GATEWAY_NAME = "Gateway";

const NFT_ADDRESS = "0xD369c3DfD5EbF11e154F096649e131A8BfAb2f7e"; // LANDRegistry
const NFT_NAME = "contracts/DCL/LANDRegistry.sol:LANDRegistry";
const ORIGINAL_NFT_ID = 14;
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

const init = async () => {
    // let prevBalance, afterBalance, initialBalance;

    // console.log(`\n\nGas consumption for project setup - one time consumption`);
    // console.log(`============================================================`);

    [owner, renter, other] = await ethers.getSigners();

    // initialBalance = prevBalance = await ethers.provider.getBalance(owner.address);

    // get rNFT
    // Get Original NFT contract
    rNFT = await ethers.getContractAt(
        RNFT_NAME,
        RNFT_ADDRESS,
        owner
    );
    console.log(`RNFT address : ${rNFT.address}`);

    // Get gateway
    gateway = await ethers.getContractAt(
        GATEWAY_NAME,
        GATEWAY_ADDRESS,
        owner
    );
    console.log(`Gateway address : ${gateway.address}`);

    // Get Original NFT contract
    // const landRegistry = await ethers.getContractAt(
    //   NFT_NAME,
    //   NFT_ADDRESS,
    //   owner
    // );

    // Approve RNFT for all (required to call `setUpdateManager`)
    // await landRegistry.setApprovalForAll(rNFT.address, true);
    // set Gateway as the admin of RNFT
    // await rNFT._setNewAdmin(gateway.address);

    // afterBalance = await ethers.provider.getBalance(owner.address);
    // console.log(`Configuration : ${ethers.utils.formatUnits(prevBalance - afterBalance, 18)} eth`);
    // prevBalance = afterBalance;

    // console.log(`------------------------------------------------------------`);    
    // console.log(`Project setup (total) : ${ethers.utils.formatUnits(initialBalance - afterBalance, 18)} eth`);
    // console.log(`============================================================`);
}

const one_go = async (
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
    let prevOwnerBalance, afterOwnerBalance, initialOwnerBalance;
    let prevRenterBalance, afterRenterBalance, initialRenterBalance;

    initialOwnerBalance = prevOwnerBalance = await ethers.provider.getBalance(owner.address);
    initialRenterBalance = prevRenterBalance = await ethers.provider.getBalance(renter.address);

    console.log(`Lender balance: ${ethers.utils.formatUnits(initialOwnerBalance, 18)} eth`);
    console.log(`Renter Balance: ${ethers.utils.formatUnits(initialRenterBalance, 18)} eth`);

    // get TRILL token contract
    const trillToken = await ethers.getContractAt(TRILL_NAME, TRILL_ADDRESS, owner);
    // approve Gateway to take token from the renter
    await trillToken.connect(RENTER).approve(
        gateway.address, // GATEWAY
        RENT_PRICE_PER_TIMEUNIT_TRILL * MAX_DURATION_IN_DAYS
    );
  
    afterRenterBalance = await ethers.provider.getBalance(RENTER.address);
    console.log(`Token approval : ${ethers.utils.formatUnits(prevRenterBalance - afterRenterBalance, 18)} eth`);

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
    afterOwnerBalance = await ethers.provider.getBalance(owner.address);
    console.log(`Create Lend Record : ${ethers.utils.formatUnits(prevOwnerBalance - afterOwnerBalance, 18)} eth`);


    // approve & premint
    await gateway
        .connect(LENDER)
        .approveAndPreMintRNFT(
        NFT_ADDRESS,
        ORIGINAL_NFT_ID,
        MIN_DURATION * TIME_UINT_IN_SECONDS,
        RENTER.address
    );
    afterOwnerBalance = await ethers.provider.getBalance(owner.address);
    console.log(`Approve & pre-mint : ${ethers.utils.formatUnits(prevOwnerBalance - afterOwnerBalance, 18)} eth`);

    // confirm payment
    await gateway
        .connect(RENTER)
        .confirmRentAgreementAndPay(NFT_ADDRESS, ORIGINAL_NFT_ID);
    afterRenterBalance = await ethers.provider.getBalance(RENTER.address);
    console.log(`Confirm & pay : ${ethers.utils.formatUnits(prevRenterBalance - afterRenterBalance, 18)} eth`);

    // // stimulate time
    // await ethers.provider.send("evm_increaseTime", [
    //     MAX_DURATION * TIME_UINT_IN_SECONDS,
    // ]);
    // await ethers.provider.send("evm_mine");

    // // terminate
    // await gateway
    //     .connect(LENDER)
    //     .terminateRentAgreement(NFT_ADDRESS, ORIGINAL_NFT_ID);
    // afterOwnerBalance = await ethers.provider.getBalance(owner.address);
    // console.log(`Termiante : ${ethers.utils.formatUnits(prevOwnerBalance - afterOwnerBalance, 18)} eth`);

    // // withdraw rent fund
    // await gateway.connect(LENDER).withdrawRentFund(NFT_ADDRESS, ORIGINAL_NFT_ID);
    // afterOwnerBalance = await ethers.provider.getBalance(owner.address);
    // console.log(`Withdraw fund : ${ethers.utils.formatUnits(prevOwnerBalance - afterOwnerBalance, 18)} eth`);
    
    // // redeem
    // await gateway.connect(LENDER).redeemNFT(NFT_ADDRESS, ORIGINAL_NFT_ID);
    // afterOwnerBalance = await ethers.provider.getBalance(owner.address);
    // console.log(`Redeem : ${ethers.utils.formatUnits(prevOwnerBalance - afterOwnerBalance, 18)} eth`);

    console.log(`------------------------------------------------------------`);    
    console.log(`One-go (total) - owner : ${ethers.utils.formatUnits(initialOwnerBalance - afterOwnerBalance, 18)} eth`);
    console.log(`One-go (total) - renter : ${ethers.utils.formatUnits(initialRenterBalance - afterRenterBalance, 18)} eth`);
    console.log(`============================================================`);
};

const supportTRILLERC20 = async () => {

    let prevBalance, afterBalance, initialBalance;

    console.log(`\n\nGas consumption for supported token addition - one time consumption per request`);
    console.log(`============================================================`);

    initialBalance = prevBalance = await ethers.provider.getBalance(owner.address);

    // Add TRILL as the supported payment method
    await gateway.setSupportedPaymentTokens(TRILL_ADDRESS);

    afterBalance = await ethers.provider.getBalance(owner.address);
    console.log(`ERC20 token support : ${ethers.utils.formatUnits(prevBalance - afterBalance, 18)} eth`);
    prevBalance = afterBalance;

    console.log(`------------------------------------------------------------`);    
    console.log(`ERC20 support (total) : ${ethers.utils.formatUnits(initialBalance - afterBalance, 18)} eth`);
    console.log(`============================================================`);

}

const check = async () => {
    // let prevOwnerBalance, afterOwnerBalance, initialOwnerBalance;
    // let prevRenterBalance, afterRenterBalance, initialRenterBalance;33// Get Trill Token contract

    // await supportTRILLERC20();

    console.log(`\n\nGas consumption for one-go`);
    console.log(`============================================================`);

    // initialOwnerBalance = prevOwnerBalance = await ethers.provider.getBalance(owner.address);
    // initialRenterBalance = prevRenterBalance = await ethers.provider.getBalance(renter.address);

    await one_go(
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
    // afterOwnerBalance = await ethers.provider.getBalance(owner.address);
    // afterRenterBalance = await ethers.provider.getBalance(renter.address);

    // console.log(`\n`);
    // console.log(`********************************`);
    // console.log(`Amounts totally spent :`);
    // console.log(`lender : ${ethers.utils.formatUnits(initialOwnerBalance - afterOwnerBalance, 18)} eth`);
    // console.log(`renter : ${ethers.utils.formatUnits(initialRenterBalance - afterRenterBalance, 18)} eth`);
}

const main = init()
            .then(() => check());