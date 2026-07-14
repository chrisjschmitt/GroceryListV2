import { useState, useEffect } from "react";
import Admin from "./pages/Admin";
import DealsTab from "./pages/tabs/DealsTab";
import BasketsTab from "./pages/tabs/BasketsTab";
import ListsTab from "./pages/tabs/ListsTab";
import ProfileTab from "./pages/tabs/ProfileTab";
import VersionHistoryModal from "./components/VersionHistoryModal";
import HelpModal from "./components/HelpModal";
import packageJson from "../package.json";
import { Home, ShoppingBasket, Tag, User, Settings2, HelpCircle } from "lucide-react";
import { OfflineStoreProvider } from "./lib/client/offline-store-context";

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [activeTab, setActiveTab] = useState<"home" | "deals" | "baskets" | "profile">("home");
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const CURRENT_VERSION = packageJson.version;
  const [isUpdating, setIsUpdating] = useState(false);
  const [targetVersion, setTargetVersion] = useState("");

  useEffect(() => {
    if (navigator.onLine) {
      fetch("/api/app-version")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.version && data.version !== CURRENT_VERSION) {
            console.log(`New version available: ${data.version} (current: ${CURRENT_VERSION}). Downloading...`);
            setTargetVersion(data.version);
            setIsUpdating(true);
            setTimeout(() => {
              window.location.reload();
            }, 1800);
          }
        })
        .catch((err) => console.error("Error checking app version:", err));
    }
  }, [CURRENT_VERSION]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  if (isUpdating) {
    return (
      <div className="fixed inset-0 bg-slate-950 text-white flex flex-col items-center justify-center z-50 px-6 text-center">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-6"></div>
          <h2 className="text-xl font-extrabold text-white mb-2">Downloading Update</h2>
          <p className="text-sm text-slate-400">
            A newer version of BasketWise is available ({targetVersion}). Downloading assets and updating your application...
          </p>
        </div>
      </div>
    );
  }

  if (currentPath === "/admin") {
    return <Admin />;
  }

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "home":
        return <ListsTab />;
      case "deals":
        return <DealsTab />;
      case "baskets":
        return <BasketsTab onNavigateToLists={() => setActiveTab("home")} />;
      case "profile":
        return <ProfileTab />;
      default:
        return <ListsTab />;
    }
  };

  return (
    <OfflineStoreProvider>
      <div className="min-h-screen bg-background text-on-background font-sans flex flex-col pb-20">
        {/* Premium Sticky Top Header */}
        <header className="sticky top-0 z-50 bg-surface/85 backdrop-blur-md border-b border-outline/10 px-4 py-3.5 flex justify-between items-center shadow-xs">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <h1 className="text-xl font-extrabold tracking-tight">
                BasketWise<span className="text-primary">.</span>
              </h1>
              <span className="text-[9px] font-black uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm tracking-wider">
                PWA
              </span>
            </div>
            <span className="text-[10px] text-on-surface-variant font-medium mt-0.5">
              Grocery Saving Engine
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Changelog Version Button */}
            <button
              onClick={() => setIsChangelogOpen(true)}
              className="text-[10px] font-bold uppercase bg-primary-container/10 hover:bg-primary-container/20 text-primary border border-primary/20 px-2.5 py-1 rounded-md transition-all cursor-pointer"
            >
              v{CURRENT_VERSION}
            </button>

            {/* Help Button */}
            <button
              onClick={() => setIsHelpOpen(true)}
              className="p-2 text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-md cursor-pointer"
              title="Help / Instructions"
            >
              <HelpCircle size={18} />
            </button>

            {/* Admin shortcut */}
            <a
              href="/admin"
              className="p-2 text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container-low rounded-md"
              title="Admin Portal"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, "", "/admin");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
            >
              <Settings2 size={18} />
            </a>
          </div>
        </header>

        {/* Main Tab Content Area */}
        <main className={`flex-1 w-full mx-auto px-4 py-6 ${activeTab === "home" ? "max-w-lg lg:max-w-[1400px]" : "max-w-lg"}`}>
          {renderTabContent()}
        </main>

        {/* Premium Bottom Tab Navigation Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-lg border-t border-outline/10 shadow-[0_-4px_16px_rgba(0,0,0,0.03)] pb-safe">
          <div className="max-w-lg mx-auto flex justify-around items-center h-16 px-2">
            {/* Home Tab Button */}
            <button
              onClick={() => setActiveTab("home")}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${
                activeTab === "home" ? "text-primary scale-105" : "text-on-surface-variant/70 hover:text-on-surface"
              }`}
            >
              <Home size={20} className={activeTab === "home" ? "stroke-[2.5px]" : "stroke-[2px]"} />
              <span className="text-[10px] font-bold mt-1 tracking-wide">Home</span>
            </button>

            {/* Baskets Tab Button */}
            <button
              onClick={() => setActiveTab("baskets")}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${
                activeTab === "baskets" ? "text-primary scale-105" : "text-on-surface-variant/70 hover:text-on-surface"
              }`}
            >
              <ShoppingBasket size={20} className={activeTab === "baskets" ? "stroke-[2.5px]" : "stroke-[2px]"} />
              <span className="text-[10px] font-bold mt-1 tracking-wide">Baskets</span>
            </button>

            {/* Deals Tab Button */}
            <button
              onClick={() => setActiveTab("deals")}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${
                activeTab === "deals" ? "text-primary scale-105" : "text-on-surface-variant/70 hover:text-on-surface"
              }`}
            >
              <Tag size={20} className={activeTab === "deals" ? "stroke-[2.5px]" : "stroke-[2px]"} />
              <span className="text-[10px] font-bold mt-1 tracking-wide">Deals</span>
            </button>

            {/* Profile Tab Button */}
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${
                activeTab === "profile" ? "text-primary scale-105" : "text-on-surface-variant/70 hover:text-on-surface"
              }`}
            >
              <User size={20} className={activeTab === "profile" ? "stroke-[2.5px]" : "stroke-[2px]"} />
              <span className="text-[10px] font-bold mt-1 tracking-wide">Profile</span>
            </button>
          </div>
        </nav>

        {/* Version Changelog History Modal */}
        <VersionHistoryModal
          isOpen={isChangelogOpen}
          onClose={() => setIsChangelogOpen(false)}
          currentVersion={CURRENT_VERSION}
        />

        {/* Help Modal */}
        <HelpModal
          isOpen={isHelpOpen}
          onClose={() => setIsHelpOpen(false)}
        />
      </div>
    </OfflineStoreProvider>
  );
}
