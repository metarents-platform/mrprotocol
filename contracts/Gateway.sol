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
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
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
    uint256 constant private DAY_IN_SECONDS = 86400;
    uint256 constant private WEEK_IN_SECONDS = 604800;
    uint256 constant private MONTH_IN_SECONDS = 2628000;

    address private ERC20_USDCAddress;
    address[] internal supportedPaymentTokens;

    /// @dev lending record mapping each owner to his lendings - lendRegistry
    mapping (address=>lendRecord) internal lendRegistry;

    uint256 private _fee; // %
    address payable private _treasuryAddress;
    uint256 private _maxRentDurationLimit; // max rent duration limit 1 year

    // < events newly added
    event NFT_Lending_Added(address lender, address nftAddress, uint nftId, uint maxDuration, uint minDuration, address acceptedPaymentMethod);
    event NFT_Lending_Removed(address lender, address nftAddress, uint nftId);
    event Renter_Request_Approved(address lender, address nftAddress, uint256 oNftId, uint256 _RNFT_tokenId, address renter, uint256 rentDuration, uint256 rentPricePerTimeUnit);
    event RenterApproved_And_RNFTPreMinted(address lender, address renter, address nftAddress, uint256 originalNFTId, uint256 rNFTId, uint256 rentDuration);
    event Approval_Canceled(address nftAddress, address ownerAddress, uint256 nftId, address renterAddress, uint256 rNFTId);
    event Payment_Distributed(uint256 rTokenId, uint256 totalRentPrice, uint256 serviceFee, uint256 rentPriceAfterFee, uint256 changeAfterPayment);
    event Supported_Payment_Method_Added(address tokenAddress, string tokenSymbol);
    event Rent_Confirmed_Paid(address nftAddress, uint256 originalTokenId, uint256 _RNFT_tokenId);
    event Rent_Agreemeng_Terminated(address nftAddress, uint256 orignal_tokenId, uint256 RNFT_tokenId);
    // events newly added !>

    /* Proxy upgradable constructor */
    function initialize(address rNFTContractAddress_) public initializer {

        __AccessControl_init();
        __ReentrancyGuard_init();
        __Ownable_init();
        
        // Add owner as administrator
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // setNewAdmin(msg.sender); // => not callable because it's not admin yet
        // Add Proxy as administrator to delegate calls
        // setNewAdmin(address(this));  // => not callable because it's not admin yet
        _setupRole(DEFAULT_ADMIN_ROLE, address(this));
        _RNFTContractAddress = rNFTContractAddress_;
        
        // Set ETH & USDC as initial supported tokens after deployment
        address etherAddress = address(0);
        ERC20_USDCAddress = address(0xeb8f08a975Ab53E34D8a0330E0D34de942C95926);    // rinkeby
        setSupportedPaymentTokens(etherAddress);
        setSupportedPaymentTokens(ERC20_USDCAddress);
        setMarketGatewayTreasury(payable(0xa7E67CD92c83Ab73638F2F7Da600685b2152597C));
        /** Add whitelist for 1st 100 customers for discount 0% up to 1 year*/
        setFee(1); // 1% platform service fee for test purpose
        _maxRentDurationLimit = 31536000;
    }

    // @dev verifier to check for authorisated administrators
    modifier onlyAdmin()
    {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "ERROR 401: Restricted to admins");
        _;
    }

    /// @dev check if address is owner or approved to operate NFT
    modifier _onlyApprovedOrOwner(address nftAddress, uint256 tokenId){
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
        uint256 maxDuration,
        uint256 minDuration,
        uint256 timeUnit,
        uint256 _rentPricePerTimeUnit,
        address _paymentMethod
    ) public _onlyApprovedOrOwner(nftAddress, original_nftId){

        /** Check if given contract is ERC721-compatible */
        // I commented because _onlyApprovedorOwner() modifier already reverts the txn in this case 
        // require(isERC721Compatible(nftAddress), "Contract is not ERC721-compatible");

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
        
        emit NFT_Lending_Added(
            _lendRecord.lender,
            _lendRecord.nftAddress,
            _lendRecord.nftId, 
            _lendRecord.maxDuration,
            _lendRecord.minDuration,
            _lendRecord.acceptedPaymentMethod
        );
    }

    /// @dev invoke RNFT Contract to approve renter and pre-mint new RNFT (rentNFT)
    function approveAndPreMintRNFT(
        address nftAddress,
        uint256 _NFTId,
        uint256 rentDuration,
        address renter_address
    ) external nonReentrant returns(uint256){
        require(renter_address != address(0), "Invalid renter address: zero address");
        require(isERC721Compatible(nftAddress), "Contract is not ERC721-compatible");
        Lending storage lendingRecord = lendRegistry[nftAddress].lendingMap[_NFTId];
        // Check if msg.sender is a registered lender and/or authorized to approve rent
        require(msg.sender==lendingRecord.lender,"unauthorized: address is not owner or lending not registered");
        // Check for same address
        require(msg.sender != renter_address, "Lender cannot be a renter");
        // Call initializeRentMetadata() to set initial NFT metadata and check approval status before final approval
        uint256 _rNftId = IRNFT(_RNFTContractAddress).initializeRentMetadata(msg.sender, nftAddress, _NFTId);
        // supply to RNFT contract NFT metadata to map it to its owner and RNFT metadata, and approve renter
        _approveRenterRequest(renter_address, nftAddress,_NFTId, rentDuration, _rNftId);

        emit RenterApproved_And_RNFTPreMinted(msg.sender, renter_address, nftAddress, _NFTId, _rNftId, rentDuration);
        return _rNftId;
    }

    /// @dev to approve a renter by supplying 'renter_address' and !!'rent_duration'!! to RNFT Contract
    /// @dev RNFT contract maps the RNFT to its metadata
    function _approveRenterRequest(address _renterAddress, address nftAddress, uint256 oNftId, uint256 rentDuration, uint256 _rNftId)
    internal returns (uint256 _RNFT_tokenId){
        Lending storage lendingRecord = lendRegistry[nftAddress].lendingMap[oNftId];
        require(lendingRecord.timeUnit > 0, "not listed for lending yet");
        require(rentDuration % lendingRecord.timeUnit == 0," Invalid rent duration: not seconds");
        require(rentDuration >= lendingRecord.minDuration && rentDuration <= lendingRecord.maxDuration,"invalid duration");
        // supply all NFT parameters
        _RNFT_tokenId = IRNFT(_RNFTContractAddress).approveRenter(lendingRecord.timeUnit,rentDuration,lendingRecord.rentPricePerTimeUnit,_renterAddress, _rNftId);
        emit Renter_Request_Approved(msg.sender,nftAddress,oNftId,_RNFT_tokenId,_renterAddress,rentDuration,lendingRecord.rentPricePerTimeUnit);
        return _RNFT_tokenId;
    }

    /// @dev confirm rent agreement and pay rent fee to market beneficiary
    function confirmRentAgreementAndPay(address nftAddress, uint256 originalTokenId)
    external virtual payable returns (uint256 _RNFT_tokenId){
        require(isERC721Compatible(nftAddress), "Contract is not ERC721-compatible");
        address renterAddress = msg.sender;
        Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[originalTokenId];
        address _lender = _lendRecord.lender;
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress, _lender, originalTokenId);
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        require(rNFTCtrInstance.isApprovedRenter(renterAddress, _RNFT_tokenId), "Renter address not approved");
        require(!rNFTCtrInstance.isRented(_RNFT_tokenId), "NFT rental status: already rented");
        
        if(!rNFTCtrInstance.isMinted(_RNFT_tokenId)) {
            // Mint RNFT with specific time duration for rent purpose and save Rent metadata
            rNFTCtrInstance._mintRNFT(nftAddress, _lender, originalTokenId, _RNFT_tokenId);
        }
        
        distributePaymentTransactions(nftAddress, originalTokenId,_RNFT_tokenId, renterAddress);
        
        //Call startRent() function to change the rent status in RNFT (isRented=True) and calculate start/end time
        rNFTCtrInstance.startRent(nftAddress, originalTokenId, _RNFT_tokenId);

        emit Rent_Confirmed_Paid(nftAddress, originalTokenId, _RNFT_tokenId);
        
        return _RNFT_tokenId;
    }

    function distributePaymentTransactions(address nftAddress,uint256 nftId,uint256 _RNFT_tokenId, address _renterAddress)
    internal returns (uint256 totalRentPrice,uint256 serviceFeeAmount){
        // add cases (ether native, other supported 20 tokens) -- h@ckk 1t-- 
        Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[nftId];
        // Add check for which accepted payment is made: ETH, ERC20
        ERC20 erc20CtrInstance = ERC20(_lendRecord.acceptedPaymentMethod);
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        // Rent price calculation or getRentPrice(_RNFT_tokenId)
        // totalRentPrice = _lendRecord.rentPrice * rentDuration; // Use SafeMath for uint256
        totalRentPrice = rNFTCtrInstance.getRentPrice(_RNFT_tokenId);
        /** Transaction to be sent to MarketGatewaytreasury wallet */
        serviceFeeAmount = SafeMathUpgradeable.div(SafeMathUpgradeable.mul(totalRentPrice, getFee()),1e2); // totalRentPrice * _fee / 100
        // Transaction to be sent to beneficiary (NFT Lender)
        uint256 rentPriceAfterFee = SafeMathUpgradeable.sub(totalRentPrice, serviceFeeAmount);
        // Change (in case of ETH) remained after payment
        uint256 changeAfterPayment = 0;


        bool success = false;

        if (_lendRecord.acceptedPaymentMethod == address(0)) { // ETH
            require(msg.value >= totalRentPrice, "Not enough ETH paid to execute transaction");
            
            // Send `rentPriceAfterFee` ETH to `lender wallet address`
            (success, ) = payable(_lendRecord.lender).call{value: rentPriceAfterFee}("");
            // Send `serviceFee` ETH to `treasury wallet address`
            (success, ) = payable(_treasuryAddress).call{value: serviceFeeAmount}("");

            require(success, "Transfer 1 to lender (beneficiary) - failed");
            // Send changes back to the renter
            if (totalRentPrice < msg.value) {
                changeAfterPayment = SafeMathUpgradeable.sub(msg.value, totalRentPrice);
                (success, ) = payable(_renterAddress).call{value: changeAfterPayment}("");
                require(success, "Transfer 2 to renter (changes) - failed");
            }
        } else {    // ERC20
            uint256 _renterBalance = 0;

            _renterBalance = erc20CtrInstance.balanceOf(_renterAddress);
            require(_renterBalance >= totalRentPrice, "Not enough balance to execute payment transaction");
                        
            // check if approved
            uint256 allowance = erc20CtrInstance.allowance(_renterAddress, address(this));
            require(allowance >= totalRentPrice, "Gateway not approved yet!");
            
            // Send `rentPriceAfterFee` tokens from `render wallet address` to `lender` using the allowance mechanism.
            success = erc20CtrInstance.transferFrom(_renterAddress, _lendRecord.lender, rentPriceAfterFee);
            require(success, "Transfer 1 to lender (beneficiary) - failed");
            
            // Send `serviceFeeAmount` tokens from `render wallet address` to `MetaRents Treasury DAO Address` using the allowance mechanism.
            success = erc20CtrInstance.transferFrom(_renterAddress, _treasuryAddress, serviceFeeAmount);
            require(success, "Transfer 2 to treasury - failed");
        }

        emit Payment_Distributed(_RNFT_tokenId, totalRentPrice, serviceFeeAmount, rentPriceAfterFee, changeAfterPayment);
    }

    /// @dev to cancel a renter approval if renter doesn't confirm and pay rent in X hours time after approval
    function cancelApproval(address nftAddress, uint256 nftId, address renterAddress)
    public returns(bool isApprovalCanceled){
        require(isERC721Compatible(nftAddress), "Contract is not ERC721-compatible");
        // Check if msg.sender is a registered lender and/or authorized to approve rent
        require(msg.sender==lendRegistry[nftAddress].lendingMap[nftId].lender,"unauthorized: address is not owner or lending not registered");
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress,msg.sender,nftId);
        // if(_RNFT_tokenId != 0,""); Check if rtoken is 0
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        require(rNFTCtrInstance.isApprovedRenter(renterAddress,_RNFT_tokenId),"renter address is not approved");
        require(!rNFTCtrInstance.isRented(_RNFT_tokenId),"NFT rental status: already rented");
        // call clearApprovalState to delete RNFTMetadata metadata key: _RtokenIds.current();
        isApprovalCanceled = rNFTCtrInstance.clearRNFTState(_RNFT_tokenId);
        if (isApprovalCanceled)
            emit Approval_Canceled(nftAddress, msg.sender, nftId, renterAddress, _RNFT_tokenId);
        return isApprovalCanceled;
    }

    /// @dev to get Lending information based on the nftAddress and tokenID
    function getLending(address nftAddress,uint256 nftId) public view returns (Lending memory lendingData){
        return lendRegistry[nftAddress].lendingMap[nftId];
    }

    /// @dev to remove a NFT listing from the marketplace
    function removeLending(address nftAddress, uint256 nftId) public {
        require(isERC721Compatible(nftAddress), "Contract is not ERC721-compatible");
        require(msg.sender==lendRegistry[nftAddress].lendingMap[nftId].lender,"unauthorized: address is not owner or lending not registered");
        // check if it's rented, if so we can't remove lending
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress, msg.sender, nftId);
        if (_RNFT_tokenId != 0) {   // RNFT minted
            require(!rNFTCtrInstance.isRented(_RNFT_tokenId), "ERROR: Rent not expired, ongoing rent duration");
        }
        delete lendRegistry[nftAddress].lendingMap[nftId];
        emit NFT_Lending_Removed(msg.sender,nftAddress, nftId);
    }

    /// @dev terminate rent without redeeming original NFT (RNFT is burned and assosicated metadata is deleted)
    function terminateRentAgreement(address nftAddress, uint256 oNftId) public nonReentrant{
        require(isERC721Compatible(nftAddress), "Contract is not ERC721-compatible");
        require(msg.sender==lendRegistry[nftAddress].lendingMap[oNftId].lender,"unauthorized: address is not owner or lending not registered");
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress, msg.sender, oNftId);
        // if(_RNFT_tokenId != 0,""); Check if rtoken is 0
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        IRNFT(_RNFTContractAddress)._terminateRent(nftAddress, _RNFT_tokenId, oNftId, msg.sender);

        emit Rent_Agreemeng_Terminated(nftAddress, oNftId, _RNFT_tokenId);
    }

    /// @dev terminate rent and redeem original NFT
    function redeemNFT(address nftAddress, uint256 oNftId) public nonReentrant{
        require(isERC721Compatible(nftAddress), "Contract is not ERC721-compatible");
        require(msg.sender==lendRegistry[nftAddress].lendingMap[oNftId].lender, "unauthorized: address is not owner or lending not registered");
        //(nftAddress != address(0) && oNftId != 0) &&
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress, msg.sender, oNftId);
        // if(_RNFT_tokenId != 0,""); Check if rtoken is 0
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        // call redeemNFT() to transfer NFT back to its owner
        IRNFT(_RNFTContractAddress)._redeemNFT(_RNFT_tokenId, nftAddress, oNftId, msg.sender);
        // call removeLending() to delete lending record
        removeLending(nftAddress, oNftId);
    }


    /** MetaRents Platform settings & configuration **/

    function setFee(uint256 fee_) public onlyAdmin{
        require(fee_ < 1e2,"invalid fee");
        _fee = fee_;
    }

    function getFee() public view returns(uint256){
        return _fee;
    }

    function setMarketGatewayTreasury(address payable treasuryAddress) public onlyAdmin{
        _treasuryAddress = treasuryAddress;
    }

    function setMaxRentDurationLimit(uint256 mdl) public onlyAdmin{
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
        string memory tokenSymbol = string("ETH");
        if(tokenAddress != address(0)){
            tokenSymbol = ERC20(tokenAddress).symbol();
        }
        require(!isSupportedPaymentToken(tokenAddress), "token already supported");
        supportedPaymentTokens.push(tokenAddress);
        emit Supported_Payment_Method_Added(tokenAddress, tokenSymbol);
        return (tokenAddress, tokenSymbol);
    }

    // Check if supported Interface implementation is correct
    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable) returns (bool){
        return super.supportsInterface(interfaceId);
    }

    /** Gateway Contract Role-Based Access Control */

    ///@dev to add contract administrators such as the Proxy
    function setNewAdmin(address _newAdmin) public onlyOwner{
        grantRole(DEFAULT_ADMIN_ROLE, _newAdmin);
        emit NewAdminAdded(_newAdmin);
    }

    ///@dev to remove an existing contract administrator
    function removeAdmin(address _admin) public onlyOwner{
        revokeRole(DEFAULT_ADMIN_ROLE, _admin);
        emit AdminRemoved(_admin);
    }

    ///@dev to check whether the given contract is ERC721-compatible
    function isERC721Compatible(address _contract) public view returns(bool) {
        bytes4 IID_IERC721 = type(IERC721).interfaceId;
        return IERC165(_contract).supportsInterface(IID_IERC721);
    }

}
