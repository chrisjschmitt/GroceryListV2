import { useState, useEffect } from "react";
import Admin from "./pages/Admin";
import HomeTab from "./pages/tabs/HomeTab";
import BasketsTab from "./pages/tabs/BasketsTab";
import ListsTab from "./pages/tabs/ListsTab";
import ProfileTab from "./pages/tabs/ProfileTab";
import VersionHistoryModal from "./components/VersionHistoryModal";
import packageJson from "../package.json";
import { Home, ShoppingBasket, ListTodo, User, Settings2 } from "lucide-react";

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [activeTab, setActiveTab] = useState<"home" | "baskets" | "lists" | "profile">("home");
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const CURRENT_VERSION = packageJson.version;

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  if (currentPath === "/admin") {
    return <Admin />;
  }

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "home":
        return <HomeTab />;
      case "baskets":
        return <BasketsTab onNavigateToLists={() => setActiveTab("lists")} />;
      case "lists":
        return <ListsTab />;
      case "profile":
        return <ProfileTab />;
      default:
        return <HomeTab />;
    }
  };

  return (
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
      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-6">
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

          {/* Lists Tab Button */}
          <button
            onClick={() => setActiveTab("lists")}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${
              activeTab === "lists" ? "text-primary scale-105" : "text-on-surface-variant/70 hover:text-on-surface"
            }`}
          >
            <ListTodo size={20} className={activeTab === "lists" ? "stroke-[2.5px]" : "stroke-[2px]"} />
            <span className="text-[10px] font-bold mt-1 tracking-wide">Lists</span>
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
    </div>
  );
}
