import { ECOPROOF_CONTRACT_ADDRESS, ECOPROOF_ABI } from "@/config/contract";
import { getContract, parseEther, zeroHash } from "viem";
import { publicClient, walletClient } from "@/config/wagmi";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

// Create contract instances
const readOnlyContract = getContract({
	address: ECOPROOF_CONTRACT_ADDRESS,
	abi: ECOPROOF_ABI as any,
	client: publicClient,
});

export const contractService = {
	// READ CONTRACT FUNCTIONS
	async getMerkleRoot() {
		try {
			return await (readOnlyContract.read as AnyClient).currentMerkleRoot();
		} catch (error) {
			console.error("Error reading merkle root:", error);
			throw error;
		}
	},

	async getBuybackPrice() {
		try {
			return await (readOnlyContract.read as AnyClient).buybackPricePerToken();
		} catch (error) {
			console.error("Error reading buyback price:", error);
			throw error;
		}
	},

	async hasAdminRole(address: `0x${string}`) {
		try {
			return await (readOnlyContract.read as AnyClient).hasRole(zeroHash, address);
		} catch (error) {
			console.error("Error checking admin role:", error);
			throw error;
		}
	},

	async getDevice(deviceId: `0x${string}`) {
		try {
			return await (readOnlyContract.read as AnyClient).devices(deviceId);
		} catch (error) {
			console.error("Error reading device:", error);
			throw error;
		}
	},

	// WRITE CONTRACT FUNCTIONS
	async setMerkleRoot(
		merkleRoot: `0x${string}`,
		ipfsCID: string,
		account: `0x${string}`
	) {
		try {
			const hash = await (walletClient as AnyClient).writeContract({
				address: ECOPROOF_CONTRACT_ADDRESS,
				abi: ECOPROOF_ABI as any,
				functionName: "setMerkleRoot",
				args: [merkleRoot, ipfsCID],
				account,
			});
			return hash;
		} catch (error) {
			console.error("Error setting merkle root:", error);
			throw error;
		}
	},

	async setBuybackPrice(newPriceEth: string, account: `0x${string}`) {
		try {
			const hash = await (walletClient as AnyClient).writeContract({
				address: ECOPROOF_CONTRACT_ADDRESS,
				abi: ECOPROOF_ABI as any,
				functionName: "setBuybackPricePerToken",
				args: [parseEther(newPriceEth)],
				account,
			});
			return hash;
		} catch (error) {
			console.error("Error setting buyback price:", error);
			throw error;
		}
	},

	async setDeviceActive(
		deviceId: `0x${string}`,
		active: boolean,
		account: `0x${string}`
	) {
		try {
			const hash = await (walletClient as AnyClient).writeContract({
				address: ECOPROOF_CONTRACT_ADDRESS,
				abi: ECOPROOF_ABI as any,
				functionName: "setDeviceActive",
				args: [deviceId, active],
				account,
			});
			return hash;
		} catch (error) {
			console.error("Error setting device active:", error);
			throw error;
		}
	},

	async sendETHToContract(valueEth: string, account: `0x${string}`) {
		try {
			const hash = await (walletClient as AnyClient).sendTransaction({
				to: ECOPROOF_CONTRACT_ADDRESS,
				value: parseEther(valueEth),
				account,
			});
			return hash;
		} catch (error) {
			console.error("Error sending ETH:", error);
			throw error;
		}
	},

	// ERROR HELPER
	parseError(error: any): string {
		if (error?.reason) return error.reason;
		if (error?.shortMessage) return error.shortMessage;
		if (error?.details) return error.details;
		if (error?.message) return error.message;
		return "Transaction failed";
	},

	// ADDRESS FORMATTER
	formatAddress(address?: string) {
		if (!address) return "Unknown";
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	},

	// CONFIG EXPORT
	config: {
		contractAddress: ECOPROOF_CONTRACT_ADDRESS,
		contractABI: ECOPROOF_ABI,
	},
};
