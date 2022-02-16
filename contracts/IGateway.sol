// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IGateway {

    /// @dev Explain to a developer any extra details
    struct Lending {
        address lender;
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

    event add_admin(address newAdmin);
    event remove_admin(address current_admin);

    event add_lending(address lender, address nftAddress, uint256 nftId);
    event remove_lending(address lender, address nftAddress, uint256 nftId);
    event NFTOnLent(address lender,address nftAddress, uint256 original_nftId,uint64 maxDuration,
    uint64 minDuration,uint256 rentPricePerTimeUnit);
    event RenterApprovedAndRNFTPreMinted(address lender,address nftAddress, uint256 original_nftId, uint256 _rNftId, uint64 maxDuration,
    uint64 minDuration,uint256 rentPricePerTimeUnit, uint256 rentDuration);

}