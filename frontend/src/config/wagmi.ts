import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { baseSepolia } from "wagmi/chains";

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

