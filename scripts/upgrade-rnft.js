const { ethers, upgrades } = require("hardhat")

async function main() {
    const RNFT = await ethers.getContractFactory("RNFT");
    const PROXY_ADDRESS = "0xE79a633Ec4a5BAFF8b25093CC44C32800565a1a0";
    const rnft = await upgrades.upgradeProxy(PROXY_ADDRESS, RNFT);
    
    console.log(`RNFT (proxy) address : ${rnft.address}`);
    console.log(`RNFT (implementation) address : ${await upgrades.erc1967.getImplementationAddress(rnft.address)}`);
    console.log(`RNFT (admin) address : ${await upgrades.erc1967.getAdminAddress(rnft.address)}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.log(err);
        process.exit(1);
    })