import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi, MapPin, Coins, Edit, CheckCircle, AlertCircle,
  Package, Truck, Sparkles, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther, parseEther, keccak256, encodePacked } from "viem";
import { ECOPROOF_CONTRACT_ADDRESS, ECOPROOF_ABI } from "@/config/contract";
import LocationPicker from "@/components/LocationPicker";

interface LocalSensor {
  id: string;
  deviceId: string;
  lat: string;
  lng: string;
  active: boolean;
  registeredAt: string;
  sensorType: string;
}

type OrderStatus = "none" | "shipping" | "arrived";
type AdditionalOrderStatus = "none" | "ordering" | "shipping" | "arrived";

const UserDashboard = () => {
  const { address, isConnected } = useAccount();
  const [sensors, setSensors] = useState<LocalSensor[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newLat, setNewLat] = useState("");
  const [newLng, setNewLng] = useState("");

  // Registration
  const [activationCode, setActivationCode] = useState("");
  const [regLat, setRegLat] = useState("");
  const [regLng, setRegLng] = useState("");

  // Purchase
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("none");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingCountry, setShippingCountry] = useState("");
  const [shippingZip, setShippingZip] = useState("");
  const [additionalOrderStatus, setAdditionalOrderStatus] = useState<AdditionalOrderStatus>("none");
  const [showBuyAnother, setShowBuyAnother] = useState(false);
  // Claim
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [isLoadingProof, setIsLoadingProof] = useState(false);

  // Contract reads
  const { data: tokenBalance } = useReadContract({
    address: ECOPROOF_CONTRACT_ADDRESS,
    abi: ECOPROOF_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: totalClaimedData } = useReadContract({
    address: ECOPROOF_CONTRACT_ADDRESS,
    abi: ECOPROOF_ABI,
    functionName: "totalClaimed",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  // Contract writes
  const { writeContract: writeClaim, data: claimHash, isPending: isClaiming } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimConfirmed } = useWaitForTransactionReceipt({ hash: claimHash });

  const { writeContract: writeUpdateMetadata, isPending: isUpdating } = useWriteContract();
  const { writeContract: writeSellTokens, data: sellHash, isPending: isSelling } = useWriteContract();
  const { isLoading: isSellConfirming, isSuccess: isSellConfirmed } = useWaitForTransactionReceipt({ hash: sellHash });

  const formattedBalance = tokenBalance ? formatEther(tokenBalance as bigint) : "0.00";
  const formattedClaimed = totalClaimedData ? formatEther(totalClaimedData as bigint) : "0.00";

  const handlePurchase = () => {
    if (!shippingAddress || !shippingCity || !shippingCountry || !shippingZip) return;
    // In production, this sends ETH to the contract
    setOrderStatus("shipping");
  };

  const handleConfirmArrived = () => {
    setOrderStatus("arrived");
  };

  const handleRegister = () => {
    if (activationCode.length !== 6 || !regLat || !regLng) return;
    // In production, this would call the contract's registerDevice via the admin backend
    const deviceId = keccak256(encodePacked(["string"], [activationCode]));
    const newSensor: LocalSensor = {
      id: String(sensors.length + 1),
      deviceId: `${deviceId.slice(0, 8)}...${deviceId.slice(-6)}`,
      lat: regLat,
      lng: regLng,
      active: true,
      registeredAt: new Date().toISOString().split("T")[0],
      sensorType: "AQ-V2",
    };
    setSensors([...sensors, newSensor]);
    setActivationCode("");
    setRegLat("");
    setRegLng("");
    setOrderStatus("none");
  };

  const handleUpdateLocation = (id: string, deviceIdFull: string) => {
    // Call updateMetadata on-chain with new lat/lng as metadataURI
    const metadataURI = JSON.stringify({ lat: newLat, lng: newLng });
    writeUpdateMetadata({
      address: ECOPROOF_CONTRACT_ADDRESS,
      abi: ECOPROOF_ABI as any,
      functionName: "updateMetadata",
      args: [deviceIdFull as `0x${string}`, metadataURI],
    } as any);
    setSensors(sensors.map(s => s.id === id ? { ...s, lat: newLat, lng: newLng } : s));
    setEditingId(null);
    setNewLat("");
    setNewLng("");
  };

  const handleClaim = async () => {
    if (!address) return;
    setIsLoadingProof(true);
    try {
      // In production, this fetches from the rewards API/IPFS
      // which returns the user's cumulative amount and merkle proof
      // Simulated: auto-generate proof data for this user
      await new Promise(r => setTimeout(r, 1500)); // simulate API call
      const simulatedAmount = "250"; // fetched from rewards distribution
      const simulatedProof: `0x${string}`[] = [
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      ];

      writeClaim({
        address: ECOPROOF_CONTRACT_ADDRESS,
        abi: ECOPROOF_ABI as any,
        functionName: "claim",
        args: [parseEther(simulatedAmount), simulatedProof],
      } as any);
    } finally {
      setIsLoadingProof(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="eco-card max-w-md w-full text-center space-y-6"
        >
          <div className="w-16 h-16 rounded-2xl eco-gradient flex items-center justify-center mx-auto">
            <Wifi className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-serif text-foreground">Connect Your Wallet</h1>
          <p className="text-muted-foreground">
            Sign in with your wallet to manage sensors, view your token balance, and claim rewards.
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </motion.div>
      </div>
    );
  }

  const hasSensors = sensors.length > 0;

  return (
    <div className="min-h-screen pt-16">
      <div className="container py-12 space-y-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-serif text-foreground">My Sensors</h1>
          <p className="text-muted-foreground mt-1">
            Connected as <code className="text-xs font-mono text-foreground">{address?.slice(0, 6)}...{address?.slice(-4)}</code>
          </p>
        </motion.div>

        {/* === No sensors: Buy a sensor pitch === */}
        {!hasSensors && orderStatus === "none" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="bg-card border-border overflow-hidden">
              <div className="grid md:grid-cols-2">
                <div className="p-8 md:p-10 space-y-5 flex flex-col justify-center">
                  <div className="inline-flex items-center gap-2 text-sm text-primary font-medium">
                    <Package className="w-4 h-4" />
                    Get Your First Sensor
                  </div>
                  <h2 className="text-2xl md:text-3xl font-serif text-foreground">
                    Start Earning With Clean Air Data
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Our AQ-V2 sensors measure real-time air quality and send data on-chain.
                    Deploy one anywhere with WiFi, and earn ECR tokens for every verified reading.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary" /> Compact & plug-and-play</li>
                    <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary" /> On-chain verified readings</li>
                    <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary" /> Earn ECR rewards daily</li>
                  </ul>
                  <div className="pt-2">
                    <p className="text-2xl font-serif text-foreground">0.05 ETH</p>
                    <p className="text-xs text-muted-foreground">Free worldwide shipping</p>
                  </div>
                </div>
                <div className="p-8 md:p-10 bg-muted/30 space-y-4 flex flex-col justify-center">
                  <h3 className="text-lg font-serif text-foreground">Shipping Address</h3>
                  <div className="space-y-3">
                    <Input
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="Street address"
                      className="bg-background"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        value={shippingCity}
                        onChange={(e) => setShippingCity(e.target.value)}
                        placeholder="City"
                        className="bg-background"
                      />
                      <Input
                        value={shippingZip}
                        onChange={(e) => setShippingZip(e.target.value)}
                        placeholder="ZIP / Postal code"
                        className="bg-background"
                      />
                    </div>
                    <Input
                      value={shippingCountry}
                      onChange={(e) => setShippingCountry(e.target.value)}
                      placeholder="Country"
                      className="bg-background"
                    />
                  </div>
                  <Button
                    onClick={handlePurchase}
                    disabled={!shippingAddress || !shippingCity || !shippingCountry || !shippingZip}
                    className="w-full eco-gradient text-primary-foreground hover:opacity-90 border-0 text-base py-6"
                  >
                    Pay 0.05 ETH & Order <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    You'll receive a 6-digit activation code and set your sensor location when it arrives.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* === Awaiting delivery === */}
        {!hasSensors && orderStatus !== "none" && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center space-y-4">
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"
                >
                  <Truck className="w-7 h-7 text-primary" />
                </motion.div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={orderStatus}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4 }}
                    className="space-y-4"
                  >
                    <h2 className="text-2xl font-serif text-foreground">
                      {orderStatus === "shipping" ? "Your Sensor Is On Its Way!" : "Sensor Arrived!"}
                    </h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      {orderStatus === "shipping"
                        ? "We're preparing your AQ-V2 sensor for shipment. You'll receive a tracking number soon."
                        : "Your sensor has arrived! Enter the 6-digit activation code from the packaging below to register it."
                      }
                    </p>

                    {orderStatus === "shipping" && (
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-center gap-3">
                          <div className="flex gap-1">
                            {[0, 1, 2].map((i) => (
                              <motion.div
                                key={i}
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }}
                                className="w-2 h-2 rounded-full bg-primary"
                              />
                            ))}
                          </div>
                          <span className="text-sm text-muted-foreground">Shipping in progress</span>
                        </div>
                        <Button
                          onClick={handleConfirmArrived}
                          variant="outline"
                          className="mx-auto"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" /> I Received My Sensor
                        </Button>
                      </div>
                    )}

                    {orderStatus === "arrived" && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="max-w-lg mx-auto space-y-4 pt-4"
                      >
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Activation Code</label>
                          <Input value={activationCode} onChange={(e) => setActivationCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code from packaging" maxLength={6} className="bg-background" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-foreground">Sensor Deployment Location</label>
                          <LocationPicker lat={regLat} lng={regLng} onLatChange={setRegLat} onLngChange={setRegLng} />
                        </div>
                        <Button
                          onClick={handleRegister}
                          disabled={activationCode.length !== 6 || !regLat || !regLng}
                          className="w-full eco-gradient text-primary-foreground hover:opacity-90 border-0"
                        >
                          Register Sensor
                        </Button>
                      </motion.div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* === Has sensors: Stats + sensor list === */}
        {hasSensors && (
          <>
            {/* Stats */}
            <div className="grid sm:grid-cols-3 gap-4">
              <Card className="bg-card border-border">
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl eco-gradient flex items-center justify-center flex-shrink-0">
                    <Wifi className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Sensors</p>
                    <p className="text-2xl font-serif text-foreground">{sensors.filter(s => s.active).length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <Coins className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">ECR Balance</p>
                    <p className="text-2xl font-serif text-foreground">
                      {Number(formattedBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </CardContent>
              </Card>
              {/* Claimable — clickable card */}
              <Card
                className="bg-card border-border cursor-pointer group hover:border-primary/40 transition-colors"
                onClick={() => setShowClaimModal(true)}
              >
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Claimed</p>
                    <p className="text-2xl font-serif text-foreground">
                      {Number(formattedClaimed).toLocaleString(undefined, { maximumFractionDigits: 2 })} ECR
                    </p>
                    <p className="text-xs text-primary font-medium mt-0.5">Click to claim →</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Claim rewards modal */}
            <AnimatePresence>
              {showClaimModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
                  onClick={() => !isClaiming && !isClaimConfirming && setShowClaimModal(false)}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="eco-card max-w-sm w-full text-center space-y-5"
                  >
                    {!isClaimConfirmed ? (
                      <>
                        <motion.div
                          animate={{ rotate: [0, 10, -10, 0] }}
                          transition={{ repeat: Infinity, duration: 3 }}
                          className="w-16 h-16 rounded-2xl eco-gradient flex items-center justify-center mx-auto"
                        >
                          <Sparkles className="w-7 h-7 text-primary-foreground" />
                        </motion.div>
                        <h3 className="text-2xl font-serif text-foreground">Claim Your Rewards</h3>
                        <p className="text-muted-foreground text-sm">
                          Your reward amount and proof will be fetched automatically from the latest distribution.
                        </p>
                        <div className="eco-card bg-muted/30 text-left space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Available to claim</span>
                            <span className="font-medium text-foreground">250 ECR</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Already claimed</span>
                            <span className="font-medium text-foreground">{Number(formattedClaimed).toLocaleString(undefined, { maximumFractionDigits: 2 })} ECR</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Proof status</span>
                            <span className="text-primary font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Verified</span>
                          </div>
                        </div>
                        <Button
                          onClick={handleClaim}
                          disabled={isLoadingProof || isClaiming || isClaimConfirming}
                          className="w-full eco-gradient text-primary-foreground hover:opacity-90 border-0"
                        >
                          {isLoadingProof ? "Fetching proof..." : isClaiming ? "Confirm in wallet..." : isClaimConfirming ? "Confirming..." : (
                            <><Sparkles className="w-4 h-4 mr-2" /> Claim Rewards</>
                          )}
                        </Button>
                        <button
                          onClick={() => setShowClaimModal(false)}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Maybe later
                        </button>
                      </>
                    ) : (
                      <>
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: [0, 1.2, 1] }}
                          transition={{ duration: 0.5 }}
                          className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"
                        >
                          <CheckCircle className="w-8 h-8 text-primary" />
                        </motion.div>
                        <h3 className="text-2xl font-serif text-foreground">Claimed!</h3>
                        <p className="text-muted-foreground">ECR tokens have been minted to your wallet.</p>
                        <Button variant="outline" onClick={() => setShowClaimModal(false)}>Close</Button>
                      </>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Sensor list — shown first */}
            <div className="space-y-4">
              <h2 className="text-2xl font-serif text-foreground">Your Sensors</h2>
              <div className="grid gap-4">
                {sensors.map((sensor, i) => (
                  <motion.div
                    key={sensor.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Card className="bg-card border-border">
                      <CardContent className="pt-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <code className="text-sm text-foreground font-mono">{sensor.deviceId}</code>
                              <Badge variant={sensor.active ? "default" : "secondary"} className={sensor.active ? "bg-primary text-primary-foreground" : ""}>
                                {sensor.active ? <><CheckCircle className="w-3 h-3 mr-1" /> Active</> : <><AlertCircle className="w-3 h-3 mr-1" /> Inactive</>}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="w-3.5 h-3.5" />
                              {editingId === sensor.id ? (
                                <div className="flex items-center gap-2">
                                  <Input value={newLat} onChange={(e) => setNewLat(e.target.value)} placeholder="Lat" type="number" step="any" className="h-7 w-24 text-sm bg-background" />
                                  <Input value={newLng} onChange={(e) => setNewLng(e.target.value)} placeholder="Lng" type="number" step="any" className="h-7 w-24 text-sm bg-background" />
                                  <Button size="sm" variant="outline" onClick={() => handleUpdateLocation(sensor.id, sensor.deviceId)} disabled={isUpdating}>
                                    {isUpdating ? "..." : "Save"}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                                </div>
                              ) : (
                                <span>{sensor.lat}, {sensor.lng}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">Type: {sensor.sensorType} · Registered: {sensor.registeredAt}</p>
                          </div>
                          {editingId !== sensor.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setEditingId(sensor.id); setNewLat(sensor.lat); setNewLng(sensor.lng); }}
                            >
                              <Edit className="w-3.5 h-3.5 mr-1" /> Update Location
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Buy another sensor */}
            {additionalOrderStatus === "none" && (
              <Card className="bg-card border-border">
                <CardContent className="py-8">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-lg font-serif text-foreground">Buy Another Sensor</h3>
                        <p className="text-sm text-muted-foreground">
                          Expand your network and earn more ECR rewards. <span className="text-foreground font-medium">0.05 ETH</span> with free shipping.
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => setAdditionalOrderStatus("ordering")}
                      className="eco-gradient text-primary-foreground hover:opacity-90 border-0 flex-shrink-0"
                    >
                      <Package className="w-4 h-4 mr-2" /> Order Sensor
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Buy another — shipping form */}
            <AnimatePresence>
              {additionalOrderStatus === "ordering" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-serif text-xl">Shipping Details</CardTitle>
                        <button onClick={() => setAdditionalOrderStatus("none")} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <Input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="Street address" className="bg-background" />
                        <Input value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} placeholder="City" className="bg-background" />
                        <Input value={shippingZip} onChange={(e) => setShippingZip(e.target.value)} placeholder="ZIP / Postal code" className="bg-background" />
                        <Input value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)} placeholder="Country" className="bg-background" />
                      </div>
                      <Button
                        onClick={() => { handlePurchase(); setAdditionalOrderStatus("shipping"); }}
                        disabled={!shippingAddress || !shippingCity || !shippingCountry || !shippingZip}
                        className="eco-gradient text-primary-foreground hover:opacity-90 border-0"
                      >
                        Pay 0.05 ETH & Order <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Buy another — awaiting delivery */}
            {additionalOrderStatus === "shipping" && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="bg-card border-border">
                  <CardContent className="py-10 text-center space-y-4">
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"
                    >
                      <Truck className="w-6 h-6 text-primary" />
                    </motion.div>
                    <h3 className="text-xl font-serif text-foreground">Your New Sensor Is On Its Way!</h3>
                    <p className="text-muted-foreground text-sm max-w-md mx-auto">
                      We're preparing your AQ-V2 sensor for shipment. You'll receive a tracking number soon.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }}
                            className="w-2 h-2 rounded-full bg-primary"
                          />
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground">Shipping in progress</span>
                    </div>
                    <Button
                      onClick={() => setAdditionalOrderStatus("arrived")}
                      variant="outline"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" /> I Received My Sensor
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Register sensor — shown after arrival (initial or additional) */}
            {(additionalOrderStatus === "arrived" || additionalOrderStatus === "none") && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="font-serif text-xl">Register a New Sensor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">6-Digit Activation Code</label>
                    <Input value={activationCode} onChange={(e) => setActivationCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="e.g. 482901" maxLength={6} className="bg-background" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Deployment Location</label>
                    <LocationPicker lat={regLat} lng={regLng} onLatChange={setRegLat} onLngChange={setRegLng} />
                  </div>
                  <Button
                    onClick={() => { handleRegister(); setAdditionalOrderStatus("none"); }}
                    disabled={activationCode.length !== 6 || !regLat || !regLng}
                    className="eco-gradient text-primary-foreground hover:opacity-90 border-0"
                  >
                    Register Sensor
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;
