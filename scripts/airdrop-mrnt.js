const { ethers } = require("hardhat");

const TRILL_ADDRESS = "0x5858Dcb6e052E884fC74F98e8E95cd753B448960";
const TRILL_NAME = "MRNT";

const AIRDROP_AMOUNT = 1e15;

const team = [
  "0x237906fd2884235ed0F32DfE84cc89A97bB76249",
  "0x6BcA3563F5503254A7206607f32030573c7d9D36",
  "0x5ca6Ff0784fcd11f2BA64B89f08404De56E8B2Fa",
  "0x4FCd3D2E887DEC8ff40e99E999bcc8c63689d776",
  "0xA3AacdB2B572e5Be1De632A50E15931aCB22C64A",
  "0xFe42e5800276f7dF36140E996aF5C6Da363b0923",
  "0x0d2D0b339E153bf89964166E2740F1Fc495c03eE",
];

let owner, mrntToken;

const init = async () => {
  [owner, ] = await ethers.getSigners();
  mrntToken = await ethers.getContractAt(TRILL_NAME, TRILL_ADDRESS, owner);

  console.log(mrntToken);
}

const setVault = async (newVault) => {
  console.log(`setting ${newVault} as the team member`);
  await mrntToken.setVault(newVault, {
    gasLimit: 100000,
    nonce: undefined,
  });
  console.log(`setting ${newVault} as the team member done!!!`);
}

const airdrop = async (addresses) => {
  for (const address of team) {
    console.log(`starting .... airdrop ${AIRDROP_AMOUNT} to ${address}`);
    await mrntToken.mint(address, AIRDROP_AMOUNT, {
      gasLimit: 100000,
      gasPrice: owner.gasPrice,
    });
    console.log(`done .... airdrop ${AIRDROP_AMOUNT} to ${address}`);
  }
}

init()
  // .then(() => setVault(owner.address))
  .then(() => airdrop(team));