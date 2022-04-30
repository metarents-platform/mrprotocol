// contracts/RNFT.sol
// SPDX-License-Identifier: MIT

/// @author Moughite El Joaydi (@Metajazzy), Robert M. Carden (@crazydevlegend)
/// @title RNFT Contract
/// @dev RNFT Contract is an ERC-721 implementation to manage lender RentNFTs (RNFTs) and rent operations

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import "./IRNFT.sol";

contract RNFT is Initializable, ERC721Upgradeable, IERC721ReceiverUpgradeable,
ERC721BurnableUpgradeable, AccessControlUpgradeable, OwnableUpgradeable {

  // RNFT Token IDs
  using CountersUpgradeable for CountersUpgradeable.Counter;
  CountersUpgradeable.Counter private _RtokenIds;

  // orignalOwner -> (origContract -> (oTokenId -> RTokenId))
  mapping(address => mapping(address => mapping(uint256 => uint256))) private _OwnerRTokenID;
  // RTokenId -> Renting
  mapping(uint256 => IRNFT.Renting) private _rmetadata;


  function initialize() public initializer {
    __ERC721_init("MetaRents RentNFT", "RNFT");
    __ERC721Burnable_init();
    __AccessControl_init();
    __Ownable_init();

    // Add owner as administrator
    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    // Add Proxy as administrator to delegate calls
    // setNewAdmin(DEFAULT_ADMIN_ROLE, proxyAddress);
  }

  // @dev verifier to check for authorisated administrators
  modifier onlyAdmin()
  {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Restricted to admins");
    _;
  }

  function onERC721Received(address, address, uint256, bytes calldata) external virtual override returns (bytes4)
  {
    return this.onERC721Received.selector;
  }

  function approveRenter(
    uint256 timeUnitSec,
    uint256 rentDuration,
    uint256 timeUnitPrice,
    address approvedRenter,
    uint256 _RTokenId) external onlyAdmin returns (uint256){

    // Calculate the approved rent period in seconds
    uint256 approvedRentPeriod = SafeMathUpgradeable.mul(timeUnitSec,rentDuration);

    // Check if the time limit is respected
    //require(approvedRentPeriod <= SafeMathUpgradeable.mul(timeUnitSec, maxTimeUnits), 'Approved period is longer than the limit');

    // Calculate the renting price
    uint256 rentingPrice = SafeMathUpgradeable.mul(rentDuration, timeUnitPrice);

    // Set the metadata
    _rmetadata[_RTokenId].isRented = false;
    _rmetadata[_RTokenId].rentPrice = SafeCastUpgradeable.toUint128(rentingPrice);
    _rmetadata[_RTokenId].approvedRentPeriod = SafeCastUpgradeable.toUint128(approvedRentPeriod);
    _rmetadata[_RTokenId].approvedRenter = approvedRenter;

    // Return the RNFT token ID to the caller
    return _RTokenId;
  }


  function preMintRNFT() private onlyAdmin returns(uint256) {
      // Don't mint if the RNFT is already in the contract
      // Generate the RNFT Token ID
      _RtokenIds.increment();
      uint256 RTokenId = _RtokenIds.current();
      return RTokenId;
  }

  function _mintRNFT(address nftAddress, address originalOwner, uint256 oTokenId, uint256 _RTokenId) private onlyAdmin returns (uint256)
  {
    // Create new instance
    IERC721 origContract = IERC721(nftAddress);
    require(origContract.getApproved(oTokenId) == address(this), "RNFT contract is not an approved operator");
    // Check if contract is not owner to prevent unexpected errors at transferFrom
    if(address(this) != origContract.ownerOf(oTokenId)){
      // Transfer the NFT to the contract - implement safeTransfer to prevent contract from locking NFT forever is non-ERC721 compatible interface
      origContract.safeTransferFrom(originalOwner, address(this), oTokenId);
    }
    // mint the RNFT
    _safeMint(address(this), _RTokenId);

    _rmetadata[_RTokenId].mintNonce = true;

    return _RTokenId;
  }

  // setter function to store initial rent metadata (owner, nftAddress, oNftId)
  function initializeRentMetadata(address originalOwner, address nftAddress,uint256 oTokenId) external returns (uint256) {
    // initialise RNFT Token ID
    uint256 RTokenId = _OwnerRTokenID[nftAddress][originalOwner][oTokenId];
    // Create an instance of the original NFT's contract
    IERC721 origContract = IERC721(nftAddress);
    address _tokenOwner = origContract.ownerOf(oTokenId);

    // Check if the contract is the owner
    if (address(this) == _tokenOwner)
    {
      // Check if the RTokenId is valid
      require(RTokenId != 0, 'Failed to retrieve RTokenId for owner');

      // RNFT must not be rented
      require(!_rmetadata[RTokenId].isRented, 'RNFT is already rented');

      // RNFT about to be rented while still in contract, clear/invalidate the old metadata mapping
      delete _rmetadata[RTokenId];
    }
    else
    {
      // Check that lender owns the NFT
      require(originalOwner == _tokenOwner, 'Not the NFT owner');

      // Check that the contract is approved: address(this) is RNFT contract
      require(origContract.getApproved(oTokenId) == address(this), 'Contract not approved to operate NFT');
    }
    //Old instruction: Mint new RNFT return RNFTtokenId
    //New instruction: Pre Mint: generate only a new RNFTtokenId for post-minting
    if(RTokenId == 0){
      RTokenId = preMintRNFT();
    }
    // Map the owner's original NFT to the RNFT
    _OwnerRTokenID[nftAddress][originalOwner][oTokenId] = RTokenId;
    // 5
    _rmetadata[RTokenId].originalOwner = originalOwner;
    // _rmetadata[RTokenId].nftAddress = nftAddress;
    // _rmetadata[RTokenId].oTokenId = oTokenId;

    return RTokenId;
  }

  /** Start rent agreement after confirmed payment  */
  function startRent(uint256 RTokenId) external virtual onlyAdmin{
    // initiateRent()
    require(RTokenId != 0, "RNFT Token ID doesn't exist");
    require(isRented(RTokenId),"NFT rental status: already rented");
    uint128 _now = SafeCastUpgradeable.toUint128(block.timestamp);
    _rmetadata[RTokenId].rStartTime = _now;
    _rmetadata[RTokenId].rEndTime = _now + _rmetadata[RTokenId].approvedRentPeriod;
    _rmetadata[RTokenId].isRented = true;
    // grant renter with DCL Operator rights
    //IERC721(addressDCL).setUpdateOperator(owner)
  }

  function _terminateRent(uint256 RTokenId, address caller) public virtual onlyAdmin{
    require(RTokenId != 0, "RNFT Token ID doesn't exist");
    require(!isRented(RTokenId),"NFT rental status: not rented");
    require(caller == _rmetadata[RTokenId].originalOwner, "Caller is not original NFT Owner");
    // check if rent duration is due
    require(block.timestamp >= _rmetadata[RTokenId].rEndTime," ERROR: Rent not expired, ongoing rent duration");
    // Clear RNFT metadata
    clearRNFTState(RTokenId);
    // revokes the renter's operating status on the original NFT. DECENTRALAND
  }

  function _redeemNFT(uint256 RTokenId, address nftAddress, uint256 oNftId, address originalNFTOwner)
  public virtual onlyAdmin{
    _terminateRent(RTokenId, originalNFTOwner);
    // Reset Owner->RNFT mapping to 0
    _OwnerRTokenID[nftAddress][originalNFTOwner][oNftId] = 0;
    delete _rmetadata[RTokenId];
     // Check if burnRNFt should be called in approveRenter (first if branch)
    _burnRNFT(RTokenId); // Burn RNFT only on Redeem
    IERC721(nftAddress).safeTransferFrom(address(this), originalNFTOwner, oNftId);
    // revokes the renter's operating status on the original NFT. DECENTRALAND
    //IERC721(addressDCL).setUpdateOperator(originalNFTOwner);
  }

  function _burnRNFT(uint256 _RTokenId) private {
    _burn(_RTokenId);
  }

  function getRnftFromNft(address origContract, address orignalOwner, uint256 oTokenId) public view returns (uint256)
  {
    // Caller must always check if the RTokenId is zero
    return _OwnerRTokenID[origContract][orignalOwner][oTokenId];
  }

  function clearRNFTState(uint256 RTokenId) public onlyAdmin returns(bool){
   // Clear/invalidate the preminted rnft metadata mapping
    //delete _rmetadata[RTokenId];
    _rmetadata[RTokenId].isRented = false;
    _rmetadata[RTokenId].rentPrice = 0;
    _rmetadata[RTokenId].approvedRentPeriod = 0;
    _rmetadata[RTokenId].approvedRenter = address(0);
    return true;
  }

  function isApprovedRenter(address renter, uint256 RTokenId) public view returns (bool){
    return _rmetadata[RTokenId].approvedRenter == renter;
  }

  function isRented(uint256 RTokenId) public view returns (bool){
    return _rmetadata[RTokenId].isRented;
  }

  function isMinted(uint RTokenId) public view returns (bool){
    return _rmetadata[RTokenId].mintNonce;
  }

  function getRentPrice(uint RTokenId) public view returns (uint128){
    return _rmetadata[RTokenId].rentPrice;
  }

  function getApprovedRentPeriod(uint RTokenId) public view returns (uint128){
    return _rmetadata[RTokenId].approvedRentPeriod;
  }

  function getApprovedRenter(uint RTokenId) public view returns (address){
    return _rmetadata[RTokenId].approvedRenter;
  }

  function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable, ERC721Upgradeable) returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }

  /** Gateway Contract Role-Based Access Control */

  ///@dev to add contract administrators such as the Gateway contract
  function _setNewAdmin(address newAdmin) external onlyOwner{
    grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
    //emit RNFTNewAdminAdded(newAdmin);
  }

  ///@dev to remove a contract administrator
  function _removeAdmin(address admin) external onlyOwner{
    revokeRole(DEFAULT_ADMIN_ROLE, admin);
    //emit RNFTAdminRemoved(admin);
  }


}
