// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { Base64 } from "base64-sol/base64.sol";

// deployed to Rinkeby : 0xF8764D543ae563A0B42761DCd31bE102603b722E
contract SmolRunners is ERC721Enumerable, Ownable {
  using Strings for uint256;

  string public baseURI = "https://gateway.pinata.cloud/ipfs/QmTZDQ2RSd6atn6BCBZSbK7nLRuScWZoQsDqXjsmbhCkw6/";

  uint256 public cost = 0.05 ether;
  uint256 public maxSupply = 7777;
  uint256 public maxMintAmount = 10;

  bool public paused = false;
  bool public revealed = true;

  string public notRevealedUri;

  constructor() ERC721("SmolRunners", "SMR") {
  }


  function _baseURI() internal view virtual override returns (string memory) {
    return baseURI;
  }

  function mint(uint256 _mintAmount) public payable {
    uint256 supply = totalSupply();
    require(!paused, "Paused from minting!");
    require(_mintAmount > 0, "Must mint at least ONE!");
    require(_mintAmount <= maxMintAmount, "Cannot mint that amount at once");
    require(supply + _mintAmount <= maxSupply, "Not enough NFTs left!");

    if (msg.sender != owner()) {
      require(msg.value >= cost * _mintAmount, "Not enough fund!");
    }

    for (uint256 i = 1; i <= _mintAmount; i++) {
      _safeMint(msg.sender, supply + i);
    }
  }

  function walletOfOwner(address _owner)
    public
    view
    returns (uint256[] memory)
  {
    uint256 ownerTokenCount = balanceOf(_owner);
    uint256[] memory tokenIds = new uint256[](ownerTokenCount);
    for (uint256 i; i < ownerTokenCount; i++) {
      tokenIds[i] = tokenOfOwnerByIndex(_owner, i);
    }
    return tokenIds;
  }

  function tokenURI(uint256 tokenId)
    public
    view
    virtual
    override
    returns (string memory)
  {
    require(
      _exists(tokenId),
      "query on non-exist token"
    );
    
    if(revealed == false) {
        return notRevealedUri;
    }

    string memory currentBaseURI = _baseURI();

    string memory encodedJson = Base64.encode(bytes(abi.encodePacked(
        "{",
            '"id": "', Strings.toString(tokenId), '",',
            '"name": "SmolRunners #', Strings.toString(tokenId), '",',
            '"description": "SmolRunners is an NFT project by Robert",',
            '"image": "', currentBaseURI, Strings.toString(tokenId), '.png"'//"',"
            // "'attributes': ", attrs,
        "}"
    )));
    string memory finalUri = string(abi.encodePacked(
        "data:application/json;base64,",
        encodedJson
    ));
    return finalUri;
  }


  function reveal() public onlyOwner {
      revealed = true;
  }
  
  function setCost(uint256 _newCost) public onlyOwner {
    cost = _newCost;
  }

  function setmaxMintAmount(uint256 _newmaxMintAmount) public onlyOwner {
    maxMintAmount = _newmaxMintAmount;
  }
  
  function setNotRevealedURI(string memory _notRevealedURI) public onlyOwner {
    notRevealedUri = _notRevealedURI;
  }

  function setBaseURI(string memory _newBaseURI) public onlyOwner {
    baseURI = _newBaseURI;
  }

  function pause(bool _state) public onlyOwner {
    paused = _state;
  }
 

  function withdraw() public payable onlyOwner {
    (bool success, ) = payable(msg.sender).call{value: address(this).balance}("");
    require(success, "Withdrawal failed!");
  }
}