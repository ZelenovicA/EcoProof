export const contractService = {

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
};
