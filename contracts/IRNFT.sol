// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @author Moughite El Joaydi (@Metajazzy), Robert M. Carden (@crazydevlegend), Robert M. Carden (@crazydevlegend)
/// @title Market Gateway Contract
/// @dev RNFT Contract is an ERC-721 implementation to manage lender RentNFTs (RNFTs) and rent operations

// RNFT Metadata
struct Renting {
  address originalOwner;
  address nftAddress;
  uint256 oTokenId;
  // Boolean indicating if the NFT is rented
  bool isRented;
  // The address of the approved renter
  address approvedRenter;
  // Total price of the rent period
  uint128 rentPrice;
  // Approved rent period in seconds
  uint128 approvedRentPeriod;
  // The rent start time (once RNFT is minted and payment is done)
  uint128 rStartTime;
  // The rent end time (checked at redeem and )
  uint128 rEndTime;
  // nonce to check if RNFT is minted or not
  bool mintNonce;
}

interface IRNFT {

    function addAdmin(address newAdmin) external;
    function removeAdmin(address admin) external;
    
      // setter function to store initial rent metadata (owner, nftAddress, oNftId)
    function initializeRentMetadata(address orignalOwner, address nftAddress,uint256 oTokenId) external;
    function approveRenter(uint256 timeUnitSec,uint256 rentDuration,uint256 timeUnitPrice,address approvedRenter) external returns (uint256);
    // function approveRenter(address orignalOwner,address nftAddress,uint256 oTokenId,uint256 timeUnitSec,uint256 rentDuration,uint256 timeUnitPrice,address approvedRenter) external returns (uint256);
    function preMintRNFT() external returns(uint256);
    function _mintRNFT(address nftAddress, address orignalOwner, uint256 oTokenId, uint256 _RTokenId) external returns (uint256);
    function startRent(uint256 RTokenId) external;
    function terminateRent(uint256 RTokenId) external;
    function _redeemNFT(uint256 RTokenId, address nftAddress, uint256 oNftId, address originalNFTOwner) external;
    function _burnRNFT() external returns(uint256);
    function clearRNFTState(uint256 RTokenId) external returns(bool);

    function getRnftFromNft(address origContract, address orignalOwner, uint256 oTokenId) external view returns (uint256);
    function isApprovedRenter(address renter, uint256 RTokenId) external view returns (bool);
    function isRented(uint256 RTokenId) external view returns (bool);
    function isMinted(uint RTokenId) external view returns (bool);
    function getRentPrice(uint RTokenId) external view returns (uint128);
    function getApprovedRentPeriod(uint RTokenId) external view returns (uint128);
    function getApprovedRenter(uint RTokenId) external view returns (address);
    function supportsInterface(bytes4 interfaceId) external view returns (bool);

}