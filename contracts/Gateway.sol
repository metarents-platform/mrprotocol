// SPDX-License-Identifier: MIT

/// @author Moughite El Joaydi (@Metajazzy)
/// @title Market Gateway Contract
/// @dev Gateway contract serves as a middleware to execute lending and renting operations

pragma solidity ^0.8.0;

/* ERC token contracts */-
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
//  Proxy upgradable contracts
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
// Access control RBAC
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
// Math operations utils
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import "./RNFT.sol";
import "./IGateway.sol";


contract Gateway is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable,
OwnableUpgradeable, IGateway, RNFT, IERC20Upgradeable{

    /** RNFT Contract Address for Inter-Contract Execution */
    address internal _RNFTContractAddress;
    //using ERC165Checker for address;
    // Check if token interface are supported before starting operations
    //_registerInterface(interfaceId);
    using SafeERC20 for IERC20;
    using SafeMathUpgradeable for uint256;
    // enum TimeUnit {DAY, WEEK, MONTH};
    // Time Unit constants
    uint64 constant private DAY_IN_SECONDS = 86400;
    uint64 constant private WEEK_IN_SECONDS = 604800;
    uint64 constant private MONTH_IN_SECONDS = 2628000;

    address constant private _DCL_MANATokenAddress = address(0x0f5d2fb29fb7d3cfee444a200298f468908cc942);
    address[] internal supportedPaymentTokens;

    /// @dev lending record mapping each owner to his lendings - lendRegistry
    mapping (address=>lendRecord) internal lendRegistry;

    uint256 private _fee; // %
    address private _treasuryAddress;
    uint64 private _maxRentDurationLimit; // set max limit 1 year

    /* Proxy upgradable constructor */
    function initialize(address rNFTContractAddress_) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Ownable_init();
        // Add owner as administrator
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _RNFTContractAddress = rNFTContractAddress_;
        setSupportedPaymentTokens(_DCL_MANATokenAddress);
        // setMarketGatewayTreasury(0x00000)
        /** Add whitelist for 1st 100 customers for discount 0% up to 1 year*/
        setFee(10); // 10% platform service fee
        _maxRentDurationLimit = 31536000;
    }

    constructor() initializer { _;}

    modifier onlyAdmin()
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ERROR 401: Restricted to admins");
        _;
    }

    /// @dev check if address is owner or approved to operate NFT
    modifier onlyApprovedOrOwner(address operator,address nftAddress,uint256 tokenId) {
        IERC721 nftCtrInstance = ERC721(nftAddress);
        address owner = nftCtrInstance.ownerOf(tokenId);
        require(owner != address(0),"ERC721: Failed, spender query nonexistent token");
        require(operator == owner || nftCtrInstance.getApproved(tokenId) == operator || nftCtrInstance.isApprovedForAll(owner, operator),
        "Only owner or operator is allowed");
        _;
    }

    /// @dev add a new lending to list the NFT and store lending metadata
    function createLendRecord(
        address nftAddress,
        uint256 original_nftId,
        uint256 maxDuration,
        uint256 minDuration,
        uint256 timeUnit,
        uint256 _rentPricePerTimeUnit,
        address _paymentMethod
        ) external onlyApprovedOrOwner(msg.sender,nftAddress,original_nftId){

        /** Validate lending parameters and duration*/
        /** Check timeUnit against time constants */
        require(timeUnit == DAY_IN_SECONDS || timeUnit == WEEK_IN_SECONDS || timeUnit == MONTH_IN_SECONDS,"invalid time unit");
        require(minDuration > 0 && maxDuration > 0, "max or min duration should be > 0");
        require(maxDuration > minDuration,"invalid duration");
        require(maxDuration < block.timestamp,"invalid maxDuration");
        // check if maxDuration exceeds marketplace maxDuration limit
        require(maxDuration <= _maxRentDurationLimit,"max rent duration exceeds allowed limit");
        require(minDuration % timeUnit == 0 && maxDuration % timeUnit == 0,"duration must be in seconds; multiple of time units");
        //require(timeUnit == TimeUnit.DAY || timeUnit == TimeUnit.MONTH || timeUnit == TimeUnit.WEEK,"incorrect time unit");
        // store a new lending record metadata
        address owner = IERC721(nftAddress).ownerOf(original_nftId);
        Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[original_nftId];
        _lendRecord.lender = owner;
        _lendRecord.nftAddress = nftAddress;
        _lendRecord.NftId = original_nftId;
        _lendRecord.maxDuration = maxDuration;
        _lendRecord.minDuration = minDuration;
        _lendRecord.timeUnit = timeUnit;
        _lendRecord.rentPricePerTimeUnit = _rentPricePerTimeUnit; // supplied per second
        // Add supported token(s) (ETH, MANA) TBC - check if supported by the marketplace contract and owner
        require(isSupportedPaymentToken(_paymentMethod),"ERC20 Token not supported as payment method by market gateway");
        _lendRecord.acceptedPaymentMethod = _paymentMethod;
        emit NftOnLent(owner,nftAddress, original_nftId, maxDuration,minDuration,_rentPricePerTimeUnit);
    }

    /// @dev invoke RNFT Contract to approve renter and pre-mint new RNFT (rentNFT)
    function _approveAndPreMintRNFT(
        address nftAddress,
        uint256 _NFTId,
        uint256 rentDuration,
        address renter_address
    ) external nonReentrant
    onlyApprovedOrOwner(msg.sender,nftAddress,_NFTId) returns(address _rNftId){
        // supply to RNFT contract NFT metadata to map it to owner and RNFT metadata and approve renter
        _rNftId = approveRenterRequest(msg.sender,nftAddress,_NFTId, renter_address,rentDuration);
        emit RenterApprovedAndRNFTPreMinted(msg.sender,nftAddress,_NFTId, _rNftId,renter_address,rentDuration);
        return _rNftId;
    }

    /// @dev to approve a renter by supplying 'renter_address' and !!'rent_duration'!! to RNFT Contract
    /// @dev RNFT contract maps the RNFT to its metadata
    function approveRenterRequest(address renterAddress,address nftAddress, uint256 oNftId, uint256 rentDuration)
    external nonReentrant onlyApprovedOrOwner(msg.sender,nftAddress,oNftId) returns (uint256){
        lendingRecord = lendRegistry[nftAddress].lendingMap[oNftId];
        require(rentDuration % lendingRecord.timeUnit == 0," Invalid rent duration: not seconds");
        require(rentDuration >= lendingRecord.minDuration &&
        rentDuration <= lendingRecord.maxDuration,"invalid duration");
        // get Rent Price from RNFT Contract - getRentPrice()
        // supply all NFT parameters
        uint256 _RNFT_tokenId = IRNFT(_RNFTContractAddress).approveRenter(msg.sender,nftAddress,oNftId,renterAddress,
        lendingRecord,rentDuration,lendingRecord._rentPricePerTimeUnit);
        return _RNFT_tokenId;
    }

    /// @dev confirm rent agreement and pay rent fee to market beneficiary
    function confirmRentAgreementAndPay(address nftAddress,uint256 originalTokenId)
    external nonReentrant virtual returns (uint256 _RNFT_tokenId){
        address renterAddress = msg.sender;
        _lender = lendRegistry[nftAddress].lendingMap[oNftId].lender;
        IERC721 rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress, _lender,tokenId);
        // if(_RNFT_tokenId != 0,""); Check if rtoken is 0
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        require(rNFTCtrInstance.isApprovedRenter(renterAddress, _RNFT_tokenId)," renter address not approved");
        require(!rNFTCtrInstance.isRented(_RNFT_tokenId),"NFT rental status: already rented");
        // Mint RNFT with specific time duration for rent purpose and save Rent metadata
        rNFTCtrInstance._mintRNFT(nftAddress, originalTokenId, _lender, _RNFT_tokenId);
        distributePaymentTransactions(_RNFT_tokenId, renterAddress);
        //Call initiateRent() function to change the rent status in RNFT (isRented=True) and calcilate start/end time
        rNFTCtrInstance.initiateRent(_RNFT_tokenId);
        return _RNFT_tokenId;

    }

    function distributePaymentTransactions(address nftAddress,uint256 nftId,uint256 _RNFT_tokenId, address _renterAddress)
    internal payable returns (uint256 totalRentPrice,uint256 _serviceFee){
        // cases (ether native, other supported 20 tokens)
        Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[NftId];
        IERC20 erc20TokenInstance = IERC20(_lendRecord._paymentMethod);
        IERC721 rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        // Rent price calculation or getRentPrice(_RNFT_tokenId)
        // totalRentPrice = _lendRecord.rentPrice * rentDuration; // Use SafeMath for uint256
        totalRentPrice = rNFTCtrInstance.getRentPrice(_RNFT_tokenId);
        /** Transaction to be sent to MarketGatewaytreasury wallet */
        _serviceFeeAmount = SafeMathUpgradeable.div(SafeMathUpgradeable.mul(totalRentPrice, _fee),1e2); // totalRentPrice * _fee / 100
        // Transaction to be sent to beneficiary (NFT Lender)
        uint256 rentPriceAfterFee = SafeMathUpgradeable.sub(totalRentPrice,_serviceFeeAmount);
        uint256 _renterBalance = erc20TokenInstance.balanceOf(_renterAddress);
        require(_renterBalance >= totalRentPrice,"Not enough balance to execute payment transaction");
        /** Sets `totalRentPrice` as the allowance of `Gateway contract` over the caller's tokens. */
        bool success = erc20CtrInstance.approve(address(this),totalRentPrice); // change to SafeERC20
        require(success, "Allowance Approval failed");
        // Send `rentPriceAfterFee` tokens from `render wallet address` to `lender` using the allowance mechanism.
        success = erc20CtrInstance.transferFrom(_renterAddress,_lendRecord.lender,rentPriceAfterFee);
        require(success, "Transfer 1 - failed");
        // Send `_serviceFeeAmount` tokens from `render wallet address` to `MetaRents Treasury DAO Address` using the allowance mechanism.
        success = erc20CtrInstance.transferFrom(_renterAddress,_treasuryAddress,_serviceFeeAmount);
        require(success, "Transfer 2 - failed");
    }

    /// @dev to cancel a renter approval if tenant doesn't confirm and pay rent in X hours time after approval
    function cancelApproval(address nftAddress, uint256 nftId, address renterAddress) 
    public onlyApprovedOrOwner(msg.sender,nftAddress,nftId) returns(bool){
         IERC721 rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress,tokenId);
        // if(_RNFT_tokenId != 0,""); Check if rtoken is 0
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        require(NFTCtrInstance.isApprovedRenter(renterAddress,msg.sender,_RNFT_tokenId)," renter address is not approved");
        require(!rNFTCtrInstance.isRented(_RNFT_tokenId),"NFT rental status: already rented");
        // call clearApprovalState to delete RNFTMetadata metadata key: _RtokenIds.current();
        rNFTCtrInstance.clearApprovalState(_RNFT_tokenId);
        _;
    }

    /// @dev to get Lending information based on the nftAddress and tokenID
    function getLending(address nftAddress,uint256 nftId) public view returns (Lending memory lendingData){
        lendingData = lendRegistry[nftAddress].lendingMap[nftId];
    }

    /// @dev to remove a NFT listing from the marketplace
    function removeLending(address nftAddress, uint256 nftId) public onlyApprovedOrOwner(msg.sender,nftAddress,nftId){
        delete lendRegistry[nftAddress].lendingMap[nftId];
        emit remove_lending(msg.sender,nftAddress, nftId);
    }

     // @dev terminate rent without redeeming original NFT 
    // function terminateRentAgreement(address nftAddress, uint256 oNftId)
    // external nonReentrant onlyApprovedOrOwner(msg.sender,nftAddress,oNftId){
    //     require(msg.sender==lendRegistry[nftAddress].lendingMap[oNftId].lender,"unauthorized address is not owner or lending not registered"
    //     IRNFT(_RNFTContractAddress).terminateRent(_RNFT_tokenId);

    // }

    /// @dev terminate rent and redeem original NFT (need to create a new lending to list the asset in the marketplace ++gas fees)
    function redeemNFT(address nftAddress, uint256 oNftId)
    external nonReentrant onlyApprovedOrOwner(msg.sender,nftAddress,oNftId){
        require(msg.sender==lendRegistry[nftAddress].lendingMap[oNftId].lender,"unauthorized address is not owner or lending not registered");
        // call removeLending()
        terminateRentAgreement(_RNFT_tokenId);
        // call redeemNFT() to transfer NFT back to its owner
        // IRNFT(_RNFTContractAddress)._redeemNFT(_RNFT_tokenId);

    }


    /** MetaRents Platform settings & configuration **/

    function setFee(uint256 fee_) public onlyAdmin{
        require(fee_ < 1e2,"invalid fee");
        _fee = fee_;
    }

    function getFee() public view onlyAdmin returns(uint256){
        return _fee;
    }

    function setMarketGatewayTreasury(address treasuryAddress) public onlyAdmin{
        _treasuryAddress = treasuryAddress;
    }

    function setMaxRentDurationLimit(uint64 mdl) public onlyAdmin{
        _maxRentDurationLimit = mdl;
    }

    function getSupportedPaymentTokens() public view returns(address[] memory) {
        return supportedPaymentTokens;

    }
    // change to Modifier !!
    function isSupportedPaymentToken(address tokenAddress) external view returns(bool) {
        bool isSupported = false;
        for (uint i = 0 ; i < supportedPaymentTokens.length; i++) {
            if (tokenAddress == supportedPaymentTokens[i]) {
                isSupported = true;
                break;
            }
        }
    //    require(isSupported,"ERC20 Token not supported as payment method");
       return isSupported;
    }

    function setSupportedPaymentTokens(address tokenAddress) external onlyAdmin returns(address, string memory){
        // require(tokenAddress.supportsInterface(ERC20InterfaceId),"NOT_ERC20_TOKEN");
        string memory tokenSymbol = IERC20(tokenAddress).symbol();
        require(!isSupportedPaymentToken(tokenAddress),"token already supported");
        supportedPaymentTokens.push(tokenAddress);
        return (tokenAddress, tokenSymbol);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable, ERC721Upgradeable) returns (bool){
        return super.supportsInterface(interfaceId);
    }

    /** Gateway Contract Role-based Access Control */

    ///@dev to add contract administrators such as the Proxy
    function setNewAdmin(address _newAdmin) external onlyOwner{
        grantRole(DEFAULT_ADMIN_ROLE, _newAdmin);
        emit add_admin(_newAdmin);
    }

    ///@dev to remove an existing contract administrator
    function removeAdmin(address _admin) external onlyOwner{
        _revokeRole(DEFAULT_ADMIN_ROLE, _admin);
        emit remove_admin(_admin);
    }

}