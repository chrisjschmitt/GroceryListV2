import React, { useState, useMemo } from "react";
import { 
  User, 
  Settings, 
  Info, 
  Bell, 
  LogOut, 
  ShoppingBag, 
  ArrowLeft, 
  TrendingUp, 
  DollarSign, 
  Store, 
  Calendar, 
  Search, 
  BarChart3, 
  ChevronRight,
  Clock
} from "lucide-react";
import { useOfflineStore } from "@/lib/client/use-offline-store";
import { PurchaseLogEntry } from "@/lib/types";

export default function ProfileTab() {
  const store = useOfflineStore();
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"dashboard" | "log">("dashboard");
  
  // Filter states
  const [searchFilter, setSearchFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState(""); // "" | "7d" | "30d" | "90d" | "180d"

  const purchaseLogs = store.purchaseLogs || [];

  // Unique stores for filter
  const uniqueStores = useMemo(() => {
    const stores = new Set<string>();
    for (const log of purchaseLogs) {
      if (log.storeName) {
        stores.add(log.storeName);
      }
    }
    return Array.from(stores).sort();
  }, [purchaseLogs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return purchaseLogs.filter((log) => {
      // 1. Search item filter
      if (searchFilter && !log.name.toLowerCase().includes(searchFilter.toLowerCase())) {
        return false;
      }
      // 2. Store filter
      if (storeFilter && log.storeName !== storeFilter) {
        return false;
      }
      // 3. Time filter
      if (timeFilter) {
        const logDate = new Date(log.timestamp).getTime();
        const cutoff = Date.now() - (
          timeFilter === "7d" ? 7 * 24 * 60 * 60 * 1000 :
          timeFilter === "30d" ? 30 * 24 * 60 * 60 * 1000 :
          timeFilter === "90d" ? 90 * 24 * 60 * 60 * 1000 :
          timeFilter === "180d" ? 180 * 24 * 60 * 60 * 1000 : 0
        );
        if (logDate < cutoff) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [purchaseLogs, searchFilter, storeFilter, timeFilter]);

  // Summary Metrics (based on filtered logs)
  const totalItemsCount = useMemo(() => {
    return filteredLogs.reduce((sum, log) => sum + (log.quantity || 1), 0);
  }, [filteredLogs]);

  const totalSpent = useMemo(() => {
    return filteredLogs.reduce((sum, log) => sum + ((log.price || 0) * (log.quantity || 1)), 0);
  }, [filteredLogs]);

  const favoriteStore = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of filteredLogs) {
      if (log.storeName) {
        counts[log.storeName] = (counts[log.storeName] || 0) + (log.quantity || 1);
      }
    }
    let fav = "N/A";
    let max = 0;
    for (const [storeName, count] of Object.entries(counts)) {
      if (count > max) {
        max = count;
        fav = storeName;
      }
    }
    return fav;
  }, [filteredLogs]);

  // Frequency Analytics (Calculated over all logs to preserve long-term accuracy)
  const frequencyStats = useMemo(() => {
    const groups: Record<string, { 
      name: string; 
      category: string; 
      timestamps: number[]; 
      totalQty: number; 
      totalSpent: number;
      lastStore?: string;
    }> = {};

    for (const log of purchaseLogs) {
      const key = log.name.toLowerCase().trim();
      if (!groups[key]) {
        groups[key] = {
          name: log.name,
          category: log.category || "Other",
          timestamps: [],
          totalQty: 0,
          totalSpent: 0,
        };
      }
      groups[key].timestamps.push(new Date(log.timestamp).getTime());
      groups[key].totalQty += log.quantity || 1;
      groups[key].totalSpent += (log.price || 0) * (log.quantity || 1);
      if (log.storeName) {
        groups[key].lastStore = log.storeName;
      }
    }

    const items = Object.values(groups).map((group) => {
      group.timestamps.sort((a, b) => a - b);
      let intervalDays = 0;
      let label: "Weekly" | "Monthly" | "Quarterly" | "Semi-Annually" | "Occasionally" = "Occasionally";

      if (group.timestamps.length > 1) {
        const spanMs = group.timestamps[group.timestamps.length - 1] - group.timestamps[0];
        const spanDays = spanMs / (1000 * 60 * 60 * 24);
        intervalDays = spanDays / (group.timestamps.length - 1);

        if (intervalDays <= 7.5) {
          label = "Weekly";
        } else if (intervalDays <= 30.5) {
          label = "Monthly";
        } else if (intervalDays <= 91.5) {
          label = "Quarterly";
        } else if (intervalDays <= 182.5) {
          label = "Semi-Annually";
        }
      } else if (group.timestamps.length === 1) {
        // Single purchase: base estimate on age
        const ageMs = Date.now() - group.timestamps[0];
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays <= 7.5) {
          label = "Weekly";
        } else if (ageDays <= 30.5) {
          label = "Monthly";
        } else if (ageDays <= 91.5) {
          label = "Quarterly";
        } else if (ageDays <= 182.5) {
          label = "Semi-Annually";
        }
      }

      return {
        ...group,
        intervalDays,
        label,
      };
    });

    // Group items count by category frequency
    const breakdown = {
      Weekly: items.filter(i => i.label === "Weekly").sort((a, b) => b.totalQty - a.totalQty),
      Monthly: items.filter(i => i.label === "Monthly").sort((a, b) => b.totalQty - a.totalQty),
      Quarterly: items.filter(i => i.label === "Quarterly").sort((a, b) => b.totalQty - a.totalQty),
      "Semi-Annually": items.filter(i => i.label === "Semi-Annually").sort((a, b) => b.totalQty - a.totalQty),
      Occasionally: items.filter(i => i.label === "Occasionally").sort((a, b) => b.totalQty - a.totalQty),
    };

    return { items, breakdown };
  }, [purchaseLogs]);

  if (showAnalytics) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline/10 pb-4">
          <button 
            onClick={() => setShowAnalytics(false)}
            className="p-2 hover:bg-surface-container-low rounded-lg transition-all text-on-surface-variant flex items-center gap-2 text-xs font-bold"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <h2 className="text-base font-extrabold text-on-surface flex items-center gap-2">
            <ShoppingBag size={18} className="text-primary" />
            Purchase History & Analytics
          </h2>
          <div className="w-16"></div> {/* Spacer for symmetry */}
        </div>

        {/* Filters Panel */}
        <div className="bg-surface p-4 rounded-xl border border-outline/10 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
              Filter Log Data
            </span>
            {(searchFilter || storeFilter || timeFilter) && (
              <button 
                onClick={() => {
                  setSearchFilter("");
                  setStoreFilter("");
                  setTimeFilter("");
                }}
                className="text-[10px] text-primary font-bold hover:underline"
              >
                Clear Filters
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
              <input 
                type="text"
                placeholder="Search items..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-surface-container-low border border-outline/10 rounded-lg text-on-surface placeholder:text-on-surface-variant/50 focus:outline-hidden focus:border-primary/50"
              />
            </div>

            {/* Store Filter */}
            <div className="relative">
              <Store size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-surface-container-low border border-outline/10 rounded-lg text-on-surface focus:outline-hidden focus:border-primary/50 appearance-none"
              >
                <option value="">All Stores</option>
                {uniqueStores.map(store => (
                  <option key={store} value={store}>{store}</option>
                ))}
              </select>
            </div>

            {/* Time Filter */}
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60" />
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-surface-container-low border border-outline/10 rounded-lg text-on-surface focus:outline-hidden focus:border-primary/50 appearance-none"
              >
                <option value="">All Time</option>
                <option value="7d">Last 7 Days (Weekly)</option>
                <option value="30d">Last 30 Days (Monthly)</option>
                <option value="90d">Last 90 Days (Quarterly)</option>
                <option value="180d">Last 180 Days (Semi-Annually)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dashboard Tabs */}
        <div className="flex border-b border-outline/5">
          <button
            onClick={() => setActiveSubTab("dashboard")}
            className={`flex-1 pb-3 text-xs font-bold text-center border-b-2 transition-all ${
              activeSubTab === "dashboard"
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Dashboard & Frequencies
          </button>
          <button
            onClick={() => setActiveSubTab("log")}
            className={`flex-1 pb-3 text-xs font-bold text-center border-b-2 transition-all ${
              activeSubTab === "log"
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            History Log ({filteredLogs.length})
          </button>
        </div>

        {activeSubTab === "dashboard" ? (
          <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-surface p-3 rounded-lg border border-outline/10 flex flex-col justify-between">
                <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Purchased</span>
                <span className="text-base font-extrabold text-on-surface mt-1">{totalItemsCount}</span>
                <span className="text-[9px] text-on-surface-variant mt-0.5">items total</span>
              </div>
              <div className="bg-surface p-3 rounded-lg border border-outline/10 flex flex-col justify-between">
                <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Total Spent</span>
                <span className="text-base font-extrabold text-primary mt-1">${totalSpent.toFixed(2)}</span>
                <span className="text-[9px] text-on-surface-variant mt-0.5">estimated cost</span>
              </div>
              <div className="bg-surface p-3 rounded-lg border border-outline/10 flex flex-col justify-between overflow-hidden">
                <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Top Store</span>
                <span className="text-xs font-extrabold text-on-surface mt-1 truncate">{favoriteStore}</span>
                <span className="text-[9px] text-on-surface-variant mt-0.5">most visits</span>
              </div>
            </div>

            {/* Frequency Groups */}
            <div className="bg-surface p-5 rounded-xl border border-outline/10 shadow-xs space-y-4">
              <h3 className="text-xs font-extrabold text-on-surface flex items-center gap-1.5 uppercase tracking-wide">
                <BarChart3 size={15} className="text-primary" />
                Purchase Frequency Breakdown
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                Items categorized dynamically by their average duration between list clearances.
              </p>

              <div className="space-y-4 pt-2">
                {(Object.keys(frequencyStats.breakdown) as Array<keyof typeof frequencyStats.breakdown>).map((freq) => {
                  const items = frequencyStats.breakdown[freq];
                  if (items.length === 0) return null;

                  return (
                    <div key={freq} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-on-surface flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            freq === "Weekly" ? "bg-emerald-500" :
                            freq === "Monthly" ? "bg-blue-500" :
                            freq === "Quarterly" ? "bg-amber-500" :
                            freq === "Semi-Annually" ? "bg-purple-500" : "bg-gray-400"
                          }`} />
                          {freq} ({items.length} items)
                        </span>
                        <span className="text-[10px] text-on-surface-variant font-medium">
                          {freq === "Weekly" ? "Bought every 1-7 days" :
                           freq === "Monthly" ? "Bought every 8-30 days" :
                           freq === "Quarterly" ? "Bought every 1-3 months" :
                           freq === "Semi-Annually" ? "Bought every 3-6 months" : "Less frequent / One-offs"}
                        </span>
                      </div>

                      {/* Display items list inside frequency group */}
                      <div className="bg-surface-container-low/50 rounded-lg p-2 divide-y divide-outline/5">
                        {items.slice(0, 5).map((item) => (
                          <div key={item.name} className="py-2 px-1 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-bold text-on-surface">{item.name}</span>
                              <span className="text-[9px] text-on-surface-variant ml-2 bg-surface-container-high px-1.5 py-0.5 rounded-md uppercase font-bold tracking-wider">
                                {item.category}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-extrabold text-on-surface">x{item.totalQty}</span>
                              <span className="text-[9px] text-on-surface-variant block">
                                {item.lastStore ? `last at ${item.lastStore}` : ""}
                              </span>
                            </div>
                          </div>
                        ))}
                        {items.length > 5 && (
                          <div className="text-center pt-2 text-[10px] text-on-surface-variant font-bold">
                            + {items.length - 5} more items in this category
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {purchaseLogs.length === 0 && (
                  <div className="py-8 text-center text-xs text-on-surface-variant/60">
                    No purchase history found. Mark items as checked and clear them to populate analytics!
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Logs list */
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <span className="text-[11px] font-bold text-on-surface-variant">
                Showing {filteredLogs.length} entries
              </span>
              <span className="text-[10px] text-on-surface-variant/70">
                Sorted by newest first
              </span>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {filteredLogs.map((log) => {
                const total = (log.price || 0) * (log.quantity || 1);
                const formattedDate = new Date(log.timestamp).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                });

                return (
                  <div 
                    key={log.id} 
                    className="p-3 bg-surface border border-outline/10 rounded-xl flex items-center justify-between hover:bg-surface-container-low transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-on-surface">{log.name}</span>
                        <span className="text-[8px] bg-outline/10 text-on-surface-variant px-1 rounded uppercase font-bold tracking-wider">
                          {log.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-on-surface-variant">
                        <span className="flex items-center gap-0.5">
                          <Store size={11} />
                          {log.storeName || "Unknown Store"}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock size={11} />
                          {formattedDate}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-extrabold text-on-surface block">
                        {log.quantity} {log.unit ? `${log.unit}${log.quantity > 1 ? "s" : ""}` : "items"}
                      </span>
                      {log.price ? (
                        <span className="text-[10px] text-primary font-bold">
                          ${log.price.toFixed(2)} ea • <span className="font-extrabold">${total.toFixed(2)}</span>
                        </span>
                      ) : (
                        <span className="text-[9px] text-on-surface-variant font-medium">
                          No price synced
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredLogs.length === 0 && (
                <div className="bg-surface rounded-xl border border-dashed border-outline/20 p-8 text-center">
                  <p className="text-xs text-on-surface-variant/60 font-bold">
                    No matching purchase records found.
                  </p>
                  <p className="text-[10px] text-on-surface-variant/40 mt-1">
                    Try adjusting your filters or search keywords.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 bg-surface p-5 rounded-lg border border-outline/10 shadow-xs">
        <div className="w-14 h-14 bg-secondary-container/30 text-secondary rounded-full flex items-center justify-center font-bold text-lg">
          JD
        </div>
        <div>
          <h2 className="text-base font-extrabold text-on-surface">John Doe</h2>
          <p className="text-xs text-on-surface-variant">john.doe@example.com</p>
        </div>
      </div>

      <div className="bg-surface rounded-lg border border-outline/10 shadow-xs overflow-hidden divide-y divide-outline/5">
        {/* Purchase History Button */}
        <button 
          onClick={() => setShowAnalytics(true)}
          className="w-full text-left p-4 hover:bg-surface-container-low transition-all flex items-center justify-between group"
        >
          <div className="flex items-start gap-4">
            <ShoppingBag size={20} className="text-primary shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-on-surface">Purchase History & Analytics</h4>
              <p className="text-xs text-on-surface-variant mt-0.5">Track purchase frequencies, stores, and spent history</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-on-surface-variant/40 group-hover:translate-x-0.5 transition-all" />
        </button>

        {[
          { icon: Settings, label: "App Settings", desc: "Configure sync intervals & storage options" },
          { icon: Bell, label: "Notifications", desc: "Manage flyer price drop alerts" },
          { icon: Info, label: "About BasketWise", desc: "Version info, licenses, and terms" }
        ].map((item, idx) => (
          <button key={idx} className="w-full text-left p-4 hover:bg-surface-container-low transition-all flex items-start gap-4">
            <item.icon size={20} className="text-secondary shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-on-surface">{item.label}</h4>
              <p className="text-xs text-on-surface-variant mt-0.5">{item.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <button className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg border border-red-200/50 transition-all flex items-center justify-center gap-2">
        <LogOut size={16} />
        Sign Out
      </button>
    </div>
  );
}
