// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract EcoRewardToken is ERC20, AccessControl {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    uint256 public constant REWARD_DECIMALS = 1e18;

    struct Device {
        address owner;
        bool active;
        uint64 registeredAt;
        bytes32 sensorType;
        string metadataURI;
    }

    mapping(bytes32 => Device) public devices;

    // MERKLE REWARD
    bytes32 public currentMerkleRoot;

    // TREASURY

    address public treasury;
    uint256 public totalETHForBuyback;

    // Total amount user has already claimed
    mapping(address => uint256) public totalClaimed;

    // =======================
    // EVENTS
    // =======================

    event MerkleRootUpdated(bytes32 newRoot);
    event RewardClaimed(address indexed user, uint256 amount);

    event TreasuryFunded(address indexed from, uint256 amount);
    event BuybackExecuted(uint256 ethSpent, uint256 tokensBurned);

    event DeviceRegistered(
        bytes32 indexed deviceId,
        address indexed owner,
        bytes32 indexed sensorType,
        string metadataURI
    );
    event DeviceStatusChanged(bytes32 indexed deviceId, bool active);

    constructor(address admin)
        ERC20("EcoReward", "ECR")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        treasury = address(this);
    }

    // =======================
    // DEVICE MANAGEMENT
    // =======================

    function registerDevice(
        bytes32 deviceId,
        address deviceOwner,
        bytes32 sensorType,
        string calldata metadataURI
    ) external onlyRole(REGISTRAR_ROLE) {
        require(deviceId != bytes32(0), "invalid device id");
        require(deviceOwner != address(0), "invalid owner");
        require(devices[deviceId].owner == address(0), "already registered");

        devices[deviceId] = Device({
            owner: deviceOwner,
            active: true,
            registeredAt: uint64(block.timestamp),
            sensorType: sensorType,
            metadataURI: metadataURI
        });

        emit DeviceRegistered(deviceId, deviceOwner, sensorType, metadataURI);
    }

    function setDeviceActive(bytes32 deviceId, bool active)
        external
        onlyRole(REGISTRAR_ROLE)
    {
        require(devices[deviceId].owner != address(0), "unknown device");
        devices[deviceId].active = active;
        emit DeviceStatusChanged(deviceId, active);
    }

    function updateMetadata(bytes32 deviceId, string calldata metadataURI)
        external
    {
        require(devices[deviceId].owner != address(0), "unknown device");
        require(devices[deviceId].owner != msg.sender, "Not the owner");

        devices[deviceId].metadataURI = metadataURI;
    }

    // =======================
    // MERKLE REWARD LOGIC
    // =======================

    function setMerkleRoot(bytes32 newRoot)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        currentMerkleRoot = newRoot;
        emit MerkleRootUpdated(newRoot);
    }

    function claim(
        uint256 cumulativeAmount,
        bytes32[] calldata proof
    ) external {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, cumulativeAmount));

        require(
            MerkleProof.verify(proof, currentMerkleRoot, leaf),
            "invalid proof"
        );

        uint256 alreadyClaimed = totalClaimed[msg.sender];
        require(cumulativeAmount > alreadyClaimed, "nothing to claim");

        uint256 claimable = cumulativeAmount - alreadyClaimed;

        totalClaimed[msg.sender] = cumulativeAmount;

        _mint(msg.sender, claimable);

        emit RewardClaimed(msg.sender, claimable);
    }

    // =======================
    // TREASURY LOGIC
    // =======================

    receive() external payable {
        totalETHForBuyback += msg.value;
        emit TreasuryFunded(msg.sender, msg.value);
    }

    // Buyback function (simplified for hackathon)
    // In production, this would interact with a DEX
    function buybackAndBurn(uint256 tokenAmount)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(balanceOf(address(this)) >= tokenAmount, "not enough tokens");

        //Buying tokens logic

        _burn(address(this), tokenAmount);

        emit BuybackExecuted(0, tokenAmount);
    }
}