const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
if (!contractAddress) {
  console.warn("VITE_CONTRACT_ADDRESS not set in environment. Check your .env file!");
}

export const ECOPROOF_CONTRACT_ADDRESS = (contractAddress || "0x1Cf055e7E5F870788DF7d30C203bB0F2CfEbE04C") as `0x${string}`;
export const BLOCK_EXPLORER_URL = `https://base-sepolia.blockscout.com/address/${ECOPROOF_CONTRACT_ADDRESS}`;
export const IS_CONTRACT_CONFIGURED = ECOPROOF_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

export const ECOPROOF_ABI = [
  {
    inputs: [{ internalType: "address", name: "admin", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "DEFAULT_ADMIN_ROLE",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "buybackPricePerToken",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "cumulativeAmount", type: "uint256" },
      { internalType: "bytes32[]", name: "proof", type: "bytes32[]" },
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "currentMerkleRoot",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "devices",
    outputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "bool", name: "active", type: "bool" },
      { internalType: "uint64", name: "registeredAt", type: "uint64" },
      { internalType: "bytes32", name: "sensorType", type: "bytes32" },
      { internalType: "int256", name: "latitude", type: "int256" },
      { internalType: "int256", name: "longitude", type: "int256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "role", type: "bytes32" },
      { internalType: "address", name: "account", type: "address" },
    ],
    name: "hasRole",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "merkleRootLatestIPFSMetadata",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "deviceId", type: "bytes32" },
      { internalType: "address", name: "deviceOwner", type: "address" },
      { internalType: "bytes32", name: "sensorType", type: "bytes32" },
      { internalType: "int256", name: "latitude", type: "int256" },
      { internalType: "int256", name: "longitude", type: "int256" },
    ],
    name: "registerDevice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "deviceId", type: "bytes32" },
      { internalType: "int256", name: "latitude", type: "int256" },
      { internalType: "int256", name: "longitude", type: "int256" },
    ],
    name: "updateMetadata",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "deviceId", type: "bytes32" },
      { internalType: "bool", name: "active", type: "bool" },
    ],
    name: "setDeviceActive",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "newRoot", type: "bytes32" },
      { internalType: "string", name: "ipfsCID", type: "string" },
    ],
    name: "setMerkleRoot",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "newPrice", type: "uint256" }],
    name: "setBuybackPricePerToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenAmount", type: "uint256" },
    ],
    name: "sellTokensForEth",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "totalClaimed",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: true, internalType: "address", name: "spender", type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      { indexed: false, internalType: "uint256", name: "tokenBurned", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "ethSpent", type: "uint256" },
    ],
    name: "BuybackExecuted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "newPricePerToken", type: "uint256" },
    ],
    name: "BuybackPriceUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "deviceId", type: "bytes32" },
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: true, internalType: "bytes32", name: "sensorType", type: "bytes32" },
      { indexed: false, internalType: "int256", name: "latitude", type: "int256" },
      { indexed: false, internalType: "int256", name: "longitude", type: "int256" },
    ],
    name: "DeviceRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "deviceId", type: "bytes32" },
      { indexed: false, internalType: "bool", name: "active", type: "bool" },
    ],
    name: "DeviceStatusChanged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "newRoot", type: "bytes32" },
      { indexed: false, internalType: "string", name: "ipfsCID", type: "string" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "MerkleRootUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "deviceId", type: "bytes32" },
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: false, internalType: "int256", name: "latitude", type: "int256" },
      { indexed: false, internalType: "int256", name: "longitude", type: "int256" },
    ],
    name: "MetadataUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "RewardClaimed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
] as const;
