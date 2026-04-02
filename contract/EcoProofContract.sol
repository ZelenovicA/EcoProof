// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract EcoRewardToken is ERC20, AccessControl {

    uint256 public constant REWARD_DECIMALS = 1e18;

    struct Device {
        address owner;
        bool active;
        uint64 registeredAt;
        bytes32 sensorType;
        int256 latitude;
        int256 longitude; 
    }

    mapping(bytes32 => Device) public devices;

    // MERKLE REWARD
    bytes32 public currentMerkleRoot;
    string public merkleRootLatestIPFSMetadata;

    // TREASURY

    address public treasury;
    uint256 public totalETHForBuyback;
    uint256 public buybackPricePerToken = 0.0001 ether;

    // Total amount user has already claimed
    mapping(address => uint256) public totalClaimed;

    // =======================
    //         EVENTS
    // =======================

    event DeviceRegistered(
        bytes32 indexed deviceId,
        address indexed owner,
        bytes32 indexed sensorType,
        int256 latitude,   // scaled (* 1e6)
        int256 longitude  // scaled (* 1e6)
    );
    event DeviceStatusChanged(bytes32 indexed deviceId, bool active);
    event MetadataUpdated(
    bytes32 indexed deviceId,
    address indexed owner,
    int256 latitude, 
    int256 longitude  
    );

    event MerkleRootUpdated(bytes32 indexed newRoot,string ipfsCID, uint256 timestamp);
    event RewardClaimed(address indexed user, uint256 amount);
    
    event TreasuryFunded(address indexed from, uint256 amount);
    event BuybackExecuted(address indexed user, uint256 tokenBurned, uint256 ethSpent);
    event BuybackPriceUpdated(uint256 newPricePerToken);

    // =======================
    //       CONSTRUCTOR
    // =======================

    constructor(address admin)
        ERC20("EcoReward", "ECR")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        treasury = address(this);
    }

    // =======================
    //    DEVICE MANAGEMENT
    // =======================

    function registerDevice(
        bytes32 deviceId,
        address deviceOwner,
        bytes32 sensorType,
        int256 latitude,
        int256 longitude
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(deviceId != bytes32(0), "invalid device id");
        require(deviceOwner != address(0), "invalid owner");
        require(devices[deviceId].owner == address(0), "already registered");

        devices[deviceId] = Device({
            owner: deviceOwner,
            active: true,
            registeredAt: uint64(block.timestamp),
            sensorType: sensorType,
            latitude: latitude, 
            longitude: longitude
        });

        emit DeviceRegistered(deviceId, deviceOwner, sensorType, latitude, longitude);
    }

    function setDeviceActive(bytes32 deviceId, bool active)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(devices[deviceId].owner != address(0), "unknown device");
        devices[deviceId].active = active;
        emit DeviceStatusChanged(deviceId, active);
    }

    function updateMetadata(bytes32 deviceId, int256 latitude, int256 longitude)
        external
    {
        require(devices[deviceId].owner != address(0), "unknown device");
        require(devices[deviceId].owner == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not the owner");

        devices[deviceId].latitude = latitude;
        devices[deviceId].latitude = longitude;

        emit MetadataUpdated(deviceId, msg.sender, latitude, longitude);
    }

    // =======================
    //   MERKLE REWARD LOGIC
    // =======================

    function setMerkleRoot(bytes32 newRoot,string calldata ipfsCID)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(currentMerkleRoot!=newRoot, "invalid merkle root");
        currentMerkleRoot = newRoot;
        merkleRootLatestIPFSMetadata = ipfsCID;
    
        emit MerkleRootUpdated(newRoot,ipfsCID,block.timestamp);
    }

    function claim(
        uint256 cumulativeAmount,
        bytes32[] calldata proof
    ) external {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, cumulativeAmount));

        require(MerkleProof.verify(proof, currentMerkleRoot, leaf),"invalid proof");

        uint256 alreadyClaimed = totalClaimed[msg.sender];
        require(cumulativeAmount > alreadyClaimed, "nothing to claim");

        uint256 claimable = cumulativeAmount - alreadyClaimed;

        totalClaimed[msg.sender] = cumulativeAmount;

        _mint(msg.sender, claimable);

        emit RewardClaimed(msg.sender, claimable);
    }

    // =======================
    //        TREASURY
    // =======================

    receive() external payable {
        require(msg.value > 0, "Must send ETH");
        totalETHForBuyback += msg.value;
        emit TreasuryFunded(msg.sender, msg.value);
    }

    // =======================
    //     BUYBACK LOGIC
    // =======================

    function sellTokensForEth(uint256 tokenAmount) 
        external {
        require(tokenAmount > 0, "invalid amount");
        require(buybackPricePerToken > 0, "price is at zero");

        uint256 ethAmount = (tokenAmount * buybackPricePerToken) / 1e18;

        require(address(this).balance >= ethAmount, "not enough ETH in treasury");

        // Transfer tokens from user to contract
        _transfer(msg.sender, address(this), tokenAmount);

        // Burn tokens
        _burn(address(this), tokenAmount);

        // Pay user ETH
        payable(msg.sender).transfer(ethAmount);

        emit BuybackExecuted(msg.sender, tokenAmount, ethAmount);
    }

     function setBuybackPricePerToken(uint256 newPrice)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newPrice > 0, "invalid price");
        buybackPricePerToken = newPrice;
        emit BuybackPriceUpdated(newPrice);
    }
}