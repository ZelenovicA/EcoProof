import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Key, BarChart3, Globe, Zap, Check, Copy, CheckCircle, ArrowUpRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseEther } from "viem";
import { toast } from "sonner";
import { ECOPROOF_CONTRACT_ADDRESS, IS_CONTRACT_CONFIGURED } from "@/config/contract";
import { contractService } from "@/services/contractService";
import { subscriptionApi, type SubscriptionDTO } from "@/services/apiClient";

const planPrices: Record<string, string> = {
  Starter: "0.00001",
  Business: "0.00005",
  Enterprise: "0.00015",
};

const plans = [
  {
    name: "Starter",
    price: "0.01 ETH/mo",
    features: ["1,000 API calls/day", "Basic aggregated data (hourly)", "One country", "Delayed data (5–10 min)", "Email support"],
    popular: false,
  },
  {
    name: "Business",
    price: "0.05 ETH/mo",
    features: ["50,000 API calls/day", "Near real-time data", "Global coverage", "Webhook alerts",  "Priority support"],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "0.15 ETH/mo",
    features: ["Unlimited calls", "Near real-time data","Global coverage", "Custom webhooks", "Dedicated support"],
    popular: false,
  },
];

const sampleData = {
  status: "ok",
  lat: 42.70,
  lon: 18.42,
  timestamp: "2026-03-31T14:22:00Z",
  readings: {
    pm25: 12.4,
    pm10: 28.1,
    temperature: 18.3,
    humidity: 62,
  },
  sensor_id: "0xab12...ef34",
  verified: true,
};

const planLabels: Record<SubscriptionDTO["plan"], string> = {
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

const toPlanValue = (planName: string): SubscriptionDTO["plan"] =>
  planName.toLowerCase() as SubscriptionDTO["plan"];

const toPlanLabel = (plan: SubscriptionDTO["plan"] | string) => {
  const normalized = plan.toLowerCase() as SubscriptionDTO["plan"];
  return planLabels[normalized] || plan;
};

const ApiAccess = () => {
  const { isConnected, address } = useAccount();
  const [subscription, setSubscription] = useState<SubscriptionDTO | null>(null);
  const [loadingSub, setLoadingSub] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  const { sendTransactionAsync, data: ethHash, isPending: isSubscribePending } = useSendTransaction();
  const { isLoading: isSubscribeConfirming, isSuccess: isSubscribeConfirmed } = useWaitForTransactionReceipt({ hash: ethHash });

  const fetchSubscription = useCallback(async () => {
    if (!address) return;
    setLoadingSub(true);
    try {
      const subs = await subscriptionApi.list(address);
      const activeSub = subs.find((sub) => sub.status === "active") || null;
      setSubscription(activeSub);
    } catch {
      setSubscription(null);
    } finally {
      setLoadingSub(false);
    }
  }, [address]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const handleSubscribe = async (planName: string, valueEth: string) => {
    if (!isConnected || !address || !IS_CONTRACT_CONFIGURED) return;
    try {
      setPendingPlan(planName);
      
      // Send ETH directly to contract address
      const txHash = await sendTransactionAsync({
        to: ECOPROOF_CONTRACT_ADDRESS,
        value: parseEther(valueEth),
      });
      
      toast.message(`Subscription transaction submitted (${valueEth} ETH).`);
      
      // Create subscription in backend
      const newSub = await subscriptionApi.create({
        wallet_address: address,
        plan: toPlanValue(planName),
        tx_hash: txHash,
      });
      setSubscription(newSub);

      toast.success(`Plan ${planName} activated on-chain.`);
      
      setTimeout(() => {
        setPendingPlan(null);
      }, 2000);
    } catch (error) {
      setPendingPlan(null);
      toast.error(contractService.parseError(error));
    }finally {
      setPendingPlan(null);
    }
  };

   const handleChangePlan = async (newPlan: string, valueEth: string) => {
    if (!subscription || !address) return;
    try {
      setPendingPlan(newPlan);

      const txHash = await sendTransactionAsync({
        to: ECOPROOF_CONTRACT_ADDRESS,
        value: parseEther(valueEth),
      });

      const updated = await subscriptionApi.update(subscription.id, { plan: toPlanValue(newPlan), tx_hash: txHash });
      setSubscription(updated);
      toast.success(`Switched to ${newPlan} plan.`);
    } catch (error) {
      toast.error(contractService.parseError(error));
    } finally {
      setPendingPlan(null);
    }
  };

  const handleCopyKey = () => {
    if (!subscription) return;
    navigator.clipboard.writeText(subscription.api_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="min-h-screen pt-16">
      <div className="container py-12 space-y-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 max-w-2xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Key className="w-3.5 h-3.5" />
            API Access
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-foreground">
            Verified Environmental Data at Scale
          </h1>
          <p className="text-lg text-muted-foreground">
            Subscribe on-chain and get instant API access to our sensor network across Serbia.
            Every data point is verified and rewarded if honest.
          </p>
        </motion.div>

        {/* Active Subscription Panel */}
        <AnimatePresence>
          {subscription && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="bg-card border-border eco-glow ring-2 ring-primary">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl eco-gradient flex items-center justify-center">
                      <Shield className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                      <CardTitle className="font-serif text-xl">Active Subscription</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {toPlanLabel(subscription.plan)} plan · Renews {new Date(subscription.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-primary/10 text-primary border-0">
                      <CheckCircle className="w-3 h-3 mr-1" /> Active
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* API Key */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Your API Key</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-background border border-border rounded-lg px-4 py-3 font-mono text-sm text-foreground overflow-x-auto">
                        {subscription.api_key}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyKey}
                        className="flex-shrink-0"
                      >
                        {copiedKey ? <CheckCircle className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Include this key in the <code className="text-foreground">Authorization</code> header of your requests.
                    </p>
                  </div>

                  {/* Subscription details */}
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Current Plan</p>
                      <p className="font-serif text-foreground">{toPlanLabel(subscription.plan)}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Subscribed</p>
                      <p className="font-serif text-foreground">{new Date(subscription.subscribed_at).toLocaleDateString()}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Renews</p>
                      <p className="font-serif text-foreground">{new Date(subscription.expires_at).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {/* Usage example */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Quick Start</label>
                    <pre className="bg-background border border-border rounded-lg p-4 text-xs font-mono text-foreground overflow-x-auto">
{`curl -H "Authorization: Bearer ${subscription.api_key}" \\
  https://api.ecoproof.io/v1/readings/belgrade`}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Plans */}

        <div className="space-y-4">
          {subscription && (
            <div className="text-center">
              <h2 className="text-2xl font-serif text-foreground">Change Your Plan</h2>
              <p className="text-sm text-muted-foreground mt-1">Upgrade or downgrade anytime</p>
            </div>
          )}
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan, i) => {
              const isCurrentPlan = subscription?.plan === toPlanValue(plan.name);
              const isPlanPending = pendingPlan === plan.name;
              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card className={`bg-card border-border relative h-full flex flex-col ${plan.popular && !subscription ? "eco-glow ring-2 ring-primary" : ""} ${isCurrentPlan ? "ring-2 ring-primary" : ""}`}>
                    {plan.popular && !subscription && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                        Most Popular
                      </Badge>
                    )}
                    {isCurrentPlan && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                        Current Plan
                      </Badge>
                    )}
                    <CardHeader>
                      <CardTitle className="font-serif text-xl">{plan.name}</CardTitle>
                      <p className="text-2xl font-serif text-foreground">{plan.price}</p>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col justify-between gap-6">
                      <ul className="space-y-3">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Check className="w-4 h-4 text-primary flex-shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      {isConnected ? (
                        isCurrentPlan ? (
                          <Button variant="outline" disabled className="w-full">
                            <CheckCircle className="w-4 h-4 mr-2" /> Active
                          </Button>
                        ) : subscription ? (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => handleChangePlan(plan.name, planPrices[plan.name])}
                            disabled={isSubscribePending || isSubscribeConfirming}
                          >
                            <ArrowUpRight className="w-4 h-4 mr-1" />
                            {isPlanPending && isSubscribePending
                              ? "Confirm..."
                              : isPlanPending && isSubscribeConfirming
                                ? "Confirming..."
                                : `Switch to ${plan.name}`}
                          </Button>
                        ) : (
                          <Button
                            className={plan.popular
                              ? "eco-gradient text-primary-foreground hover:opacity-90 border-0 w-full"
                              : "w-full"
                            }
                            variant={plan.popular ? "default" : "outline"}
                            onClick={() => handleSubscribe(plan.name, planPrices[plan.name])}
                            disabled={isSubscribePending || isSubscribeConfirming}
                          >
                            {isPlanPending && isSubscribePending
                              ? "Confirm..."
                              : isPlanPending && isSubscribeConfirming
                                ? "Confirming..."
                                : "Subscribe Now"}
                          </Button>
                        )
                      ) : (
                        <div className="w-full flex justify-center">
                          <ConnectButton label="Connect to Subscribe" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Sample Response */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="space-y-6"
        >
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-serif text-foreground">Sample API Response</h2>
            <p className="text-muted-foreground">What you get with every request</p>
          </div>
          <div className="max-w-2xl mx-auto eco-card">
            <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">GET</span>
              <code>/api/v1/readings/belgrade</code>
            </div>
            <pre className="text-sm font-mono text-foreground bg-background rounded-lg p-4 overflow-x-auto border border-border">
              {JSON.stringify(sampleData, null, 2)}
            </pre>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: Globe, label: "Regions Covered", value: "20+" },  
            { icon: BarChart3, label: "Daily Readings", value: "24K" },
            { icon: Zap, label: "Avg Response Time", value: "<50ms" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="eco-card text-center space-y-2"
            >
              <stat.icon className="w-6 h-6 text-primary mx-auto" />
              <p className="text-3xl font-serif text-foreground">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ApiAccess;
