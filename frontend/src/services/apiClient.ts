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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${response.status}`);
  }

  return response.json();
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

export const chainApi = {
  status: () => request<ChainStatusDTO>("/chain/status"),
  sync: () =>
    request<ChainSyncResultDTO>("/chain/sync", {
      method: "POST",
    }),
};

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT || "";

export const pinataApi = {
  upload: async (json: Record<string, unknown>, name?: string): Promise<string> => {
    if (!PINATA_JWT) throw new Error("VITE_PINATA_JWT not configured");

    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: json,
        pinataMetadata: { name: name || "ecoproof_epoch.json" },
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error?.details || `Pinata error ${response.status}`);
    }

    const data = await response.json();
    return data.IpfsHash as string;
  },
};

export interface UserScoreDTO {
  id: number;
  wallet_address: string;
  score: number;
  cumulative_amount: string;
  updated_at: string | null;
}

export const scoreApi = {
  get: (walletAddress: string) => request<UserScoreDTO>(`/scores/${walletAddress}`),
  list: () => request<UserScoreDTO[]>("/scores/"),
};

export interface ValidationDTO {
  id: number;
  sensor_id: number;
  timestamp_hour: string;
  cluster_id: number;
  avg_pm25: number;
  avg_pm10: number | null;
  variance_pm25: number;
  total_readings: number;
  valid_readings: number;
}

export const validationApi = {
  get: (sensorId: number, hours?: number) =>
    request<ValidationDTO[]>(withQuery(`/validations/${sensorId}`, { hours })),
};

export const weeklyRewardApi = {
  get: (sensorId: number) => request<any>(`/api/sensors/${sensorId}/weekly-reward`),
};

export interface PendingRegistrationDTO {
  id: number;
  activation_code: string;
  wallet_address: string;
  lat: number;
  lon: number;
  status: "pending" | "approved" | "rejected";
  order_id: number | null;
  created_at: string;
  updated_at: string;
}
export const registrationApi = {
  create: (data: { activation_code: string; wallet_address: string; lat: number; lon: number }) =>
    request<PendingRegistrationDTO>("/registrations/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  list: (params?: { status?: string; wallet_address?: string }) =>
    request<PendingRegistrationDTO[]>(withQuery("/registrations/", params)),
  updateStatus: (id: number, status: string) =>
    request<PendingRegistrationDTO>(`/registrations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};