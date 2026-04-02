import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, sepolia } from "wagmi/chains";
import { createPublicClient, createWalletClient, http } from "viem";

export const config = getDefaultConfig({
  appName: "EcoProof",
  projectId: "ecoproof-demo",
  chains: [sepolia, base],
  ssr: false,
});

// Create public and wallet clients for direct contract calls
const rpcUrl = "";

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl || undefined),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

export const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(rpcUrl || undefined),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;
