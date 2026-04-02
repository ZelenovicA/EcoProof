import { getContract, parseEther } from "viem";

import { ECOPROOF_ABI, ECOPROOF_CONTRACT_ADDRESS } from "@/config/contract";
import { getWalletClient, publicClient } from "@/config/wagmi";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const readOnlyContract = getContract({
  address: ECOPROOF_CONTRACT_ADDRESS,
  abi: ECOPROOF_ABI as any,
  client: publicClient,
});

async function writeContract(config: {
  functionName: string;
  args: unknown[];
  account: `0x${string}`;
}) {
  const walletClient = getWalletClient() as AnyClient;
  return walletClient.writeContract({
    address: ECOPROOF_CONTRACT_ADDRESS,
    abi: ECOPROOF_ABI as any,
    functionName: config.functionName,
    args: config.args,
    account: config.account,
  });
}

export const contractService = {
  readOnlyContract,

  async setMerkleRoot(
    merkleRoot: `0x${string}`,
    ipfsCID: string,
    account: `0x${string}`,
  ) {
    return writeContract({
      functionName: "setMerkleRoot",
      args: [merkleRoot, ipfsCID],
      account,
    });
  },

  async setBuybackPrice(newPriceEth: string, account: `0x${string}`) {
    return writeContract({
      functionName: "setBuybackPricePerToken",
      args: [parseEther(newPriceEth)],
      account,
    });
  },

  async setDeviceActive(
    deviceId: `0x${string}`,
    active: boolean,
    account: `0x${string}`,
  ) {
    return writeContract({
      functionName: "setDeviceActive",
      args: [deviceId, active],
      account,
    });
  },

  async sendETHToContract(valueEth: string, account: `0x${string}`) {
    const walletClient = getWalletClient() as AnyClient;
    return walletClient.sendTransaction({
      to: ECOPROOF_CONTRACT_ADDRESS,
      value: parseEther(valueEth),
      account,
    });
  },

  parseError(error: unknown): string {
    const maybeError = error as {
      reason?: string;
      shortMessage?: string;
      details?: string;
      message?: string;
    };

    if (maybeError?.reason) return maybeError.reason;
    if (maybeError?.shortMessage) return maybeError.shortMessage;
    if (maybeError?.details) return maybeError.details;
    if (maybeError?.message) return maybeError.message;
    return "Transaction failed";
  },

  formatAddress(address?: string) {
    if (!address) return "Unknown";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  },

  config: {
    contractAddress: ECOPROOF_CONTRACT_ADDRESS,
    contractABI: ECOPROOF_ABI,
  },
};
