// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title IGateway
/// @author Moughite El Joaydi (@Metajazzy)
/// @notice Explain to an end user what this does
/// @dev Explain to a developer any extra detail

interface IRNFT {

    function addAdmin(address newAdmin) external;
    function removeAdmin(address admin) external;
    
    function approveRenter(
    address orignalOwner,
    address nftAddress,
    uint256 oTokenId,
    uint256 timeUnitSec,
    uint256 rentDuration,
    uint256 timeUnitPrice,
    address approvedRenter) external onlyAdmin returns (uint256);
    function preMintRNFT() private onlyAdmin returns(uint256);
    function _mintRNFT(address nftAddress, address orignalOwner, uint256 oTokenId, uint256 _RTokenId) private returns (uint256);
    function startRent(uint256 RTokenId) external onlyAdmin;
    function terminateRent(uint256 RTokenId) external onlyAdmin;
    function _burnRNFT() private onlyAdmin returns(uint256);

    function getRnftFromNft(address origContract, address orignalOwner, uint256 oTokenId) public view returns (uint256);
    function isApprovedRenter(address renter, uint256 RTokenId) public view returns (bool);
    function isRented(uint256 RTokenId) public view returns (bool);
    function getRentPrice(uint RTokenId) public view returns (uint128);
    function getApprovedRentPeriod(uint RTokenId) public view returns (uint128);
    function getApprovedRenter(uint RTokenId) public view returns (address);
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable, ERC721Upgradeable) returns (bool);

}