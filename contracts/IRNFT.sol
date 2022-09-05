// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IRNFT {

    struct Renting{
        address originalOwner;
        bool isRented;
        address approvedRenter;
        uint256 rentPrice;
        uint256 approvedRentPeriod;
        uint256 rStartTime;
        uint256 rEndTime;
        bool mintNonce;
        bool isRentBalanceWithdrawn;
    }

    event RNFTNewAdminAdded(address newAdmin);
    event RNFTAdminRemoved(address admin);
    function initializeRentMetadata(address originalOwner, address nftAddress,uint256 oTokenId) external returns (uint256);
    function approveRenter(uint256 timeUnitSec,uint256 rentDuration,uint256 timeUnitPrice,address approvedRenter, uint256 _RTokenId) external returns (uint256);
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
    function _setNewAdmin(address newAdmin) external;
    function _removeAdmin(address admin) external;
    function setWithdrawFlag(uint256 rTokenId) external;
    function isWithdrawn(uint256 rTokenId) external view returns (bool);
}