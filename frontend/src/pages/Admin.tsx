import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Coins, Power, Upload, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseEther, formatEther } from "viem";
import { ECOPROOF_CONTRACT_ADDRESS, ECOPROOF_ABI } from "@/config/contract";

interface AdminDevice {
  deviceId: string;
  owner: string;
  location: string;
  active: boolean;
  sensorType: string;
}

const MOCK_DEVICES: AdminDevice[] = [
  { deviceId: "0xab12...ef34", owner: "0x1234...5678", location: "Belgrade", active: true, sensorType: "AQ-V2" },
  { deviceId: "0xcd56...gh78", owner: "0x9abc...def0", location: "Niš", active: true, sensorType: "AQ-V2" },
  { deviceId: "0xef90...ij12", owner: "0x5678...1234", location: "Novi Sad", active: false, sensorType: "AQ-V1" },
];

const ADMIN_ADDRESS = "0x0000000000000000000000000000000000000000"; // Replace with actual admin address

const Admin = () => {
  const { address, isConnected } = useAccount();
  const [merkleRoot, setMerkleRoot] = useState("");
  const [ipfsCID, setIpfsCID] = useState("");
  const [buybackPrice, setBuybackPrice] = useState("");
  const [devices, setDevices] = useState(MOCK_DEVICES);

  // Contract reads
  const { data: currentMerkleRoot } = useReadContract({
    address: ECOPROOF_CONTRACT_ADDRESS,
    abi: ECOPROOF_ABI,
    functionName: "currentMerkleRoot",
  });

  const { data: currentBuybackPrice } = useReadContract({
    address: ECOPROOF_CONTRACT_ADDRESS,
    abi: ECOPROOF_ABI,
    functionName: "buybackPricePerToken",
  });

  // Contract writes
  const { writeContract: writeSetMerkle, data: merkleHash, isPending: isMerklePending } = useWriteContract();
  const { isLoading: isMerkleConfirming, isSuccess: isMerkleConfirmed } = useWaitForTransactionReceipt({ hash: merkleHash });

  const { writeContract: writeSetBuyback, data: buybackHash, isPending: isBuybackPending } = useWriteContract();
  const { isLoading: isBuybackConfirming, isSuccess: isBuybackConfirmed } = useWaitForTransactionReceipt({ hash: buybackHash });

  const { writeContract: writeSetDeviceActive, isPending: isDevicePending } = useWriteContract();

  const handleSetMerkleRoot = () => {
    if (!merkleRoot || !ipfsCID) return;
    writeSetMerkle({
      address: ECOPROOF_CONTRACT_ADDRESS,
      abi: ECOPROOF_ABI as any,
      functionName: "setMerkleRoot",
      args: [merkleRoot as `0x${string}`, ipfsCID],
    } as any);
  };

  const handleSetBuybackPrice = () => {
    if (!buybackPrice) return;
    writeSetBuyback({
      address: ECOPROOF_CONTRACT_ADDRESS,
      abi: ECOPROOF_ABI as any,
      functionName: "setBuybackPricePerToken",
      args: [parseEther(buybackPrice)],
    } as any);
  };

  const handleToggleDevice = (deviceId: string, currentActive: boolean) => {
    writeSetDeviceActive({
      address: ECOPROOF_CONTRACT_ADDRESS,
      abi: ECOPROOF_ABI as any,
      functionName: "setDeviceActive",
      args: [deviceId as `0x${string}`, !currentActive],
    } as any);
    setDevices(devices.map(d => d.deviceId === deviceId ? { ...d, active: !d.active } : d));
  };

  const handleAutoGenerate = () => {
    setMerkleRoot("0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));
    setIpfsCID("Qm" + Array.from({ length: 44 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 62)]).join(""));
  };

  // Simple admin check — in production use contract's hasRole
  const isAdmin = isConnected; // For now allow any connected wallet; replace with proper check

  if (!isConnected) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="eco-card max-w-md w-full text-center space-y-6"
        >
          <div className="w-16 h-16 rounded-2xl eco-gradient flex items-center justify-center mx-auto">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-serif text-foreground">Admin Access</h1>
          <p className="text-muted-foreground">
            Connect with an admin wallet to access the management panel.
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </motion.div>
      </div>
    );
  }

  const formattedBuyback = currentBuybackPrice
    ? formatEther(currentBuybackPrice as bigint)
    : "0.0001";

  return (
    <div className="min-h-screen pt-16">
      <div className="container py-12 space-y-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl md:text-4xl font-serif text-foreground">Admin Panel</h1>
            <Badge className="bg-destructive text-destructive-foreground">Admin Only</Badge>
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
                <Button variant="outline" className="w-full" onClick={handleAutoGenerate}>
                  Auto-Generate
                </Button>
                <Button
                  className="eco-gradient text-primary-foreground hover:opacity-90 border-0 w-full"
                  onClick={handleSetMerkleRoot}
                  disabled={!merkleRoot || !ipfsCID || isMerklePending || isMerkleConfirming}
                >
                  {isMerklePending ? "Confirm..." : isMerkleConfirming ? "Confirming..." : isMerkleConfirmed ? "✓ Done" : "Submit On-Chain"}
                </Button>
              </div>
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
                disabled={!buybackPrice || isBuybackPending || isBuybackConfirming}
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
          <div className="grid gap-3">
            {devices.map((device, i) => (
              <motion.div
                key={device.deviceId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="bg-card border-border">
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono text-foreground">{device.deviceId}</code>
                          <Badge variant={device.active ? "default" : "secondary"} className={device.active ? "bg-primary text-primary-foreground" : ""}>
                            {device.active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Owner: {device.owner} · {device.location} · {device.sensorType}
                        </p>
                      </div>
                      <Button
                        variant={device.active ? "destructive" : "outline"}
                        size="sm"
                        onClick={() => handleToggleDevice(device.deviceId, device.active)}
                        disabled={isDevicePending}
                      >
                        {device.active ? (
                          <><AlertTriangle className="w-3.5 h-3.5 mr-1" /> Deactivate</>
                        ) : (
                          <><Power className="w-3.5 h-3.5 mr-1" /> Activate</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;
