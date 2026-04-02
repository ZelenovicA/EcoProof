import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { baseSepolia } from "wagmi/chains";

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

export const supportedChain = baseSepolia;

const rpcUrl = import.meta.env.VITE_RPC_URL || undefined;

export const config = getDefaultConfig({
  appName: "EcoProof",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "ecoproof-demo",
  chains: [supportedChain],
  ssr: false,
  transports: {
    [supportedChain.id]: http(rpcUrl),
  },
});

export const publicClient = createPublicClient({
  chain: supportedChain,
  transport: http(rpcUrl),
});

export const getWalletClient = () => {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet found");
  }

  return createWalletClient({
    chain: supportedChain,
    transport: custom(window.ethereum),
  });
};
