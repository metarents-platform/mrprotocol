// contracts/RNFT.sol
// SPDX-License-Identifier: MIT
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


contract RNFT is Initializable, ERC721Upgradeable, IERC721ReceiverUpgradeable,
ERC721BurnableUpgradeable, AccessControlUpgradeable, OwnableUpgradeable {

  // RNFT Token IDs
  using CountersUpgradeable for CountersUpgradeable.Counter;
  CountersUpgradeable.Counter private _RtokenIds;

  // RNFT Metadata
  struct RMetadata {
    // Boolean indicating if the NFT is rented
    bool isRented;

    // The address of the approved renter
    address approvedRenter;

    // Total price of the rent period
    uint128 rentPrice;

    // Approved rent period in seconds
    uint128 approvedRentPeriod;

    // The rent start time (once RNFT is minted and payment is done)
    uint128 rStartTime;

    // The rent end time (checked at redeem and )
    uint128 rEndTime;


  }

  // orignalOwner -> (origContract -> (oTokenId -> RTokenId))
  mapping(address => mapping(address => mapping(uint256 => uint256))) private _OwnerRTokenID;

  // RTokenId -> RMetadata
  mapping(uint256 => RMetadata) private _rmetadata;


  function initialize() public initializer {
    __ERC721_init("MetaRents RentNFT", "RNFT");
    __ERC721Burnable_init();
    __AccessControl_init();
    __Ownable_init();

    // Add owner as administrator
    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
  }

  modifier onlyAdmin()
  {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Restricted to admins");
    _;
  }

  ///@dev to add contract administrators such as the Gateway contract
  function addAdmin(address newAdmin) external onlyOwner
  {
    grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
  }

  ///@dev to remove a contract administrator
  function removeAdmin(address admin) external onlyOwner
  {
    _revokeRole(DEFAULT_ADMIN_ROLE, admin);
  }

  function onERC721Received(address, address, uint256, bytes calldata) external virtual override returns (bytes4)
  {
    return this.onERC721Received.selector;
  }

  function approveRenter(
    address orignalOwner,
    address nftAddress,
     uint256 oTokenId,
      uint256 timeUnitSec,
        uint256 rentDuration,
        uint256 timeUnitPrice,
        address approvedRenter) external onlyAdmin returns (uint256){
    // Invalid value
    uint256 RTokenId = 0;

    // Check for same address
    require(orignalOwner != approvedRenter, 'Lender cannot be a renter');

    // Create an instance of the original NFT's contract
    IERC721 origContract = IERC721(nftAddress);

    // Check if the contract is the owner
    if (address(this) == origContract.ownerOf(oTokenId))
    {
      // Get the RTokenId
      RTokenId = _OwnerRTokenID[nftAddress][orignalOwner][oTokenId];

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
      require(orignalOwner == origContract.ownerOf(oTokenId), 'Not the NFT owner');

      // Check that the contract is approved: address(this) is the delegating proxy.
      require(address(this) == origContract.getApproved(oTokenId), 'Contract not approved');
    }

    // Calculate the approved rent period in seconds
    uint256 approvedRentPeriod = SafeMathUpgradeable.mul(timeUnitSec,rentDuration);

    // Check if the time limit is respected
    //require(approvedRentPeriod <= SafeMathUpgradeable.mul(timeUnitSec, maxTimeUnits), 'Approved period is longer than the limit');

    // Calculate the renting price
    uint256 rentingPrice = SafeMathUpgradeable.mul(rentDuration, timeUnitPrice);

    //Old: Mint new RNFT return RNFTtokenId
    //New: Pre Mint: generate ony a new RNFTtokenId
    if(RTokenId == 0){
      RTokenId = preMintRNFT();
    }
    // Set the metadata
    _rmetadata[RTokenId].isRented = false;
    _rmetadata[RTokenId].rentPrice = SafeCastUpgradeable.toUint128(rentingPrice);
    _rmetadata[RTokenId].approvedRentPeriod = SafeCastUpgradeable.toUint128(approvedRentPeriod);
    _rmetadata[RTokenId].approvedRenter = approvedRenter;

    // Return the RNFT token ID to the caller
    return RTokenId;
  }


  function preMintRNFT() private onlyAdmin returns(uint256) {
      // Don't mint if the RNFT is already in the contract
      // Generate the RNFT Token ID
      _RtokenIds.increment();
      uint256 RTokenId = _RtokenIds.current();
      return RTokenId;
  }

  function clearApprovalState(uint256 RTokenId) external onlyAdmin{
    // Clear/invalidate the preminted rnft metadata mapping
    delete _rmetadata[RTokenId];
  }

  function _mintRNFT(address nftAddress, address orignalOwner, uint256 oTokenId, uint256 _RTokenId) private onlyAdmin returns (uint256)
  {
    // Create new instance
    IERC721 origContract = IERC721(nftAddress);
    // Transfer the NFT to the contract
    origContract.safeTransferFrom(orignalOwner, address(this), oTokenId);

    // // Generate the RNFT Token ID
    // _RtokenIds.increment();
    // uint256 RTokenId = _RtokenIds.current();

    // mint the RNFT
    _mint(address(this), _RTokenId);

    // Map the owner's original NFT to the RNFT
    _OwnerRTokenID[nftAddress][orignalOwner][oTokenId] = _RTokenId;

    // Return the RTokenId
    return _RTokenId;
  }

  /** Start rent agreement after confirmed payment  */
  function startRent(uint256 RTokenId) external onlyAdmin{
    // initiateRent()
    require(RTokenId != 0, "RNFT Token ID doesn't exist");
    require(isRented(RTokenId),"NFT rental status: already rented");
    uint256 _now = block.timestamp;
    _rmetadata[RTokenId].rStartTime = _now;
    _rmetadata[RTokenId].rEndTime = _now + _rmetadata[RTokenId].approvedRentPeriod;
    _rmetadata[RTokenId].isRented = true;
  }

  function terminateRent(uint256 RTokenId) external onlyAdmin{
    require(RTokenId != 0, "RNFT Token ID doesn't exist");
    require(!isRented(RTokenId),"NFT rental status: not rented");
    // check if rent duration is due
    _burnRNFT();
  }


  function _burnRNFT() private{
    _;
  }

  function getRnftFromNft(address origContract, address orignalOwner, uint256 oTokenId) public view returns (uint256)
  {
    // Caller must always check if the RTokenId is zero
    return _OwnerRTokenID[origContract][orignalOwner][oTokenId];
  }

  function isApprovedRenter(address renter, uint256 RTokenId) public view returns (bool){
    return _rmetadata[RTokenId].approvedRenter == renter;
  }

  function isRented(uint256 RTokenId) public view returns (bool){
    return _rmetadata[RTokenId].isRented;
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
}
