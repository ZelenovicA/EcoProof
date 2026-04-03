import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle, Coins, Lock, MapPin, Power, Shield, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther, hexToString, keccak256, encodePacked, stringToHex, zeroAddress, zeroHash, parseEther } from "viem";
import { baseSepolia } from "wagmi/chains";
import { toast } from "sonner";
import { ECOPROOF_CONTRACT_ADDRESS, ECOPROOF_ABI, IS_CONTRACT_CONFIGURED } from "@/config/contract";
import { contractService } from "@/services/contractService";
import { chainApi, rewardApi, registrationApi, autoGenerateApi, type MerkleTreeDTO, type PendingRegistrationDTO } from "@/services/apiClient";
const isBytes32 = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value);

const decodeSensorType = (value: string) => {
  try {
    const decoded = hexToString(value as `0x${string}`, { size: 32 }).split("\0").join("").trim();
    return decoded || "N/A";
  } catch {
    return "N/A";
  }
};

const formatCoordinate = (scaled: bigint | undefined) => {
  if (scaled === undefined) return "N/A";
  return (Number(scaled) / 1_000_000).toFixed(6);
};

const Admin = () => {
  const { address, isConnected } = useAccount();
  const [merkleRoot, setMerkleRoot] = useState("");
  const [ipfsCID, setIpfsCID] = useState("");
  const [buybackPrice, setBuybackPrice] = useState("");
  const [deviceIdInput, setDeviceIdInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedEpoch, setGeneratedEpoch] = useState<MerkleTreeDTO | null>(null);
  const [pendingRegs, setPendingRegs] = useState<PendingRegistrationDTO[]>([]);
  const [loadingRegs, setLoadingRegs] = useState(false);
  const normalizedDeviceId = useMemo(() => {
    const trimmed = deviceIdInput.trim();
    return isBytes32(trimmed) ? (trimmed as `0x${string}`) : undefined;
  }, [deviceIdInput]);

  // Contract reads with wagmi
  const { data: currentMerkleRoot } = useReadContract({
    address: ECOPROOF_CONTRACT_ADDRESS,
    abi: ECOPROOF_ABI,
    functionName: "currentMerkleRoot",
    query: { enabled: IS_CONTRACT_CONFIGURED },
  });

  const { data: currentBuybackPriceRaw } = useReadContract({
    address: ECOPROOF_CONTRACT_ADDRESS,
    abi: ECOPROOF_ABI,
    functionName: "buybackPricePerToken",
    query: { enabled: IS_CONTRACT_CONFIGURED },
  });

  const { data: hasAdminRole, isLoading: isAdminRoleLoading } = useReadContract({
    address: ECOPROOF_CONTRACT_ADDRESS,
    abi: ECOPROOF_ABI,
    functionName: "hasRole",
    args: address ? [zeroHash, address] : undefined,
    query: { enabled: !!address && IS_CONTRACT_CONFIGURED },
  });

  const { data: selectedDevice } = useReadContract({
    address: ECOPROOF_CONTRACT_ADDRESS,
    abi: ECOPROOF_ABI,
    functionName: "devices",
    args: normalizedDeviceId ? [normalizedDeviceId] : undefined,
    query: { enabled: !!normalizedDeviceId && IS_CONTRACT_CONFIGURED },
  });

  // Contract writes with wagmi
  const { writeContractAsync: setMerkleRootAsync, data: merkleHash, isPending: isMerklePending } = useWriteContract();
  const { isLoading: isMerkleConfirming, isSuccess: isMerkleConfirmed } = useWaitForTransactionReceipt({ hash: merkleHash });

  const { writeContractAsync: setBuybackPriceAsync, data: buybackHash, isPending: isBuybackPending } = useWriteContract();
  const { isLoading: isBuybackConfirming, isSuccess: isBuybackConfirmed } = useWaitForTransactionReceipt({ hash: buybackHash });

  const { writeContractAsync: setDeviceActiveAsync, data: deviceHash, isPending: isDevicePending } = useWriteContract();
  const { isLoading: isDeviceConfirming, isSuccess: isDeviceConfirmed } = useWaitForTransactionReceipt({ hash: deviceHash });

  const { writeContractAsync: writeRegisterDevice, isPending: isRegPending } = useWriteContract();
  const [approvingRegId, setApprovingRegId] = useState<number | null>(null);

  const currentBuybackPrice = currentBuybackPriceRaw ? formatEther(currentBuybackPriceRaw as bigint) : "0";
  const deviceExists = selectedDevice && selectedDevice[0] && selectedDevice[0] !== zeroAddress;
  const selectedOwner = (selectedDevice as any)?.[0];
  const selectedActive = (selectedDevice as any)?.[1];
  const selectedSensorTypeRaw = (selectedDevice as any)?.[3];
  const selectedLatitude = (selectedDevice as any)?.[4];
  const selectedLongitude = (selectedDevice as any)?.[5];
  const isAdmin = !!hasAdminRole;
  const isDeviceActionLoading = isDevicePending || isDeviceConfirming;

  const fetchPendingRegs = useCallback(async () => {
    setLoadingRegs(true);
    try {
      const regs = await registrationApi.list({ status: "pending" });
      setPendingRegs(regs);
    } catch {
      setPendingRegs([]);
    } finally {
      setLoadingRegs(false);
    }
  }, []);

  useEffect(() => {
    if (!isMerkleConfirmed || !generatedEpoch || !ipfsCID || !merkleHash) return;

    Promise.allSettled([
      rewardApi.updateEpochIpfs(generatedEpoch.epoch_id, ipfsCID, merkleHash),
      chainApi.sync(),
    ]);
  }, [generatedEpoch, ipfsCID, isMerkleConfirmed, merkleHash]);

  useEffect(() => {
    if (!isDeviceConfirmed) return;
    chainApi.sync().catch(() => undefined);
  }, [isDeviceConfirmed]);

  // Fetch pending registrations when admin is confirmed
  useEffect(() => {
    if (isAdmin) fetchPendingRegs();
  }, [isAdmin, fetchPendingRegs]);

  const handleApproveRegistration = async (reg: PendingRegistrationDTO) => {
    if (!address || !IS_CONTRACT_CONFIGURED) return;
    setApprovingRegId(reg.id);

    const deviceId = keccak256(encodePacked(["string"], [reg.activation_code])) as `0x${string}`;
    const sensorType = stringToHex("AQ-V2", { size: 32 });
    const scaledLat = BigInt(Math.round(reg.lat * 1_000_000));
    const scaledLng = BigInt(Math.round(reg.lon * 1_000_000));

    try {
      await writeRegisterDevice({
        address: ECOPROOF_CONTRACT_ADDRESS,
        abi: ECOPROOF_ABI,
        functionName: "registerDevice",
        args: [deviceId, reg.wallet_address as `0x${string}`, sensorType, scaledLat, scaledLng],
        account: address,
        chain: baseSepolia,
      });

      await registrationApi.updateStatus(reg.id, "approved");
      await chainApi.sync().catch(() => undefined);
      setPendingRegs((prev) => prev.filter((r) => r.id !== reg.id));
      toast.success(`Sensor registered on-chain for ${reg.wallet_address.slice(0, 6)}...${reg.wallet_address.slice(-4)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to register device");
    } finally {
      setApprovingRegId(null);
    }
  };

  const handleRejectRegistration = async (reg: PendingRegistrationDTO) => {
    try {
      await registrationApi.updateStatus(reg.id, "rejected");
      setPendingRegs((prev) => prev.filter((r) => r.id !== reg.id));
      toast.success("Registration rejected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject");
    }
  };

  // ── Not connected ──
  if (!isConnected) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="eco-card max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl eco-gradient flex items-center justify-center mx-auto">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-serif text-foreground">Admin Access</h1>
          <p className="text-muted-foreground">Connect with an admin wallet to access the management panel.</p>
          <div className="flex justify-center"><ConnectButton /></div>
        </motion.div>
      </div>
    );
  }

  if (IS_CONTRACT_CONFIGURED && address && isAdminRoleLoading) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="eco-card max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl eco-gradient flex items-center justify-center mx-auto">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-serif text-foreground">Checking Admin Access</h1>
          <p className="text-muted-foreground">Verifying the connected wallet against the EcoProof contract.</p>
        </motion.div>
      </div>
    );
  }

  // ── Not admin ──
  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="eco-card max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-destructive" />
          </div>
          <h1 className="text-3xl font-serif text-foreground">Access Denied</h1>
          <p className="text-muted-foreground">
            The connected wallet <code className="text-xs font-mono text-foreground">{address?.slice(0, 6)}...{address?.slice(-4)}</code> does not have admin privileges on the EcoProof contract.
          </p>
          <div className="flex justify-center"><ConnectButton /></div>
        </motion.div>
      </div>
    );
  }

  // Merkle Root
  const handleSetMerkleRoot = async () => {
    if (!merkleRoot || !ipfsCID || !address || !IS_CONTRACT_CONFIGURED) return;
    try {
      await setMerkleRootAsync({
        address: ECOPROOF_CONTRACT_ADDRESS, abi: ECOPROOF_ABI,
        functionName: "setMerkleRoot", args: [merkleRoot as `0x${string}`, ipfsCID],
        account: address, chain: baseSepolia,
      });
      toast.message("Merkle root transaction submitted.");
    } catch (error) { toast.error(contractService.parseError(error)); }
  };

  // Buyback Price
  const handleSetBuybackPrice = async () => {
    if (!buybackPrice || !address || !IS_CONTRACT_CONFIGURED) return;
    try {
      await setBuybackPriceAsync({
        address: ECOPROOF_CONTRACT_ADDRESS, abi: ECOPROOF_ABI,
        functionName: "setBuybackPricePerToken", args: [parseEther(buybackPrice)],
        account: address, chain: baseSepolia,
      });
      toast.message("Buyback price update transaction submitted.");
      setBuybackPrice("");
    } catch (error) { toast.error(contractService.parseError(error)); }
  };

  // Device Toggle

  const handleToggleDevice = async () => {
    if (!normalizedDeviceId) { toast.error("Enter a valid bytes32 device ID."); return; }
    if (!deviceExists) { toast.error("Device is not registered on-chain."); return; }
    if (!address || !IS_CONTRACT_CONFIGURED) return;
    try {
      await setDeviceActiveAsync({
        address: ECOPROOF_CONTRACT_ADDRESS, abi: ECOPROOF_ABI,
        functionName: "setDeviceActive", args: [normalizedDeviceId, !selectedActive],
        account: address, chain: baseSepolia,
      });
      toast.message("Device status transaction submitted.");
    } catch (error) { toast.error(contractService.parseError(error)); }
  };

  const handleGenerateTree = async () => {
    setIsGenerating(true);
    try {
      const result = await autoGenerateApi.seedAndGenerate();
      setGeneratedEpoch(result);
      setMerkleRoot(result.merkle_root);
      setIpfsCID(result.ipfs_cid || "");
      toast.success(
        result.ipfs_cid
          ? `Scores computed, tree generated & pinned. CID: ${result.ipfs_cid.slice(0, 12)}...`
          : "Tree generated. Configure Pinata to auto-pin.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate tree");
    } finally {
      setIsGenerating(false);
    }
  };


  const formattedBuyback = currentBuybackPrice || "0.0001";

  return (
    <div className="min-h-screen pt-16">
      <div className="container py-12 space-y-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl md:text-4xl font-serif text-foreground">Admin Panel</h1>
            <Badge className={isAdmin ? "bg-primary/10 text-primary" : "bg-destructive text-destructive-foreground"}>
              {isAdmin ? "Admin" : "No Admin Role"}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            Connected as <code className="text-xs font-mono text-foreground">{address?.slice(0, 6)}...{address?.slice(-4)}</code>
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Set Merkle Root */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-serif text-lg flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" /> Set Merkle Root
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New Merkle Root</label>
                <Input
                  value={merkleRoot}
                  onChange={(e) => setMerkleRoot(e.target.value)}
                  placeholder="0x..."
                  className="bg-background font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">IPFS CID</label>
                <Input
                  value={ipfsCID}
                  onChange={(e) => setIpfsCID(e.target.value)}
                  placeholder="QmXyz..."
                  className="bg-background font-mono text-sm"
                />
              </div>
              {currentMerkleRoot && (
                <p className="text-xs text-muted-foreground font-mono break-all">
                  Current: {currentMerkleRoot as string}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="w-full" onClick={handleGenerateTree}>
                  {isGenerating ? "Generating..." : "Auto-Generate"}
                </Button>
                <Button
                  className="eco-gradient text-primary-foreground hover:opacity-90 border-0 w-full"
                  onClick={handleSetMerkleRoot}
                  disabled={!isAdmin || !merkleRoot || !ipfsCID || isMerklePending || isMerkleConfirming}
                >
                  {isMerklePending ? "Confirm..." : isMerkleConfirming ? "Confirming..." : isMerkleConfirmed ? "✓ Done" : "Submit On-Chain"}
                </Button>
              </div>
              {generatedEpoch && (
                <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 p-3 rounded-lg">
                  <p><strong>Epoch #{generatedEpoch.epoch_id}</strong> · {generatedEpoch.num_users} users</p>
                  <p>Total: {formatEther(BigInt(generatedEpoch.total_rewards))} ECR</p>
                  <p>{ipfsCID ? <>Pinned to IPFS: <code className="font-mono">{ipfsCID}</code> — submit on-chain.</> : "Uploading to IPFS..."}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Set Buyback Price */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="font-serif text-lg flex items-center gap-2">
                <Coins className="w-4 h-4 text-accent" /> Buyback Price
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Current price: <span className="font-semibold text-foreground">{formattedBuyback} ETH</span> per ECR token
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">New Price (in ETH)</label>
                <Input
                  value={buybackPrice}
                  onChange={(e) => setBuybackPrice(e.target.value)}
                  placeholder="0.0002"
                  type="number"
                  step="0.0001"
                  className="bg-background"
                />
              </div>
              <Button
                className="eco-gradient text-primary-foreground hover:opacity-90 border-0 w-full"
                onClick={handleSetBuybackPrice}
                disabled={!isAdmin || !buybackPrice || isBuybackPending || isBuybackConfirming}
              >
                {isBuybackPending ? "Confirm..." : isBuybackConfirming ? "Confirming..." : isBuybackConfirmed ? "✓ Updated" : "Update Buyback Price"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Device Management */}
        <div className="space-y-4">
          <h2 className="text-2xl font-serif text-foreground flex items-center gap-2">
            <Power className="w-5 h-5 text-primary" /> Device Management
          </h2>

          <Card className="bg-card border-border">
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Device ID (bytes32)</label>
                <Input
                  value={deviceIdInput}
                  onChange={(e) => setDeviceIdInput(e.target.value)}
                  placeholder="0x... (64 hex chars)"
                  className="bg-background font-mono text-sm"
                />
                {deviceIdInput && !normalizedDeviceId && (
                  <p className="text-xs text-muted-foreground">Enter full bytes32 value like <code className="font-mono">0x + 64 hex chars</code>.</p>
                )}
              </div>

              {normalizedDeviceId && (
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="text-xs md:text-sm font-mono text-foreground break-all">{normalizedDeviceId}</code>
                    {deviceExists && (
                      <Badge variant={selectedActive ? "default" : "secondary"} className={selectedActive ? "bg-primary text-primary-foreground" : ""}>
                        {selectedActive ? "Active" : "Inactive"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">Owner: {selectedOwner ?? "-"}</p>
                  <p className="text-sm text-muted-foreground">Sensor Type: {selectedSensorTypeRaw ? decodeSensorType(selectedSensorTypeRaw) : "-"}</p>
                  <p className="text-sm text-muted-foreground">Location: {formatCoordinate(selectedLatitude)}, {formatCoordinate(selectedLongitude)}</p>
                  {!deviceExists && <p className="text-sm text-destructive">This device is not registered on-chain.</p>}
                </div>
              )}

              <Button
                variant={selectedActive ? "destructive" : "outline"}
                onClick={handleToggleDevice}
                disabled={!isAdmin || !deviceExists || isDeviceActionLoading}
                className="w-full sm:w-auto"
              >
                {isDeviceActionLoading ? "Confirming..." : selectedActive ? (
                  <><AlertTriangle className="w-3.5 h-3.5 mr-1" /> Deactivate</>
                ) : (
                  <><Power className="w-3.5 h-3.5 mr-1" /> Activate</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Pending Registrations */}
        <div className="space-y-4">
          <h2 className="text-2xl font-serif text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Pending Sensor Registrations
          </h2>

          {loadingRegs && <p className="text-muted-foreground text-sm">Loading...</p>}

          {!loadingRegs && pendingRegs.length === 0 && (
            <Card className="bg-card border-border">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No pending registration requests.</p>
              </CardContent>
            </Card>
          )}

          {pendingRegs.map((reg) => (
            <Card key={reg.id} className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-amber-500 border-amber-500/30">Pending</Badge>
                      <code className="text-sm font-mono text-foreground">{reg.wallet_address.slice(0, 6)}...{reg.wallet_address.slice(-4)}</code>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Code: <strong>{reg.activation_code}</strong>
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> {reg.lat.toFixed(6)}, {reg.lon.toFixed(6)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted: {new Date(reg.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApproveRegistration(reg)}
                      disabled={approvingRegId === reg.id || isRegPending}
                      className="eco-gradient text-primary-foreground hover:opacity-90 border-0"
                    >
                      {approvingRegId === reg.id ? "Registering..." : <><CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve & Register</>}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleRejectRegistration(reg)}
                      disabled={approvingRegId === reg.id}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Admin;

