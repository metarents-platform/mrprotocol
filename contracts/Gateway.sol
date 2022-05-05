// SPDX-License-Identifier: MIT

/// @author Moughite El Joaydi (@Metajazzy), Robert M. Carden (@crazydevlegend)
/// @title Market Gateway Contract
/// @dev Gateway contract serves as a middleware to execute lending and renting operations

pragma solidity ^0.8.0;

/* ERC token contracts */
// import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
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

import "./IRNFT.sol";
import "./IGateway.sol";


contract Gateway is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable,
OwnableUpgradeable, IGateway /*, ERC20Upgradeable */{

    /** RNFT Contract Address for Inter-Contract Execution */
    address internal _RNFTContractAddress;
    //using ERC165Checker for address;
    // Check if token interface are supported before starting operations
    //_registerInterface(interfaceId);
    using SafeERC20Upgradeable for ERC20;
    using SafeMathUpgradeable for uint256;
    // change to enum TimeUnit {DAY, WEEK, MONTH};
    // Time Unit constants
    uint128 constant private DAY_IN_SECONDS = 86400;
    uint128 constant private WEEK_IN_SECONDS = 604800;
    uint128 constant private MONTH_IN_SECONDS = 2628000;

    address private ERC20_USDCAddress;
    address[] internal supportedPaymentTokens;

    /// @dev lending record mapping each owner to his lendings - lendRegistry
    mapping (address=>lendRecord) internal lendRegistry;

    uint256 private _fee; // %
    address payable private _treasuryAddress;
    uint128 private _maxRentDurationLimit; // max rent duration limit 1 year

    // < events newly added
    event NFT_Listed(address lender, address nftAddress, uint nftId, uint maxDuration, uint minDuration, address acceptedPaymentMethod);
    // events newly added !>

    /* Proxy upgradable constructor */
    function initialize(address rNFTContractAddress_, address payable treasuryAddress) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Ownable_init();
        // Add owner as administrator
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Add Proxy as administrator to delegate calls
        // setNewAdmin(DEFAULT_ADMIN_ROLE, proxyAddress);
        _RNFTContractAddress = rNFTContractAddress_;
        // Set ETH & USDC as initial supported tokens after deployment
        address etherAddress = address(0);
        ERC20_USDCAddress = address(0xeb8f08a975Ab53E34D8a0330E0D34de942C95926);    // rinkeby
        setSupportedPaymentTokens(etherAddress);
        setSupportedPaymentTokens(ERC20_USDCAddress);
        // _DCL_MANATokenAddress = address(0x0F5D2fB29fb7d3CFeE444a200298f468908cC942);
        setMarketGatewayTreasury(treasuryAddress);
        /** Add whitelist for 1st 100 customers for discount 0% up to 1 year*/
        setFee(10); // 10% platform service fee
        _maxRentDurationLimit = 31536000;
    }

    // @dev verifier to check for authorisated administrators
    modifier onlyAdmin()
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ERROR 401: Restricted to admins");
        _;
    }

    /// @dev check if address is owner or approved to operate NFT
    modifier _onlyApprovedOrOwner(address nftAddress,uint256 tokenId){
        IERC721 nftCtrInstance = IERC721(nftAddress);
        address operator = msg.sender;
        address owner = nftCtrInstance.ownerOf(tokenId);
        require(owner != address(0),"ERC721: Failed, spender query nonexistent token");
        require(
            operator == owner ||
            nftCtrInstance.getApproved(tokenId) == operator || 
            nftCtrInstance.isApprovedForAll(owner, operator),
            "Only owner or operator is allowed");
        _;
    }

    /// @dev add a new lending to list the NFT and store lending metadata
    function createLendRecord(
        address nftAddress,
        uint256 original_nftId,
        uint128 maxDuration,
        uint128 minDuration,
        uint256 timeUnit,
        uint256 _rentPricePerTimeUnit,
        address _paymentMethod
    ) public _onlyApprovedOrOwner(nftAddress, original_nftId){

        /** Validate lending parameters and duration*/
        /** Check timeUnit against time constants */
        require(timeUnit == DAY_IN_SECONDS || timeUnit == WEEK_IN_SECONDS || timeUnit == MONTH_IN_SECONDS,"invalid time unit");
        require(minDuration > 0 && maxDuration > 0, "max or min duration should be > 0");
        require(maxDuration >= minDuration,"invalid duration");
        // check if maxDuration exceeds marketplace maxDuration limit
        require(maxDuration <= _maxRentDurationLimit,"max rent duration exceeds allowed limit");
        require(minDuration % timeUnit == 0 && maxDuration % timeUnit == 0,"duration must be in seconds; multiple of time units");
        // Add supported token(s) (ETH, USDC, MANA) TBC - check if supported by the marketplace contract and owner
        require(isSupportedPaymentToken(_paymentMethod),"ERC20 Token not supported as payment method by market gateway");
        // store a new lending record metadata .

        address payable owner = payable(IERC721(nftAddress).ownerOf(original_nftId));
        Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[original_nftId];
        _lendRecord.lender = owner;
        _lendRecord.nftAddress = nftAddress;
        _lendRecord.nftId = original_nftId;
        _lendRecord.maxDuration = maxDuration;
        _lendRecord.minDuration = minDuration;
        _lendRecord.timeUnit = timeUnit;
        _lendRecord.rentPricePerTimeUnit = _rentPricePerTimeUnit; // supplied per second (day/week/month)
        _lendRecord.acceptedPaymentMethod = _paymentMethod;
        
        emit NFT_Listed(
            _lendRecord.lender,
            _lendRecord.nftAddress,
            _lendRecord.nftId, 
            _lendRecord.maxDuration,
            _lendRecord.minDuration,
            _lendRecord.acceptedPaymentMethod
        );
    }

    /// @dev invoke RNFT Contract to approve renter and pre-mint new RNFT (rentNFT)
    function _approveAndPreMintRNFT(
        address nftAddress,
        uint256 _NFTId,
        uint256 rentDuration,
        address renter_address
    ) external nonReentrant returns(uint256){
        require(renter_address != address(0), 'Invalid renter address: zero address');
        Lending storage lendingRecord = lendRegistry[nftAddress].lendingMap[_NFTId];
        // Check if msg.sender is a registered lender and/or authorized to approve rent
        require(msg.sender==lendingRecord.lender,"unauthorized: address is not owner or lending not registered");
        // Check for same address
        require(msg.sender != renter_address, 'Lender cannot be a renter');
        // Call initializeRentMetadata() to set initial NFT metadata and check approval status before final approval
        uint256 _rNftId = IRNFT(_RNFTContractAddress).initializeRentMetadata(msg.sender, nftAddress, _NFTId);
        // supply to RNFT contract NFT metadata to map it to its owner and RNFT metadata, and approve renter
        approveRenterRequest(renter_address, nftAddress,_NFTId, rentDuration, _rNftId);
        return _rNftId;
    }

    /// @dev to approve a renter by supplying 'renter_address' and !!'rent_duration'!! to RNFT Contract
    /// @dev RNFT contract maps the RNFT to its metadata
    function approveRenterRequest(address _renterAddress, address nftAddress, uint256 oNftId, uint256 rentDuration, uint256 _rNftId)
    public nonReentrant returns (uint256 _RNFT_tokenId){
        Lending storage lendingRecord = lendRegistry[nftAddress].lendingMap[oNftId];
        require(rentDuration % lendingRecord.timeUnit == 0," Invalid rent duration: not seconds");
        require(rentDuration >= lendingRecord.minDuration && rentDuration <= lendingRecord.maxDuration,"invalid duration");
        // supply all NFT parameters
        _RNFT_tokenId = IRNFT(_RNFTContractAddress).approveRenter(lendingRecord.timeUnit,rentDuration,lendingRecord.rentPricePerTimeUnit,_renterAddress, _rNftId);
        emit RenterApprovedAndRNFTPreMinted(msg.sender,nftAddress,oNftId,_RNFT_tokenId,_renterAddress,rentDuration,lendingRecord.rentPricePerTimeUnit);
        return _RNFT_tokenId;
    }

    /// @dev confirm rent agreement and pay rent fee to market beneficiary
    function confirmRentAgreementAndPay(address nftAddress,uint256 originalTokenId)
    external nonReentrant virtual returns (uint256 _RNFT_tokenId){
        address renterAddress = msg.sender;
        Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[originalTokenId];
        address _lender = _lendRecord.lender;
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress, _lender, originalTokenId);
        // if(_RNFT_tokenId != 0,""); Check if rtoken is 0
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        require(rNFTCtrInstance.isApprovedRenter(renterAddress, _RNFT_tokenId)," renter address not approved");
        require(!rNFTCtrInstance.isRented(_RNFT_tokenId),"NFT rental status: already rented");
        if(!rNFTCtrInstance.isMinted(_RNFT_tokenId)){
            // Mint RNFT with specific time duration for rent purpose and save Rent metadata
            rNFTCtrInstance._mintRNFT(nftAddress, _lender, originalTokenId, _RNFT_tokenId);
        }
        distributePaymentTransactions(nftAddress, originalTokenId,_RNFT_tokenId, renterAddress);
        //Call startRent() function to change the rent status in RNFT (isRented=True) and calculate start/end time
        rNFTCtrInstance.startRent(_RNFT_tokenId);
        return _RNFT_tokenId;
    }

    function distributePaymentTransactions(address nftAddress,uint256 nftId,uint256 _RNFT_tokenId, address _renterAddress)
    public payable returns (uint256 totalRentPrice,uint256 _serviceFeeAmount){
        // add cases (ether native, other supported 20 tokens) -- h@ckk 1t-- 
        Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[nftId];
        // Add check for which accepted payment is made: ETH, ERC20
        ERC20 erc20CtrInstance = ERC20(_lendRecord.acceptedPaymentMethod);
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        // Rent price calculation or getRentPrice(_RNFT_tokenId)
        // totalRentPrice = _lendRecord.rentPrice * rentDuration; // Use SafeMath for uint256
        totalRentPrice = rNFTCtrInstance.getRentPrice(_RNFT_tokenId);
        /** Transaction to be sent to MarketGatewaytreasury wallet */
        _serviceFeeAmount = SafeMathUpgradeable.div(SafeMathUpgradeable.mul(totalRentPrice, getFee()),1e2); // totalRentPrice * _fee / 100
        // Transaction to be sent to beneficiary (NFT Lender)
        uint256 rentPriceAfterFee = SafeMathUpgradeable.sub(totalRentPrice,_serviceFeeAmount);
        // Ethereum case ;
        // if (_lendRecord.acceptedPaymentMethod == address(0))
        // uint256 _renterBalance = 
        uint256 _renterBalance = erc20CtrInstance.balanceOf(_renterAddress);
        require(_renterBalance >= totalRentPrice,"Not enough balance to execute payment transaction");
        /** Sets `totalRentPrice` as the allowance of `Gateway contract` over the caller's tokens. */
        // bool success = erc20CtrInstance.approve(address(this),totalRentPrice); // change to SafeERC20
        // require(success, "Allowance Approval failed");
        // Send `rentPriceAfterFee` tokens from `render wallet address` to `lender` using the allowance mechanism.
        bool success = erc20CtrInstance.transferFrom(_renterAddress,_lendRecord.lender,rentPriceAfterFee);
        require(success, "Transfer 1 to lender (beneficiary) - failed");
        // Send `_serviceFeeAmount` tokens from `render wallet address` to `MetaRents Treasury DAO Address` using the allowance mechanism.
        success = erc20CtrInstance.transferFrom(_renterAddress,_treasuryAddress,_serviceFeeAmount);
        require(success, "Transfer 2 to treasury - failed");
    }

    /// @dev to cancel a renter approval if renter doesn't confirm and pay rent in X hours time after approval
    function cancelApproval(address nftAddress, uint256 nftId, address renterAddress)
    public returns(bool isApprovalCanceled){
        // Check if msg.sender is a registered lender and/or authorized to approve rent
        require(msg.sender==lendRegistry[nftAddress].lendingMap[nftId].lender,"unauthorized: address is not owner or lending not registered");

        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress,msg.sender,nftId);
        // if(_RNFT_tokenId != 0,""); Check if rtoken is 0
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        require(rNFTCtrInstance.isApprovedRenter(renterAddress,_RNFT_tokenId)," renter address is not approved");
        require(!rNFTCtrInstance.isRented(_RNFT_tokenId),"NFT rental status: already rented");
        // call clearApprovalState to delete RNFTMetadata metadata key: _RtokenIds.current();
        isApprovalCanceled = rNFTCtrInstance.clearRNFTState(_RNFT_tokenId);
        return isApprovalCanceled;
    }

    /// @dev to get Lending information based on the nftAddress and tokenID
    function getLending(address nftAddress,uint256 nftId) public view returns (Lending memory lendingData){
        return lendRegistry[nftAddress].lendingMap[nftId];
    }

    /// @dev to remove a NFT listing from the marketplace
    function removeLending(address nftAddress, uint256 nftId) public {
        require(msg.sender==lendRegistry[nftAddress].lendingMap[nftId].lender,"unauthorized: address is not owner or lending not registered");
        delete lendRegistry[nftAddress].lendingMap[nftId];
        emit remove_lending(msg.sender,nftAddress, nftId);
    }

     // @dev terminate rent without redeeming original NFT (RNFT is burned and assosicated metadata is deleted)
    function terminateRentAgreement(address nftAddress, uint256 oNftId) public nonReentrant{
        require(msg.sender==lendRegistry[nftAddress].lendingMap[oNftId].lender,"unauthorized: address is not owner or lending not registered");
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress, msg.sender, oNftId);
        // if(_RNFT_tokenId != 0,""); Check if rtoken is 0
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        IRNFT(_RNFTContractAddress)._terminateRent(_RNFT_tokenId, msg.sender);
    }

    /// @dev terminate rent and redeem original NFT (need to create a new lending to list the asset in the marketplace ++gas fees)
    function redeemNFT(address nftAddress, uint256 oNftId) public nonReentrant{
        require(msg.sender==lendRegistry[nftAddress].lendingMap[oNftId].lender,"unauthorized: address is not owner or lending not registered");
        //(nftAddress != address(0) && oNftId != 0) &&
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress, msg.sender, oNftId);
        // if(_RNFT_tokenId != 0,""); Check if rtoken is 0
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        // call redeemNFT() to transfer NFT back to its owner
        IRNFT(_RNFTContractAddress)._redeemNFT(_RNFT_tokenId, nftAddress, oNftId, msg.sender);
    }


    /** MetaRents Platform settings & configuration **/

    function setFee(uint256 fee_) public onlyAdmin{
        require(fee_ < 1e2,"invalid fee");
        _fee = fee_;
    }

    function getFee() public view onlyAdmin returns(uint256){
        return _fee;
    }

    function setMarketGatewayTreasury(address payable treasuryAddress) public onlyAdmin{
        _treasuryAddress = treasuryAddress;
    }

    function setMaxRentDurationLimit(uint128 mdl) public onlyAdmin{
        _maxRentDurationLimit = mdl;
    }

    function getSupportedPaymentTokens() public view returns(address[] memory) {
        return supportedPaymentTokens;

    }
    // change to Modifier !!
    function isSupportedPaymentToken(address tokenAddress) public view returns(bool) {
        for (uint i = 0 ; i < supportedPaymentTokens.length; i++) {
            if (tokenAddress == supportedPaymentTokens[i]) {
                return true;
            }
        }
    //    require(isSupported,"ERC20 Token not supported as payment method");
       return false;
    }

    function setSupportedPaymentTokens(address tokenAddress) public onlyAdmin returns(address, string memory){
        // require(tokenAddress.supportsInterface(ERC20InterfaceId),"NOT_ERC20_TOKEN");
        string memory tokenSymbol = string('ETH');
        if(tokenAddress != address(0)){
        tokenSymbol = ERC20(tokenAddress).symbol();
        }
        require(!isSupportedPaymentToken(tokenAddress),"token already supported");
        supportedPaymentTokens.push(tokenAddress);
        return (tokenAddress, tokenSymbol);
    }

    // Check if supported Interface implementation is correct
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable) returns (bool){
        return super.supportsInterface(interfaceId);
    }

    /** Gateway Contract Role-Based Access Control */

    ///@dev to add contract administrators such as the Proxy
    function setNewAdmin(address _newAdmin) external onlyOwner{
        grantRole(DEFAULT_ADMIN_ROLE, _newAdmin);
        emit NewAdminAdded(_newAdmin);
    }

    ///@dev to remove an existing contract administrator
    function removeAdmin(address _admin) external onlyOwner{
        revokeRole(DEFAULT_ADMIN_ROLE, _admin);
        emit AdminRemoved(_admin);
    }

}