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

    function createLendRecord(
        address nftAddress,
        uint256 original_nftId,
        uint256 maxDuration,
        uint256 minDuration,
        uint256 timeUnit,
        uint256 _rentPricePerTimeUnit,
        address _paymentMethod
        ) external onlyApprovedOrOwner(msg.sender,nftAddress,original_nftId);

    function _approveAndPreMintRNFT(
        address nftAddress,
        uint256 _NFTId,
        uint256 rentDuration,
        address renter_address
    ) external nonReentrant
    onlyApprovedOrOwner(msg.sender,nftAddress,_NFTId) returns(address _rNftId);

    function approveRenterRequest(address renterAddress,address nftAddress, uint256 oNftId, uint256 rentDuration)
    external nonReentrant onlyApprovedOrOwner(msg.sender,nftAddress,oNftId) returns (uint256);

    function confirmRentAgreementAndPay(address nftAddress,uint256 originalTokenId)
    external nonReentrant virtual returns (uint256 _RNFT_tokenId);
    
    function distributePaymentTransactions(address nftAddress,uint256 nftId,uint256 _RNFT_tokenId, address _renterAddress)
    internal payable returns (uint256 totalRentPrice,uint256 _serviceFee);
    
    function cancelApproval(address nftAddress, uint256 nftId, address renterAddress) 
    public onlyApprovedOrOwner(msg.sender,nftAddress,nftId) returns(bool);

    function getLending(address nftAddress,uint256 nftId) public view returns (Lending memory lendingData);

    function removeLending(address nftAddress, uint256 nftId) public onlyApprovedOrOwner(msg.sender,nftAddress,nftId);

    function terminateRentAgreement(address nftAddress, uint256 oNftId)
    external nonReentrant onlyApprovedOrOwner(msg.sender,nftAddress,oNftId);

    function redeemNFT(address nftAddress, uint256 oNftId)
    external nonReentrant onlyApprovedOrOwner(msg.sender,nftAddress,oNftId);

     /** MetaRents Platform settings & configuration **/
    function setFee(uint256 fee_) public onlyAdmin;
    function getFee() public view onlyAdmin returns(uint256);
    function setMarketGatewayTreasury(address treasuryAddress) public onlyAdmin;
    function setMaxRentDurationLimit(uint64 mdl) public onlyAdmin;
    function getSupportedPaymentTokens() public view returns(address[] memory);
    function isSupportedPaymentToken(address tokenAddress) external view returns(bool);
    function setSupportedPaymentTokens(address tokenAddress) external onlyAdmin returns(address, string memory);

    /** Gateway Contract Role-based Access Control */
    function setNewAdmin(address _newAdmin) external onlyOwner;
    function removeAdmin(address _admin) external onlyOwner;

}