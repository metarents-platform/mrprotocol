const { ethers, upgrades } = require("hardhat")

async function main() {
    const Gateway = await ethers.getContractFactory("Gateway");
    const PROXY_ADDRESS = "0x03Dafc6bBF74675432624F184cb52d2AF492F6F6";
    const RNFT_ADDRESS = "0xE79a633Ec4a5BAFF8b25093CC44C32800565a1a0";
    const gateway = await upgrades.upgradeProxy(PROXY_ADDRESS, Gateway);
    
    console.log(`Gateway (proxy) address : ${gateway.address}`);
    console.log(`Gateway (implementation) address : ${await upgrades.erc1967.getImplementationAddress(gateway.address)}`);
    console.log(`Gateway (admin) address : ${await upgrades.erc1967.getAdminAddress(gateway.address)}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.log(err);
        process.exit(1);
    })