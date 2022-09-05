// SPDX-License-Identifier: MIT

/// @author Moughite El Joaydi (@Metajazzy), Robert M. Carden (@crazydevlegend)
/// @title Market Gateway Contract
/// @dev Gateway contract serves as a middleware to execute lending and renting operations

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

import "./IRNFT.sol";
import "./IGateway.sol";

contract Gateway is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    IGateway
{
    address internal _RNFTContractAddress;
    using SafeERC20Upgradeable for ERC20;
    using SafeMathUpgradeable for uint256;

    uint256 private constant DAY_IN_SECONDS = 86400;
    uint256 private constant WEEK_IN_SECONDS = 604800;
    uint256 private constant MONTH_IN_SECONDS = 2628000;

    address private ERC20_USDCAddress;
    address private constant ETHER_ADDRESS = address(1);
    address[] internal supportedPaymentTokens;

    mapping(address => lendRecord) internal lendRegistry;

    uint256 private _fee;
    address payable private _treasuryAddress;
    uint256 private _maxRentDurationLimit;

    mapping (address => uint256) private protocolBalance;
    mapping (uint256 => uint256) private rentBalance;

    event NFT_Lending_Added(
        address lender,
        address nftAddress,
        uint256 nftId,
        uint256 maxDuration,
        uint256 minDuration,
        address acceptedPaymentMethod
    );
    event NFT_Lending_Removed(
        address lender,
        address nftAddress,
        uint256 nftId
    );
    event Renter_Request_Approved(
        address lender,
        address nftAddress,
        uint256 oNftId,
        uint256 _RNFT_tokenId,
        address renter,
        uint256 rentDuration,
        uint256 rentPricePerTimeUnit
    );
    event RenterApproved_And_RNFTPreMinted(
        address lender,
        address renter,
        address nftAddress,
        uint256 originalNFTId,
        uint256 rNFTId,
        uint256 rentDuration
    );
    event Approval_Canceled(
        address nftAddress,
        address ownerAddress,
        uint256 nftId,
        address renterAddress,
        uint256 rNFTId
    );
    event Payment_Distributed(
        uint256 rTokenId,
        uint256 totalRentPrice,
        uint256 serviceFee,
        uint256 changeAfterPayment
    );
    event Supported_Payment_Method_Added(
        address tokenAddress,
        string tokenSymbol
    );
    event Rent_Confirmed_Paid(
        address nftAddress,
        uint256 originalTokenId,
        uint256 _RNFT_tokenId
    );
    event Rent_Agreemeng_Terminated(
        address nftAddress,
        uint256 orignal_tokenId,
        uint256 RNFT_tokenId
    );
    event Rent_Fee_Withdrawn(
        address lender, 
        address nftAddress, 
        uint256 tokenID, 
        address paymentMethod,
        uint256 withdrawBalance
    );
    event Protocol_Fee_Claimed(address _treasuryAddress, address paymentMethod, uint256 balance);

    function initialize(address rNFTContractAddress_) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Ownable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(DEFAULT_ADMIN_ROLE, address(this));
        _RNFTContractAddress = rNFTContractAddress_;

        ERC20_USDCAddress = address(0x2f3A40A3db8a7e3D09B0adfEfbCe4f6F81927557);
        setSupportedPaymentTokens(ETHER_ADDRESS);
        setSupportedPaymentTokens(ERC20_USDCAddress);
        setFee(1);
        _maxRentDurationLimit = 31536000;
    }

    modifier onlyAdmin() {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERROR 401: Restricted to admins"
        );
        _;
    }

    modifier _onlyApprovedOrOwner(address nftAddress, uint256 tokenId) {
        IERC721 nftCtrInstance = IERC721(nftAddress);
        address operator = msg.sender;
        address owner = nftCtrInstance.ownerOf(tokenId);
        require(
            owner != address(0),
            "ERC721: Failed, spender query nonexistent token"
        );
        require(
            operator == owner ||
                nftCtrInstance.getApproved(tokenId) == operator ||
                nftCtrInstance.isApprovedForAll(owner, operator),
            "Only owner or operator is allowed"
        );
        _;
    }

    function createLendRecord(
        address nftAddress,
        uint256 original_nftId,
        uint256 maxDuration,
        uint256 minDuration,
        uint256 timeUnit,
        uint256 _rentPricePerTimeUnit,
        address _paymentMethod
    ) public _onlyApprovedOrOwner(nftAddress, original_nftId) {
        require(
            timeUnit == DAY_IN_SECONDS ||
                timeUnit == WEEK_IN_SECONDS ||
                timeUnit == MONTH_IN_SECONDS,
            "invalid time unit"
        );
        require(
            minDuration > 0 && maxDuration > 0,
            "max or min duration should be > 0"
        );
        require(maxDuration >= minDuration, "invalid duration");
        require(
            maxDuration <= _maxRentDurationLimit,
            "max rent duration exceeds allowed limit"
        );
        require(
            minDuration % timeUnit == 0 && maxDuration % timeUnit == 0,
            "duration must be in seconds; multiple of time units"
        );
        require(
            isSupportedPaymentToken(_paymentMethod),
            "ERC20 Token not supported as payment method by market gateway"
        );
    
        address payable owner = payable(
            IERC721(nftAddress).ownerOf(original_nftId)
        );
        Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[
            original_nftId
        ];
        _lendRecord.lender = owner;
        _lendRecord.nftAddress = nftAddress;
        _lendRecord.nftId = original_nftId;
        _lendRecord.maxDuration = maxDuration;
        _lendRecord.minDuration = minDuration;
        _lendRecord.timeUnit = timeUnit;
        _lendRecord.rentPricePerTimeUnit = _rentPricePerTimeUnit;
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

    function approveAndPreMintRNFT(
        address nftAddress,
        uint256 _NFTId,
        uint256 rentDuration,
        address renter_address
    ) external nonReentrant returns (uint256) {
        require(
            renter_address != address(0),
            "Invalid renter address: zero address"
        );
        require(
            isERC721Compatible(nftAddress),
            "Contract is not ERC721-compatible"
        );
        Lending storage lendingRecord = lendRegistry[nftAddress].lendingMap[
            _NFTId
        ];
        require(
            msg.sender == lendingRecord.lender,
            "unauthorized: address is not owner or lending not registered"
        );
        require(msg.sender != renter_address, "Lender cannot be a renter");
        uint256 _rNftId = IRNFT(_RNFTContractAddress).initializeRentMetadata(
            msg.sender,
            nftAddress,
            _NFTId
        );
        _approveRenterRequest(
            renter_address,
            nftAddress,
            _NFTId,
            rentDuration,
            _rNftId
        );

        emit RenterApproved_And_RNFTPreMinted(
            msg.sender,
            renter_address,
            nftAddress,
            _NFTId,
            _rNftId,
            rentDuration
        );
        return _rNftId;
    }

    function _approveRenterRequest(
        address _renterAddress,
        address nftAddress,
        uint256 oNftId,
        uint256 rentDuration,
        uint256 _rNftId
    ) internal returns (uint256 _RNFT_tokenId) {
        Lending storage lendingRecord = lendRegistry[nftAddress].lendingMap[
            oNftId
        ];
        require(lendingRecord.timeUnit > 0, "not listed for lending yet");
        require(
            rentDuration % lendingRecord.timeUnit == 0,
            " Invalid rent duration: not seconds"
        );
        require(
            rentDuration >= lendingRecord.minDuration &&
                rentDuration <= lendingRecord.maxDuration,
            "invalid duration"
        );
        _RNFT_tokenId = IRNFT(_RNFTContractAddress).approveRenter(
            lendingRecord.timeUnit,
            rentDuration,
            lendingRecord.rentPricePerTimeUnit,
            _renterAddress,
            _rNftId
        );
        emit Renter_Request_Approved(
            msg.sender,
            nftAddress,
            oNftId,
            _RNFT_tokenId,
            _renterAddress,
            rentDuration,
            lendingRecord.rentPricePerTimeUnit
        );
        return _RNFT_tokenId;
    }

    function confirmRentAgreementAndPay(
        address nftAddress,
        uint256 originalTokenId
    ) external payable returns (uint256 _RNFT_tokenId) {
        require(
            isERC721Compatible(nftAddress),
            "Contract is not ERC721-compatible"
        );
        address renterAddress = msg.sender;
        Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[
            originalTokenId
        ];
        address _lender = _lendRecord.lender;
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(
            nftAddress,
            _lender,
            originalTokenId
        );
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        require(
            rNFTCtrInstance.isApprovedRenter(renterAddress, _RNFT_tokenId),
            "Renter address not approved"
        );
        require(
            !rNFTCtrInstance.isRented(_RNFT_tokenId),
            "NFT rental status: already rented"
        );

        if (!rNFTCtrInstance.isMinted(_RNFT_tokenId)) {
            rNFTCtrInstance._mintRNFT(
                nftAddress,
                _lender,
                originalTokenId,
                _RNFT_tokenId
            );
        }

        distributePaymentTransactions(
            nftAddress,
            originalTokenId,
            _RNFT_tokenId,
            renterAddress
        );

        rNFTCtrInstance.startRent(nftAddress, originalTokenId, _RNFT_tokenId);

        emit Rent_Confirmed_Paid(nftAddress, originalTokenId, _RNFT_tokenId);

        return _RNFT_tokenId;
    }

    function distributePaymentTransactions(address nftAddress, uint256 nftId, uint256 _RNFT_tokenId, address _renterAddress) 
    internal nonReentrant {
        Lending storage _lendRecord = lendRegistry[nftAddress].lendingMap[nftId];    
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 totalRentPrice = rNFTCtrInstance.getRentPrice(_RNFT_tokenId);
        (uint256 serviceFeeAmount, uint256 rentPriceAfterFee) = calculateServiceFees(totalRentPrice);
        uint256 changeAfterPayment = 0;
        bool success = false;

        if (_lendRecord.acceptedPaymentMethod == ETHER_ADDRESS) {
            require(
                msg.value >= totalRentPrice,
                "Not enough ETH paid to execute transaction"
            );

            if (totalRentPrice < msg.value) {
                changeAfterPayment = SafeMathUpgradeable.sub(
                    msg.value,
                    totalRentPrice
                );
                (success, ) = payable(_renterAddress).call{
                    value: changeAfterPayment
                }("");
                require(success, "Transfer to renter (changes) - failed");
            }
        } else {
            uint256 _renterBalance = 0;
            ERC20 erc20CtrInstance = ERC20(_lendRecord.acceptedPaymentMethod);

            _renterBalance = erc20CtrInstance.balanceOf(_renterAddress);
            require(
                _renterBalance >= totalRentPrice,
                "Not enough balance to execute payment transaction"
            );

            uint256 allowance = erc20CtrInstance.allowance(
                _renterAddress,
                address(this)
            );
            require(allowance >= totalRentPrice, "Gateway not approved yet!");

            success = erc20CtrInstance.transferFrom(
                _renterAddress,
                address(this),
                totalRentPrice
            );
            require(success, "Deposit to the Gateway - failed");
        }

        protocolBalance[_lendRecord.acceptedPaymentMethod] += serviceFeeAmount;
        rentBalance[_RNFT_tokenId] = rentPriceAfterFee;

        emit Payment_Distributed(
            _RNFT_tokenId,
            totalRentPrice,
            serviceFeeAmount,
            changeAfterPayment
        );
    }

    function cancelApproval(
        address nftAddress,
        uint256 nftId,
        address renterAddress
    ) public returns (bool isApprovalCanceled) {
        require(
            isERC721Compatible(nftAddress),
            "Contract is not ERC721-compatible"
        );
        require(
            msg.sender == lendRegistry[nftAddress].lendingMap[nftId].lender,
            "unauthorized: address is not owner or lending not registered"
        );
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(
            nftAddress,
            msg.sender,
            nftId
        );
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        require(
            rNFTCtrInstance.isApprovedRenter(renterAddress, _RNFT_tokenId),
            "renter address is not approved"
        );
        require(
            !rNFTCtrInstance.isRented(_RNFT_tokenId),
            "NFT rental status: already rented"
        );
        isApprovalCanceled = rNFTCtrInstance.clearRNFTState(_RNFT_tokenId);
        if (isApprovalCanceled)
            emit Approval_Canceled(
                nftAddress,
                msg.sender,
                nftId,
                renterAddress,
                _RNFT_tokenId
            );
        return isApprovalCanceled;
    }

    function getLending(address nftAddress, uint256 nftId)
        public
        view
        returns (Lending memory lendingData)
    {
        return lendRegistry[nftAddress].lendingMap[nftId];
    }

    function removeLending(address nftAddress, uint256 nftId) public {
        require(
            isERC721Compatible(nftAddress),
            "Contract is not ERC721-compatible"
        );
        require(
            msg.sender == lendRegistry[nftAddress].lendingMap[nftId].lender,
            "unauthorized: address is not owner or lending not registered"
        );
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(
            nftAddress,
            msg.sender,
            nftId
        );
        if (_RNFT_tokenId != 0) {
            require(
                !rNFTCtrInstance.isRented(_RNFT_tokenId),
                "ERROR: Rent not expired, ongoing rent duration"
            );
        }
        delete lendRegistry[nftAddress].lendingMap[nftId];
        emit NFT_Lending_Removed(msg.sender, nftAddress, nftId);
    }

    function terminateRentAgreement(address nftAddress, uint256 oNftId)
        public
        nonReentrant
    {
        require(
            isERC721Compatible(nftAddress),
            "Contract is not ERC721-compatible"
        );
        require(
            msg.sender == lendRegistry[nftAddress].lendingMap[oNftId].lender,
            "unauthorized: address is not owner or lending not registered"
        );
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(
            nftAddress,
            msg.sender,
            oNftId
        );
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        IRNFT(_RNFTContractAddress)._terminateRent(
            nftAddress,
            _RNFT_tokenId,
            oNftId,
            msg.sender
        );

        emit Rent_Agreemeng_Terminated(nftAddress, oNftId, _RNFT_tokenId);
    }

    function redeemNFT(address nftAddress, uint256 oNftId) public nonReentrant {
        require(
            isERC721Compatible(nftAddress),
            "Contract is not ERC721-compatible"
        );
        require(
            msg.sender == lendRegistry[nftAddress].lendingMap[oNftId].lender,
            "unauthorized: address is not owner or lending not registered"
        );
        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(
            nftAddress,
            msg.sender,
            oNftId
        );
        require(_RNFT_tokenId != 0, "RNFT Token ID doesn't exist");
        require(rentBalance[_RNFT_tokenId] == 0, "Funds for this lending are not claimed yet");
        IRNFT(_RNFTContractAddress)._redeemNFT(
            _RNFT_tokenId,
            nftAddress,
            oNftId,
            msg.sender
        );
        removeLending(nftAddress, oNftId);
    }

    function setFee(uint256 fee_) public onlyAdmin {
        require(fee_ < 1e2, "invalid fee");
        _fee = fee_;
    }

    function getFee() public view returns (uint256) {
        return _fee;
    }

    function setMarketGatewayTreasury(address payable treasuryAddress) public onlyAdmin{
        _treasuryAddress = treasuryAddress;
    }

    function setMaxRentDurationLimit(uint256 mdl) public onlyAdmin {
        _maxRentDurationLimit = mdl;
    }

    function getSupportedPaymentTokens() public view returns (address[] memory){
        return supportedPaymentTokens;
    }

    function isSupportedPaymentToken(address tokenAddress) public view returns (bool){
        for (uint256 i = 0; i < supportedPaymentTokens.length; i++) {
            if (tokenAddress == supportedPaymentTokens[i]) {
                return true;
            }
        }
        return false;
    }

    function setSupportedPaymentTokens(address tokenAddress) public onlyAdmin returns (address, string memory){
        string memory tokenSymbol = string("ETH");
        if (tokenAddress != ETHER_ADDRESS) {
            tokenSymbol = ERC20(tokenAddress).symbol();
        }
        require(
            !isSupportedPaymentToken(tokenAddress),
            "token already supported"
        );
        supportedPaymentTokens.push(tokenAddress);
        emit Supported_Payment_Method_Added(tokenAddress, tokenSymbol);
        return (tokenAddress, tokenSymbol);
    }

    function isAssetRentBalanceWithdrawable(address nftAddress, uint256 tokenID) 
    internal view returns (IGateway.WithdrawMsg){
        
        (, address lender) = getPaymentInfo(nftAddress, tokenID);

        if (msg.sender != lender)   return WithdrawMsg.PermissionDenied;

        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress, lender, tokenID);

        if (_RNFT_tokenId == 0)                         return WithdrawMsg.NotMinted;
        if (rNFTCtrInstance.isWithdrawn(_RNFT_tokenId)) return WithdrawMsg.AlreadyWithdrawn;
    
        return WithdrawMsg.Success;
    }

    function _withdraw(address nftAddress, uint256 tokenID) internal returns (IGateway.WithdrawMsg) {

        WithdrawMsg res = isAssetRentBalanceWithdrawable(nftAddress, tokenID);
        if (res != WithdrawMsg.Success)   return res;

        (address paymentMethod, address lender) = getPaymentInfo(nftAddress, tokenID);

        IRNFT rNFTCtrInstance = IRNFT(_RNFTContractAddress);
        uint256 _RNFT_tokenId = rNFTCtrInstance.getRnftFromNft(nftAddress, msg.sender, tokenID);

        uint256 old_rentBalance = rentBalance[_RNFT_tokenId];
        rentBalance[_RNFT_tokenId] = 0;
        bool success;
        
        if (paymentMethod == ETHER_ADDRESS) {
            (success, ) = payable(lender).call{value: old_rentBalance}("");
        } else {
            ERC20 paymentToken = ERC20(paymentMethod);
            success = paymentToken.transfer(lender, old_rentBalance);
        }
        if ( !success ) {
            rentBalance[_RNFT_tokenId] = old_rentBalance;
            return WithdrawMsg.TransferFailed;
        }

        rNFTCtrInstance.setWithdrawFlag(_RNFT_tokenId);

        emit Rent_Fee_Withdrawn(lender, nftAddress, tokenID, paymentMethod, old_rentBalance);

        return WithdrawMsg.Success;
    }

    function getPaymentInfo(address nftAddress, uint256 tokenID) internal view returns (address, address){
        Lending memory _lendRecord = lendRegistry[nftAddress].lendingMap[tokenID];
        require(_lendRecord.lender != address(0), "Lending not created yet");
        require(_lendRecord.acceptedPaymentMethod != address(0), "Payment method not set");
        return (_lendRecord.acceptedPaymentMethod, _lendRecord.lender);
    }

    function withdrawRentFund(address nftAddress, uint256 tokenID)
        external nonReentrant
        returns (IGateway.WithdrawMsg)
    {
        WithdrawMsg res = _withdraw(nftAddress, tokenID);
        require(res != WithdrawMsg.PermissionDenied, "Unauthorized caller: invalid withdrawer");
        require(res != WithdrawMsg.NotMinted, "RNFT-ID not found");
        require(res != WithdrawMsg.NotRented, "NFT rental status: not rented");
        require(res != WithdrawMsg.AlreadyWithdrawn, "Rent balance was already withdrawn!");
        require(res != WithdrawMsg.TransferFailed, "Rent balance withdrawal failed");
        return res;
    }

    function withdrawRentFunds(
        address[] calldata nftAddresses,
        uint256[] calldata tokenIDs
    ) external nonReentrant returns (WithdrawMsg[] memory) {
        require(nftAddresses.length == tokenIDs.length, "Invalid input data: different array length");
        WithdrawMsg[] memory results = new WithdrawMsg[](nftAddresses.length);
        
        for (uint256 i = 0; i < nftAddresses.length; i++) {
            results[i] = _withdraw(nftAddresses[i], tokenIDs[i]);
        }
        return results;
    }

    function claimProtocolFee(address paymentMethod) external nonReentrant onlyAdmin returns (bool){
        require(protocolBalance[paymentMethod] > 0, "No balance to claim");
        uint256 balance = protocolBalance[paymentMethod];
        protocolBalance[paymentMethod] = 0;
        bool success;
    
        if (paymentMethod == ETHER_ADDRESS) {
            (success, ) = payable(_treasuryAddress).call{value: balance}("");
        } else {
            ERC20 paymentToken = ERC20(paymentMethod);
            success = paymentToken.transfer(_treasuryAddress, balance);
        }
        if ( !success ) {
            protocolBalance[paymentMethod] = balance;
            revert("Something went wrong, claiming protocol fee transcation failed!!!");
        }

        emit Protocol_Fee_Claimed(_treasuryAddress, paymentMethod, balance);
        return true;
    }

    function claimProtocolFees(address[] calldata paymentMethods) external nonReentrant onlyAdmin returns (bool[] memory) {
        address paymentMethod;
        uint256 balance;
        bool[] memory results = new bool[](paymentMethods.length);
        bool success;

        for (uint256 i = 0; i < paymentMethods.length; i++) {
            paymentMethod = paymentMethods[i];

            if (!isSupportedPaymentToken(paymentMethod))  continue;
            if (protocolBalance[paymentMethod] == 0)      continue;

            balance = protocolBalance[paymentMethod];
            protocolBalance[paymentMethod] = 0;
            if (paymentMethod == ETHER_ADDRESS) {
                (success, ) = payable(_treasuryAddress).call{value: balance}("");
            } else {
                ERC20 paymentToken = ERC20(paymentMethod);
                success = paymentToken.transferFrom(address(this), _treasuryAddress, balance);
            }
            if ( !success ) {
                protocolBalance[paymentMethod] = balance;
            }
            results[i] = success;
        }
        return results
    }

    function calculateServiceFees(uint256 amount) internal view returns (uint256, uint256) {
        uint256 serviceFeeAmount = SafeMathUpgradeable.div(
            SafeMathUpgradeable.mul(amount, getFee()),
            1e2
        );
        uint256 rentPriceAfterFee = SafeMathUpgradeable.sub(
            amount,
            serviceFeeAmount
        );
        return (serviceFeeAmount, rentPriceAfterFee);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable) returns (bool){
        return super.supportsInterface(interfaceId);
    }

    function setNewAdmin(address _newAdmin) public onlyOwner {
        grantRole(DEFAULT_ADMIN_ROLE, _newAdmin);
        emit NewAdminAdded(_newAdmin);
    }

    function removeAdmin(address _admin) public onlyOwner {
        revokeRole(DEFAULT_ADMIN_ROLE, _admin);
        emit AdminRemoved(_admin);
    }

    function isERC721Compatible(address _contract) public view returns (bool) {
        bytes4 IID_IERC721 = type(IERC721).interfaceId;
        return IERC165(_contract).supportsInterface(IID_IERC721);
    }    
}
