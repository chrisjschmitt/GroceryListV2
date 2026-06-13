import React, { useRef, useState, useCallback, useEffect } from "react";
import Link from "@/components/Link";
import { RegularItem, PriceEntry, ScrapeConfig, PriceData } from "@/lib/types";
import { 
  Search, 
  X, 
  ExternalLink, 
  Save, 
  Link as LinkIcon, 
  DollarSign, 
  Check, 
  Globe, 
  HelpCircle,
  Plus,
  Trash2,
  Clipboard,
  Wrench,
  ChevronDown,
  ChevronUp
} from "lucide-react";

function isSaleExpiredLocal(validUntil?: string | null): boolean {
  if (!validUntil) return false;
  const expiryDate = new Date(validUntil);
  if (isNaN(expiryDate.getTime())) return false;
  
  const now = new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(validUntil.trim())) {
    const [y, m, d] = validUntil.trim().split("-").map(Number);
    const targetDate = new Date(y, m - 1, d, 23, 59, 59, 999);
    return now > targetDate;
  }
  return now > expiryDate;
}

interface RegularItemsListProps {
  items: RegularItem[];
  onAddToGroceryList: (items: RegularItem[]) => Promise<void>;
  onRemoveFromGroceryList: (name: string) => Promise<void>;
  onUploadCsv: (file: File) => Promise<{ count: number; errors: string[] }>;
  alreadyInList: Set<string>;
  onAddItem?: (name: string, category: string) => Promise<void>;
  onEditItem?: (id: string, name: string) => Promise<void>;
  onDeleteItem?: (id: string) => Promise<void>;
  priceLookup: Map<string, PriceEntry>;
  allowCrud?: boolean;
  prices?: PriceData;
  onPricesUpdated?: () => Promise<void>;
  onSaveChanges?: () => Promise<void>;
  hasPendingChanges?: boolean;
}

interface EditState {
  type: "add" | "edit";
  category: string;
  itemId?: string;
  value: string;
}

function abbreviateStoreName(name: string): string {
  if (!name) return "";
  const normalized = name.toLowerCase().trim();
  if (normalized.includes("food basics") || normalized === "fb" || normalized === "foodbasics") return "FB";
  if (normalized.includes("metro") || normalized === "mt") return "MT";
  if (normalized.includes("freshmart") || normalized === "fresh mart") return "FM";
  if (normalized.includes("budget") || normalized === "budgetgrocer") return "BG";
  if (normalized.includes("organic") || normalized === "organicplace") return "OP";
  if (normalized.includes("mega") || normalized === "megasave") return "MS";
  const words = name.split(/\s+/);
  if (words.length > 1) {
    return words.map(w => w[0]).join("").toUpperCase().substring(0, 3);
  }
  return name.substring(0, 2).toUpperCase();
}

function checkIfLowestPriceForEntry(price: any, storeId: string): boolean {
  if (!price.stores || typeof price.stores !== "object") return true;
  const storeKeys = Object.keys(price.stores);
  if (storeKeys.length <= 1) return true;

  let lowestPrice = Infinity;
  for (const key of storeKeys) {
    const s = price.stores[key];
    const p = (s.is_on_sale && s.sale_price !== null && s.sale_price !== undefined) ? s.sale_price : (s.regular_price || 0);
    if (p < lowestPrice) {
      lowestPrice = p;
    }
  }

  const currentStore = price.stores[storeId];
  const currentPrice = currentStore ? ((currentStore.is_on_sale && currentStore.sale_price !== null && currentStore.sale_price !== undefined) ? currentStore.sale_price : (currentStore.regular_price || 0)) : Infinity;
  return currentPrice <= lowestPrice;
}

function getSearchUrlForStore(storeKey: string, itemName: string): string {
  const encodedName = encodeURIComponent(itemName);
  switch (storeKey) {
    case "foodbasics":
      return `https://www.foodbasics.ca/search?searchItem=${encodedName}`;
    case "metro":
      return `https://www.metro.ca/en/search?filter=${encodedName}`;
    case "loblaws":
      return `https://www.loblaws.ca/search?search-bar=${encodedName}`;
    case "nofrills":
      return `https://www.nofrills.ca/search?search-bar=${encodedName}`;
    default:
      return `https://www.google.com/search?q=${encodeURIComponent(itemName + " " + storeKey)}`;
  }
}

export default function RegularItemsList({
  items,
  onAddToGroceryList,
  onRemoveFromGroceryList,
  onUploadCsv,
  alreadyInList,
  onAddItem,
  onEditItem,
  onDeleteItem,
  priceLookup,
  allowCrud = false,
  prices,
  onPricesUpdated,
  onSaveChanges,
  hasPendingChanges = false,
}: RegularItemsListProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; name: string } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Price Checker & Lookup states
  const [scrapeConfig, setScrapeConfig] = useState<ScrapeConfig | null>(null);
  const [activePriceCheckItem, setActivePriceCheckItem] = useState<RegularItem | null>(null);
  const [modalStoreKey, setModalStoreKey] = useState("foodbasics");
  const [modalUrl, setModalUrl] = useState("");
  const [modalUpc, setModalUpc] = useState("");
  const [modalSuccessMsg, setModalSuccessMsg] = useState<string | null>(null);
  const [generalToast, setGeneralToast] = useState<string | null>(null);

  // Manual Price Repair States
  const [isRepairExpanded, setIsRepairExpanded] = useState(false);
  const [repairRegularPrice, setRepairRegularPrice] = useState("");
  const [repairSalePrice, setRepairSalePrice] = useState("");
  const [repairIsOnSale, setRepairIsOnSale] = useState(false);
  const [repairUpc, setRepairUpc] = useState("");
  const [repairValidUntil, setRepairValidUntil] = useState("");
  const [repairTrackPricing, setRepairTrackPricing] = useState(false);
  const [repairExternalName, setRepairExternalName] = useState("");
  
  // Search query state for general catalog filtering
  const [searchQuery, setSearchQuery] = useState("");

  const showGeneralToast = (msg: string) => {
    setGeneralToast(msg);
    setTimeout(() => setGeneralToast(null), 4000);
  };

  const getDynamicStoreNames = (): Record<string, string> => {
    const defaultStores: Record<string, string> = {
      foodbasics: "Food Basics",
      metro: "Metro",
      loblaws: "Loblaws",
      nofrills: "No Frills"
    };
    if (scrapeConfig?.stores) {
      Object.entries(scrapeConfig.stores).forEach(([key, store]: [string, any]) => {
        if (store?.store_name) {
          defaultStores[key] = store.store_name;
        }
      });
    }
    return defaultStores;
  };

  const getDynamicStoreIdMap = (): Record<string, string> => {
    const defaultIds: Record<string, string> = {
      foodbasics: "7923194",
      metro: "metro",
      loblaws: "loblaws",
      nofrills: "nofrills"
    };
    if (scrapeConfig?.stores) {
      Object.entries(scrapeConfig.stores).forEach(([key, store]: [string, any]) => {
        if (store?.store_id) {
          defaultIds[key] = store.store_id;
        }
      });
    }
    return defaultIds;
  };

  useEffect(() => {
    async function loadScrapeConfig() {
      try {
        const res = await fetch("/api/scrape-config");
        if (res.ok) {
          const data = await res.json();
          setScrapeConfig(data);
        }
      } catch (err) {
        console.warn("Failed to load scrape config in RegularItemsList", err);
      }
    }
    loadScrapeConfig();
  }, []);

  const handleLoadStoreContextForModal = (item: RegularItem, storeKey: string) => {
    let initialUrl = "";
    let initialUpc = "";
    let initialExternalName = "";
    let initialTrackPricing = false;
    let initialValidUntil = "";

    if (scrapeConfig?.items) {
      const match = scrapeConfig.items.find(
        (sc: any) => sc.name.toLowerCase() === item.name.toLowerCase()
      );
      if (match?.stores && match.stores[storeKey]) {
        initialUrl = match.stores[storeKey].url || "";
        initialUpc = match.stores[storeKey].upc || "";
        if ((match.stores[storeKey] as any).external_name) {
          initialExternalName = (match.stores[storeKey] as any).external_name;
        }
        if ((match.stores[storeKey] as any).track_pricing !== undefined) {
          initialTrackPricing = !!(match.stores[storeKey] as any).track_pricing;
        }
      }
    }

    const priceEntry = priceLookup.get(item.name.toLowerCase());
    let isCorrupted = false;
    let regP = "";
    let saleP = "";
    let ios = false;

    if (priceEntry) {
      let storeInfo = null;
      if (priceEntry.stores && typeof priceEntry.stores === "object") {
        storeInfo = priceEntry.stores[storeKey];
      } else if (storeKey === "foodbasics") {
        storeInfo = priceEntry;
      }

      if (storeInfo) {
        regP = storeInfo.regular_price !== null && storeInfo.regular_price !== undefined ? String(storeInfo.regular_price) : "";
        saleP = storeInfo.sale_price !== null && storeInfo.sale_price !== undefined ? String(storeInfo.sale_price) : "";
        ios = storeInfo.is_on_sale === 1 || !!storeInfo.is_on_sale;
        initialValidUntil = storeInfo.valid_until || "";
        if (storeInfo.track_pricing !== undefined) {
          initialTrackPricing = storeInfo.track_pricing === 1 || !!storeInfo.track_pricing;
        }
        if (storeInfo.external_name) {
          initialExternalName = storeInfo.external_name;
        }
        
        const rp = storeInfo.regular_price;
        const isRegInvalid = rp === null || rp === undefined || typeof rp !== "number" || isNaN(rp) || rp <= 0;
        const isSaleInvalid = ios && (storeInfo.sale_price === null || storeInfo.sale_price === undefined || typeof storeInfo.sale_price !== "number" || isNaN(storeInfo.sale_price) || storeInfo.sale_price < 0);
        isCorrupted = isRegInvalid || isSaleInvalid;
      }
    }

    setIsRepairExpanded(isCorrupted || !regP); // Expand by default if no pricing exists yet
    setRepairRegularPrice(regP);
    setRepairSalePrice(saleP);
    setRepairIsOnSale(ios);
    setRepairValidUntil(initialValidUntil);
    setRepairTrackPricing(initialTrackPricing);
    setRepairExternalName(initialExternalName);

    if (!initialUpc && prices) {
      const found = Object.entries(prices).find(([_, value]) => 
        value && (
          (value.item_name && value.item_name.toLowerCase() === item.name.toLowerCase()) || 
          (value.config_name && value.config_name.toLowerCase() === item.name.toLowerCase())
        ) && (
          value.store_id === storeKey || (value.stores && value.stores[storeKey])
        )
      );
      if (found) {
        initialUpc = found[0];
      }
    }

    if (!initialUpc) {
      initialUpc = `manual-${Date.now()}`;
    }

    setModalUrl(initialUrl);
    setModalUpc(initialUpc);
    setRepairUpc(initialUpc);
  };

  const handleOpenPriceCheck = (item: RegularItem) => {
    setActivePriceCheckItem(item);
    setModalSuccessMsg(null);
    let defaultStore = "foodbasics";
    const dynamicNames = getDynamicStoreNames();
    if (dynamicNames && Object.keys(dynamicNames).length > 0) {
      const keys = Object.keys(dynamicNames);
      if (!keys.includes("foodbasics") || !scrapeConfig?.stores?.["foodbasics"]?.enabled) {
        const firstEnabled = keys.find(k => scrapeConfig?.stores?.[k]?.enabled);
        defaultStore = firstEnabled || keys[0];
      }
    }
    setModalStoreKey(defaultStore);
    handleLoadStoreContextForModal(item, defaultStore);
  };

  const handleStoreKeyChange = (newStoreKey: string) => {
    setModalStoreKey(newStoreKey);
    if (activePriceCheckItem) {
      handleLoadStoreContextForModal(activePriceCheckItem, newStoreKey);
    }
  };

  const showModalSuccessMessage = (msg: string) => {
    setModalSuccessMsg(msg);
    setTimeout(() => setModalSuccessMsg(null), 3000);
  };

  const getItemPriceStatus = (item: RegularItem | null) => {
    if (!item) {
      return {
        statusLabel: "Unknown",
        statusDesc: "",
        statusBoxClass: "bg-gray-50 border-gray-400 text-[#111827]",
        statusDotClass: "bg-gray-400",
        detailsBlock: null
      };
    }

    const itemPriceLink = scrapeConfig?.items?.find(
      (sc: any) => sc.name.toLowerCase() === item.name.toLowerCase() && sc.stores?.[modalStoreKey]?.url
    );
    const hasPriceLink = !!itemPriceLink;
    const priceEntry = priceLookup.get(item.name.toLowerCase());
    
    let activePriceEntry: any = priceEntry;
    if (priceEntry) {
      if (priceEntry.stores && typeof priceEntry.stores === "object" && priceEntry.stores[modalStoreKey]) {
        activePriceEntry = priceEntry.stores[modalStoreKey];
      } else if (modalStoreKey !== "foodbasics") {
        activePriceEntry = null; // No custom pricing loaded for other stores unless they match explicitly
      }
    }
    const hasPriceEntry = !!activePriceEntry;

    const isPriceCorrupted = (price: any): boolean => {
      if (!price) return false;
      const regPrice = price.regular_price;
      const isRegInvalid = regPrice === null || regPrice === undefined || typeof regPrice !== "number" || isNaN(regPrice) || regPrice <= 0;
      const isOnSale = price.is_on_sale === 1;
      const salePrice = price.sale_price;
      const isSaleInvalid = isOnSale && (salePrice === null || salePrice === undefined || typeof salePrice !== "number" || isNaN(salePrice) || salePrice < 0);
      return isRegInvalid || isSaleInvalid;
    };

    const corrupted = isPriceCorrupted(activePriceEntry);
    const saleExpired = isSaleExpiredLocal(activePriceEntry?.valid_until);

    const storeNames = getDynamicStoreNames();
    const storeLabelName = storeNames[modalStoreKey] || modalStoreKey;

    // Determine status attributes
    let statusLabel = "Unconfigured / No Link";
    let statusDesc = `No active scraper details or ${storeLabelName} product URLs are registered in scrape_config.json for this item yet. Prices are not actively tracked.`;
    let statusBoxClass = "bg-gray-100 border-gray-400 text-[#111827] shadow-[2px_2px_0px_0px_rgba(156,163,175,1)]";
    let statusDotClass = "bg-gray-400";
    let detailsBlock = null;

    if (hasPriceLink) {
      if (hasPriceEntry) {
        if (corrupted) {
          statusLabel = "Corrupted Pricing Data";
          statusDesc = `This item's pricing record in prices.json for ${storeLabelName} contains empty, null, or invalid price values.`;
          statusBoxClass = "bg-rose-50 border-rose-500 text-rose-900 shadow-[2px_2px_0px_0px_rgba(239,68,68,1)]";
          statusDotClass = "bg-rose-500 animate-pulse";
        } else if (saleExpired) {
          statusLabel = "Invalid / Expired Sale Price";
          statusDesc = `The sale price for ${storeLabelName} is INVALID: the 'valid_until' date of ${activePriceEntry.valid_until} has passed.`;
          statusBoxClass = "bg-amber-50 border border-yellow-500 text-amber-950 shadow-[2px_2px_0px_0px_rgba(234,179,8,1)]";
          statusDotClass = "bg-amber-500 animate-pulse";
        } else {
          statusLabel = "Active & Verified Price";
          statusDesc = `Successfully linked in scrape_config.json and verified pricing for ${storeLabelName} is loaded from prices.json.`;
          statusBoxClass = "bg-emerald-50 border-emerald-500 text-emerald-955 shadow-[2px_2px_0px_0px_rgba(16,185,129,1)]";
          statusDotClass = "bg-emerald-500";
        }
      } else {
        statusLabel = "Configured (No Pricing Loaded Yet)";
        statusDesc = `Item is registered in scrape_config.json for ${storeLabelName}, but has not completed scanning or matching prices.json records.`;
        statusBoxClass = "bg-amber-50 border-amber-500 text-amber-900 shadow-[2px_2px_0px_0px_rgba(245,158,11,1)]";
        statusDotClass = "bg-amber-400 animate-pulse";
      }
    } else {
      if (hasPriceEntry) {
        if (corrupted) {
          statusLabel = "Unlinked with Corrupted Data";
          statusDesc = `Pricing records are loaded from prices.json for ${storeLabelName} but are corrupt, and no configuration URL exists.`;
          statusBoxClass = "bg-rose-50 border-rose-500 text-rose-900 shadow-[2px_2px_0px_0px_rgba(239,68,68,1)]";
          statusDotClass = "bg-rose-500 animate-pulse";
        } else if (saleExpired) {
          statusLabel = "Expired Manual Sale Price";
          statusDesc = `Warning: This item's manual sale price for ${storeLabelName} has expired and is no longer valid (expired on ${activePriceEntry.valid_until}).`;
          statusBoxClass = "bg-amber-50 border border-yellow-500 text-amber-950 shadow-[2px_2px_0px_0px_rgba(234,179,8,1)]";
          statusDotClass = "bg-amber-500 animate-pulse";
        } else {
          statusLabel = "Manual Prices Loaded (Unlinked)";
          statusDesc = `Verified pricing for ${storeLabelName} is loaded in prices.json, but no active automated link exists in scrape_config.json.`;
          statusBoxClass = "bg-emerald-50 border-emerald-500 text-emerald-955 shadow-[2px_2px_0px_0px_rgba(16,185,129,1)]";
          statusDotClass = "bg-emerald-600";
        }
      }
    }

    if (hasPriceEntry && activePriceEntry) {
      const rp = activePriceEntry.regular_price;
      const sp = activePriceEntry.sale_price;
      const ios = activePriceEntry.is_on_sale === 1 || !!activePriceEntry.is_on_sale;
      const hasRp = rp !== null && typeof rp === "number" && !isNaN(rp);
      const hasSp = sp !== null && typeof sp === "number" && !isNaN(sp);

      detailsBlock = (
        <div className="mt-2.5 pt-2 border-t border-dashed border-current grid grid-cols-2 gap-3 text-xs font-bold uppercase font-mono">
          <div>
            <span className="text-[10px] opacity-75 block text-left">Regular Price:</span>
            <span className={hasRp ? "text-sm font-black block text-left" : "text-rose-600 underline font-black block text-left"}>
              {hasRp ? `$${rp.toFixed(2)}` : "MISSING/NULL"}
            </span>
          </div>
          <div>
            <span className="text-[10px] opacity-75 block text-left">Active Sale Price:</span>
            <span className={saleExpired ? "text-sm font-black text-amber-500 block text-left animate-pulse" : ios ? (hasSp ? "text-sm font-black text-red-655 block text-left" : "text-rose-600 underline font-black block text-left") : "text-gray-400 font-bold block text-left"}>
              {ios ? (hasSp ? (
                <span>
                  <span className={saleExpired ? "text-amber-500 font-black" : ""}>$</span>
                  {sp.toFixed(2)}
                </span>
              ) : "MISSING/NULL") : "No Sale"}
            </span>
          </div>
          {activePriceEntry.valid_until && (
            <div className="col-span-2 text-[9.5px] font-mono text-gray-500 normal-case text-left flex items-center gap-1">
              <span>Valid until: {activePriceEntry.valid_until}</span>
              {saleExpired && (
                <span className="bg-amber-100 text-amber-800 border border-yellow-500 px-1 text-[8px] uppercase font-black tracking-wider animate-pulse ml-1.5">
                  INVALID/EXPIRED
                </span>
              )}
            </div>
          )}
          {activePriceEntry.last_updated && (
            <div className="col-span-2 text-[9px] font-mono opacity-80 normal-case text-left">
              Last Scanned: {new Date(activePriceEntry.last_updated).toLocaleString()}
            </div>
          )}
        </div>
      );
    }

    return {
      statusLabel,
      statusDesc,
      statusBoxClass,
      statusDotClass,
      detailsBlock
    };
  };

  const handleUrlChange = (val: string) => {
    let cleanUrl = val.trim();
    if (cleanUrl.includes("foodbasics.ca")) {
      const questionIdx = cleanUrl.indexOf("?");
      if (questionIdx !== -1) {
        cleanUrl = cleanUrl.substring(0, questionIdx);
      }
    }
    setModalUrl(cleanUrl);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        let cleanUrl = text.trim();
        if (cleanUrl.includes("foodbasics.ca")) {
          const questionIdx = cleanUrl.indexOf("?");
          if (questionIdx !== -1) {
            cleanUrl = cleanUrl.substring(0, questionIdx);
          }
        }
        setModalUrl(cleanUrl);
        showModalSuccessMessage("Successfully pasted and cleaned URL!");
      } else {
        alert("Your clipboard appears to be empty.");
      }
    } catch (err) {
      console.warn("Could not read from clipboard automatically", err);
      alert("Direct clipboard reading is blocked/restricted by your browser. Please manual paste (Ctrl+V) directly into the field!");
    }
  };

  const handleSearchAndCopyName = async () => {
    if (!activePriceCheckItem) return;
    try {
      await navigator.clipboard.writeText(activePriceCheckItem.name);
      showModalSuccessMessage(`"${activePriceCheckItem.name}" copied! Ready to paste into search.`);
    } catch (err) {
      console.warn("Could not write item name to clipboard", err);
    }
  };

  const handleSavePriceCheckUrl = async (url: string, upcOverride: string) => {
    if (!activePriceCheckItem) return;
    const finalItemName = activePriceCheckItem.name;
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      alert("Please specify product page URL.");
      return;
    }

    // Perform a full deep-clone of the configuration object to completely bypass
    // React's shallow comparative reference checks (which caused state changes to be ignored).
    let config = scrapeConfig ? JSON.parse(JSON.stringify(scrapeConfig)) : { stores: {}, items: [] };
    if (!config.items) config.items = [];
    if (!config.stores) config.stores = {};

    const storeKey = modalStoreKey;

    if (!config.stores[storeKey]) {
      const storeNames = getDynamicStoreNames();
      const baseUrls: Record<string, string> = {
        foodbasics: "https://www.foodbasics.ca",
        metro: "https://www.metro.ca",
        loblaws: "https://www.loblaws.ca",
        nofrills: "https://www.nofrills.ca"
      };
      config.stores[storeKey] = {
        enabled: true,
        store_name: storeNames[storeKey] || storeKey,
        base_url: baseUrls[storeKey] || `https://www.${storeKey}.com`,
        postal_code: "K7H3C6",
        store_id: storeKey,
      };
    }

    let upc = upcOverride.trim();
    if (!upc) {
      const match = trimmedUrl.match(/\/p\/(\d+)/);
      upc = match ? match[1] : `manual-${Date.now()}`;
    }

    let existingItem = config.items.find((i: any) => i.name.toLowerCase() === finalItemName.toLowerCase());
    if (existingItem) {
      if (!existingItem.stores) existingItem.stores = {};
      existingItem.stores[storeKey] = {
        url: trimmedUrl,
        upc,
      };
    } else {
      config.items.push({
        name: finalItemName,
        stores: {
          [storeKey]: {
            url: trimmedUrl,
            upc,
          }
        }
      });
    }

    try {
      const res = await fetch("/api/scrape-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        // Update local React state with fully fresh object references
        setScrapeConfig(config);
        setModalUrl("");
        setModalUpc("");
        // Automatically close the dialog window
        setActivePriceCheckItem(null);
        // Show high-impact page-level success notification
        showGeneralToast(`Saved scraper link for "${finalItemName}"!`);
      } else {
        alert("Failed to save scraper config.");
      }
    } catch (err) {
      console.error("Failed to save scrape config", err);
      alert("Failed to save scraper config.");
    }
  };

  const handleDeletePriceCheckUrl = async () => {
    if (!activePriceCheckItem || !scrapeConfig) return;
    const finalItemName = activePriceCheckItem.name;

    if (!confirm(`Are you sure you want to remove the price check link for "${finalItemName}"?`)) {
      return;
    }

    // Perform a full deep-clone of the configuration object
    const config = JSON.parse(JSON.stringify(scrapeConfig));
    if (!config.items) config.items = [];

    const itemConfig = config.items.find((i: any) => i.name.toLowerCase() === finalItemName.toLowerCase());
    if (itemConfig && itemConfig.stores) {
      delete itemConfig.stores[modalStoreKey];
      if (Object.keys(itemConfig.stores).length === 0) {
        config.items = config.items.filter((i: any) => i.name.toLowerCase() !== finalItemName.toLowerCase());
      }
    }

    try {
      const res = await fetch("/api/scrape-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setScrapeConfig(config);
        setModalUrl("");
        setModalUpc("");
        // Automatically close the dialog window
        setActivePriceCheckItem(null);
        // Show high-impact page-level success notification
        showGeneralToast(`Removed scraper link for "${finalItemName}"!`);
      } else {
        alert("Failed to remove link config on the server.");
      }
    } catch (err) {
      console.error("Failed to remove link config", err);
      alert("Failed to remove link config.");
    }
  };

  const handleSaveManualPriceRepair = async () => {
    if (!activePriceCheckItem) return;
    const finalItemName = activePriceCheckItem.name;
    const cleanUpc = repairUpc.trim();

    if (!cleanUpc) {
      alert("UPC code is required to repair pricing.");
      return;
    }

    const parsedRegular = parseFloat(repairRegularPrice);
    if (isNaN(parsedRegular) || parsedRegular < 0) {
      alert("Please enter a valid regular price.");
      return;
    }

    let parsedSale = parseFloat(repairSalePrice);
    if (repairIsOnSale && (isNaN(parsedSale) || parsedSale < 0)) {
      alert("Please enter a valid sale price when item is on sale.");
      return;
    }

    // Chris has to enter an end date for the sale of this item before he can save it.
    if (repairIsOnSale) {
      if (!repairValidUntil.trim()) {
        alert("Please enter a sale end date (Valid Until) before saving this item.");
        return;
      }
      const parsedDate = Date.parse(repairValidUntil);
      if (isNaN(parsedDate)) {
        alert("Please enter a valid sale end date (YYYY-MM-DD or standard date format).");
        return;
      }
    }

    const storeNames = getDynamicStoreNames();
    const storeIdMap = getDynamicStoreIdMap();

    const finalStoreName = storeNames[modalStoreKey] || modalStoreKey;
    const finalStoreId = storeIdMap[modalStoreKey] || modalStoreKey;

    const payload = {
      upc: cleanUpc,
      item: {
        item_name: finalItemName,
        config_name: finalItemName,
        store_name: finalStoreName,
        postal_code: "K7H3C6",
        store_id: finalStoreId,
        regular_price: parsedRegular,
        sale_price: repairIsOnSale ? parsedSale : null,
        is_on_sale: repairIsOnSale ? 1 : 0,
        lookup_url: modalUrl.trim() || "",
        valid_until: repairIsOnSale ? repairValidUntil : "",
        track_pricing: repairTrackPricing,
        external_name: repairExternalName.trim(),
        last_updated: new Date().toISOString()
      }
    };

    try {
      const res = await fetch("/api/admin/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showModalSuccessMessage("Pricing repaired and saved successfully!");
        
        // Refresh pricing on parent component if callback provided
        if (onPricesUpdated) {
          await onPricesUpdated();
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.error || "Failed to update pricing on the server.");
      }
    } catch (err) {
      console.error("Failed to repair price", err);
      alert("Failed to repair price.");
    }
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setUploadMsg("Please upload a .csv file");
      return;
    }
    setUploading(true);
    setUploadMsg(null);
    const { count, errors } = await onUploadCsv(file);
    if (count > 0) {
      setUploadMsg(errors.length > 0 ? `Imported ${count} items (${errors.length} rows skipped)` : null);
    } else {
      setUploadMsg(errors[0] || "Failed to parse CSV");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTap = (item: RegularItem) => {
    if (contextMenu || editState) return;
    if (alreadyInList.has(item.name.toLowerCase())) {
      onRemoveFromGroceryList(item.name);
    } else {
      onAddToGroceryList([item]);
    }
  };

  const handleLongPressStart = useCallback((item: RegularItem) => {
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ id: item.id, name: item.name });
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleEdit = (id: string, currentName: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setContextMenu(null);
    setEditState({ type: "edit", category: item.category, itemId: id, value: currentName });
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  const handleDelete = async (id: string) => {
    setContextMenu(null);
    if (onDeleteItem) await onDeleteItem(id);
  };

  const handleStartAdd = (category: string) => {
    if (!allowCrud) return;
    setEditState({ type: "add", category, value: "" });
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  };

  const handleEditSubmit = async () => {
    if (!editState || !editState.value.trim()) {
      setEditState(null);
      return;
    }

    if (editState.type === "add" && onAddItem) {
      await onAddItem(editState.value.trim(), editState.category);
    } else if (editState.type === "edit" && editState.itemId && onEditItem) {
      await onEditItem(editState.itemId, editState.value.trim());
    }
    setEditState(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleEditSubmit();
    if (e.key === "Escape") setEditState(null);
  };

  const filteredItems = items.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      item.name.toLowerCase().includes(query) ||
      (item.category && item.category.toLowerCase().includes(query))
    );
  });

  const categories = filteredItems.reduce<Record<string, RegularItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    acc[item.category].sort((a, b) => a.name.localeCompare(b.name));
    return acc;
  }, {});

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        {generalToast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white border-2 border-black px-4 py-2.5 text-xs font-black uppercase tracking-wider shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2 rounded-none">
            <Check className="w-4 h-4 text-white shrink-0" />
            <span>{generalToast}</span>
          </div>
        )}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-emerald-400 bg-emerald-50" : "border-gray-200 hover:border-emerald-300 hover:bg-gray-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
            aria-label="Upload CSV file"
          />
          <div className="text-3xl mb-2">📄</div>
          <p className="text-sm font-medium text-gray-700">
            {uploading ? "Uploading..." : "Upload your grocery items CSV"}
          </p>
          <p className="text-xs text-gray-400 mt-1">Format: category, item name (one per row)</p>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-xl">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            </div>
          )}
        </div>
        {uploadMsg && <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">{uploadMsg}</p>}

        <div className="text-center py-8">
          <div className="text-4xl mb-3">📋</div>
          <h3 className="text-base font-medium text-gray-900 mb-1">No grocery items yet</h3>
          <p className="text-sm text-gray-500 mb-4">Upload a CSV above or use the Admin page</p>
          <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700">
            Go to Admin →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {generalToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white border-2 border-black px-4 py-2.5 text-xs font-black uppercase tracking-wider shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2 rounded-none">
          <Check className="w-4 h-4 text-white shrink-0" />
          <span>{generalToast}</span>
        </div>
      )}
      {contextMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setContextMenu(null)} />
      )}

      {allowCrud ? (
        <p className="text-xs font-bold uppercase tracking-widest text-[#6b7280]">Tap to add • long press to edit</p>
      ) : (
        <p className="text-sm font-medium text-gray-500">Tap items to add or remove them from your active shopping list below.</p>
      )}

      {/* Modern High-Contrast Neo-Brutalist Search Input */}
      <div className="relative flex items-center bg-white border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-[#111827] focus-within:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] focus-within:translate-x-[2px] focus-within:translate-y-[2px] transition-all my-2">
        <div className="pl-3.5 text-black shrink-0 select-none">
          <Search className="w-4 h-4 font-black" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search catalog by item name or category..."
          className="w-full bg-transparent px-3 py-3 text-xs font-black uppercase tracking-wider placeholder:text-gray-400 focus:outline-none placeholder:normal-case font-mono"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="pr-3.5 text-black hover:text-red-650 transition-colors font-bold"
            title="Clear search query"
          >
            <X className="w-4 h-4 shrink-0" />
          </button>
        )}
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center py-12 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6 my-4">
          <div className="text-4xl mb-3">🔍</div>
          <h4 className="text-xs font-black uppercase tracking-wider text-black">No matching items found</h4>
          <p className="text-xs text-gray-500 mt-2 max-w-sm mx-auto font-medium">
            We couldn't find items in the catalog that match "{searchQuery}". Try searching for another item or clear your query.
          </p>
          <button
            onClick={() => setSearchQuery("")}
            className="mt-5 text-[10px] font-black uppercase tracking-wider bg-white border-2 border-black px-4 py-2 hover:bg-gray-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-black"
          >
            Clear Search Filter
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(categories)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryItems]) => (
            <div key={category} className="bg-[#f9fafb] border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center justify-between mb-3 pb-1 border-b-2 border-dashed border-gray-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-black">{category}</h4>
                <div className="flex items-center gap-1.5">
                  {hasPendingChanges && onSaveChanges ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSaveChanges();
                      }}
                      className="animate-pulse text-[9px] font-black uppercase tracking-wider bg-amber-400 hover:bg-amber-500 border border-black px-1.5 py-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] text-black"
                      title="Save all changes to the server"
                    >
                      💾 Save changes
                    </button>
                  ) : null}

                  {allowCrud && (
                    <button
                      onClick={() => handleStartAdd(category)}
                      className="text-[10px] font-black uppercase tracking-wider bg-white border border-black px-2 py-0.5 hover:bg-emerald-50 transition-colors shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] text-black"
                      title={`Add item to ${category}`}
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {categoryItems.map((item) => {
                  const inList = alreadyInList.has(item.name.toLowerCase());
                  const isEditing = editState?.type === "edit" && editState.itemId === item.id;
                  const hasPriceLink = !!(scrapeConfig?.items?.some(
                    (sc: any) => sc.name.toLowerCase() === item.name.toLowerCase() && 
                    Object.values(sc.stores || {}).some((storeLink: any) => !!storeLink?.url)
                  ));

                  const priceEntry = priceLookup.get(item.name.toLowerCase());
                  const hasPriceEntry = !!priceEntry;

                  const isPriceCorrupted = (price: PriceEntry | undefined): boolean => {
                    if (!price) return false;
                    const regPrice = price.regular_price;
                    const isRegInvalid = regPrice === null || regPrice === undefined || typeof regPrice !== "number" || isNaN(regPrice) || regPrice <= 0;
                    const isOnSale = price.is_on_sale === 1;
                    const salePrice = price.sale_price;
                    const isSaleInvalid = isOnSale && (salePrice === null || salePrice === undefined || typeof salePrice !== "number" || isNaN(salePrice) || salePrice < 0);
                    return isRegInvalid || isSaleInvalid;
                  };

                  let indicatorColorClass = "bg-white text-gray-400 hover:text-black hover:bg-emerald-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]";
                  let tooltipText = `Configure/lookup price check for "${item.name}"`;

                  if (hasPriceLink) {
                    if (hasPriceEntry) {
                      if (isPriceCorrupted(priceEntry)) {
                        indicatorColorClass = "bg-rose-500 text-white hover:bg-rose-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]";
                        tooltipText = `Pricing is CORRUPTED in prices.json for "${item.name}" (active link)`;
                      } else {
                        indicatorColorClass = "bg-emerald-500 text-white hover:bg-emerald-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]";
                        tooltipText = `Edit price check for "${item.name}" (active link with prices)`;
                      }
                    } else {
                      indicatorColorClass = "bg-amber-400 text-black hover:bg-amber-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]";
                      tooltipText = `Item registered for scraping, but NO prices loaded in prices.json for "${item.name}"`;
                    }
                  } else {
                    if (hasPriceEntry) {
                      if (isPriceCorrupted(priceEntry)) {
                        indicatorColorClass = "bg-rose-500 text-white hover:bg-rose-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]";
                        tooltipText = `Pricing is CORRUPTED in prices.json (unlinked to scrape_config)`;
                      } else {
                        indicatorColorClass = "bg-emerald-500 text-white hover:bg-emerald-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]";
                        tooltipText = `Prices loaded in prices.json for "${item.name}" (unlinked to scrape_config)`;
                      }
                    }
                  }

                  if (isEditing) {
                    return (
                      <div key={item.id} className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        <input
                          ref={inputRef}
                          type="text"
                          value={editState.value}
                          onChange={(e) => setEditState({ ...editState, value: e.target.value })}
                          onKeyDown={handleEditKeyDown}
                          onBlur={handleEditSubmit}
                          className="flex-1 text-sm outline-none bg-transparent font-bold text-black"
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={item.id} className="flex gap-1.5 items-stretch relative">
                      <button
                        onClick={() => handleTap(item)}
                        onMouseDown={allowCrud ? () => handleLongPressStart(item) : undefined}
                        onMouseUp={allowCrud ? handleLongPressEnd : undefined}
                        onMouseLeave={allowCrud ? handleLongPressEnd : undefined}
                        onTouchStart={allowCrud ? () => handleLongPressStart(item) : undefined}
                        onTouchEnd={allowCrud ? handleLongPressEnd : undefined}
                        onContextMenu={allowCrud ? (e) => {
                          e.preventDefault();
                          setContextMenu({ id: item.id, name: item.name });
                        } : undefined}
                        className={`flex-1 flex items-start sm:items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 border-2 border-black text-left text-sm transition-all ${
                          inList
                            ? "bg-emerald-50 text-emerald-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-600"
                            : "bg-white text-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[2px] hover:-translate-y-[2px]"
                        }`}
                        title={inList ? "Tap to remove from shopping list" : "Tap to add to shopping list"}
                      >
                        <span
                          className={`flex-shrink-0 w-5 h-5 border-2 border-black flex items-center justify-center mt-0.5 sm:mt-0 transition-all ${
                            inList ? "bg-black text-white" : "bg-white text-black"
                          }`}
                        >
                          {inList && (
                            <div className="w-1.5 h-1.5 bg-white rotate-45"></div>
                          )}
                        </span>
                        
                        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 min-w-0">
                          <span className="font-bold overflow-hidden break-words text-xs sm:text-sm leading-tight pr-1.5">{item.name}</span>
                          {(() => {
                            const price = priceLookup.get(item.name.toLowerCase());
                            if (!price) return null;

                            if (price.stores && typeof price.stores === "object") {
                              const storeEntries = Object.entries(price.stores);
                              if (storeEntries.length > 0) {
                                return (
                                  <span className="sm:ml-auto inline-flex flex-wrap gap-1 items-center">
                                    {storeEntries.map(([storeId, storeInfo]: [string, any]) => {
                                      const activeP = (storeInfo.is_on_sale && storeInfo.sale_price !== null && storeInfo.sale_price !== undefined) 
                                        ? storeInfo.sale_price 
                                        : (storeInfo.regular_price || 0);
                                      const isLowest = checkIfLowestPriceForEntry(price, storeId);
                                      const storeExpired = storeInfo.is_on_sale && storeInfo.valid_until && isSaleExpiredLocal(storeInfo.valid_until);
                                      return (
                                        <span
                                          key={storeId}
                                          className={`text-[9px] font-black uppercase border border-black px-1.5 py-0.2 shrink-0 inline-flex items-center gap-0.5 rounded-none ${
                                            isLowest
                                              ? storeInfo.is_on_sale 
                                                ? storeExpired
                                                  ? "bg-amber-100 text-amber-800 border-yellow-500 animate-pulse"
                                                  : "bg-red-100 text-red-700 font-extrabold"
                                                : "bg-emerald-100 text-emerald-800"
                                              : "bg-gray-100 text-gray-500 font-normal"
                                          }`}
                                          title={`${storeInfo.store_name || storeId}: $${activeP.toFixed(2)}${storeInfo.valid_until ? ` (valid until ${storeInfo.valid_until})` : ""}`}
                                        >
                                          <span>{abbreviateStoreName(storeInfo.store_name || storeId)}:</span>
                                          <span className={storeExpired ? "text-amber-500 font-black animate-pulse" : ""}>$</span>
                                          <span>{activeP.toFixed(2)}</span>
                                          {storeInfo.is_on_sale && (
                                            <span className={storeExpired ? "text-amber-600 font-black text-[7px]" : "text-red-600 font-black text-[7px]"}>%</span>
                                          )}
                                          {storeInfo.is_on_sale && storeInfo.valid_until && (
                                            <span className="text-[7.5px] text-gray-400 font-medium normal-case ml-0.5 font-mono">({storeInfo.valid_until})</span>
                                          )}
                                        </span>
                                      );
                                    })}
                                  </span>
                                );
                              }
                            }

                            // Single Store Fallback
                            const activePrice = price.is_on_sale && price.sale_price !== null ? price.sale_price : price.regular_price;
                            const fallbackExpired = price.is_on_sale && price.valid_until && isSaleExpiredLocal(price.valid_until);
                            return (
                              <span
                                className={`sm:ml-auto flex-shrink-0 text-[10px] font-black uppercase border border-black px-1.5 py-0.2 shrink-0 inline-flex items-center gap-0.5 ${
                                  price.is_on_sale 
                                    ? fallbackExpired
                                      ? "text-amber-700 bg-amber-50 border-yellow-500 animate-pulse"
                                      : "text-red-700 bg-red-100" 
                                    : "text-gray-500 bg-gray-50"
                                }`}
                                title={price.valid_until ? `Valid until ${price.valid_until}` : undefined}
                              >
                                <span>{abbreviateStoreName(price.store_name || "Food Basics")}:</span>
                                <span className={fallbackExpired ? "text-amber-500 font-black animate-pulse" : ""}>$</span>
                                <span>{activePrice?.toFixed(2)}</span>
                                {price.is_on_sale === 1 && (
                                  <span className={fallbackExpired ? "ml-0.5 text-[7px] text-amber-600 font-bold" : "ml-0.5 text-[7px] font-bold"}>
                                    {fallbackExpired ? "expired" : "sale"}
                                  </span>
                                )}
                                {price.is_on_sale && price.valid_until && (
                                  <span className="text-[8px] text-gray-400 font-medium ml-0.5 normal-case font-mono">({price.valid_until})</span>
                                )}
                              </span>
                            );
                          })()}
                          {inList && !priceLookup.get(item.name.toLowerCase()) && (
                            <span className="sm:ml-auto text-[10px] font-black uppercase text-emerald-600">✔ in list</span>
                          )}
                        </div>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPriceCheck(item);
                        }}
                        className={`flex-shrink-0 w-10 border-2 border-black flex items-center justify-center transition-all ${indicatorColorClass}`}
                        title={tooltipText}
                      >
                        <DollarSign className="w-4 h-4" />
                      </button>

                      {contextMenu?.id === item.id && (
                        <div className="absolute right-0 top-full mt-1 z-20 bg-white border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] py-1 min-w-[120px]">
                          <button
                            onClick={() => handleEdit(item.id, item.name)}
                            className="w-full text-left px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-gray-50 text-black"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="w-full text-left px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-red-50 text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {editState?.type === "add" && editState.category === category && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <input
                      ref={inputRef}
                      type="text"
                      value={editState.value}
                      onChange={(e) => setEditState({ ...editState, value: e.target.value })}
                      onKeyDown={handleEditKeyDown}
                      onBlur={handleEditSubmit}
                      placeholder="New item name"
                      className="flex-1 text-sm outline-none bg-transparent font-bold placeholder-gray-400 text-black"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Price Check Setup & Lookup Dialog Modal */}
      {activePriceCheckItem && (() => {
        const { statusLabel, statusDesc, statusBoxClass, statusDotClass, detailsBlock } = getItemPriceStatus(activePriceCheckItem);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
            <div 
              className="bg-white border-4 border-black p-6 w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] md:p-8 relative text-[#111827]"
              role="dialog"
              aria-modal="true"
            >
              {/* Modal Close Button */}
              <button
                onClick={() => setActivePriceCheckItem(null)}
                className="absolute right-4 top-4 bg-white hover:bg-gray-100 border-2 border-black p-1 hover:translate-x-[1px] hover:translate-y-[1px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4 text-black" />
              </button>

              {/* Modal Header */}
              <div className="mb-4 flex items-start gap-3">
                <div className="bg-emerald-100 border-2 border-black p-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex-shrink-0">
                  <DollarSign className="w-5 h-5 text-emerald-800" />
                </div>
                <div className="text-left">
                  <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider block mb-0.5">Price Checking Assistant</span>
                  <h3 className="text-2xl font-black uppercase tracking-tight leading-none text-black break-all">
                    {activePriceCheckItem.name}
                  </h3>
                </div>
              </div>

              {/* Live Status indicator Card block */}
              <div className={`mb-4 border-2 border-black p-3 text-left ${statusBoxClass}`}>
                <div className="flex items-center gap-1.5 mb-1 bg-white/20 px-1.5 py-0.5 rounded w-fit">
                  <span className={`w-2 h-2 rounded-full ${statusDotClass}`} />
                  <span className="text-[10px] font-black uppercase tracking-wider">{statusLabel}</span>
                </div>
                <p className="text-[11px] leading-snug font-bold">
                  {statusDesc}
                </p>
                {detailsBlock}
              </div>

              {/* Modal Inner Alert Toast */}
              {modalSuccessMsg && (
                <div className="mb-4 bg-black text-emerald-400 border-2 border-emerald-400 p-2.5 shadow-[3px_3px_0px_0px_rgba(5,150,105,0.3)] flex items-center gap-2 text-xs font-extrabold animate-bounce">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>{modalSuccessMsg}</span>
                </div>
              )}

              <div className="space-y-4">
              {/* 1. Store Selector */}
              <div>
                <label className="text-xs font-black uppercase block mb-1 text-black">Target Grocery Store</label>
                <select
                  value={modalStoreKey}
                  onChange={(e) => handleStoreKeyChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs border-2 border-black bg-white font-bold focus:outline-none text-black cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  {Object.entries(getDynamicStoreNames()).map(([key, name]) => {
                    const isConfiguredStore = scrapeConfig?.stores?.[key];
                    const isEnabled = isConfiguredStore ? isConfiguredStore.enabled !== false : true;
                    return (
                      <option key={key} value={key}>
                        {name} {isConfiguredStore ? (isEnabled ? "(Active & Monitored)" : "(Disabled)") : "(Active & Monitored)"}
                      </option>
                    );
                  })}
                </select>
                <span className="text-[9px] text-[#4b5563] font-bold block mt-1.5">
                  ℹ Choose which store dashboard to view, configure, or repair pricing.
                </span>
              </div>

              {/* 2. Direct Lookup Search Helper */}
              <div className="bg-emerald-50/50 border-2 border-black p-3 space-y-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-left">
                <span className="text-[10px] uppercase font-black text-emerald-950 block flex items-center gap-1">
                  <Search className="w-3 h-3" /> Live Price & URL Lookup Helper
                </span>
                <p className="text-[11px] text-emerald-950 leading-tight">
                  Click below to find the product page on {getDynamicStoreNames()[modalStoreKey] || modalStoreKey}. This will automatically copy the item name to your clipboard for search.
                </p>
                <a
                  href={getSearchUrlForStore(modalStoreKey, activePriceCheckItem.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleSearchAndCopyName}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-black uppercase bg-[#059669] hover:bg-emerald-700 text-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-colors font-bold text-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Search {getDynamicStoreNames()[modalStoreKey] || modalStoreKey} (Auto-Copies Name)
                </a>
              </div>

              {/* 3. Paste Direct Product URL */}
              <div>
                <label className="text-xs font-black uppercase block mb-1 text-black">Direct Product URL (Required for automated script)</label>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    placeholder={`Paste ${getDynamicStoreNames()[modalStoreKey] || modalStoreKey} product detail link...`}
                    value={modalUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                  />
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="px-3 bg-gray-100 hover:bg-emerald-50 text-black hover:text-emerald-800 border-2 border-black font-black uppercase text-[10px] tracking-wider transition-all flex items-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                    title="Click to automatically paste and cleanse URL from your clipboard"
                  >
                    <Clipboard className="w-3.5 h-3.5 text-emerald-700" /> Paste URL
                  </button>
                </div>
                <span className="text-[9px] text-gray-500 block mt-1.5 mr-auto text-left w-full">
                  💡 Tip: Any URL pasted or typed is auto-cleaned of tracking queries on the fly!
                </span>
              </div>

              {/* 4. Optional UPC code override */}
              <div className="mb-1">
                <label className="text-xs font-bold uppercase block mb-1 text-gray-550">ID / UPC Override (Optional)</label>
                <input
                  type="text"
                  placeholder="Will auto-parse from URL if left empty"
                  value={modalUpc}
                  onChange={(e) => {
                    setModalUpc(e.target.value);
                    setRepairUpc(e.target.value); // Keep them synchronized for seamless UX
                  }}
                  className="w-full px-3 py-2 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                />
              </div>

              {/* 5. Manual Price Repair Accordion Section */}
              <div className="border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsRepairExpanded(!isRepairExpanded)}
                  className="w-full px-3 py-2 bg-yellow-50 hover:bg-yellow-100 flex items-center justify-between font-black uppercase text-xs text-black border-b-2 border-black transition-colors"
                >
                  <span className="flex items-center gap-1.5 text-amber-800">
                    <Wrench className="w-4 h-4 text-amber-600" />
                    🛠️ Manual Price Edit / Repair
                  </span>
                  {isRepairExpanded ? <ChevronUp className="w-4 h-4 text-black" /> : <ChevronDown className="w-4 h-4 text-black" />}
                </button>

                {isRepairExpanded && (
                  <div className="p-3 bg-white space-y-3 text-left animate-fade-in text-black">
                    <p className="text-[10px] font-bold text-[#4b5563] leading-snug uppercase tracking-wider">
                      Overridden prices are written directly to prices.json for this UPC. Fixed corrupted entries instantly.
                    </p>

                    {/* Scraped / External Name */}
                    <div>
                      <label className="text-[10px] font-black uppercase block mb-1 text-black">Scraped Product Name (External Name)</label>
                      <input
                        type="text"
                        placeholder="e.g. Natrel 1% Lactose-Free Milk Fine-Filtered"
                        value={repairExternalName}
                        onChange={(e) => setRepairExternalName(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                      />
                      <span className="text-[9px] text-gray-500 mt-0.5 block">
                        Stores the exact product catalog title matched on the web page.
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-black uppercase block mb-1 text-black">Regular Price ($) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="e.g. 3.49"
                          value={repairRegularPrice}
                          onChange={(e) => setRepairRegularPrice(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-black uppercase text-black">Sale Price ($)</label>
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={repairIsOnSale}
                              onChange={(e) => setRepairIsOnSale(e.target.checked)}
                              className="accent-black w-3.5 h-3.5 border-2 border-black cursor-pointer"
                            />
                            <span className="text-[9px] font-black uppercase text-red-650">On Sale</span>
                          </label>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.00"
                          placeholder={repairIsOnSale ? "e.g. 2.49" : "N/A - Check 'On Sale'"}
                          disabled={!repairIsOnSale}
                          value={repairSalePrice}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRepairSalePrice(val);
                            if (val && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
                              setRepairIsOnSale(true);
                            }
                          }}
                          className={`w-full px-2.5 py-1.5 text-xs border-2 border-black focus:outline-none font-bold text-black ${
                            !repairIsOnSale ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300" : "bg-white"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Sale End Date / Valid Until */}
                    <div className={repairIsOnSale ? "opacity-100 transition-opacity" : "opacity-50 transition-opacity"}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-black uppercase text-black flex items-center gap-1">
                          Sale End Date (Valid Until) {repairIsOnSale && <span className="text-red-500 font-bold">*</span>}
                        </label>
                        {repairIsOnSale && (
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              const day = d.getDay();
                              const daysToWednesday = (3 - day + 7) % 7 || 7;
                              d.setDate(d.getDate() + daysToWednesday);
                              const yyyy = d.getFullYear();
                              const mm = String(d.getMonth() + 1).padStart(2, '0');
                              const dd = String(d.getDate()).padStart(2, '0');
                              setRepairValidUntil(`${yyyy}-${mm}-${dd}`);
                            }}
                            className="text-[9px] px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border-2 border-black font-black uppercase transition-colors"
                          >
                            📅 Flyer Wednesday
                          </button>
                        )}
                      </div>
                      <input
                        type="date"
                        disabled={!repairIsOnSale}
                        value={repairValidUntil}
                        onChange={(e) => setRepairValidUntil(e.target.value)}
                        className={`w-full px-2.5 py-1.5 text-xs border-2 border-black focus:outline-none font-bold text-black ${
                          !repairIsOnSale ? "bg-gray-100 text-gray-400 cursor-not-allowed border-gray-300" : "bg-white"
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="text-[10px] font-black uppercase block mb-1 text-black">Associated UPC Code (Required)</label>
                        <input
                          type="text"
                          placeholder="Will auto-fill or use custom UPC"
                          value={repairUpc}
                          onChange={(e) => setRepairUpc(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-mono text-black"
                        />
                      </div>
                    </div>

                    {/* Track weekly pricing toggle */}
                    <div className="flex items-center gap-2 pt-1 pb-1">
                      <input
                        type="checkbox"
                        id="track_pricing_checkbox"
                        checked={repairTrackPricing}
                        onChange={(e) => setRepairTrackPricing(e.target.checked)}
                        className="accent-black w-4 h-4 border-2 border-black cursor-pointer"
                      />
                      <label htmlFor="track_pricing_checkbox" className="text-xs font-black uppercase text-black select-none cursor-pointer flex items-center gap-1.5">
                        ⭐ Track pricing weekly for this item
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveManualPriceRepair}
                      className="w-full py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-black font-black uppercase tracking-wider text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all inline-flex items-center justify-center gap-1"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Manual Price Override
                    </button>
                  </div>
                )}
              </div>

              {/* Controls Row */}
              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t-2 border-black">
                <button
                  onClick={() => handleSavePriceCheckUrl(modalUrl, modalUpc)}
                  disabled={!modalUrl.trim()}
                  className="flex-1 py-1.5 text-xs bg-black text-white hover:bg-[#059669] border-2 border-black font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-center inline-flex items-center justify-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                >
                  <Save className="w-3.5 h-3.5" /> Save to Script
                </button>

                {scrapeConfig?.items?.some((sc: any) => sc.name.toLowerCase() === activePriceCheckItem.name.toLowerCase() && sc.stores?.[modalStoreKey]?.url) && (
                  <button
                    onClick={handleDeletePriceCheckUrl}
                    className="py-1.5 px-3 text-xs bg-white text-red-655 hover:bg-red-50 border-2 border-black text-red-600 font-black uppercase tracking-wider transition-colors inline-flex items-center justify-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" /> Delete URL
                  </button>
                )}

                <button
                  onClick={() => setActivePriceCheckItem(null)}
                  className="py-1.5 px-4 text-xs bg-white text-black hover:bg-gray-100 border-2 border-black font-black uppercase tracking-wider transition-colors text-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      );
      })()}
    </div>
  );
}
