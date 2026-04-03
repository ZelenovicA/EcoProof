const configuredApiBase = (import.meta.env.VITE_API_URL || "").trim();
const API_BASE =
  configuredApiBase && !configuredApiBase.endsWith(":3000")
    ? configuredApiBase
    : "http://localhost:8000";

function withQuery(path: string, params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return path;

  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function request<T>(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const timeoutMs = (options as any)?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { timeoutMs: _, ...fetchOptions } = (options ?? {}) as any;
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...fetchOptions?.headers },
      ...fetchOptions,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `API error ${response.status}`);
    }
    return response.json();
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out – the server is still processing. Try again in a moment.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export interface SensorDTO {
  id: number;
  device_id: string;
  device_id_hash: string | null;
  activation_code: string | null;
  owner_address: string;
  lat: number;
  lon: number;
  sensor_type: string;
  active: boolean;
  registered_at: string;
}

export const sensorApi = {
  list: (ownerAddress?: string) =>
    request<SensorDTO[]>(withQuery("/sensors/", { owner_address: ownerAddress })),

  get: (id: number) => request<SensorDTO>(`/sensors/${id}`),

  register: (data: {
    device_id: string;
    activation_code?: string;
    lat: number;
    lon: number;
    owner_address: string;
    sensor_type?: string;
    device_id_hash?: string;
    active?: boolean;
  }) =>
    request<SensorDTO>("/sensors/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (
    id: number,
    data: {
      lat?: number;
      lon?: number;
      active?: boolean;
      device_id_hash?: string;
      activation_code?: string;
      sensor_type?: string;
    },
  ) =>
    request<SensorDTO>(`/sensors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export interface OrderDTO {
  id: number;
  buyer_address: string;
  status: "pending" | "shipping" | "arrived" | "cancelled";
  tx_hash: string | null;
  amount_eth: string | null;
  shipping_street: string | null;
  shipping_city: string | null;
  shipping_zip: string | null;
  shipping_country: string | null;
  activation_code: string | null;
  created_at: string;
  updated_at: string;
}

export const orderApi = {
  list: (buyerAddress?: string) =>
    request<OrderDTO[]>(withQuery("/orders/", { buyer_address: buyerAddress })),

  get: (id: number) => request<OrderDTO>(`/orders/${id}`),

  create: (data: {
    buyer_address: string;
    shipping_street: string;
    shipping_city: string;
    shipping_zip: string;
    shipping_country: string;
    tx_hash?: string;
    amount_eth?: string;
  }) =>
    request<OrderDTO>("/orders/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateStatus: (id: number, data: { status: string; activation_code?: string }) =>
    request<OrderDTO>(`/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export interface SubscriptionDTO {
  id: number;
  wallet_address: string;
  plan: "starter" | "business" | "enterprise";
  api_key: string;
  tx_hash: string | null;
  subscribed_at: string;
  expires_at: string;
  status: "active" | "expired" | "cancelled";
}

export const subscriptionApi = {
  list: (walletAddress?: string) =>
    request<SubscriptionDTO[]>(withQuery("/subscriptions/", { wallet_address: walletAddress })),

  get: (id: number) => request<SubscriptionDTO>(`/subscriptions/${id}`),

  create: (data: { wallet_address: string; plan: string; tx_hash?: string }) =>
    request<SubscriptionDTO>("/subscriptions/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: number, data: { plan?: string; status?: string; tx_hash?: string }) =>
    request<SubscriptionDTO>(`/subscriptions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export interface UserRewardDTO {
  wallet_address: string;
  cumulative_amount: string;
  proof: string[];
  merkle_root: string;
  already_claimed: boolean;
}

export interface ChainStatusDTO {
  enabled: boolean;
  configured: boolean;
  configuration_issue: string | null;
  contract_address: string | null;
  rpc_configured: boolean;
  poll_interval_seconds: number;
  running: boolean;
  last_synced_block: number | null;
  last_synced_at: string | null;
}

export interface ChainSyncResultDTO {
  configured: boolean;
  reason?: string | null;
  synced: boolean;
  from_block: number | null;
  to_block: number | null;
  events: Record<string, number>;
}

export interface MerkleTreeDTO {
  epoch_id: number;
  merkle_root: string;
  ipfs_json: Record<string, unknown>;
  total_rewards: string;
  num_users: number;
  ipfs_cid: string | null;
}

export const rewardApi = {
  getUserReward: (walletAddress: string) => request<UserRewardDTO>(`/rewards/${walletAddress}`),

  generateTree: (options?: { pinToIpfs?: boolean }) =>
    request<MerkleTreeDTO>(withQuery("/rewards/generate-tree", { pin_to_ipfs: options?.pinToIpfs }), {
      method: "POST",
    }),

  updateEpochIpfs: (epochId: number, ipfsCid: string, txHash?: string) =>
    request<{ status: string }>(
      withQuery(`/rewards/epochs/${epochId}/ipfs`, {
        ipfs_cid: ipfsCid,
        tx_hash: txHash,
      }),
      { method: "PATCH" },
    ),
};

export interface UserScoreDTO {
  wallet_address: string;
  cumulative_amount: string;
  score: number;
}
export const scoreApi = {
  get: (walletAddress: string) => request<UserScoreDTO>(`/scores/${walletAddress}`),
};

export const chainApi = {
  status: () => request<ChainStatusDTO>("/chain/status"),
  sync: () =>
    request<ChainSyncResultDTO>("/chain/sync", {
      method: "POST",
    }),
};

export const autoGenerateApi = {
  seedAndGenerate: () =>
    request<MerkleTreeDTO>("/rewards/auto-generate", {
      method: "POST",
      timeoutMs: 120_000,
    } as any),
};

export interface PendingRegistrationDTO {
  id: number;
  activation_code: string;
  wallet_address: string;
  status: "pending" | "approved" | "rejected";
  lat: number | null;
  lon: number | null;
  created_at: string;
}
export const registrationApi = {
  list: (params?: { wallet_address?: string; status?: string }) =>
    request<PendingRegistrationDTO[]>(withQuery("/registrations/", params)),
  create: (data: { activation_code: string; wallet_address: string; lat?: number; lon?: number }) =>
    request<PendingRegistrationDTO>("/registrations/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateStatus: (id: number, status: string) =>
    request<PendingRegistrationDTO>(`/registrations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};