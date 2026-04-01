// Replace with your deployed contract address
export const ECOPROOF_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const ECOPROOF_ABI = [
  // ERC20
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalClaimed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Device Management
  {
    name: "devices",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "active", type: "bool" },
      { name: "registeredAt", type: "uint64" },
      { name: "sensorType", type: "bytes32" },
      { name: "metadataURI", type: "string" },
    ],
  },
  {
    name: "registerDevice",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "deviceId", type: "bytes32" },
      { name: "deviceOwner", type: "address" },
      { name: "sensorType", type: "bytes32" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "setDeviceActive",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "deviceId", type: "bytes32" },
      { name: "active", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "updateMetadata",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "deviceId", type: "bytes32" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [],
  },
  // Merkle Rewards
  {
    name: "currentMerkleRoot",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "merkleRootLatestIPFSMetadata",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "setMerkleRoot",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "newRoot", type: "bytes32" },
      { name: "ipfsCID", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "cumulativeAmount", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  // Treasury / Buyback
  {
    name: "buybackPricePerToken",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "setBuybackPricePerToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "newPrice", type: "uint256" }],
    outputs: [],
  },
  {
    name: "sellTokensForEth",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenAmount", type: "uint256" }],
    outputs: [],
  },
  // Events
  {
    name: "DeviceRegistered",
    type: "event",
    inputs: [
      { name: "deviceId", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "sensorType", type: "bytes32", indexed: true },
      { name: "metadataURI", type: "string", indexed: false },
    ],
  },
  {
    name: "DeviceStatusChanged",
    type: "event",
    inputs: [
      { name: "deviceId", type: "bytes32", indexed: true },
      { name: "active", type: "bool", indexed: false },
    ],
  },
  {
    name: "MerkleRootUpdated",
    type: "event",
    inputs: [
      { name: "newRoot", type: "bytes32", indexed: true },
      { name: "ipfsCID", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "RewardClaimed",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "BuybackExecuted",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "tokenBurned", type: "uint256", indexed: false },
      { name: "ethSpent", type: "uint256", indexed: false },
    ],
  },
  {
    name: "BuybackPriceUpdated",
    type: "event",
    inputs: [
      { name: "newPricePerToken", type: "uint256", indexed: false },
    ],
  },
] as const;

// Loose-typed ABI for writeContract calls (avoids strict TS requirements)
export const ECOPROOF_ABI_LOOSE: any[] = ECOPROOF_ABI as any;
