import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi, MapPin, Coins, Edit, CheckCircle, AlertCircle,
  Package, Truck, Sparkles, ArrowRight, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAccount, useReadContract, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther, parseEther, zeroHash } from "viem";
import { baseSepolia } from "wagmi/chains";
import { toast } from "sonner";
import { ECOPROOF_CONTRACT_ADDRESS, ECOPROOF_ABI, IS_CONTRACT_CONFIGURED } from "@/config/contract";
import LocationPicker from "@/components/LocationPicker";
import {
  chainApi,
  sensorApi,
  orderApi,
  rewardApi,
  scoreApi,
  registrationApi,
  type OrderDTO,
  type SensorDTO,
  type UserRewardDTO,
  type UserScoreDTO,
  type PendingRegistrationDTO,
} from "@/services/apiClient";


type OrderStatus = "none" | "pending" | "shipping" | "arrived";
type AdditionalOrderStatus = "none" | "ordering" | "shipping" | "arrived";

const toScaledCoordinate = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return BigInt(Math.round(parsed * 1_000_000));
};

const shortDeviceId = (deviceId: string) => `${deviceId.slice(0, 10)}...${deviceId.slice(-8)}`;

const toErrorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Transaction failed";

const sensorMatchesDeviceId = (sensor: SensorDTO, deviceId: string) =>
  sensor.device_id.toLowerCase() === deviceId || sensor.device_id_hash?.toLowerCase() === deviceId;

const coordinatesMatch = (sensor: Pick<SensorDTO, "lat" | "lon">, lat: number, lon: number) =>
  Math.abs(sensor.lat - lat) < 0.000001 && Math.abs(sensor.lon - lon) < 0.000001;

const UserDashboard = () => {
  const { address, isConnected } = useAccount();
  // Data from API
  const [sensors, setSensors] = useState<SensorDTO[]>([]);
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [pendingRegs, setPendingRegs] = useState<PendingRegistrationDTO[]>([]);
  const [userScore, setUserScore] = useState<UserScoreDTO | null>(null);
  const [loadingSensors, setLoadingSensors] = useState(false);

  // UI state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newLat, setNewLat] = useState("");
  const [newLng, setNewLng] = useState("");
  const [pendingLocationUpdate, setPendingLocationUpdate] = useState<{
    id: number;
    lat: string;
    lng: string;
  } | null>(null);

  // Registration
  const [activationCode, setActivationCode] = useState("");
  const [regLat, setRegLat] = useState("");
  const [regLng, setRegLng] = useState("");

  // Purchase
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingCountry, setShippingCountry] = useState("");
  const [shippingZip, setShippingZip] = useState("");
  const [additionalOrderStatus, setAdditionalOrderStatus] = useState<AdditionalOrderStatus>("none");
  // Claim
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [isLoadingProof, setIsLoadingProof] = useState(false);
  const [rewardData, setRewardData] = useState<UserRewardDTO | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

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

  const { data: canRegisterDevice } = useReadContract({
    address: ECOPROOF_CONTRACT_ADDRESS,
    abi: ECOPROOF_ABI,
    functionName: "hasRole",
    args: address ? [zeroHash, address] : undefined,
    query: { enabled: false }, // kept for potential future use
  });

  // Contract writes
  const { sendTransactionAsync, isPending: isPurchasePending } = useSendTransaction();
  const { writeContractAsync: writeClaim, data: claimHash, isPending: isClaiming } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimConfirmed } = useWaitForTransactionReceipt({ hash: claimHash });




  const { writeContractAsync: writeUpdateMetadata, data: updateMetadataHash, isPending: isUpdating } = useWriteContract();
  const { isLoading: isUpdateConfirming, isSuccess: isUpdateConfirmed } = useWaitForTransactionReceipt({ hash: updateMetadataHash });

  const formattedBalance = tokenBalance ? formatEther(tokenBalance as bigint) : "0.00";
  const formattedClaimed = totalClaimedData ? formatEther(totalClaimedData as bigint) : "0.00";
  const isPurchaseBusy = isPurchasePending || isSubmittingOrder;

  // ── Fetch sensors & orders from API ──
  const fetchData = useCallback(async () => {
    if (!address) return;
    setLoadingSensors(true);
    try {
      const [sensorData, orderData, regData] = await Promise.all([
        sensorApi.list(address).catch(() => [] as SensorDTO[]),
        orderApi.list(address).catch(() => [] as OrderDTO[]),
        registrationApi.list({ wallet_address: address, status: "pending" }).catch(() => [] as PendingRegistrationDTO[]),
      ]);
      setSensors(sensorData);
      setOrders(orderData);
      setPendingRegs(regData);
      // Fetch score separately (may 404 for new users)
      scoreApi.get(address).then(setUserScore).catch(() => setUserScore(null));
    } finally {
      setLoadingSensors(false);
    }
  }, [address]);

  const syncChainState = useCallback(async () => {
    try {
      return await chainApi.sync();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derive order status from API data
  const latestOrder = orders.find(o => o.status !== "cancelled");
  const orderStatus = !latestOrder ? "none" : latestOrder.status === "arrived" ? "arrived" : latestOrder.status === "shipping" ? "shipping" : "pending";

  const handlePurchase = async () => {
    if (!shippingAddress || !shippingCity || !shippingCountry || !shippingZip || !address) return false;
    if (!IS_CONTRACT_CONFIGURED) {
      toast.error("Contract address is not configured.");
      return false;
    }

    setIsSubmittingOrder(true);
    try {
      const txHash = await sendTransactionAsync({
        to: ECOPROOF_CONTRACT_ADDRESS,
        value: parseEther("0.00005"),
        chain: baseSepolia,
      });

      const newOrder = await orderApi.create({
        buyer_address: address,
        shipping_street: shippingAddress,
        shipping_city: shippingCity,
        shipping_zip: shippingZip,
        shipping_country: shippingCountry,
        tx_hash: txHash,
        amount_eth: "0.00005",
      });
      setOrders((prev) => [newOrder, ...prev.filter((order) => order.id !== newOrder.id)]);
      toast.success("Payment sent and order saved.");
      return true;
    } catch (error) {
      toast.error(toErrorMessage(error));
      return false;
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const [isSubmittingReg, setIsSubmittingReg] = useState(false);

  const handleRegister = async () => {
    if (!address) return;
    if (activationCode.length !== 6 || !regLat || !regLng) return;

    setIsSubmittingReg(true);
    try {
      const reg = await registrationApi.create({
        activation_code: activationCode,
        wallet_address: address,
        lat: Number(regLat),
        lon: Number(regLng),
      });
      setPendingRegs((prev) => [reg, ...prev]);
      setActivationCode("");
      setRegLat("");
      setRegLng("");
      toast.success("Registration submitted! Waiting for admin approval.");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsSubmittingReg(false);
    }
  };

  const handleUpdateLocation = async (id: number) => {
    if (!IS_CONTRACT_CONFIGURED || !address) {
      toast.error("Contract address is not configured.");
      return;
    }

    const target = sensors.find((sensor) => sensor.id === id);
    if (!target || !target.device_id_hash) return;

    const scaledLat = toScaledCoordinate(newLat);
    const scaledLng = toScaledCoordinate(newLng);
    if (scaledLat === null || scaledLng === null) {
      toast.error("Invalid coordinates.");
      return;
    }

    try {
      setPendingLocationUpdate({ id, lat: newLat, lng: newLng });
      await writeUpdateMetadata({
        address: ECOPROOF_CONTRACT_ADDRESS,
        abi: ECOPROOF_ABI,
        functionName: "updateMetadata",
        args: [target.device_id_hash as `0x${string}`, scaledLat, scaledLng],
        account: address,
        chain: baseSepolia,
      });
      toast.message("Update location transaction submitted.");
    } catch (error) {
      setPendingLocationUpdate(null);
      toast.error(toErrorMessage(error));
    }
  };

  const handleConfirmArrived = async () => {
    if (!latestOrder) return;

    try {
      const updatedOrder = await orderApi.updateStatus(latestOrder.id, { status: "arrived" });
      setOrders((prev) => prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
      toast.success("Order marked as arrived.");
    } catch (error) {
      toast.error(toErrorMessage(error));
    }
  };

  const handleClaim = async () => {
    if (!address) return;
    if (!IS_CONTRACT_CONFIGURED) {
      toast.error("Contract address is not configured.");
      return;
    }

    setIsLoadingProof(true);
    try {
      const reward = await rewardApi.getUserReward(address);
      setRewardData(reward);

      if (reward.already_claimed) {
        toast.info("Rewards already claimed for this epoch.");
        return;
      }

      const proofHashes = reward.proof.map(p => p as `0x${string}`);
      await writeClaim({
        address: ECOPROOF_CONTRACT_ADDRESS,
        abi: ECOPROOF_ABI,
        functionName: "claim",
        args: [BigInt(reward.cumulative_amount), proofHashes],
        account: address,
        chain: baseSepolia,
      });
      toast.message("Claim transaction submitted.");
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsLoadingProof(false);
    }
  };

  // After successful location update, save to backend
  useEffect(() => {
    if (!isUpdateConfirmed || !pendingLocationUpdate) return;

    const syncLocationUpdate = async () => {
      const lat = Number(pendingLocationUpdate.lat);
      const lon = Number(pendingLocationUpdate.lng);

      try {
        await syncChainState();
        const refreshedSensor = await sensorApi.get(pendingLocationUpdate.id).catch(() => null);

        if (refreshedSensor && coordinatesMatch(refreshedSensor, lat, lon)) {
          await fetchData();
          toast.success("Device location updated and synced to backend.");
        } else {
          await sensorApi.update(pendingLocationUpdate.id, { lat, lon });
          await fetchData();
          toast.success("Device location updated.");
        }
      } catch {
        toast.warning("Updated on-chain but backend sync failed.");
      }
    };

    syncLocationUpdate();

    setEditingId(null);
    setNewLat("");
    setNewLng("");
    setPendingLocationUpdate(null);
  }, [isUpdateConfirmed, pendingLocationUpdate, fetchData, syncChainState]);

  useEffect(() => {
    if (!isClaimConfirmed || !address) return;

    const syncClaimState = async () => {
      await syncChainState();

      try {
        const refreshedReward = await rewardApi.getUserReward(address);
        setRewardData({ ...refreshedReward, already_claimed: true });
      } catch {
        setRewardData((prev) => (prev ? { ...prev, already_claimed: true } : prev));
      }

      await fetchData();
    };

    syncClaimState();
  }, [isClaimConfirmed, address, fetchData, syncChainState]);

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
  const showPurchaseForm = !hasSensors && orderStatus === "none";
  const showDeliveryStatus = !hasSensors && orderStatus !== "none";

  return (
    <div className="min-h-screen pt-16">
      <div className="container py-12 space-y-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl md:text-4xl font-serif text-foreground">My Sensors</h1>
          <p className="text-muted-foreground mt-1">
            Connected as <code className="text-xs font-mono text-foreground">{address?.slice(0, 6)}...{address?.slice(-4)}</code>
          </p>
        </motion.div>

        {loadingSensors && (
          <div className="text-center text-muted-foreground py-8">Loading your data...</div>
        )}

        {/* === No sensors: Buy a sensor pitch === */}
        {!loadingSensors && showPurchaseForm && (
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
                    Our AQ sensors measure real-time air quality and can be set up in a matter of seconds.
                    Deploy one anywhere with WiFi, and earn ECR tokens based on every verified reading.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary" /> Compact & plug-and-play</li>
                    <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary" /> Earn ECR rewards</li>
                    <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-primary" /> On-chain verified buybacks</li>
                  </ul>
                  <div className="pt-2">
                    <p className="text-2xl font-serif text-foreground">0.05 ETH</p>
                    <p className="text-xs text-muted-foreground">Free worldwide shipping</p>
                  </div>
                </div>
                <div className="p-8 md:p-10 bg-muted/30 space-y-4 flex flex-col justify-center">
                  <h3 className="text-lg font-serif text-foreground">Shipping Address</h3>
                  <div className="space-y-3">
                    <Input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="Street address" className="bg-background" />
                    <div className="grid grid-cols-2 gap-3">
                      <Input value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} placeholder="City" className="bg-background" />
                      <Input value={shippingZip} onChange={(e) => setShippingZip(e.target.value)} placeholder="ZIP / Postal code" className="bg-background" />
                    </div>
                    <Input value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)} placeholder="Country" className="bg-background" />
                  </div>
                  <Button
                    onClick={handlePurchase}
                    disabled={!shippingAddress || !shippingCity || !shippingCountry || !shippingZip || isPurchaseBusy}
                    className="w-full eco-gradient text-primary-foreground hover:opacity-90 border-0 text-base py-6"
                  >
                    {isPurchaseBusy ? "Confirming order..." : <>Pay 0.05 ETH & Order <ArrowRight className="w-4 h-4 ml-1" /></>}
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
        {!loadingSensors && showDeliveryStatus && (
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
                      {orderStatus === "arrived" ? "Sensor Arrived!" : "Your Sensor Is On Its Way!"}
                    </h2>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      {orderStatus === "arrived"
                        ? "Your sensor has arrived! Enter the 6-digit activation code from the packaging below to register it."
                        : "We're preparing your AQ-V2 sensor for shipment. You'll receive a tracking number soon."}
                    </p>

                    {(orderStatus === "pending" || orderStatus === "shipping") && (
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
                        <Button onClick={handleConfirmArrived} variant="outline" className="mx-auto">
                          <CheckCircle className="w-4 h-4 mr-2" /> I Received My Sensor
                        </Button>
                      </div>
                    )}

                    {orderStatus === "arrived" && pendingRegs.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="max-w-lg mx-auto space-y-4 pt-4"
                      >
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto">
                          <Clock className="w-6 h-6 text-amber-500" />
                        </div>
                        <h3 className="text-xl font-serif text-foreground">Waiting for Admin Approval</h3>
                        <p className="text-muted-foreground text-sm">
                          Your registration request has been submitted. An admin will review and register your sensor on-chain shortly.
                        </p>
                        <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                          Code: {pendingRegs[0].activation_code} · Pending
                        </Badge>
                      </motion.div>
                    ) : orderStatus === "arrived" && (
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
                          disabled={activationCode.length !== 6 || !regLat || !regLng || isSubmittingReg}
                          className="w-full eco-gradient text-primary-foreground hover:opacity-90 border-0"
                        >
                          {isSubmittingReg ? "Submitting..." : "Register Sensor"}
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <Card className="bg-card border-border">
                <CardContent className="pt-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Your Score</p>
                    <p className="text-2xl font-serif text-foreground">
                      {userScore ? userScore.score.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"}
                    </p>
                  </div>
                </CardContent>
              </Card>
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
                            <span className="font-medium text-foreground">
                              {rewardData ? `${formatEther(BigInt(rewardData.cumulative_amount))} ECR` : "Fetch on claim"}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Already claimed</span>
                            <span className="font-medium text-foreground">{Number(formattedClaimed).toLocaleString(undefined, { maximumFractionDigits: 2 })} ECR</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Proof status</span>
                            <span className="text-primary font-medium flex items-center gap-1">
                              {rewardData ? <><CheckCircle className="w-3 h-3" /> Verified</> : "Pending"}
                            </span>
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

            {/* Sensor list */}
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
                              <code className="text-sm text-foreground font-mono">
                                {sensor.device_id_hash ? shortDeviceId(sensor.device_id_hash) : sensor.device_id}
                              </code>
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
                                  <Button size="sm" variant="outline" onClick={() => handleUpdateLocation(sensor.id)} disabled={isUpdating || isUpdateConfirming}>
                                    {isUpdating ? "Confirm..." : isUpdateConfirming ? "Confirming..." : "Save"}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                                </div>
                              ) : (
                                <span>{sensor.lat}, {sensor.lon}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">Type: {sensor.sensor_type} · Registered: {new Date(sensor.registered_at).toLocaleDateString()}</p>
                          </div>
                          {editingId !== sensor.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setEditingId(sensor.id); setNewLat(String(sensor.lat)); setNewLng(String(sensor.lon)); }}
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
                        onClick={async () => {
                          const created = await handlePurchase();
                          if (created) setAdditionalOrderStatus("shipping");
                        }}
                        disabled={!shippingAddress || !shippingCity || !shippingCountry || !shippingZip || isPurchaseBusy}
                        className="eco-gradient text-primary-foreground hover:opacity-90 border-0"
                      >
                        {isPurchaseBusy ? "Confirming order..." : <>Pay 0.05 ETH & Order <ArrowRight className="w-4 h-4 ml-1" /></>}
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
                      We're preparing your AQ-V2 sensor for shipment.
                    </p>
                    <Button onClick={() => setAdditionalOrderStatus("arrived")} variant="outline" className="mx-auto">
                      <CheckCircle className="w-4 h-4 mr-2" /> I Received My Sensor
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Buy another — arrived, register */}
            {additionalOrderStatus === "arrived" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="font-serif text-xl">Register Your New Sensor</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 max-w-lg">
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
                      disabled={activationCode.length !== 6 || !regLat || !regLng || isSubmittingReg}
                      className="w-full eco-gradient text-primary-foreground hover:opacity-90 border-0"
                    >
                      {isSubmittingReg ? "Submitting..." : "Register Sensor"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;

