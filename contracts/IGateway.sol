// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IGateway {

    /// @dev Lending metadata
    struct Lending {
        address payable lender;
        uint256 nftId;
        address nftAddress;
        uint256 maxDuration;
        uint256 minDuration;
        uint256 timeUnit;
        uint256 rentPricePerTimeUnit; // price per second
        address acceptedPaymentMethod;
    }

    // /// @dev lendRecord struct to store lendingMap
    struct lendRecord{
        mapping (uint256=>Lending) lendingMap;
    }

    // struct NFTRoyalty {
    //     uint256 fee;
    //     uint256 balance;
    //     address beneficiary;
    // }

    event NewAdminAdded(address newAdmin);
    event AdminRemoved(address current_admin);
    event add_lending(address lender, address nftAddress, uint256 nftId);
    event remove_lending(address lender, address nftAddress, uint256 nftId);
    event NFTOnLent(address lender,address nftAddress, uint256 original_nftId,uint256 maxDuration,uint256 minDuration,uint256 rentPricePerTimeUnit);
    event RenterApprovedAndRNFTPreMinted(address lender,address nftAddress, uint256 original_nftId,uint256 _RNFT_tokenId, address renter_address, uint256 rent_duration,uint256 rentPricePerTimeUnit);

    function createLendRecord(
        address nftAddress,
        uint256 original_nftId,
        uint256 maxDuration,
        uint256 minDuration,
        uint256 timeUnit,
        uint256 _rentPricePerTimeUnit,
        address _paymentMethod
    ) external;

    function approveAndPreMintRNFT(
        address nftAddress,
        uint256 _NFTId,
        uint256 rentDuration,
        address renter_address
    ) external returns(uint256 _rNftId);

    function _approveRenterRequest(address _renterAddress, address nftAddress, uint256 oNftId, uint256 rentDuration, uint256 _rNftId) external returns (uint256);
    function confirmRentAgreementAndPay(address nftAddress,uint256 originalTokenId) external returns (uint256 _RNFT_tokenId);
    
    function distributePaymentTransactions(address nftAddress,uint256 nftId,uint256 _RNFT_tokenId, address _renterAddress)
    external payable returns (uint256 totalRentPrice,uint256 _serviceFee);
    
    function cancelApproval(address nftAddress, uint256 nftId, address renterAddress) external returns(bool);
    function getLending(address nftAddress,uint256 nftId) external view returns (Lending memory lendingData);
    function removeLending(address nftAddress, uint256 nftId) external;
    function terminateRentAgreement(address nftAddress, uint256 oNftId)external;
    function redeemNFT(address nftAddress, uint256 oNftId) external;

     /** MetaRents Platform settings & configuration **/
    function setFee(uint256 fee_) external;
    function getFee() external view returns(uint256);
    function setMarketGatewayTreasury(address payable treasuryAddress) external;
    function setMaxRentDurationLimit(uint256 mdl) external;
    function getSupportedPaymentTokens() external view returns(address[] memory);
    function isSupportedPaymentToken(address tokenAddress) external view returns(bool);
    function setSupportedPaymentTokens(address tokenAddress) external returns(address, string memory);

    /** Gateway Contract Role-based Access Control */
    function setNewAdmin(address _newAdmin) external;
    function removeAdmin(address _admin) external;

}