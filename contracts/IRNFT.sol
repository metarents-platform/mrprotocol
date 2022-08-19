// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRNFT {

    // RNFT Metadata
    struct Renting{
        address originalOwner;
        // Boolean indicating if the NFT is rented
        bool isRented;
        // The address of the approved renter
        address approvedRenter;
        // Total price of the rent period
        uint256 rentPrice;
        // Approved rent period in seconds
        uint256 approvedRentPeriod;
        // The rent start time (once RNFT is minted and payment is done)
        uint256 rStartTime;
        // The rent end time (checked at redeem and )
        uint256 rEndTime;
        // nonce to check if RNFT is minted or not
        bool mintNonce;
    }

    event RNFTNewAdminAdded(address newAdmin);
    event RNFTAdminRemoved(address admin);
    // setter function to store initial rent metadata (owner, nftAddress, oNftId)
    function initializeRentMetadata(address originalOwner, address nftAddress,uint256 oTokenId) external returns (uint256);
    function approveRenter(uint256 timeUnitSec,uint256 rentDuration,uint256 timeUnitPrice,address approvedRenter, uint256 _RTokenId) external returns (uint256);
    // function approveRenter(address orignalOwner,address nftAddress,uint256 oTokenId,uint256 timeUnitSec,uint256 rentDuration,uint256 timeUnitPrice,address approvedRenter) external returns (uint256);
    function preMintRNFT() internal returns(uint256);
    function _mintRNFT(address nftAddress, address originalOwner, uint256 oTokenId, uint256 _RTokenId) external returns (uint256);
    function startRent(address assetRegistry, uint256 originalNFTId, uint256 RTokenId) external;
    function _terminateRent(address assetRegistry, uint256 RTokenId, uint256 originalNFTId, address caller) external;
    function _redeemNFT(uint256 RTokenId, address nftAddress, uint256 oNftId, address originalNFTOwner) external;
    function _burnRNFT(uint256 RTokenId) external;
    function clearRNFTState(uint256 RTokenId) external returns(bool);

    function getRnftFromNft(address origContract, address originalOwner, uint256 oTokenId) external view returns (uint256);
    function isApprovedRenter(address renter, uint256 RTokenId) external view returns (bool);
    function isRented(uint256 RTokenId) external view returns (bool);
    function isMinted(uint RTokenId) external view returns (bool);
    function getRentPrice(uint RTokenId) external view returns (uint256);
    function getApprovedRentPeriod(uint RTokenId) external view returns (uint256);
    function getApprovedRenter(uint RTokenId) external view returns (address);
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    
    /** RNFT Contract Role-based Access Control */
    function _setNewAdmin(address newAdmin) external;
    function _removeAdmin(address admin) external;
}