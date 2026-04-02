import { Link, useLocation } from "react-router-dom";
import { Leaf, Menu, X, Moon, Sun, Wallet, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { BLOCK_EXPLORER_URL } from "@/config/contract";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/sensors", label: "My Sensors" },
  { to: "/api-access", label: "Data Access" },
  { to: "/admin", label: "Admin Dashboard" },
];

const Navbar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  useEffect(() => {
    document.documentElement.style.transition = "background-color 0.5s ease, color 0.5s ease";
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg eco-gradient flex items-center justify-center">
            <Leaf className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-serif text-xl text-foreground">EcoProof</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === link.to
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={BLOCK_EXPLORER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="View contract on BaseScan"
            title="View smart contract"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <div className="hidden sm:block">
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
                const connected = mounted && account && chain;
                return (
                  <Button
                    onClick={connected ? openAccountModal : openConnectModal}
                    variant="outline"
                    size="sm"
                    className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary font-medium gap-2"
                  >
                    <Wallet className="w-4 h-4" />
                    {connected
                      ? `${account.displayName}`
                      : "Connect Wallet"
                    }
                  </Button>
                );
              }}
            </ConnectButton.Custom>
          </div>
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden bg-background border-b border-border"
          >
            <div className="container py-4 flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === link.to
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="px-4 pt-3 sm:hidden">
                <ConnectButton.Custom>
                  {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
                    const connected = mounted && account && chain;
                    return (
                      <Button
                        onClick={connected ? openAccountModal : openConnectModal}
                        variant="outline"
                        size="sm"
                        className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary font-medium gap-2 w-full"
                      >
                        <Wallet className="w-4 h-4" />
                        {connected ? `${account.displayName}` : "Connect Wallet"}
                      </Button>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
