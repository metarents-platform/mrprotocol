
/*** DCL LAND Registry Contract parameters ***/
const contractAddress = "0xC1436f5788eAeE05B9523A2051117992cF6e22d8"; // Update with the address of your smart contract
const contractAbi = "./LANDRegistry.json"; // Update with an ABI file, for example "./sampleAbi.json"

/*** Global scope variables that will be automatically assigned values later on ***/
let infoSpace; // This is an <ul> element where we will print out all the info
let web3; // Web3 instance
let contract; // Contract instance
let account; // Your account as will be reported by Metamask

const team = [
  // "0x237906fd2884235ed0F32DfE84cc89A97bB76249",
  "0x6BcA3563F5503254A7206607f32030573c7d9D36",
  "0x5ca6Ff0784fcd11f2BA64B89f08404De56E8B2Fa",
  "0x4FCd3D2E887DEC8ff40e99E999bcc8c63689d776",
  // "0xA3AacdB2B572e5Be1De632A50E15931aCB22C64A",
  // "0xFe42e5800276f7dF36140E996aF5C6Da363b0923",
  // "0x0d2D0b339E153bf89964166E2740F1Fc495c03eE",
];

const serverUrl = "https://gpwt9opruwl8.usemoralis.com:2053/server";
const appId = "baEfrgKJ1clN7nAexmJAK6lZLXmM63RpClx59D28";
Moralis.start({ serverUrl, appId });

async function login() {
  let user = Moralis.User.current();
  if (!user) {
    try {
      user = await Moralis.authenticate({ signingMessage: "Hello World!" });
      console.log(user);
      console.log(user.get("ethAddress"));
    } catch (error) {
      console.log(error);
    }
  }
}

/*** Initialize when page loads ***/
window.addEventListener("load", () => {
  // Shortcut to interact with HTML elements
  infoSpace = document.querySelector(".info");
  document.getElementById("btn-login").onclick = login;

  // Check whether ethereum is defined, ie. MetaMask plugin is active
  document.querySelector(".start").addEventListener("click", async () => {
    if (contractAddress === "" || contractAbi === "") {
      printResult(
        `Make sure to set the variables <code>contractAddress</code> and <code>contractAbi</code> in <code>./index.js</code> first. Check out <code>README.md</code> for more info.`
      );
      return;
    }

    if (typeof ethereum === "undefined") {
      printResult(
        `Metamask not connected. Make sure you have the Metamask plugin, you are logged in to your MetaMask account, and you are using a server or a localhost (simply opening the html in a browser won't work).`
      );
      return;
    }

    // Create a Web3 instance
    web3 = new Web3(window.ethereum);

    // Calling desired functions
    await connectWallet();
    console.log('Wallet connected');
    await connectContract(contractAbi, contractAddress);
    // const testnetNFTs = await Moralis.Web3API.account.getNFTs({ chain: "rinkeby" });
    // console.log(testnetNFTs)
    let landcount = Math.floor(Math.random() * 100);
    await airdrop(landcount);
  });
});

/*** Functions ***/

// Helper function to print results
const printResult = (text) => {
  infoSpace.innerHTML += `<li>${text}</li>`;
};

// Helper function to display readable address
const readableAddress = (address) => {
  return `${address.slice(0, 5)}...${address.slice(address.length - 4)}`;
};

// Helper function to get JSON (in order to read ABI in our case)
const getJson = async (path) => {
  const response = await fetch(path);
  const data = await response.json();
  return data;
};

// Connect to the MetaMast wallet
const connectWallet = async () => {
  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  account = accounts[0];
  printResult(`Connected account: ${readableAddress(account)}`);
};

// Connect to the contract
const connectContract = async (contractAbi, contractAddress) => {
  const data = await getJson(contractAbi);
  const contractABI = data;
  contract = new web3.eth.Contract(contractABI, contractAddress);
  printResult(`LANDRegistry Contract Address: ${contractAddress}`)
};


const airdrop = async (amount) => {
  console.log(team);
  let y = 0;
  let dcl_url = ""
  team.forEach(async (beneficiary, x) => {
    // console.log(
    //   `Assigning ${amount} parcels to ${readableAddress(beneficiary)} at index ${x}...`
    // );
      y = Math.floor(Math.random() * 80)
    // for(let y=0; y < amount; y++){
      console.log(`Parcels to : ${x},${y}`)
      printResult(`Assigning Parcel (${x},${y}) to ${readableAddress(beneficiary)}`)
      /**
       * compose json
      //  */
      dcl_url = `https://api.decentraland.org/v2/parcels/${x}/-${y}/map.png?size=24&width=1024&height=1024`
      const nft_metadata = {
        "data": [
        {
          "nft": {
            "id": "asset_id_placeholder",
            "tokenId": "token_id_placeholder",
            "contractAddress": "0xC1436f5788eAeE05B9523A2051117992cF6e22d8",
            "activeOrderId": null,
            "owner": beneficiary,
            "name": `Parcel (${x},${y})`,
            "image": `https://api.decentraland.org/v1/parcels/${x}/${y}/map.png`,
            "url": "/contracts/0xC1436f5788eAeE05B9523A2051117992cF6e22d8/tokens/115792089237316195423570985008687907848846313895668364014433714111300142891009",
            "data": { 
              "parcel": {
                "description": "Decentraland test LAND NFT",
                "x": x,
                "y": y,
                "estate": null
              }
            },
            "issuedId": null,
            "itemId": null,
            "category": "parcel",
            "network": "ETHEREUM",
            "chainId": 1,
            "createdAt": 1516590150000,
            "updatedAt": 1623698990000,
            "soldAt": 1623698990000
          },
          "order": null
        }
        ],
        "total": 1000
      };

      // // /**
      //  * upload json to IPFS
      //  */
      const file = new Moralis.File(`land${x}_${y}.json`, {
        base64: btoa(JSON.stringify(nft_metadata)),
      });
      await file.saveIPFS();
      console.log(file.ipfs());
      printResult("IPFS metadata: " + file.ipfs());
      // /**
      //  * mint
      //  */
      const txn = await contract.methods.assignNewParcel(
        x,
        y,
        beneficiary,
        file.ipfs()
        //`https://api.decentraland.org/v2/contracts/0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d/tokens/18034965446809738563558854193883715207157`
      ).send({ from: account });

      await txn.wait();
    } 
    )
  };

  // const metadata = {
  //   description: "Decentraland test LAND",
  //   image: dcl_url,
  //   external_url: "https://market.decentraland.org/contracts/0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d/tokens/18034965446809738563558854193883715207157",
  //   name: `Parcel (${x},${y})`,
  //   attributes: [
  //     {
  //       display_type: "number",
  //       trait_type: "X",
  //       value: x,
  //     },
  //     {
  //       display_type: "number",
  //       trait_type: "Y",
  //       value: y,
  //     },
  //     {
  //       display_type: "number",
  //       trait_type: "Distance to road",
  //       value: Math.sqrt(x * x + y * y),
  //     },
  //   ],
  // };







// const nft_metadata = {
//   "data": [
//   {
//   "nft": {
//     "id": "0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d-115792089237316195423570985008687907848846313895668364014433714111300142891009",
//     "tokenId": "115792089237316195423570985008687907848846313895668364014433714111300142891009",
//     "contractAddress": "0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d",
//     "activeOrderId": null,
//     "owner": "0x26648e3f7c7b12e55f6637f4bb5bd75314af943a",
//     "name": "Rare Genesis Plaza Gem!",
//     "image": "https://api.decentraland.org/v1/parcels/-13/1/map.png",
//     "url": "/contracts/0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d/tokens/115792089237316195423570985008687907848846313895668364014433714111300142891009",
//     "data": {
//       "parcel": {
//         "description": "Extremely rare parcel for sale.  Next to Genesis Plaza and touching the double road. Excellent long-term investment. Priced to sell.  ",
//         "x": "-13",
//         "y": "1",
//         "estate": null
//       }
//   },
//     "issuedId": null,
//     "itemId": null,
//     "category": "parcel",
//     "network": "ETHEREUM",
//     "chainId": 1,
//     "createdAt": 1516590150000,
//     "updatedAt": 1623698990000,
//     "soldAt": 1623698990000
//   },
//     "order": null
//     }
//   ],
//     "total": 1000
//   }


  // return Promise.all(promises).then(() =>
    // // console.log(`Parcels to : ${x},${y}`)
    //   console.log(`Airdropped to : ${team}`)
    // );





// const assignNewParcel = async (x, y, address) => {
//   printResult(`Parcel (x,y) assigned to ${readableAddress(address)}`);
//   try {
//       const result = await contract.methods.assignNewParcel(x, y, address).send({ from: account });
//       printResult(`Parcel assigned to account ${readableAddress(address)} `);
//       printResult(`Result: ${result.status}`);
//   } catch (error) {
//     printResult(`Error: ${error.message}`);
//   }
// };

