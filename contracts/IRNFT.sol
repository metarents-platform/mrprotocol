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

}