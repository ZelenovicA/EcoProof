import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Key, BarChart3, Globe, Zap, Check, Copy, CheckCircle, ArrowUpRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

interface Subscription {
  plan: string;
  apiKey: string;
  subscribedAt: string;
  expiresAt: string;
}

const plans = [
  {
    name: "Starter",
    price: "0.01 ETH/mo",
    features: ["1,000 API calls/day", "5 regions", "JSON format", "Email support"],
    popular: false,
  },
  {
    name: "Business",
    price: "0.05 ETH/mo",
    features: ["50,000 API calls/day", "All regions", "JSON + CSV", "Webhook alerts", "Priority support"],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "0.15 ETH/mo",
    features: ["Unlimited calls", "All regions", "All formats", "Custom webhooks", "Dedicated support", "SLA guarantee"],
    popular: false,
  },
];

const sampleData = {
  status: "ok",
  region: "Belgrade",
  timestamp: "2026-03-31T14:22:00Z",
  readings: {
    pm25: 12.4,
    pm10: 28.1,
    co2: 412,
    temperature: 18.3,
    humidity: 62,
  },
  sensor_id: "0xab12...ef34",
  verified: true,
};

const generateApiKey = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "ecr_";
  for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
};

const ApiAccess = () => {
  const { isConnected } = useAccount();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const handleSubscribe = async (planName: string) => {
    if (!isConnected) return;
    setIsSubscribing(true);
    // Simulate on-chain subscription tx
    await new Promise(r => setTimeout(r, 1500));
    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + 1);
    setSubscription({
      plan: planName,
      apiKey: generateApiKey(),
      subscribedAt: now.toISOString().split("T")[0],
      expiresAt: expires.toISOString().split("T")[0],
    });
    setIsSubscribing(false);
  };

  const handleCopyKey = () => {
    if (!subscription) return;
    navigator.clipboard.writeText(subscription.apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleChangePlan = (newPlan: string) => {
    if (!subscription) return;
    const now = new Date();
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + 1);
    setSubscription({
      ...subscription,
      plan: newPlan,
      subscribedAt: now.toISOString().split("T")[0],
      expiresAt: expires.toISOString().split("T")[0],
    });
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
            Every data point is blockchain-verified and tamper-proof.
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
                          {subscription.plan} plan · Renews {subscription.expiresAt}
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
                        {subscription.apiKey}
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
                      <p className="font-serif text-foreground">{subscription.plan}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Subscribed</p>
                      <p className="font-serif text-foreground">{subscription.subscribedAt}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">Renews</p>
                      <p className="font-serif text-foreground">{subscription.expiresAt}</p>
                    </div>
                  </div>

                  {/* Usage example */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Quick Start</label>
                    <pre className="bg-background border border-border rounded-lg p-4 text-xs font-mono text-foreground overflow-x-auto">
{`curl -H "Authorization: Bearer ${subscription.apiKey}" \\
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
              const isCurrentPlan = subscription?.plan === plan.name;
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
                            onClick={() => handleChangePlan(plan.name)}
                          >
                            <ArrowUpRight className="w-4 h-4 mr-1" />
                            Switch to {plan.name}
                          </Button>
                        ) : (
                          <Button
                            className={plan.popular
                              ? "eco-gradient text-primary-foreground hover:opacity-90 border-0 w-full"
                              : "w-full"
                            }
                            variant={plan.popular ? "default" : "outline"}
                            onClick={() => handleSubscribe(plan.name)}
                            disabled={isSubscribing}
                          >
                            {isSubscribing ? "Processing..." : "Subscribe Now"}
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
            { icon: Globe, label: "Regions Covered", value: "12+" },
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
