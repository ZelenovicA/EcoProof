import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, optimism } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "EcoProof",
  projectId: "ecoproof-demo", // Replace with real WalletConnect project ID for production
  chains: [base, optimism],
  ssr: false,
});
