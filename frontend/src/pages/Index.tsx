import { motion } from "framer-motion";
import { Leaf, Shield, Wifi, Coins, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import imgLeaf from "@/assets/ecoBlockchainLeaf1.png";
import PollutionMap from "@/components/PollutionMap";

const features = [
  {
    icon: Wifi,
    title: "IoT Sensor Network",
    description: "Deploy our compact air quality sensors anywhere. Earn tokens based on each valid reading.",
  },
  {
    icon: Shield,
    title: "Reliable & Tamper-Proof",
    description: " All company funds are stored on-chain and can only be used for token buybacks. No manipulation, ever.",
  },
  {
    icon: Coins,
    title: "Earn ECR Tokens",
    description: "Get rewarded for contributing clean data. Sell tokens back or hold for governance rights in the future.",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen pt-16">
      {/* Hero */}
      <section className="relative overflow-hidden eco-gradient-soft">
        <div className="container py-24 md:py-32 flex flex-col md:flex-row items-center gap-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex-1 space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Leaf className="w-3.5 h-3.5" />
              Decentralized Environmental Data
            </div>
            <h1 className="text-5xl md:text-7xl font-serif leading-[1.1] text-foreground">
              Data You Can{" "}
              <span className="eco-text-gradient italic">Breathe On</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
              A blockchain-powered network of air quality sensors, providing transparent, 
              reliable environmental data to everyone.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/sensors"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl eco-gradient text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
              >
                Get a Sensor <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/api-access"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-card border border-border text-foreground font-medium text-sm hover:bg-muted transition-colors"
              >
                Get Data Access
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="flex-shrink-0"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-eco-green/10 rounded-full blur-3xl scale-150" />
              <img
                src={imgLeaf}
                alt="EcoProof leaf symbol"
                className="relative w-72 md:w-[26rem] lg:w-[30rem] max-w-none h-auto drop-shadow-2xl"
                width={800}
                height={800}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Heatmap */}
      <section className="container py-20 space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center space-y-3"
        >
          <h2 className="text-3xl md:text-4xl font-serif text-foreground">
            Live Air Quality Heatmap
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Real-time pollution zones across Serbia from our sensor network. Color-coded by air quality category.
          </p>
        </motion.div>
        <div className="max-w-5xl mx-auto eco-card">
          <PollutionMap />
        </div>
      </section>

      {/* Sensors & Features */}
      <section className="bg-card border-y border-border">
        <div className="container py-20 space-y-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center space-y-3"
          >
            <h2 className="text-3xl md:text-4xl font-serif text-foreground">
              Our Sensor Ecosystem
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Purchase a sensor, deploy it, and start earning rewards while contributing to a healthier planet.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="eco-card space-y-4 hover:eco-glow transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl eco-gradient flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-serif text-foreground">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="eco-card max-w-2xl mx-auto text-center space-y-4"
          >
            <h3 className="text-2xl font-serif text-foreground">Ready to Get Started?</h3>
            <p className="text-muted-foreground">
              Our sensors cost <span className="font-semibold text-foreground">0.05 ETH</span> and come with a unique 6-digit activation code. 
              Deploy anywhere with WiFi access to start contributing environmental data and earning ECR tokens.
            </p>
            <Link
              to="/sensors"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl eco-gradient text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Buy Your First Sensor <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="container py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Leaf className="w-4 h-4 text-primary" />
          <span>EcoProof © 2026</span>
        </div>
        <p>Built on Blockchain. Powered by community.</p>
      </footer>
    </div>
  );
};

export default Index;
