import { useState, useEffect, useMemo } from "react";
import Link from "@/components/Link";
import { RegularItem, ScrapeConfig, ScrapeItemConfig, ScrapeStoreConfig } from "@/lib/types";
import CsvUpload from "@/components/CsvUpload";
import JsonPricesUpload from "@/components/JsonPricesUpload";
import GoogleDriveBackup from "@/components/GoogleDriveBackup";
import { getCategoryOrderIndex, CATEGORY_ORDER } from "@/lib/categories";
import { getAutoSaveEnabled, setAutoSaveEnabled } from "@/lib/client/settings";
import { 
  Edit2, 
  Trash2, 
  Plus, 
  Check, 
  X, 
  Search, 
  ShoppingBag, 
  Tag, 
  ExternalLink, 
  HelpCircle,
  Database,
  Link as LinkIcon,
  CircleAlert,
  Save,
  Grid,
  Play,
  Square,
  Terminal,
  Image,
  Eye,
  RefreshCw,
  Store,
  Download
} from "lucide-react";

const getSearchUrlForStore = (storeKey: string, itemName: string, scrapeConfig?: any) => {
  const enc = encodeURIComponent(itemName);
  const store = scrapeConfig?.stores?.[storeKey];
  if (store) {
    if (store.base_url) {
      if (storeKey === "foodbasics") return `https://www.foodbasics.ca/search?searchItem=${enc}`;
      if (storeKey === "metro") return `https://www.metro.ca/en/search?filter=${enc}`;
      if (storeKey === "loblaws") return `https://www.loblaws.ca/search?search-bar=${enc}`;
      if (storeKey === "nofrills") return `https://www.nofrills.ca/search?search-bar=${enc}`;
      if (storeKey === "freshco") return `https://freshco.com/search?q=${enc}`;
      return `${store.base_url}/search?q=${enc}`;
    }
  }
  switch (storeKey) {
    case "foodbasics": return `https://www.foodbasics.ca/search?searchItem=${enc}`;
    case "metro": return `https://www.metro.ca/en/search?filter=${enc}`;
    case "loblaws": return `https://www.loblaws.ca/search?search-bar=${enc}`;
    case "nofrills": return `https://www.nofrills.ca/search?search-bar=${enc}`;
    case "freshco": return `https://freshco.com/search?q=${enc}`;
    default: return `https://www.google.com/search?q=${encodeURIComponent(itemName + ' ' + storeKey)}`;
  }
};

const getStoreDisplayNameDef = (scrapeConfig: any, storeKey: string) => {
  const store = scrapeConfig?.stores?.[storeKey];
  if (store?.store_name) return store.store_name;
  const names: Record<string, string> = {
    foodbasics: "Food Basics",
    metro: "Metro",
    loblaws: "Loblaws",
    nofrills: "No Frills",
    freshco: "FreshCo",
    yourindependentgrocer: "Your Independent Grocer"
  };
  return names[storeKey] || storeKey;
};

const getStoreDisplayName = (storeKey: string) => {
  const names: Record<string, string> = {
    foodbasics: "Food Basics",
    metro: "Metro",
    loblaws: "Loblaws",
    nofrills: "No Frills",
    freshco: "FreshCo",
    yourindependentgrocer: "Your Independent Grocer"
  };
  return names[storeKey] || storeKey;
};

const ensureHttps = (url: string): string => {
  if (!url) return "";
  let trimmed = url.trim();
  // Strip quotes and backslashes
  trimmed = trimmed.replace(/["\\']/g, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const getNormalizedStoreKey = (storeId: string) => {
  if (!storeId) return "foodbasics";
  const s = storeId.toLowerCase();
  if (s === "7923194" || s === "foodbasics") return "foodbasics";
  return s;
};

const isSaleExpiredAdmin = (validUntil?: string | null): boolean => {
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
};

const storeNames: Record<string, string> = {
  foodbasics: "Food Basics",
  metro: "Metro",
  loblaws: "Loblaws",
  nofrills: "No Frills",
  freshco: "FreshCo",
  yourindependentgrocer: "Your Independent Grocer"
};

export default function AdminPage() {
  const [items, setItems] = useState<RegularItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSave, setAutoSave] = useState(() =>
    typeof window !== "undefined" ? getAutoSaveEnabled() : false
  );

  // Scrape config state
  const [scrapeConfig, setScrapeConfig] = useState<ScrapeConfig>({ stores: {} });
  const [scrapeLoading, setScrapeLoading] = useState(true);

  // Dynamic store name mapping derived from active scrape configurations & defaults
  const dynamicStoreNames = useMemo(() => {
    const defaults: Record<string, string> = {
      foodbasics: "Food Basics",
      metro: "Metro",
      loblaws: "Loblaws",
      nofrills: "No Frills",
      freshco: "FreshCo",
      yourindependentgrocer: "Your Independent Grocer"
    };
    if (scrapeConfig?.stores) {
      Object.entries(scrapeConfig.stores).forEach(([key, sObj]: [string, any]) => {
        if (sObj?.store_name) {
          defaults[key] = sObj.store_name;
        }
      });
    }
    return defaults;
  }, [scrapeConfig]);
  
  // Adding Scrape Item states (Option 3 integrated)
  const [addingItem, setAddingItem] = useState(false);
  const [newItemMode, setNewItemMode] = useState<"link" | "create">("link");
  const [newScrapeItem, setNewScrapeItem] = useState({ name: "", upc: "", url: "" });
  const [selectedCatalogName, setSelectedCatalogName] = useState("");
  const [newCatalogCategory, setNewCatalogCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [isCreatingCustomCategory, setIsCreatingCustomCategory] = useState(false);
  const [newScrapeStoreKey, setNewScrapeStoreKey] = useState<string>("foodbasics");

  // Store setup CRUD states
  const [addingStore, setAddingStore] = useState(false);
  const [editingStoreKey, setEditingStoreKey] = useState<string | null>(null);
  const [storeForm, setStoreForm] = useState({
    key: "",
    store_name: "",
    base_url: "",
    postal_code: "K7H3C6",
    store_id: "",
    enabled: true
  });

  // Editing Scrape Item states
  const [editingScrapeUpc, setEditingScrapeUpc] = useState<string | null>(null);
  const [editingScrapeStoreKey, setEditingScrapeStoreKey] = useState<string>("foodbasics");
  const [editScrapeForm, setEditScrapeForm] = useState({ name: "", url: "", upc: "" });
  const [editScrapeItemMode, setEditScrapeItemMode] = useState<"link" | "create">("link");
  const [editSelectedCatalogName, setEditSelectedCatalogName] = useState("");
  const [editNewCatalogCategory, setEditNewCatalogCategory] = useState("");
  const [editCustomCategory, setEditCustomCategory] = useState("");
  const [editIsCreatingCustomCategory, setEditIsCreatingCustomCategory] = useState(false);

  // Catalog Item Editor states
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [editCatalogName, setEditCatalogName] = useState("");
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [newCatalogItemName, setNewCatalogItemName] = useState("");
  const [newGlobalItemName, setNewGlobalItemName] = useState("");
  const [newGlobalCategory, setNewGlobalCategory] = useState("");
  const [newGlobalCustomCat, setNewGlobalCustomCat] = useState("");
  const [globalCatIsCustom, setGlobalCatIsCustom] = useState(false);
  const [newGlobalUnit, setNewGlobalUnit] = useState("unit");
  const [editCatalogUnit, setEditCatalogUnit] = useState("unit");

  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");

  // Gemini AI Matching States
  const [evaluatingMatch, setEvaluatingMatch] = useState(false);
  const [geminiMatchResult, setGeminiMatchResult] = useState<any>(null);

  // Match test runner states
  const [testRunnerLoading, setTestRunnerLoading] = useState(false);
  const [testRunnerResults, setTestRunnerResults] = useState<any>(null);

  // Match playground interactive state
  const [playgroundScrapedText, setPlaygroundScrapedText] = useState("");
  const [playgroundResult, setPlaygroundResult] = useState<any>(null);
  const [playgroundLoading, setPlaygroundLoading] = useState(false);

  const runAllMatchTestsInUI = async () => {
    setTestRunnerLoading(true);
    try {
      const response = await fetch("/api/match/run-tests", {
        method: "POST"
      });
      if (response.ok) {
        const data = await response.json();
        setTestRunnerResults(data);
        showVisualMessage(`Successfully executed all ${data.total} matching test cases!`);
      } else {
        alert("Failed to run matching test cases.");
      }
    } catch (err) {
      console.error("Test runner failed:", err);
      alert("Error calling match test runner endpoint.");
    } finally {
      setTestRunnerLoading(false);
    }
  };

  const evaluatePlaygroundMatch = async (scrapedName: string) => {
    if (!scrapedName.trim()) {
      alert("Please enter a scraped product name to test.");
      return;
    }
    setPlaygroundLoading(true);
    setPlaygroundResult(null);
    try {
      const response = await fetch("/api/match/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scrapedName }),
      });
      if (response.ok) {
        const data = await response.json();
        setPlaygroundResult(data);
      } else {
        alert("Evaluation request failed.");
      }
    } catch (err) {
      console.error("Playground evaluation error:", err);
      alert("Error occurred while classifying playground match.");
    } finally {
      setPlaygroundLoading(false);
    }
  };

  const triggerGeminiDiagnostic = async (scrapedName: string) => {
    setEvaluatingMatch(true);
    setGeminiMatchResult(null);
    try {
      const response = await fetch("/api/match/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scrapedName }),
      });
      if (response.ok) {
        const data = await response.json();
        setGeminiMatchResult(data);
      }
    } catch (err) {
      console.error("Error during edit analysis:", err);
    } finally {
      setEvaluatingMatch(false);
    }
  };

  // Prices list state and form states
  const [prices, setPrices] = useState<Record<string, any>>({});
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesSearch, setPricesSearch] = useState("");
  const [editingPriceUpc, setEditingPriceUpc] = useState<string | null>(null);
  const [addingPrice, setAddingPrice] = useState(false);
  const [originalStoreId, setOriginalStoreId] = useState<string>("");
  const [priceForm, setPriceForm] = useState({
    upc: "",
    item_name: "",
    config_name: "",
    store_name: "Food Basics",
    postal_code: "K7H3C6",
    store_id: "7923194",
    regular_price: "",
    sale_price: "",
    is_on_sale: false,
    lookup_url: "",
    valid_until: ""
  });

  // Combined Catalog Manager State
  const [catalog, setCatalog] = useState<any>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogScrapedFilter, setCatalogScrapedFilter] = useState("all");
  const [catalogSaleFilter, setCatalogSaleFilter] = useState("all");
  const [catalogTrackedFilter, setCatalogTrackedFilter] = useState("all");

  const [editingCatalogItem, setEditingCatalogItem] = useState<any>(null);
  const [selectedCatalogStore, setSelectedCatalogStore] = useState<string>("foodbasics");
  const [catalogItemForm, setCatalogItemForm] = useState<any>({
    id: "",
    name: "",
    category: "grocery",
    unit: "unit",
    requires_scraping: false,
    stores: {},
    editStore: {
      url: "",
      upc: "",
      regular_price: "",
      sale_price: "",
      is_on_sale: false,
      valid_until: "",
      track_pricing: false,
      external_name: ""
    }
  });

  // Scraper console states
  const [scraperStatus, setScraperStatus] = useState<{
    isRunning: boolean;
    logs: string[];
    exitCode: number | null;
    screenshots: string[];
  }>({
    isRunning: false,
    logs: [],
    exitCode: null,
    screenshots: [],
  });
  const [testUrl, setTestUrl] = useState("");
  const [scanLimit, setScanLimit] = useState<number>(2);
  const [activeScreenshot, setActiveScreenshot] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchScraperStatus = async () => {
    try {
      const res = await fetch("/api/scraper/status");
      if (res.ok) {
        const data = await res.json();
        setScraperStatus(data);
        return data;
      }
    } catch (err) {
      console.error("Failed to fetch scraper status:", err);
    }
    return null;
  };

  useEffect(() => {
    fetchScraperStatus();
  }, []);

  // Polling loop when running
  useEffect(() => {
    let timer: any = null;
    if (scraperStatus.isRunning) {
      timer = setInterval(async () => {
        const data = await fetchScraperStatus();
        if (data && !data.isRunning) {
          clearInterval(timer);
        }
      }, 1500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [scraperStatus.isRunning]);

  const handleStartScraper = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/scraper/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testUrl: testUrl.trim() || undefined,
          limit: scanLimit,
        }),
      });
      if (res.ok) {
        await fetchScraperStatus();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to start scraper");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStopScraper = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch("/api/scraper/stop", { method: "POST" });
      if (res.ok) {
        await fetchScraperStatus();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAutoSaveToggle = () => {
    const newValue = !autoSave;
    setAutoSave(newValue);
    setAutoSaveEnabled(newValue);
  };

  const fetchItems = async () => {
    try {
      const res = await fetch("/api/regular-items");
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const fetchPrices = async () => {
    try {
      const res = await fetch("/api/prices");
      if (res.ok) {
        const data = await res.json();
        setPrices(data.prices || {});
      }
    } catch (err) {
      console.error("Failed to fetch prices:", err);
    } finally {
      setPricesLoading(false);
    }
  };

  const handlePricesUploaded = async () => {
    await Promise.all([fetchItems(), fetchPrices()]);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [itemsRes, configRes, pricesRes, catalogRes] = await Promise.all([
          fetch("/api/regular-items"),
          fetch("/api/scrape-config"),
          fetch("/api/prices"),
          fetch("/api/catalog"),
        ]);
        const itemsData = await itemsRes.json();
        const configData = await configRes.json();
        const pricesData = await pricesRes.json();
        const catalogData = await catalogRes.json();
        if (!cancelled) {
          setItems(itemsData.items || []);
          const normalizedConfig = ensureDefaultStores(configData);
          setScrapeConfig(normalizedConfig);
          setPrices(pricesData.prices || {});
          setCatalog(catalogData || { stores: {}, items: [] });
        }
      } catch (err) {
        console.error("Error loading admin system datasets:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setScrapeLoading(false);
          setPricesLoading(false);
          setCatalogLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchCatalog = async () => {
    try {
      setCatalogLoading(true);
      const res = await fetch("/api/catalog");
      if (res.ok) {
        const data = await res.json();
        setCatalog(data || { stores: {}, items: [] });
      }
    } catch (err) {
      console.error("Failed to fetch catalog:", err);
    } finally {
      setCatalogLoading(false);
    }
  };

  const saveCatalog = async (updatedCatalog: any) => {
    try {
      setCatalogLoading(true);
      const response = await fetch("/api/catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedCatalog),
      });
      if (response.ok) {
        const data = await response.json();
        setCatalog(data.catalog || updatedCatalog);
        showVisualMessage("Combined catalog saved successfully!");
        return true;
      } else {
        showVisualMessage("Failed to save combined catalog to server");
      }
    } catch (err) {
      console.error("Error saving catalog:", err);
      showVisualMessage("Failed to save combined catalog to server");
    } finally {
      setCatalogLoading(false);
    }
    return false;
  };

  const [isAddingCatalogItem, setIsAddingCatalogItem] = useState(false);
  const [visibleCatalogCount, setVisibleCatalogCount] = useState(30);

  const handleOpenEditCatalog = (item: any) => {
    setIsAddingCatalogItem(false);
    setEditingCatalogItem(item);
    
    // Choose first store key if stores exist, otherwise default to "foodbasics"
    const existingStoreKeys = Object.keys(item.stores || {});
    const initialStore = existingStoreKeys.length > 0 ? existingStoreKeys[0] : "foodbasics";
    setSelectedCatalogStore(initialStore);
    
    const sanitizedStores = JSON.parse(JSON.stringify(item.stores || {}));
    for (const storeKey of Object.keys(sanitizedStores)) {
      if (sanitizedStores[storeKey] && sanitizedStores[storeKey].url) {
        sanitizedStores[storeKey].url = ensureHttps(sanitizedStores[storeKey].url);
      }
    }
    
    setCatalogItemForm({
      id: item.id || "",
      name: item.name || "",
      category: item.category || "grocery",
      unit: item.unit || "unit",
      requires_scraping: item.requires_scraping === true,
      stores: sanitizedStores
    });
  };

  const handleOpenAddCatalog = () => {
    setIsAddingCatalogItem(true);
    setEditingCatalogItem(null);
    setSelectedCatalogStore("foodbasics");
    setCatalogItemForm({
      id: `catalog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: "",
      category: "grocery",
      unit: "unit",
      requires_scraping: false,
      stores: {}
    });
  };

  const handleStoreFieldChange = (field: string, val: any) => {
    setCatalogItemForm((prev: any) => {
      const updatedStores = { ...prev.stores };
      const defaultStoreObj = {
        url: "",
        upc: "",
        regular_price: "",
        sale_price: "",
        is_on_sale: false,
        valid_until: "",
        track_pricing: true,
        external_name: "",
        is_verified: false
      };
      const currentStore = {
        ...defaultStoreObj,
        ...(updatedStores[selectedCatalogStore] || {})
      };
      updatedStores[selectedCatalogStore] = {
        ...currentStore,
        [field]: val
      };
      return {
        ...prev,
        stores: updatedStores
      };
    });
  };

  const removeStoreFromItem = (storeKey: string) => {
    if (confirm(`Remove store-specific price rules & tracking for "${storeKey}" on this item?`)) {
      setCatalogItemForm((prev: any) => {
        const updatedStores = { ...prev.stores };
        delete updatedStores[storeKey];
        return {
          ...prev,
          stores: updatedStores
        };
      });
      showVisualMessage(`Store "${storeKey}" config removed from form. Apply changes by clicking "Save Catalog Product Entry".`);
    }
  };

  const deleteCatalogItem = async (itemId: string, itemName: string) => {
    if (confirm(`Are you sure you want to completely delete the catalog item "${itemName}"? This will prune all store-specific metadata, URLs, and scraper configurations.`)) {
      if (!catalog) return;
      const updatedItems = catalog.items.filter((item: any) => item.id !== itemId);
      const updatedCatalog = { ...catalog, items: updatedItems };
      await saveCatalog(updatedCatalog);
    }
  };

  const saveCatalogItemSubmit = async (e: any) => {
    e.preventDefault();
    if (!catalogItemForm.name.trim()) {
      showVisualMessage("Product Name is required!");
      return;
    }

    if (!catalog) return;

    // Standardize catalog item entries
    const newItem = {
      id: catalogItemForm.id || `catalog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: catalogItemForm.name.trim(),
      category: catalogItemForm.category || "grocery",
      unit: catalogItemForm.unit || "unit",
      requires_scraping: !!catalogItemForm.requires_scraping,
      stores: {} as Record<string, any>
    };

    // Clean pricing fields inside stores dictionary
    for (const [storeKey, storeDetails] of Object.entries(catalogItemForm.stores)) {
      const s = storeDetails as any;
      
      const regPrice = typeof s.regular_price === "number" ? s.regular_price : 
                       (s.regular_price && String(s.regular_price).trim() !== "" ? parseFloat(s.regular_price) : null);
      
      const salePrice = typeof s.sale_price === "number" ? s.sale_price : 
                        (s.sale_price && String(s.sale_price).trim() !== "" ? parseFloat(s.sale_price) : null);
      
      const isOnSale = s.is_on_sale === true || s.is_on_sale === 1 || String(s.is_on_sale) === "true" ? 1 : 0;
      const trackPricing = s.track_pricing === true || s.track_pricing === 1 || String(s.track_pricing) === "true";
      const isVerified = s.is_verified === true || s.is_verified === 1 || String(s.is_verified) === "true";

      newItem.stores[storeKey] = {
        url: s.url ? ensureHttps(s.url) : "",
        upc: s.upc || "",
        regular_price: isNaN(regPrice as number) ? null : regPrice,
        sale_price: isNaN(salePrice as number) ? null : salePrice,
        is_on_sale: isOnSale,
        valid_until: s.valid_until || "",
        track_pricing: trackPricing,
        external_name: s.external_name || "",
        is_verified: isVerified
      };
    }

    let updatedItems;
    if (editingCatalogItem) {
      updatedItems = catalog.items.map((item: any) => item.id === editingCatalogItem.id ? newItem : item);
    } else {
      updatedItems = [newItem, ...catalog.items];
    }

    const updatedCatalog = { ...catalog, items: updatedItems };
    const success = await saveCatalog(updatedCatalog);
    if (success) {
      setEditingCatalogItem(null);
      setIsAddingCatalogItem(false);
    }
  };

  const saveCatalogItems = async (updatedItems: RegularItem[]) => {
    try {
      const res = await fetch("/api/regular-items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedItems),
      });
      if (res.ok) {
        setItems(updatedItems);
        showVisualMessage("Grocery catalog saved successfully!");
        return true;
      }
    } catch {
      showVisualMessage("Error saving grocery catalog");
    }
    return false;
  };

  const handleClear = async () => {
    if (confirm("Are you sure you want to completely delete all catalog items? This action is irreversible.")) {
      try {
        await fetch("/api/regular-items", { method: "DELETE" });
        setItems([]);
        showVisualMessage("Catalog cleared");
      } catch {
        showVisualMessage("Failed to clear catalog");
      }
    }
  };

  const handleExportCSV = () => {
    try {
      if (items.length === 0) {
        showVisualMessage("No items in the catalog to export");
        return;
      }

      const escapeCSVValue = (val: any) => {
        if (val === null || val === undefined) return "";
        let str = String(val);
        if (/[",\n\r]/.test(str)) {
          str = '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const headers = ["id", "category", "name", "selected", "unit", "linked_to_scrape_config"];
      const csvRows = [headers.join(",")];

      items.forEach(item => {
        const isLinked = (scrapeConfig?.items || []).some(
          ci => ci.name && ci.name.toLowerCase() === item.name.toLowerCase()
        );
        const row = [
          escapeCSVValue(item.id),
          escapeCSVValue(item.category),
          escapeCSVValue(item.name),
          escapeCSVValue(item.selected ? "true" : "false"),
          escapeCSVValue(item.unit || "unit"),
          escapeCSVValue(isLinked ? "true" : "false")
        ];
        csvRows.push(row.join(","));
      });

      const csvString = csvRows.join("\r\n");
      const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `regular_items_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showVisualMessage("Catalog exported successfully!");
    } catch (err: any) {
      console.error("CSV Export error:", err);
      showVisualMessage("Failed to export catalog CSV");
    }
  };

  // Ensure default stores exist in scrape config
  const ensureDefaultStores = (config: ScrapeConfig): ScrapeConfig => {
    const updated = { ...config };
    if (!updated.stores) updated.stores = {};
    
    if (!updated.stores.foodbasics) {
      updated.stores.foodbasics = {
        enabled: true,
        store_name: "Food Basics",
        base_url: "https://www.foodbasics.ca",
        postal_code: "K7H3C6",
        store_id: "7923194",
      };
    }
    if (!updated.stores.metro) {
      updated.stores.metro = {
        enabled: true,
        store_name: "Metro",
        base_url: "https://www.metro.ca",
        postal_code: "K7H3C6",
        store_id: "metro",
      };
    }
    if (!updated.stores.loblaws) {
      updated.stores.loblaws = {
        enabled: true,
        store_name: "Loblaws",
        base_url: "https://www.loblaws.ca",
        postal_code: "K7H3C6",
        store_id: "loblaws",
      };
    }
    if (!updated.stores.nofrills) {
      updated.stores.nofrills = {
        enabled: true,
        store_name: "No Frills",
        base_url: "https://www.nofrills.ca",
        postal_code: "K7H3C6",
        store_id: "nofrills",
      };
    }
    if (!updated.stores.freshco) {
      updated.stores.freshco = {
        enabled: true,
        store_name: "FreshCo",
        base_url: "https://freshco.com",
        postal_code: "K7H3C6",
        store_id: "freshco",
      };
    }
    if (!updated.stores.yourindependentgrocer) {
      updated.stores.yourindependentgrocer = {
        enabled: true,
        store_name: "Your Independent Grocer",
        base_url: "https://www.yourindependentgrocer.ca",
        postal_code: "K7H3C6",
        store_id: "yourindependentgrocer",
      };
    }
    return updated;
  };

  const saveScrapeConfig = async (config: ScrapeConfig) => {
    try {
      await fetch("/api/scrape-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      showVisualMessage("Saved scraper configuration!");
    } catch {
      showVisualMessage("Failed to save scraper config");
    }
  };

  // --- Store setup CRUD handlers ---
  const handleOpenAddStore = () => {
    setEditingStoreKey(null);
    setStoreForm({
      key: "",
      store_name: "",
      base_url: "",
      postal_code: "K7H3C6",
      store_id: "",
      enabled: true
    });
    setAddingStore(true);
  };

  const handleOpenEditStore = (key: string, store: any) => {
    setEditingStoreKey(key);
    setStoreForm({
      key: key,
      store_name: store.store_name || "",
      base_url: store.base_url || "",
      postal_code: store.postal_code || "K7H3C6",
      store_id: store.store_id || "",
      enabled: store.enabled !== false
    });
    setAddingStore(true);
  };

  const handleSaveStoreSubmit = async (e: any) => {
    e.preventDefault();
    const rawKey = storeForm.key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!rawKey) {
      alert("Store Key (internal code) is required.");
      return;
    }
    if (!storeForm.store_name.trim()) {
      alert("Store Name is required.");
      return;
    }
    if (!storeForm.base_url.trim()) {
      alert("Base Website URL is required.");
      return;
    }

    const config = { ...scrapeConfig };
    if (!config.stores) config.stores = {};

    config.stores[rawKey] = {
      enabled: storeForm.enabled,
      store_name: storeForm.store_name.trim(),
      base_url: ensureHttps(storeForm.base_url),
      postal_code: storeForm.postal_code.trim(),
      store_id: storeForm.store_id.trim() || rawKey,
    };

    setScrapeConfig(config);
    await saveScrapeConfig(config);
    setAddingStore(false);
    setEditingStoreKey(null);
    showVisualMessage(`Store "${storeForm.store_name}" saved successfully!`);
  };

  const handleRemoveStore = async (key: string) => {
    if (key === "foodbasics") {
      alert("Food Basics is the primary core store and cannot be completely deleted.");
      return;
    }
    if (confirm(`Are you sure you want to remove the store configuration for "${key}"? This will not delete scraping links associated with it, but we won't show dynamic lookup tools until the store is configured again.`)) {
      const config = { ...scrapeConfig };
      if (config.stores) {
        delete config.stores[key];
      }
      setScrapeConfig(config);
      await saveScrapeConfig(config);
      showVisualMessage(`Store "${key}" removed.`);
    }
  };

  // --- Mismatch Link creation in scrape_config.json ---
  const handleCreateNewScrapeLinkFromMismatch = async (currentStoreKey: string) => {
    const finalItemName = priceForm.item_name.trim();
    if (!finalItemName) {
      alert("Item name is required.");
      return;
    }

    const config = { ...scrapeConfig };
    if (!config.items) config.items = [];

    // 1. Ensure the store is defined in scrapeConfig.stores
    if (!config.stores) config.stores = {};
    if (!config.stores[currentStoreKey]) {
      const storeNames: Record<string, string> = {
        foodbasics: "Food Basics",
        metro: "Metro",
        loblaws: "Loblaws",
        nofrills: "No Frills",
        freshco: "FreshCo",
        yourindependentgrocer: "Your Independent Grocer"
      };
      const baseUrls: Record<string, string> = {
        foodbasics: "https://www.foodbasics.ca",
        metro: "https://www.metro.ca",
        loblaws: "https://www.loblaws.ca",
        nofrills: "https://www.nofrills.ca",
        freshco: "https://freshco.com",
        yourindependentgrocer: "https://www.yourindependentgrocer.ca"
      };
      config.stores[currentStoreKey] = {
        enabled: true,
        store_name: storeNames[currentStoreKey] || currentStoreKey.charAt(0).toUpperCase() + currentStoreKey.slice(1),
        base_url: baseUrls[currentStoreKey] || `https://www.${currentStoreKey}.com`,
        postal_code: "K7H3C6",
        store_id: currentStoreKey,
      };
    }

    // 2. Build search URL
    const searchUrl = getSearchUrlForStore(currentStoreKey, finalItemName, config);

    // 3. Update or insert item in scrapeConfig.items
    let existingItem = config.items.find(i => i.name.toLowerCase() === finalItemName.toLowerCase());
    const initialUpc = `manual-${Date.now()}`;

    if (existingItem) {
      if (!existingItem.stores) existingItem.stores = {};
      existingItem.stores[currentStoreKey] = {
        url: searchUrl,
        upc: initialUpc
      };
    } else {
      config.items.push({
        name: finalItemName,
        stores: {
          [currentStoreKey]: {
            url: searchUrl,
            upc: initialUpc
          }
        }
      });
    }

    setScrapeConfig(config);
    await saveScrapeConfig(config);

    // Close price editor form (preserving original record in database completely)
    setEditingPriceUpc(null);
    setAddingPrice(false);

    // Automatically trigger edit state in scraper links card below
    setEditingScrapeUpc(finalItemName);
    setEditingScrapeStoreKey(currentStoreKey);
    setEditScrapeForm({
      name: finalItemName,
      url: searchUrl,
      upc: initialUpc
    });
    setEditScrapeItemMode("link");
    setEditSelectedCatalogName(finalItemName);

    showVisualMessage(`Created new configuration link for "${finalItemName}" under ${getStoreDisplayNameDef(config, currentStoreKey)}! Complete search configuration below.`);
  };

  const showVisualMessage = (msg: string) => {
    setScrapeMsg(msg);
    setTimeout(() => setScrapeMsg(null), 3000);
  };

  // Catalog CRUD Functions
  const handleAddCatalogItem = async (categoryName: string, itemName: string) => {
    const trimmed = itemName.trim();
    if (!trimmed) return;
    
    // Check if duplicate in catalog
    if (items.some(i => i.name.toLowerCase() === trimmed.toLowerCase())) {
      showVisualMessage(`"${trimmed}" already exists in catalog.`);
      return;
    }

    const newItem: RegularItem = {
      id: `regular-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: categoryName,
      name: trimmed,
      selected: false,
    };

    const updated = [...items, newItem];
    if (await saveCatalogItems(updated)) {
      setNewCatalogItemName("");
      setAddingToCategory(null);
    }
  };

  const handleCreateGlobalItem = async () => {
    const trimmedFormName = newGlobalItemName.trim();
    if (!trimmedFormName) return;

    let targetCategory = newGlobalCategory;
    if (globalCatIsCustom) {
      targetCategory = newGlobalCustomCat.trim();
    }

    if (!targetCategory) {
      alert("Please select or enter a category name");
      return;
    }

    const newItem: RegularItem = {
      id: `regular-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: targetCategory,
      name: trimmedFormName,
      selected: false,
      unit: newGlobalUnit,
    };

    const updated = [...items, newItem];
    if (await saveCatalogItems(updated)) {
      setNewGlobalItemName("");
      setNewGlobalCategory("");
      setNewGlobalCustomCat("");
      setGlobalCatIsCustom(false);
      setNewGlobalUnit("unit");
    }
  };

  const handleOpenAddPrice = () => {
    setOriginalStoreId("");
    setPriceForm({
      upc: "",
      item_name: "",
      config_name: "",
      store_name: "Food Basics",
      postal_code: "K7H3C6",
      store_id: "7923194",
      regular_price: "",
      sale_price: "",
      is_on_sale: false,
      lookup_url: "",
      valid_until: ""
    });
    setEditingPriceUpc(null);
    setAddingPrice(true);
  };

  const handleOpenEditPrice = (upc: string, entry: any) => {
    const sId = entry.store_id || "7923194";
    setOriginalStoreId(sId);
    setPriceForm({
      upc: upc,
      item_name: entry.item_name || "",
      config_name: entry.config_name || "",
      store_name: entry.store_name || "Food Basics",
      postal_code: entry.postal_code || "K7H3C6",
      store_id: sId,
      regular_price: entry.regular_price !== null && entry.regular_price !== undefined ? String(entry.regular_price) : "",
      sale_price: entry.sale_price !== null && entry.sale_price !== undefined ? String(entry.sale_price) : "",
      is_on_sale: entry.is_on_sale === 1,
      lookup_url: entry.lookup_url || "",
      valid_until: entry.valid_until || ""
    });
    setEditingPriceUpc(upc);
    setAddingPrice(true);
  };

  const handleDeletePrice = async (upc: string) => {
    if (confirm(`Are you sure you want to delete the price entry for UPC "${upc}"?`)) {
      try {
        const res = await fetch(`/api/admin/prices/${encodeURIComponent(upc)}`, {
          method: "DELETE"
        });
        if (res.ok) {
          const data = await res.json();
          setPrices(data.prices || {});
        } else {
          alert("Failed to delete price entry.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to delete price entry.");
      }
    }
  };

  const handleClearAllPrices = async () => {
    if (confirm("WARNING: Are you sure you want to completely clear ALL prices from the config database? This cannot be undone.")) {
      try {
        const res = await fetch("/api/admin/prices", {
          method: "DELETE"
        });
        if (res.ok) {
          setPrices({});
          alert("All prices cleared successfully.");
        } else {
          alert("Failed to clear prices.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to clear prices.");
      }
    }
  };

  const handleSavePriceFormSubmit = async (e: any) => {
    e.preventDefault();
    const upcToUse = priceForm.upc.trim();
    if (!upcToUse) {
      alert("UPC is required.");
      return;
    }

    const normalizedCurrentStoreKey = getNormalizedStoreKey(priceForm.store_id);
    const normalizedOriginalStoreKey = originalStoreId ? getNormalizedStoreKey(originalStoreId) : "";
    const isStoreChanged = normalizedOriginalStoreKey && normalizedCurrentStoreKey !== normalizedOriginalStoreKey;
    if (isStoreChanged) {
      alert("Store has been changed. To maintain price records integrity, standard updates are disabled. Please use the 'Create Scraper Config & Link' button in the warning box above to safe-create a new scraper configuration link instead.");
      return;
    }

    const regPriceParsed = parseFloat(priceForm.regular_price);
    const salePriceParsed = parseFloat(priceForm.sale_price);

    const payload = {
      upc: upcToUse,
      item: {
        item_name: priceForm.item_name.trim(),
        config_name: priceForm.config_name.trim() || priceForm.item_name.trim(),
        store_name: priceForm.store_name,
        postal_code: priceForm.postal_code,
        store_id: priceForm.store_id,
        regular_price: isNaN(regPriceParsed) ? null : regPriceParsed,
        sale_price: isNaN(salePriceParsed) ? null : salePriceParsed,
        is_on_sale: priceForm.is_on_sale ? 1 : 0,
        lookup_url: ensureHttps(priceForm.lookup_url),
        valid_until: priceForm.valid_until.trim(),
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
        const data = await res.json();
        setPrices(data.prices || {});
        setAddingPrice(false);
        setEditingPriceUpc(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to save price entry.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save price entry.");
    }
  };

  const handleStartEditCatalog = (item: RegularItem) => {
    setEditingCatalogId(item.id);
    setEditCatalogName(item.name);
    setEditCatalogUnit(item.unit || "unit");
  };

  const handleEditCatalogItemSubmit = async (id: string) => {
    const trimmed = editCatalogName.trim();
    if (!trimmed) {
      setEditingCatalogId(null);
      return;
    }

    const updated = items.map(item => 
      item.id === id ? { ...item, name: trimmed, unit: editCatalogUnit } : item
    );

    if (await saveCatalogItems(updated)) {
      setEditingCatalogId(null);
    }
  };

  const handleDeleteCatalogItem = async (id: string) => {
    const itemToDelete = items.find(i => i.id === id);
    if (!itemToDelete) return;

    if (confirm(`Are you sure you want to delete "${itemToDelete.name}" from the catalog?`)) {
      const updated = items.filter(item => item.id !== id);
      await saveCatalogItems(updated);
    }
  };

  // Price Checked Scraper CRUD with Catalog Autocreation (Option 3)
  const handleAddScrapeItem = async () => {
    let finalItemName = "";

    if (newItemMode === "link") {
      if (!selectedCatalogName) {
        alert("Please select a catalog item to link.");
        return;
      }
      finalItemName = selectedCatalogName;
    } else {
      if (!newScrapeItem.name.trim()) {
        alert("Please write a product name.");
        return;
      }
      finalItemName = newScrapeItem.name.trim();

      // Check if we need to auto-create inside catalog
      const alreadyExists = items.some(item => item.name.toLowerCase() === finalItemName.toLowerCase());
      if (!alreadyExists) {
        let cat = newCatalogCategory;
        if (isCreatingCustomCategory) {
          cat = customCategory.trim();
        }
        if (!cat) {
          alert("Please specify a category for the new catalog item.");
          return;
        }

        // Add to catalog items first
        const newCatalogItem: RegularItem = {
          id: `regular-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          category: cat,
          name: finalItemName,
          selected: false,
        };
        const updatedCat = [...items, newCatalogItem];
        const success = await saveCatalogItems(updatedCat);
        if (!success) {
          alert("Failed to create the associated catalog item. Catalog update aborted.");
          return;
        }
      }
    }

    if (!newScrapeItem.url.trim()) {
      alert("Please specify product page URL.");
      return;
    }

    const config = { ...scrapeConfig };
    if (!config.items) config.items = [];

    // Ensure store meta setup is present
    if (!config.stores) config.stores = {};
    const storeKey = newScrapeStoreKey;

    const storeNames: Record<string, string> = {
      foodbasics: "Food Basics",
      metro: "Metro",
      loblaws: "Loblaws",
      nofrills: "No Frills",
      freshco: "FreshCo",
      yourindependentgrocer: "Your Independent Grocer"
    };
    const baseUrls: Record<string, string> = {
      foodbasics: "https://www.foodbasics.ca",
      metro: "https://www.metro.ca",
      loblaws: "https://www.loblaws.ca",
      nofrills: "https://www.nofrills.ca",
      freshco: "https://freshco.com",
      yourindependentgrocer: "https://www.yourindependentgrocer.ca"
    };

    if (!config.stores[storeKey]) {
      config.stores[storeKey] = {
        enabled: true,
        store_name: storeNames[storeKey] || storeKey,
        base_url: baseUrls[storeKey] || "",
        postal_code: "K7H3C6",
        store_id: storeKey,
      };
    }

    // Check if UPC exists already in scraper
    let upc = newScrapeItem.upc.trim();
    if (!upc) {
      const match = newScrapeItem.url.match(/\/p\/(\d+)/);
      upc = match ? match[1] : `manual-${Date.now()}`;
    }

    // Update or insert item in unified scraper config
    let existingItem = config.items.find(i => i.name.toLowerCase() === finalItemName.toLowerCase());
    if (existingItem) {
      if (!existingItem.stores) existingItem.stores = {};
      existingItem.stores[storeKey] = {
        url: ensureHttps(newScrapeItem.url),
        upc,
      };
    } else {
      config.items.push({
        name: finalItemName,
        stores: {
          [storeKey]: {
            url: ensureHttps(newScrapeItem.url),
            upc,
          }
        }
      });
    }

    setScrapeConfig(config);
    await saveScrapeConfig(config);

    // Reset forms
    setNewScrapeItem({ name: "", upc: "", url: "" });
    setSelectedCatalogName("");
    setNewCatalogCategory("");
    setCustomCategory("");
    setIsCreatingCustomCategory(false);
    setAddingItem(false);
  };

  const handleStartEditScrapeItem = (item: any, storeKey: string) => {
    // Use item name to map edition context
    setEditingScrapeUpc(item.name);
    setEditingScrapeStoreKey(storeKey);
    setEditScrapeForm({
      name: item.name,
      url: item.url,
      upc: item.upc,
    });
    
    // Check if matches Catalog Item Name
    const matchingCatalog = items.find(i => i.name.toLowerCase() === item.name.toLowerCase());
    if (matchingCatalog) {
      setEditScrapeItemMode("link");
      setEditSelectedCatalogName(matchingCatalog.name);
    } else {
      setEditScrapeItemMode("create");
      setEditSelectedCatalogName("");
    }
    setEditNewCatalogCategory("");
    setEditCustomCategory("");
    setEditIsCreatingCustomCategory(false);
    triggerGeminiDiagnostic(item.name);
  };

  const handleSaveScrapeItemEditSubmit = async () => {
    let finalItemName = "";

    if (editScrapeItemMode === "link") {
      if (!editSelectedCatalogName) {
        alert("Please select a catalog item to link.");
        return;
      }
      finalItemName = editSelectedCatalogName;
    } else {
      if (!editScrapeForm.name.trim()) {
        alert("Please specify product name.");
        return;
      }
      finalItemName = editScrapeForm.name.trim();

      // Check if we need to auto-create inside catalog
      const alreadyExists = items.some(item => item.name.toLowerCase() === finalItemName.toLowerCase());
      if (!alreadyExists) {
        let cat = editNewCatalogCategory;
        if (editIsCreatingCustomCategory) {
          cat = editCustomCategory.trim();
        }
        if (!cat) {
          alert("Please specify a category for the new catalog item.");
          return;
        }

        const newCatalogItem: RegularItem = {
          id: `regular-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          category: cat,
          name: finalItemName,
          selected: false,
        };
        const updatedCat = [...items, newCatalogItem];
        const success = await saveCatalogItems(updatedCat);
        if (!success) {
          alert("Failed to auto-create catalog item.");
          return;
        }
      }
    }

    if (!editScrapeForm.url.trim()) {
      alert("Please specify the Food Basics page URL.");
      return;
    }

    const config = { ...scrapeConfig };
    if (!config.items) config.items = [];

    let finalUpc = editScrapeForm.upc.trim();
    if (!finalUpc) {
      const match = editScrapeForm.url.match(/\/p\/(\d+)/);
      finalUpc = match ? match[1] : `manual-${Date.now()}`;
    }

    // First, find the original item configuration using original name (stored in editingScrapeUpc)
    let itemConfig = config.items.find(i => i.name === editingScrapeUpc);
    
    if (itemConfig) {
      // If name changed, rename or merge with existing
      if (itemConfig.name !== finalItemName) {
        const conflict = config.items.find(i => i.name.toLowerCase() === finalItemName.toLowerCase() && i.name !== editingScrapeUpc);
        if (conflict) {
          conflict.stores[editingScrapeStoreKey] = {
            url: ensureHttps(editScrapeForm.url),
            upc: finalUpc,
          };
          config.items = config.items.filter(i => i.name !== editingScrapeUpc);
        } else {
          itemConfig.name = finalItemName;
          itemConfig.stores[editingScrapeStoreKey] = {
            url: ensureHttps(editScrapeForm.url),
            upc: finalUpc,
          };
        }
      } else {
        itemConfig.stores[editingScrapeStoreKey] = {
          url: ensureHttps(editScrapeForm.url),
          upc: finalUpc,
        };
      }
    } else {
      // Create new config item entry
      config.items.push({
        name: finalItemName,
        stores: {
          [editingScrapeStoreKey]: {
            url: ensureHttps(editScrapeForm.url),
            upc: finalUpc,
          }
        }
      });
    }

    setScrapeConfig(config);
    await saveScrapeConfig(config);
    setEditingScrapeUpc(null);
  };

  const handleRemoveScrapeItem = async (storeKey: string, itemName: string) => {
    if (confirm(`Remove the ${storeKey} link for "${itemName}" from the Combined Catalog Registry configuration?`)) {
      const config = { ...scrapeConfig };
      if (!config.items) config.items = [];

      const itemConfig = config.items.find(i => i.name === itemName);
      if (itemConfig) {
        delete itemConfig.stores[storeKey];
        if (Object.keys(itemConfig.stores).length === 0) {
          config.items = config.items.filter(i => i.name !== itemName);
        }
      }

      setScrapeConfig(config);
      await saveScrapeConfig(config);
    }
  };

  const allScrapeItems = (scrapeConfig.items || []).flatMap((item: any) => {
    return Object.entries(item.stores).map(([storeKey, linkVal]: [string, any]) => {
      const storeMeta = scrapeConfig.stores[storeKey] || { store_name: storeKey };
      return {
        name: item.name,
        storeKey,
        storeName: storeMeta.store_name,
        upc: linkVal.upc,
        url: linkVal.url,
      };
    });
  });

  // Derive catalog categories list
  const categoriesList = Array.from(new Set(items.map(item => item.category)))
    .sort((a, b) => getCategoryOrderIndex(a as string) - getCategoryOrderIndex(b as string));

  // Group catalog items alphabetically
  const categories = items.reduce<Record<string, RegularItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, RegularItem[]>);

  // Apply search filtering on catalog items
  const filteredCategories = (Object.entries(categories) as [string, RegularItem[]][]).reduce<Record<string, RegularItem[]>>((acc, [category, categoryItems]) => {
    const matched = categoryItems.filter(item => 
      item.name.toLowerCase().includes(catalogSearch.toLowerCase()) || 
      category.toLowerCase().includes(catalogSearch.toLowerCase())
    );
    if (matched.length > 0) {
      acc[category] = matched.sort((a, b) => a.name.localeCompare(b.name));
    }
    return acc;
  }, {} as Record<string, RegularItem[]>);

  // Derive filtered combined-catalog entries
  const filteredCatalogItems = (catalog?.items || []).filter((item: any) => {
    if (catalogSearch.trim() !== "") {
      const q = catalogSearch.toLowerCase();
      const matchName = item.name?.toLowerCase().includes(q);
      const matchId = String(item.id)?.toLowerCase().includes(q);
      const matchStores = Object.entries(item.stores || {}).some(([storeKey, storeDetails]: [string, any]) => {
        return (
          storeKey.toLowerCase().includes(q) ||
          String(storeDetails?.upc)?.toLowerCase().includes(q) ||
          String(storeDetails?.external_name)?.toLowerCase().includes(q)
        );
      });
      if (!matchName && !matchId && !matchStores) return false;
    }

    if (catalogScrapedFilter === "scraped" && !item.requires_scraping) return false;
    if (catalogScrapedFilter === "not-scraped" && item.requires_scraping) return false;

    const anyOnSale = Object.values(item.stores || {}).some((s: any) => {
      const isExp = s.valid_until && isSaleExpiredAdmin(s.valid_until);
      return (s.is_on_sale === 1 || s.is_on_sale === true) && !isExp;
    });
    if (catalogSaleFilter === "sale" && !anyOnSale) return false;
    if (catalogSaleFilter === "not-sale" && anyOnSale) return false;

    const anyTracked = Object.values(item.stores || {}).some((s: any) => s.track_pricing === true || s.track_pricing === 1);
    if (catalogTrackedFilter === "tracked" && !anyTracked) return false;
    if (catalogTrackedFilter === "not-tracked" && anyTracked) return false;

    return true;
  });

  return (
    <main className="flex-1 bg-[#f9fafb] text-[#111827] min-h-screen font-sans">
      <div className="max-w-4xl mx-auto px-4 py-8">
        
        {/* Header Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4 pb-4 border-b-2 border-black">
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-widest text-[#059669] mb-1">
              ADMINISTRATION PORTAL
            </span>
            <h1 className="text-4xl font-extrabold tracking-tighter">
              Manage Catalog & Prices<span className="text-emerald-600">.</span>
            </h1>
          </div>
          <Link
            href="/"
            className="text-xs font-black uppercase tracking-wider bg-white border-2 border-black px-4 py-2 hover:bg-emerald-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          >
            ← Back to Checklist
          </Link>
        </header>

        {/* Global Toast Message */}
        {scrapeMsg && (
          <div className="sticky top-4 z-50 mb-6 bg-black text-emerald-400 border-2 border-emerald-400 px-4 py-3 shadow-[4px_4px_0px_0px_rgba(5,150,105,0.4)] flex items-center gap-2 text-sm font-bold">
            <Check className="w-5 h-5 flex-shrink-0 animate-bounce" />
            <span>{scrapeMsg}</span>
          </div>
        )}

        <section className="space-y-10">
          
          {/* Settings Section */}
          <div className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-base font-black uppercase tracking-tight mb-4 pb-1.5 border-b-2 border-black flex items-center gap-2">
              <Grid className="w-5 h-5 text-gray-500" /> Settings
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-black">Auto-save changes on tab blur</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Save all shopping checklist mutations automatically when switching screen focus or navigating away.
                </p>
              </div>
              <button
                onClick={handleAutoSaveToggle}
                className={`relative w-12 h-6 border-2 border-black transition-colors ${
                  autoSave ? "bg-[#059669]" : "bg-gray-200"
                }`}
                aria-label="Toggle auto-saved content changes"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white border border-black transition-transform ${
                    autoSave ? "translate-x-6" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Grocery Stores Setup & Registry Section */}
          <div className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-4 pb-1.5 border-b-2 border-black">
              <h2 className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-600" /> Manage Grocery Stores
              </h2>
              <button
                type="button"
                onClick={handleOpenAddStore}
                className="text-xs font-black uppercase tracking-wider bg-white border-2 border-black px-4 py-2 hover:bg-emerald-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4 text-emerald-600" /> Add Custom Store
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-6 font-medium leading-relaxed">
              Configure and manage grocery store details. Defining the base search URLs and store IDs enables live verification search flow lookups and proper item configuration indexing.
            </p>

            {/* Store Form Drawer / Row */}
            {addingStore && (
              <form onSubmit={handleSaveStoreSubmit} className="bg-[#f0f9ff]/40 border-2 border-black p-5 mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-fade-in text-black">
                <div className="flex items-center justify-between pb-2 mb-4 border-b border-black">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#1e3a8a]">
                    {editingStoreKey ? `✏ Edit Store: ${editingStoreKey}` : "🆕 Configure New Grocery Store"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingStore(false);
                      setEditingStoreKey(null);
                    }}
                    className="p-1 hover:bg-sky-100 border border-transparent hover:border-black rounded text-black"
                  >
                    <X className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {/* Store Key / Internal ID */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">
                      Store Key (Lowercase, alphanumeric ID)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. sobeys"
                      value={storeForm.key}
                      onChange={(e) => setStoreForm({ ...storeForm, key: e.target.value })}
                      disabled={!!editingStoreKey}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black disabled:bg-gray-100"
                      required
                    />
                  </div>

                  {/* Store Name / Display Name */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">
                      Store Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sobeys"
                      value={storeForm.store_name}
                      onChange={(e) => setStoreForm({ ...storeForm, store_name: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                      required
                    />
                  </div>

                  {/* Primary Website / Base Search URL */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">
                      Website URL / Base Website Search
                    </label>
                    <input
                      type="url"
                      placeholder="e.g. https://www.sobeys.com"
                      value={storeForm.base_url}
                      onChange={(e) => setStoreForm({ ...storeForm, base_url: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                      required
                    />
                  </div>

                  {/* Internal ID Code */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">
                      Internal Store ID Code (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. sobeys"
                      value={storeForm.store_id}
                      onChange={(e) => setStoreForm({ ...storeForm, store_id: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                    />
                  </div>

                  {/* Postal code */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">
                      Default Store Postal Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. K7H3C6"
                      value={storeForm.postal_code}
                      onChange={(e) => setStoreForm({ ...storeForm, postal_code: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                    />
                  </div>

                  {/* Enabled checkpoint */}
                  <div className="flex items-center gap-2 mt-4">
                    <input
                      type="checkbox"
                      id="storeEnabled"
                      checked={storeForm.enabled}
                      onChange={(e) => setStoreForm({ ...storeForm, enabled: e.target.checked })}
                      className="accent-black w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="storeEnabled" className="text-xs font-black cursor-pointer uppercase select-none text-black">
                      Active / Enabled for search
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-dashed border-gray-300">
                  <button
                    type="button"
                    onClick={() => {
                      setAddingStore(false);
                      setEditingStoreKey(null);
                    }}
                    className="px-4 py-1.5 text-xs font-black uppercase text-black hover:bg-gray-100 border border-black"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-1.5 text-xs font-black uppercase text-white bg-black hover:bg-sky-600 border border-black"
                  >
                    Save Store Parameters
                  </button>
                </div>
              </form>
            )}

            {/* List of configured stores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(scrapeConfig.stores || {}).map(([key, store]: [string, any]) => {
                return (
                  <div
                    key={key}
                    className="border-2 border-black p-4 bg-[#f9fafb] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[-1px] hover:translate-x-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-black/10 pb-2 mb-2">
                        <span className="font-extrabold text-sm text-black uppercase flex items-center gap-1.5">
                          🏪 {store.store_name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                            store.enabled !== false ? "bg-emerald-100 text-emerald-800 border border-emerald-400" : "bg-gray-100 text-gray-500 border border-gray-300"
                          }`}>
                            {store.enabled !== false ? "Active" : "Disabled"}
                          </span>
                          <span className="text-[9px] font-mono bg-gray-200 text-gray-700 px-1.5 rounded uppercase font-bold">
                            KEY: {key}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs text-gray-600 mb-4 text-left font-semibold">
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-[10px] uppercase">Base website:</span>
                          <a
                            href={store.base_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 hover:underline overflow-hidden text-ellipsis max-w-[170px]"
                          >
                            {store.base_url}
                          </a>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-[10px] uppercase">Internal ID Code:</span>
                          <span className="text-black font-extrabold">{store.store_id || key}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-[10px] uppercase">Default Postal Code:</span>
                          <span className="text-black font-extrabold">{store.postal_code || "N/A"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-black/10 pt-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditStore(key, store)}
                        className="px-2 py-1 text-[10px] font-black uppercase text-black bg-white hover:bg-gray-100 border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                      >
                        Edit
                      </button>
                      {key !== "foodbasics" && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStore(key)}
                          className="px-2 py-1 text-[10px] font-black uppercase text-white bg-red-600 hover:bg-red-700 border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Price Check Scraper CRUD Configuration Section */}
          <div className="hidden bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-4 pb-1.5 border-b-2 border-black">
              <h2 className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-emerald-600" /> Price Check Links & URLs
              </h2>
              <span className="text-xs font-black uppercase bg-emerald-100 text-emerald-800 border border-black px-2 py-0.5">
                {allScrapeItems.length} Products configured
              </span>
            </div>
            
            <p className="text-xs text-gray-500 mb-6 font-medium leading-relaxed">
              These items are queried on Food Basics periodically. The <strong>Product Name</strong> must exactly match a name inside the <strong>Grocery Catalog</strong> to link prices up seamlessly. If URLs are broken or need revision, correct them below.
            </p>

            {scrapeLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-black border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* List Table of Configured Items */}
                {allScrapeItems.length > 0 ? (
                  <div className="border-2 border-black divide-y divide-black overflow-hidden bg-gray-50">
                    {allScrapeItems.map((item) => {
                      const isEditingThis = editingScrapeUpc === item.name && editingScrapeStoreKey === item.storeKey;
                      const isMatchedWithCatalog = items.some(i => i.name.toLowerCase() === item.name.toLowerCase());

                      if (isEditingThis) {
                        return (
                          <div key={`${item.name}_${item.storeKey}`} className="p-4 bg-emerald-50 space-y-4">
                            <div className="flex justify-between items-center pb-2 border-b border-black/10">
                              <span className="text-xs font-black uppercase text-emerald-800">Editing scraper URL config for {item.name}</span>
                              <span className="text-[10px] font-mono text-gray-500 bg-gray-200/50 px-1 border border-black">UPC/ID: {item.upc}</span>
                            </div>

                            {/* Linked Options Tabs (Option 3 implementation) */}
                            <div className="space-y-3">
                              <div>
                                <label className="text-xs font-black uppercase block mb-1 text-black">Product Name Association</label>
                                <div className="grid grid-cols-2 gap-2 border-2 border-black p-1 bg-white mb-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditScrapeItemMode("link")}
                                    className={`py-1.5 text-xs font-black uppercase tracking-wider transition-all ${
                                      editScrapeItemMode === "link" ? "bg-black text-white" : "bg-white hover:bg-gray-100 text-black"
                                    }`}
                                  >
                                    Link with Existing Catalog Entry
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditScrapeItemMode("create")}
                                    className={`py-1.5 text-xs font-black uppercase tracking-wider transition-all ${
                                      editScrapeItemMode === "create" ? "bg-black text-white" : "bg-white hover:bg-gray-100 text-black"
                                    }`}
                                  >
                                    Associate / Rename to New Item
                                  </button>
                                </div>
                              </div>

                              {/* Gemini Smart Match Card */}
                              <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 border-2 border-black p-3.5 space-y-2 text-black my-4">
                                <div className="flex items-center gap-1.5 pb-1.5 border-b border-black/10">
                                  <div className={`w-2 h-2 rounded-full animate-pulse ${geminiMatchResult?.isFallback ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                  <span className="text-[11px] font-black uppercase tracking-wider text-black flex items-center justify-between w-full">
                                    <span className="flex items-center gap-1">🤖 Gemini Smart Match Assistant</span>
                                    {geminiMatchResult?.isFallback && (
                                      <span className="bg-amber-100 text-amber-800 text-[9px] font-extrabold px-1.5 py-0.5 border border-amber-400 uppercase tracking-widest leading-none">
                                        Offline Matcher Fallback
                                      </span>
                                    )}
                                  </span>
                                </div>
                                
                                {geminiMatchResult?.isFallback && (
                                  <div className="bg-amber-50 border border-amber-300 text-amber-900 text-[10px] font-bold p-2.5 flex flex-col gap-1 rounded-sm leading-normal">
                                    <div className="flex items-center gap-1 select-none text-amber-800">
                                      <CircleAlert className="w-3.5 h-3.5 flex-shrink-0" />
                                      <span className="uppercase tracking-wider font-extrabold">Local Matcher fallback Engaged</span>
                                    </div>
                                    <p className="font-semibold text-gray-700">
                                      {geminiMatchResult.isApiError 
                                        ? "The Gemini API credits/allowances are depleted or key is incorrect. Falling back to programmatic matching." 
                                        : "Using client-configured heuristic matching rules."}
                                    </p>
                                    {geminiMatchResult.fallbackReason && (
                                      <span className="text-[9px] font-mono text-amber-700 opacity-90 break-all font-semibold bg-amber-100/50 p-1 rounded-sm">
                                        Details: {geminiMatchResult.fallbackReason}
                                      </span>
                                    )}
                                  </div>
                                )}
                                
                                {evaluatingMatch ? (
                                  <div className="flex items-center gap-2 py-2 text-xs text-gray-500 font-bold">
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                                    <span>Analyzing product attributes, pack sizing, and brand alignments...</span>
                                  </div>
                                ) : geminiMatchResult ? (
                                  <div className="space-y-2 text-left">
                                    <div className="text-xs text-black">
                                      {geminiMatchResult.matched_id ? (
                                        <div>
                                          <p className="font-bold text-black mb-1">
                                            Match Recommendation:{" "}
                                            <span className="text-emerald-700 bg-emerald-100 border border-emerald-500 px-1.5 py-0.5 font-extrabold uppercase text-[10px]">
                                              {items.find(i => i.id === geminiMatchResult.matched_id)?.name || "Matched Item"} ({geminiMatchResult.confidence}% confidence)
                                            </span>
                                          </p>
                                          <p className="text-[11px] text-gray-600 leading-relaxed font-semibold italic mb-2">
                                            "{geminiMatchResult.reason}"
                                          </p>
                                          <div className="flex flex-wrap gap-1.5 mb-2.5">
                                            <span className={`text-[9px] font-extrabold px-1 border uppercase ${geminiMatchResult.unit_match ? 'bg-emerald-100 text-emerald-800 border-emerald-500' : 'bg-red-100 text-red-800 border-red-500'}`}>
                                              {geminiMatchResult.unit_match ? '✔ Sizing Type Compatible' : '⚠ Measurement Mismatch (Unit vs Wg)'}
                                            </span>
                                            <span className={`text-[9px] font-extrabold px-1 border uppercase ${geminiMatchResult.brand_match ? 'bg-emerald-100 text-emerald-800 border-emerald-500' : 'bg-amber-100 text-amber-800 border-amber-500'}`}>
                                              {geminiMatchResult.brand_match ? '✔ Brand Match' : 'ℹ Brand Mismatch (Substitution OK)'}
                                            </span>
                                          </div>
                                          
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const targetItem = items.find(i => i.id === geminiMatchResult.matched_id);
                                              if (targetItem) {
                                                setEditScrapeItemMode("link");
                                                setEditSelectedCatalogName(targetItem.name);
                                                setEditScrapeForm(prev => ({ ...prev, name: targetItem.name }));
                                                showVisualMessage(`Selected suggestion: "${targetItem.name}"`);
                                              }
                                            }}
                                            className="mt-1 w-full bg-black hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-wider py-1.5 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all inline-flex items-center justify-center gap-1 cursor-pointer"
                                          >
                                            <Check className="w-3.5 h-3.5" /> Bind Price to Mapped Catalog Item
                                          </button>
                                        </div>
                                      ) : (
                                        <div>
                                          <p className="font-bold text-black mb-1">
                                            Recommendation:{" "}
                                            <span className="text-amber-800 bg-amber-100 border border-amber-500 px-1.5 py-0.5 font-extrabold uppercase text-[10px]">
                                              Create Brand New Item ({geminiMatchResult.confidence}% confidence)
                                            </span>
                                          </p>
                                          <p className="text-[11px] text-gray-600 leading-relaxed font-semibold italic mb-2">
                                            "{geminiMatchResult.reason}"
                                          </p>
                                          {geminiMatchResult.proposed_new_item && (
                                            <div className="bg-white border-2 border-dashed border-black p-2 space-y-1 mb-2">
                                              <p className="text-[9px] font-mono text-gray-400 uppercase font-black">Clean Catalog Recommendation:</p>
                                              <p className="text-xs font-black text-black">
                                                Item Name: <span className="text-emerald-700 font-bold">{geminiMatchResult.proposed_new_item.name}</span>
                                              </p>
                                              <p className="text-xs font-black text-black">
                                                Category: <span className="text-emerald-700 font-bold">{geminiMatchResult.proposed_new_item.category}</span>
                                              </p>
                                            </div>
                                          )}
                                          
                                          {geminiMatchResult.proposed_new_item && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditScrapeItemMode("create");
                                                setEditScrapeForm(prev => ({ ...prev, name: geminiMatchResult.proposed_new_item!.name }));
                                                const catExists = categoriesList.includes(geminiMatchResult.proposed_new_item!.category);
                                                if (catExists) {
                                                  setEditIsCreatingCustomCategory(false);
                                                  setEditNewCatalogCategory(geminiMatchResult.proposed_new_item!.category);
                                                } else {
                                                  setEditIsCreatingCustomCategory(true);
                                                  setEditCustomCategory(geminiMatchResult.proposed_new_item!.category);
                                                }
                                                showVisualMessage(`Filled catalog suggestion: "${geminiMatchResult.proposed_new_item!.name}"`);
                                              }}
                                              className="w-full bg-[#059669] hover:bg-[#047857] text-white font-black uppercase text-[10px] tracking-wider py-1.5 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all inline-flex items-center justify-center gap-1 cursor-pointer"
                                            >
                                              <Plus className="w-3.5 h-3.5" /> Initialize Catalog Item Adding
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="py-1.5 text-[11px] text-gray-400 font-bold">
                                    No details resolved. Loading suggestions details below...
                                  </div>
                                )}
                              </div>

                              {editScrapeItemMode === "link" ? (
                                <div className="space-y-1">
                                  <label className="text-xs font-bold uppercase block mb-1 text-gray-500">Choose Catalog Product</label>
                                  <select
                                    value={editSelectedCatalogName}
                                    onChange={(e) => {
                                      setEditSelectedCatalogName(e.target.value);
                                      setEditScrapeForm({ ...editScrapeForm, name: e.target.value });
                                    }}
                                    className="w-full px-3 py-2 text-sm border-2 border-black bg-white focus:outline-none font-bold text-black"
                                  >
                                    <option value="">-- Choose existing product name --</option>
                                    {items.map(catItem => (
                                      <option key={catItem.id} value={catItem.name}>{catItem.name} — ({catItem.category})</option>
                                    ))}
                                  </select>
                                  {editSelectedCatalogName && (
                                    <div className="mt-2 text-left bg-emerald-50 border border-emerald-300 p-2 text-xs">
                                      <span className="font-bold text-emerald-900 block mb-1 flex items-center gap-1">
                                        <Search className="w-3.5 h-3.5" /> Direct Lookup Helper
                                      </span>
                                      <a
                                        href={`https://www.foodbasics.ca/search?searchItem=${encodeURIComponent(editSelectedCatalogName)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-black uppercase text-emerald-700 bg-white border border-emerald-400 px-2 py-1 hover:bg-emerald-50"
                                      >
                                        🔍 Search Food Basics for "{editSelectedCatalogName}"
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-3 bg-white p-3 border-2 border-black">
                                  <div>
                                    <label className="text-xs font-bold uppercase text-gray-500 block mb-0.5">Item Name (No duplicate spellings)</label>
                                    <input
                                      type="text"
                                      placeholder="e.g. 2% Organics Milk"
                                      value={editScrapeForm.name}
                                      onChange={(e) => setEditScrapeForm({ ...editScrapeForm, name: e.target.value })}
                                      className="w-full px-3 py-2 text-sm border-2 border-black bg-white focus:outline-none font-bold text-black"
                                    />
                                    {editScrapeForm.name.trim() && (
                                      <div className="mt-2 text-left bg-emerald-50 border border-emerald-300 p-2 text-xs">
                                        <span className="font-bold text-emerald-900 block mb-1 flex items-center gap-1">
                                          <Search className="w-3.5 h-3.5" /> Direct Lookup Helper
                                        </span>
                                        <a
                                          href={`https://www.foodbasics.ca/search?searchItem=${encodeURIComponent(editScrapeForm.name.trim())}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 font-black uppercase text-emerald-700 bg-white border border-emerald-400 px-2 py-1 hover:bg-emerald-50"
                                        >
                                          🔍 Search Food Basics for "{editScrapeForm.name.trim()}"
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {!items.some(i => i.name.toLowerCase() === editScrapeForm.name.trim().toLowerCase()) && (
                                    <div className="p-2 bg-amber-50 border border-amber-300 text-amber-900 text-xs">
                                      <span className="font-extrabold flex items-center gap-1">
                                        <CircleAlert className="w-3.5 h-3.5" /> ✨ New catalog item auto-creation
                                      </span>
                                      <p className="mt-1">This product name does not exist in the grocery lists, so saving will create a new catalog item automatically!</p>
                                      
                                      <div className="mt-2.5 space-y-2">
                                        <label className="font-bold text-[10px] uppercase text-gray-600 block">Catalog Category</label>
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            id="editIsCustomCategory"
                                            checked={editIsCreatingCustomCategory}
                                            onChange={(e) => setEditIsCreatingCustomCategory(e.target.checked)}
                                            className="accent-black w-4 h-4 border-2 border-black"
                                          />
                                          <label htmlFor="editIsCustomCategory" className="text-[11px] font-bold text-black">Type custom category name directly</label>
                                        </div>

                                        {editIsCreatingCustomCategory ? (
                                          <input
                                            type="text"
                                            placeholder="Brand new category name (e.g. Cold Cuts, Pet)"
                                            value={editCustomCategory}
                                            onChange={(e) => setEditCustomCategory(e.target.value)}
                                            className="w-full px-2.5 py-1 text-xs border-2 border-black bg-white focus:outline-none font-bold"
                                          />
                                        ) : (
                                          <select
                                            value={editNewCatalogCategory}
                                            onChange={(e) => setEditNewCatalogCategory(e.target.value)}
                                            className="w-full px-2.5 py-1 text-xs border-2 border-black bg-white focus:outline-none font-bold"
                                          >
                                            <option value="">-- Associate with existing category --</option>
                                            {categoriesList.map(cat => (
                                              <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                            <option value="Other">Other</option>
                                          </select>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Target Product URL */}
                              <div>
                                <label className="text-xs font-black uppercase block mb-1 text-black">Target Food Basics URL (Required)</label>
                                <input
                                  type="text"
                                  placeholder="Food Basics product detail URL"
                                  value={editScrapeForm.url}
                                  onChange={(e) => setEditScrapeForm({ ...editScrapeForm, url: e.target.value })}
                                  className="w-full px-3 py-2 text-sm border-2 border-black bg-white focus:outline-none font-bold text-black"
                                />
                              </div>

                              {/* UPC Code Override */}
                              <div>
                                <label className="text-xs font-black uppercase block mb-1 text-black">UPC override (Optional — extracted automatically if empty)</label>
                                <input
                                  type="text"
                                  placeholder="e.g. 068700011503"
                                  value={editScrapeForm.upc}
                                  onChange={(e) => setEditScrapeForm({ ...editScrapeForm, upc: e.target.value })}
                                  className="w-full px-3 py-2 text-sm border-2 border-black bg-white focus:outline-none font-bold text-black"
                                />
                              </div>
                            </div>

                            {/* Action Row */}
                            <div className="flex gap-2 pt-2 border-t border-black/10">
                              <button
                                onClick={handleSaveScrapeItemEditSubmit}
                                className="inline-flex items-center gap-1 px-4 py-1.5 text-xs bg-black text-white hover:bg-[#059669] border-2 border-black font-black uppercase tracking-wider"
                              >
                                <Save className="w-3.5 h-3.5" /> Save Correction
                              </button>
                              <button
                                onClick={() => setEditingScrapeUpc(null)}
                                className="inline-flex items-center gap-1 px-4 py-1.5 text-xs bg-white text-black hover:bg-gray-100 border-2 border-black font-black uppercase tracking-wider"
                              >
                                <X className="w-3.5 h-3.5" /> Cancel
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={`${item.name}_${item.storeKey}`} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 gap-3 hover:bg-emerald-50/20 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-extrabold text-black">{item.name}</span>
                              {isMatchedWithCatalog ? (
                                <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-500 font-black uppercase px-1.5">
                                  ✔ SYNCED IN CATALOG
                                </span>
                              ) : (
                                <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-500 font-black uppercase px-1.5 flex items-center gap-0.5" title="This item name has no exact spelled match in our list of regular grocery item assets. It won't associate sale prices correctly.">
                                  <CircleAlert className="w-2.5 h-2.5" /> SPELLING MISMATCH
                                </span>
                              )
                              }
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                              <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1 border border-gray-200">
                                store: {item.storeName}
                              </span>
                              <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1 border border-gray-200">
                                ID/UPC: {item.upc}
                              </span>
                              <a 
                                href={item.url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-[10px] font-bold text-[#059669] inline-flex items-center gap-0.5 hover:underline"
                              >
                                View product listing <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                          
                          {/* Row actions */}
                          <div className="flex items-center gap-1.5 self-end sm:self-auto flex-shrink-0">
                            <button
                              onClick={() => handleStartEditScrapeItem(item, item.storeKey)}
                              className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider bg-white hover:bg-emerald-50 text-black border-2 border-black px-2 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                              title="Edit item URL, UPC, or mapped Catalog Item"
                            >
                              <Edit2 className="w-3 h-3 text-black" /> Edit Link
                            </button>
                            <button
                              onClick={() => handleRemoveScrapeItem(item.storeKey, item.name)}
                              className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider bg-white hover:bg-rose-50 text-[#991b1b] border-2 border-black px-2 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                              title="Remove item from Price Checker"
                            >
                              <Trash2 className="w-3 h-3 text-[#991b1b]" /> Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 bg-gray-50">
                    <p className="text-sm font-bold text-gray-500">No Web Links or Price checks defined.</p>
                  </div>
                )}

                {/* Adding Scrape Item Form */}
                {addingItem ? (
                  <div className="space-y-4 p-5 bg-[#fee2e2]/30 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-fade-in text-[#111827]">
                    <h3 className="text-xs font-black uppercase text-gray-700 tracking-wider pb-1 border-b border-black/10 flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" /> Configure New Price Check Link
                    </h3>

                    {/* Target Chain Selector (Future Extensible dropdown) */}
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Target Grocery Chain</label>
                      <select
                        value={newScrapeStoreKey}
                        onChange={(e) => setNewScrapeStoreKey(e.target.value)}
                        className="w-full px-3 py-2 text-sm border-2 border-black bg-white font-bold text-black focus:outline-none cursor-pointer"
                      >
                        {Object.entries(scrapeConfig.stores || {}).map(([key, store]: [string, any]) => (
                          <option key={key} value={key}>
                            {store.store_name} ({store.enabled ? "Active" : "Disabled"})
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">
                        ℹ Store price verification scripts support multi-store setup. Select this store to configure item search lookups.
                      </p>
                    </div>
                    
                    {/* Choose between mapping to existing catalog entry or making a new one (Option 3 integrated) */}
                    <div>
                      <span className="text-xs font-black uppercase block mb-1 text-black">Coupling Mode (Option 3)</span>
                      <div className="grid grid-cols-2 gap-2 border-2 border-black p-1 bg-white">
                        <button
                          type="button"
                          onClick={() => setNewItemMode("link")}
                          className={`py-1.5 text-xs font-black uppercase tracking-wider transition-all ${
                            newItemMode === "link" ? "bg-black text-white" : "bg-white hover:bg-gray-100 text-black"
                          }`}
                        >
                          Select Existing Catalog Entry
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewItemMode("create")}
                          className={`py-1.5 text-xs font-black uppercase tracking-wider transition-all ${
                            newItemMode === "create" ? "bg-black text-white" : "bg-white hover:bg-gray-100 text-black"
                          }`}
                        >
                          + Create New Catalog Item & Link
                        </button>
                      </div>
                    </div>

                    {newItemMode === "link" ? (
                      <div className="space-y-1">
                        <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Link with Grocery catalog product</label>
                        <select
                          value={selectedCatalogName}
                          onChange={(e) => {
                            setSelectedCatalogName(e.target.value);
                            if (e.target.value) {
                              setNewScrapeItem({ ...newScrapeItem, name: e.target.value });
                            }
                          }}
                          className="w-full px-3 py-2 text-sm border-2 border-black bg-white focus:outline-none font-bold text-black"
                        >
                          <option value="">-- Choose target catalog product to link --</option>
                          {items.map(item => (
                            <option key={item.id} value={item.name}>{item.name} — ({item.category})</option>
                          ))}
                        </select>
                        {selectedCatalogName && (
                          <div className="mt-2 text-left bg-emerald-50 border border-emerald-300 p-2.5">
                            <span className="text-xs font-bold text-emerald-900 block mb-1">🔍 Need to find the listing URL for {selectedCatalogName}?</span>
                            <div className="flex flex-wrap gap-2">
                              <a
                                href={getSearchUrlForStore(newScrapeStoreKey, selectedCatalogName, scrapeConfig)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-black uppercase bg-[#059669] hover:bg-emerald-700 text-white border-2 border-black px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                              >
                                <Search className="w-4 h-4" /> Open {getStoreDisplayNameDef(scrapeConfig, newScrapeStoreKey)} Search
                              </a>
                            </div>
                            <p className="text-[10px] text-emerald-700 mt-1.5 font-medium leading-normal">
                              Clicking above opens the grocery chain's search session. Select the desired packaging/brand, then copy-paste its browser page link below!
                            </p>
                          </div>
                        )}
                        <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                          ✔ Selecting an existing name guarantees price checks match automatically without spelling/capitalization issues!
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 bg-white p-3 border-2 border-black">
                        <div>
                          <label className="text-xs font-bold uppercase text-gray-500 block mb-0.5">Product Name</label>
                          <input
                            type="text"
                            placeholder="e.g. 2% Lactose-Free Milk"
                            value={newScrapeItem.name}
                            onChange={(e) => setNewScrapeItem({ ...newScrapeItem, name: e.target.value })}
                            className="w-full px-3 py-2 text-sm border-2 border-black bg-white focus:outline-none font-bold text-black"
                          />
                          {newScrapeItem.name.trim() && (
                            <div className="mt-2 text-left bg-emerald-50 border border-emerald-300 p-2.5">
                              <span className="text-xs font-bold text-emerald-900 block mb-1">🔍 Search for {newScrapeItem.name.trim()}?</span>
                              <div className="flex flex-wrap gap-2">
                                <a
                                  href={getSearchUrlForStore(newScrapeStoreKey, newScrapeItem.name.trim(), scrapeConfig)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-black uppercase bg-[#059669] hover:bg-emerald-700 text-white border-2 border-black px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                >
                                  <Search className="w-4 h-4" /> Open {getStoreDisplayNameDef(scrapeConfig, newScrapeStoreKey)} Search
                                </a>
                              </div>
                              <p className="text-[10px] text-emerald-700 mt-1.5 font-medium leading-normal">
                                Click to open a direct browser session searching {getStoreDisplayNameDef(scrapeConfig, newScrapeStoreKey)}, find the target item, and copy-paste its product URL.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Associated category details */}
                        <div>
                          <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Assign list category in Grocery Catalog</label>
                          
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="checkbox"
                              id="isCustomCategory"
                              checked={isCreatingCustomCategory}
                              onChange={(e) => setIsCreatingCustomCategory(e.target.checked)}
                              className="accent-black w-4 h-4 border-2 border-black"
                            />
                            <label htmlFor="isCustomCategory" className="text-[11px] font-bold text-black">Type custom category name directly</label>
                          </div>

                          {isCreatingCustomCategory ? (
                            <input
                              type="text"
                              placeholder="Type brand new category (e.g. Baking, Seafood)"
                              value={customCategory}
                              onChange={(e) => setCustomCategory(e.target.value)}
                              className="w-full px-3 py-2 text-sm border-2 border-black bg-white focus:outline-none font-bold text-black"
                            />
                          ) : (
                            <select
                              value={newCatalogCategory}
                              onChange={(e) => setNewCatalogCategory(e.target.value)}
                              className="w-full px-3 py-2 text-sm border-2 border-black bg-white focus:outline-none font-bold text-black"
                            >
                              <option value="">-- Choose existing category --</option>
                              {categoriesList.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                              <option value="Other">Other</option>
                            </select>
                          )}
                          <p className="text-[10px] text-amber-700 font-semibold mt-1">
                            ✨ Saving will automatically create this catalog item entry so that it is instantly checkable on the main page!
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Dynamic Store URL */}
                    <div>
                      <label className="text-xs font-bold uppercase text-black block mb-0.5">Direct Product Listing Page URL for {getStoreDisplayName(newScrapeStoreKey)} (Required)</label>
                      <input
                        type="text"
                        placeholder={`Paste the ${getStoreDisplayName(newScrapeStoreKey)} page URL...`}
                        value={newScrapeItem.url}
                        onChange={(e) => setNewScrapeItem({ ...newScrapeItem, url: e.target.value })}
                        className="w-full px-3 py-2 text-sm border-2 border-black bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-black"
                      />
                    </div>

                    {/* UPC overrides */}
                    <div>
                      <label className="text-xs font-bold uppercase text-black block mb-0.5">ID / UPC code Override (Optional — auto-parsed if blank)</label>
                      <input
                        type="text"
                        placeholder="UPC override (will auto-extract if left empty)"
                        value={newScrapeItem.upc}
                        onChange={(e) => setNewScrapeItem({ ...newScrapeItem, upc: e.target.value })}
                        className="w-full px-3 py-2 text-sm border-2 border-black bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-black"
                      />
                    </div>

                    {/* Controls Row */}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleAddScrapeItem}
                        disabled={(newItemMode === "link" && !selectedCatalogName) || (newItemMode === "create" && !newScrapeItem.name.trim()) || !newScrapeItem.url.trim()}
                        className="px-4 py-1.5 text-xs bg-black text-white hover:bg-emerald-600 border-2 border-black font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        + Create price check URL
                      </button>
                      <button
                        onClick={() => { 
                          setAddingItem(false); 
                          setNewScrapeItem({ name: "", upc: "", url: "" }); 
                        }}
                        className="px-4 py-1.5 text-xs bg-white text-black hover:bg-gray-100 border-2 border-black font-black uppercase tracking-wider transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingItem(true); setNewItemMode("link"); }}
                    className="text-xs font-black uppercase tracking-wider bg-white border-2 border-black px-4 py-2 hover:bg-emerald-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all inline-flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4 text-emerald-600" /> Couple new item URL
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Catalog Item Manager Section (Dedicated CRUD on Admin page only) */}
          <div className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-1.5 border-b-2 border-black">
              <h2 className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" /> Grocery List Catalog CRUD
              </h2>
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="text-xs font-black uppercase tracking-wider text-emerald-800 hover:bg-emerald-50 border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all bg-white inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" /> Export Catalog CSV
                  </button>
                  <button
                    onClick={handleClear}
                    className="text-xs font-black uppercase tracking-wider text-red-600 hover:bg-red-50 border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all bg-white"
                  >
                    Delete entire catalog
                  </button>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 mb-6 font-medium leading-relaxed">
              Below is the comprehensive list of regular products that shopping checklist participants can select from. Modify, add new categories, rename items, or delete options from here directly.
            </p>

            {/* Quick Filter Search Bar */}
            <div className="relative mb-5">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Filter catalog items or search categories..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border-2 border-black bg-white focus:outline-none font-bold placeholder-gray-400 text-black"
              />
              {catalogSearch && (
                <button
                  onClick={() => setCatalogSearch("")}
                  className="absolute right-3 top-2.5 text-xs font-bold text-gray-400 hover:text-black uppercase"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Top-Level global category item creator */}
            <div className="bg-emerald-50 border-2 border-black p-4 mb-6 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-black animate-fade-in">
              <span className="text-xs font-black text-emerald-800 uppercase tracking-wider block mb-2">⚡ Quick catalog item creator</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Product Name</label>
                  <div className="mb-1.5 mt-0.5 py-0.5 opacity-0 select-none hidden sm:block">
                    <span className="text-[10px] px-1">Alignment spacer</span>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Avocados, French Onion Dip"
                    value={newGlobalItemName}
                    onChange={(e) => setNewGlobalItemName(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Category Folder</label>
                  
                  <div className="flex items-center gap-2 mb-1.5 mt-0.5 py-0.5">
                    <input
                      type="checkbox"
                      id="globalCatIsCustom"
                      checked={globalCatIsCustom}
                      onChange={(e) => setGlobalCatIsCustom(e.target.checked)}
                      className="accent-black w-3.5 h-3.5 cursor-pointer"
                    />
                    <label htmlFor="globalCatIsCustom" className="text-[10px] font-bold text-black cursor-pointer select-none">Add brand new category</label>
                  </div>

                  {globalCatIsCustom ? (
                    <input
                      type="text"
                      placeholder="Custom category (e.g. Frozen Food)"
                      value={newGlobalCustomCat}
                      onChange={(e) => setNewGlobalCustomCat(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black placeholder-gray-400"
                    />
                  ) : (
                    <select
                      value={newGlobalCategory}
                      onChange={(e) => setNewGlobalCategory(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black cursor-pointer"
                    >
                      <option value="">-- Choose category --</option>
                      {categoriesList.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Base Unit</label>
                  <div className="mb-1.5 mt-0.5 py-0.5">
                    <span className="text-[10px] font-bold text-[#b45309] uppercase bg-amber-50 px-1 border border-amber-200 rounded-sm">Default Shopping List Unit</span>
                  </div>
                  <select
                    value={newGlobalUnit}
                    onChange={(e) => setNewGlobalUnit(e.target.value)}
                    className="w-full h-8 px-2.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black cursor-pointer"
                  >
                    {["unit", "g", "kg", "ml", "l", "lb", "oz", "gal", "dozen", "bunch", "bag", "can", "box", "pack"].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={handleCreateGlobalItem}
                disabled={!newGlobalItemName.trim()}
                className="w-full h-8 text-xs font-black uppercase text-white bg-black hover:bg-emerald-605 disabled:opacity-40 border border-black text-center cursor-pointer transition-colors"
              >
                + Save Catalog Product
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <span className="animate-spin rounded-full h-6 w-6 border-2 border-black border-t-transparent" />
              </div>
            ) : items.length > 0 ? (
              <div className="space-y-6">
                {Object.entries(filteredCategories)
                  .sort(([a], [b]) => getCategoryOrderIndex(a) - getCategoryOrderIndex(b))
                  .map(([category, categoryItems]) => (
                    <div key={category} className="bg-[#f9fafb] border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[1px] hover:-translate-y-[1px] transition-all">
                      
                      {/* Catalog Category Header */}
                      <div className="flex items-center justify-between mb-3.5 pb-1 border-b border-gray-200">
                        <span className="text-xs font-black uppercase tracking-wider text-black">{category}</span>
                        
                        {addingToCategory === category ? (
                          <div className="flex items-center gap-1 animate-fade-in">
                            <input
                              type="text"
                              value={newCatalogItemName}
                              onChange={(e) => setNewCatalogItemName(e.target.value)}
                              onKeyDown={(e) => { 
                                if (e.key === "Enter") handleAddCatalogItem(category, newCatalogItemName);
                                if (e.key === "Escape") setAddingToCategory(null);
                              }}
                              placeholder="Type name and press Enter..."
                              className="px-2 py-0.5 text-xs border border-black focus:outline-none font-bold text-black bg-white"
                              autoFocus
                            />
                            <button
                              onClick={() => handleAddCatalogItem(category, newCatalogItemName)}
                              className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-500 px-1.5 py-0.5"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => { setAddingToCategory(null); setNewCatalogItemName(""); }}
                              className="text-[10px] font-black uppercase text-red-800 bg-red-100 hover:bg-red-200 border border-red-500 px-1.5 py-0.5"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingToCategory(category)}
                            className="bg-white hover:bg-emerald-50 transition-colors text-[10px] font-black uppercase border border-black px-2 py-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                          >
                            + Quick Add
                          </button>
                        )}
                      </div>

                      {/* Display items as beautiful interactive badges */}
                      <div className="flex flex-wrap gap-2">
                        {categoryItems.map((item) => {
                          const isEditingThisItem = editingCatalogId === item.id;

                          if (isEditingThisItem) {
                            return (
                              <div key={item.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] text-black">
                                <input
                                  type="text"
                                  value={editCatalogName}
                                  onChange={(e) => setEditCatalogName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleEditCatalogItemSubmit(item.id);
                                    if (e.key === "Escape") setEditingCatalogId(null);
                                  }}
                                  className="text-xs outline-none bg-transparent font-bold border-b border-black text-black w-28 bg-white"
                                  autoFocus
                                />
                                <select
                                  value={editCatalogUnit}
                                  onChange={(e) => setEditCatalogUnit(e.target.value)}
                                  className="text-[10px] font-bold border border-black px-1 py-0.5 bg-white cursor-pointer text-black"
                                >
                                  {["unit", "g", "kg", "ml", "l", "lb", "oz", "gal", "dozen", "bunch", "bag", "can", "box", "pack"].map((u) => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleEditCatalogItemSubmit(item.id)}
                                  className="text-emerald-600 hover:text-emerald-800"
                                  title="Save Correction"
                                >
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </button>
                                <button
                                  onClick={() => setEditingCatalogId(null)}
                                  className="text-rose-600 hover:text-rose-800"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5 stroke-[3]" />
                                </button>
                              </div>
                            );
                          }

                          return (
                            <span
                              key={item.id}
                              className="inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1 bg-white text-gray-800 text-xs font-bold border border-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] group hover:bg-[#fee2e2]/10 transition-colors"
                            >
                              <span className="text-black">{item.name}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleStartEditCatalog(item)}
                                  className="text-gray-400 hover:text-[#059669] transition-colors p-0.5 mr-0.5 border border-transparent rounded hover:bg-gray-150"
                                  title={`Rename/Edit ${item.name}`}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCatalogItem(item.id)}
                                  className="text-gray-400 hover:text-[#991b1b] transition-colors p-0.5 border border-transparent rounded hover:bg-gray-150"
                                  title={`Delete ${item.name}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-10 border-2 border-dashed border-gray-300 bg-gray-50">
                <p className="text-sm font-bold text-gray-500">No catalog items match your search filter.</p>
              </div>
            )}
          </div>

          {/* Combined Catalog Registry CRUD Section */}
          <div className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-black mt-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-1.5 border-b-2 border-black">
              <h2 className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" /> Combined Catalog Registry Manager (combined-catalog.json)
              </h2>
              <button
                type="button"
                onClick={handleOpenAddCatalog}
                className="text-xs font-black uppercase tracking-wider text-black bg-indigo-400 hover:bg-indigo-300 border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                + Add Catalog Product
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-6 font-medium leading-relaxed">
              This panel provides complete CRUD controls over your master catalog (<code>combined-catalog.json</code>). You can fine-tune global metrics (Name, category, and scraping required) and store-specific scrape triggers, pricing definitions, and validation dates in one consolidated view.
            </p>

            {/* Micro Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="border border-black p-2.5 bg-gray-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Catalog Items</span>
                <span className="text-xl font-black">{catalog?.items?.length || 0}</span>
              </div>
              <div className="border border-black p-2.5 bg-emerald-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Requires Scraping</span>
                <span className="text-xl font-black text-emerald-800">
                  {catalog ? catalog.items.filter((i: any) => i.requires_scraping).length : 0}
                </span>
              </div>
              <div className="border border-black p-2.5 bg-amber-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Currently On Sale</span>
                <span className="text-xl font-black text-amber-800">
                  {catalog ? catalog.items.filter((item: any) => 
                    Object.values(item.stores || {}).some((s: any) => (s.is_on_sale === 1 || s.is_on_sale === true) && !(s.valid_until && isSaleExpiredAdmin(s.valid_until)))
                  ).length : 0}
                </span>
              </div>
              <div className="border border-black p-2.5 bg-indigo-50 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Tracked Stores</span>
                <span className="text-xl font-black text-indigo-800">
                  {catalog ? catalog.items.filter((item: any) => 
                    Object.values(item.stores || {}).some((s: any) => s.track_pricing === true || s.track_pricing === 1)
                  ).length : 0}
                </span>
              </div>
            </div>

            {/* Catalog Search & Filters */}
            <div className="bg-gray-50 border-2 border-black p-4 mb-6 space-y-3">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by product name, ID, store key or store UPC..."
                    value={catalogSearch}
                    onChange={(e) => {
                      setCatalogSearch(e.target.value);
                      setVisibleCatalogCount(30);
                    }}
                    className="w-full pl-9 pr-4 py-2 border-2 border-black bg-white font-medium text-xs placeholder-gray-400 focus:outline-none focus:ring-0 text-black leading-tight"
                  />
                  {catalogSearch && (
                    <button
                      type="button"
                      onClick={() => setCatalogSearch("")}
                      className="absolute right-3 top-2 text-xs font-bold text-black border border-black bg-white px-1 hover:bg-gray-100"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
                  <div>
                    <label className="block text-[9px] font-black uppercase text-gray-400 mb-0.5">Scraping</label>
                    <select
                      value={catalogScrapedFilter}
                      onChange={(e) => {
                        setCatalogScrapedFilter(e.target.value);
                        setVisibleCatalogCount(30);
                      }}
                      className="py-1.5 px-2 border-2 border-black bg-white font-black text-[11px] uppercase tracking-wider leading-relaxed text-black w-full text-xs"
                    >
                      <option value="all">All Items</option>
                      <option value="scraped">Scraped</option>
                      <option value="not-scraped">Not Scraped</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-black uppercase text-gray-400 mb-0.5">Sale Status</label>
                    <select
                      value={catalogSaleFilter}
                      onChange={(e) => {
                        setCatalogSaleFilter(e.target.value);
                        setVisibleCatalogCount(30);
                      }}
                      className="py-1.5 px-2 border-2 border-black bg-white font-black text-[11px] uppercase tracking-wider leading-relaxed text-black w-full text-xs"
                    >
                      <option value="all">All Promo</option>
                      <option value="sale">On Sale</option>
                      <option value="not-sale">Not On Sale</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-black uppercase text-gray-400 mb-0.5">Price Tracking</label>
                    <select
                      value={catalogTrackedFilter}
                      onChange={(e) => {
                        setCatalogTrackedFilter(e.target.value);
                        setVisibleCatalogCount(30);
                      }}
                      className="py-1.5 px-2 border-2 border-black bg-white font-black text-[11px] uppercase tracking-wider leading-relaxed text-black w-full text-xs"
                    >
                      <option value="all">All Tracking</option>
                      <option value="tracked">Tracked</option>
                      <option value="not-tracked">Not Tracked</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Catalog Item Editing Drawer/Form Container */}
            {(editingCatalogItem || isAddingCatalogItem) && catalogItemForm && (
              <form
                onSubmit={saveCatalogItemSubmit}
                className="bg-indigo-50 border-2 border-black p-5 mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-black space-y-4"
              >
                <div className="flex items-center justify-between border-b border-black pb-2 mb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                    {editingCatalogItem ? `✏ Edit Catalog Entry ID: ${catalogItemForm.id}` : `✨ Add New Catalog Entry`}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCatalogItem(null);
                      setIsAddingCatalogItem(false);
                    }}
                    className="p-1 border border-black bg-white hover:bg-gray-100"
                  >
                    <X className="w-4 h-4 text-black" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Left Column: Global Product Fields */}
                  <div className="space-y-3 p-3 bg-white border border-black">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-700 pb-1 border-b border-gray-100">
                      1. Global Product Data (Item Level)
                    </h4>
                    
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Product Title / Name *</label>
                      <input
                        type="text"
                        value={catalogItemForm.name}
                        onChange={(e) => setCatalogItemForm({ ...catalogItemForm, name: e.target.value })}
                        placeholder="e.g. Apples Granny Smith"
                        className="w-full p-2 border-2 border-black font-medium text-xs text-black"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Category</label>
                        <input
                          type="text"
                          value={catalogItemForm.category}
                          onChange={(e) => setCatalogItemForm({ ...catalogItemForm, category: e.target.value })}
                          placeholder="e.g. Fruit, Dairy, Meat"
                          className="w-full p-2 border-2 border-black font-medium text-xs text-black"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Unit</label>
                        <select
                          value={catalogItemForm.unit}
                          onChange={(e) => setCatalogItemForm({ ...catalogItemForm, unit: e.target.value })}
                          className="w-full p-2 border-2 border-black font-medium text-xs text-black bg-white cursor-pointer"
                        >
                          {["unit", "g", "kg", "ml", "l", "lb", "oz", "gal", "dozen", "bunch", "bag", "can", "box", "pack"].map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                          {catalogItemForm.unit && !["unit", "g", "kg", "ml", "l", "lb", "oz", "gal", "dozen", "bunch", "bag", "can", "box", "pack"].includes(catalogItemForm.unit) && (
                            <option value={catalogItemForm.unit}>{catalogItemForm.unit}</option>
                          )}
                        </select>
                      </div>
                    </div>

                    <div className="pt-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={catalogItemForm.requires_scraping}
                          onChange={(e) => setCatalogItemForm({ ...catalogItemForm, requires_scraping: e.target.checked })}
                          className="w-4 h-4 accent-indigo-600 border-2 border-black rounded"
                        />
                        <span className="text-xs font-extrabold uppercase">Requires Scraper Ingestion</span>
                      </label>
                      <p className="text-[9px] text-gray-400 mt-1 leading-normal">
                        If checked, the scraper subprocess is authorized to automatically periodically scan the linked store URLs to fetch and overwrite pricing fields.
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Store Override and Price Linking */}
                  <div className="space-y-3 p-3 bg-white border border-black flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-1 border-b border-gray-100 mb-2">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                          2. Store-Specific Overrides
                        </h4>
                        
                        <div className="flex items-center gap-1">
                          <label className="text-[9px] font-black uppercase text-gray-400">Store:</label>
                          <select
                            value={selectedCatalogStore}
                            onChange={(e) => setSelectedCatalogStore(e.target.value)}
                            className="p-1 border border-black bg-white font-extrabold text-[10px] uppercase text-black"
                          >
                            {Object.entries(dynamicStoreNames).map(([key, name]) => {
                              const hasActiveLink = !!catalogItemForm.stores?.[key]?.url;
                              return (
                                <option key={key} value={key}>
                                  {name} {hasActiveLink ? " (🔗 Active Link)" : " (No Link)"}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      <div className="mb-2">
                        {catalogItemForm.stores?.[selectedCatalogStore] ? (
                          <div className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-1 flex items-center justify-between leading-normal">
                            <span>● "{dynamicStoreNames[selectedCatalogStore] || selectedCatalogStore}" pricing link is currently configured.</span>
                            <button
                              type="button"
                              onClick={() => removeStoreFromItem(selectedCatalogStore)}
                              className="text-[9px] font-black text-red-600 underline hover:no-underline"
                            >
                              Delete link
                            </button>
                          </div>
                        ) : (
                          <div className="bg-gray-150 text-gray-600 border border-gray-300 text-[9px] font-bold px-2 py-1 leading-normal">
                            ✕ No active pricing link for "{dynamicStoreNames[selectedCatalogStore] || selectedCatalogStore}" in this form. Fill fields below to add it.
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 text-xs">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[9px] font-bold text-gray-500 uppercase">Product Scraper URL</label>
                            {catalogItemForm.stores?.[selectedCatalogStore]?.url && (
                              <a
                                href={catalogItemForm.stores[selectedCatalogStore].url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[9px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 py-0.5 font-bold hover:bg-indigo-100 uppercase"
                              >
                                Test/Visit URL ↗
                              </a>
                            )}
                          </div>
                          <input
                            type="text"
                            value={catalogItemForm.stores?.[selectedCatalogStore]?.url || ""}
                            onChange={(e) => handleStoreFieldChange("url", e.target.value)}
                            placeholder="e.g. https://www.foodbasics.ca/p/..."
                            className="w-full p-1.5 border border-black font-medium text-xs text-black"
                          />
                          
                          <div className="mt-1.5 flex items-center justify-between bg-gray-50 border border-black p-1.5">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!catalogItemForm.stores?.[selectedCatalogStore]?.is_verified}
                                onChange={(e) => handleStoreFieldChange("is_verified", e.target.checked)}
                                className="w-4 h-4 accent-indigo-600 border border-black rounded"
                              />
                              <span className="text-[10px] font-black uppercase text-black">Link is Verified Active</span>
                            </label>
                            {catalogItemForm.stores?.[selectedCatalogStore]?.is_verified ? (
                              <span className="text-[8px] bg-blue-100 text-blue-800 border border-blue-400 font-bold uppercase px-1 py-0.5">Verified ✓</span>
                            ) : (
                              <span className="text-[8px] bg-amber-100 text-amber-800 border border-amber-400 font-bold uppercase px-1 py-0.5">Unverified ✕</span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase">Store UPC/SKU</label>
                            <input
                              type="text"
                              value={catalogItemForm.stores?.[selectedCatalogStore]?.upc || ""}
                              onChange={(e) => handleStoreFieldChange("upc", e.target.value)}
                              placeholder="Store Item ID"
                              className="w-full p-1.5 border border-black font-medium text-xs text-black"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase">External Scraped Name</label>
                            <input
                              type="text"
                              value={catalogItemForm.stores?.[selectedCatalogStore]?.external_name || ""}
                              onChange={(e) => handleStoreFieldChange("external_name", e.target.value)}
                              placeholder="Matches scraper scrape"
                              className="w-full p-1.5 border border-black font-medium text-xs text-black"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase">Regular Price</label>
                            <input
                              type="text"
                              value={catalogItemForm.stores?.[selectedCatalogStore]?.regular_price ?? ""}
                              onChange={(e) => handleStoreFieldChange("regular_price", e.target.value)}
                              placeholder="0.00"
                              className="w-full p-1.5 border border-black font-medium text-xs text-black"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase">Sale Price</label>
                            <input
                              type="text"
                              value={catalogItemForm.stores?.[selectedCatalogStore]?.sale_price ?? ""}
                              onChange={(e) => handleStoreFieldChange("sale_price", e.target.value)}
                              placeholder="0.00"
                              className="w-full p-1.5 border border-black font-medium text-xs text-black"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-gray-500 uppercase">Valid Until (Expiry)</label>
                            <input
                              type="text"
                              value={catalogItemForm.stores?.[selectedCatalogStore]?.valid_until || ""}
                              onChange={(e) => handleStoreFieldChange("valid_until", e.target.value)}
                              placeholder="YYYY-MM-DD"
                              className="w-full p-1.5 border border-black font-medium text-xs text-black"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 pt-1">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!catalogItemForm.stores?.[selectedCatalogStore]?.is_on_sale}
                              onChange={(e) => handleStoreFieldChange("is_on_sale", e.target.checked ? 1 : 0)}
                              className="w-3.5 h-3.5 accent-amber-600 border border-black rounded"
                            />
                            <span className="text-[10px] font-bold uppercase">Mark store on-sale</span>
                          </label>

                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!catalogItemForm.stores?.[selectedCatalogStore]?.track_pricing}
                              onChange={(e) => handleStoreFieldChange("track_pricing", e.target.checked)}
                              className="w-3.5 h-3.5 accent-amber-600 border border-black rounded"
                            />
                            <span className="text-[10px] font-bold uppercase">Track Store prices</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-end gap-2 text-xs">
                      {catalogItemForm.stores?.[selectedCatalogStore] && (
                        <button
                          type="button"
                          onClick={() => removeStoreFromItem(selectedCatalogStore)}
                          className="bg-white hover:bg-red-50 text-red-600 font-bold border border-red-500 px-2 py-1 text-[10px] uppercase"
                        >
                          Purge {dynamicStoreNames[selectedCatalogStore] || selectedCatalogStore} Link
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-black">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCatalogItem(null);
                      setIsAddingCatalogItem(false);
                    }}
                    className="text-xs font-black uppercase tracking-wider text-black bg-white hover:bg-gray-100 border-2 border-black px-4 py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 border-2 border-black px-4 py-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-1"
                  >
                    <Save className="w-4 h-4 text-white" /> Save Catalog Product Entry
                  </button>
                </div>
              </form>
            )}

            {/* Catalog Grid View */}
            {catalogLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="animate-spin w-8 h-8 text-indigo-500" />
                <span className="ml-2 font-bold text-sm">Synchronizing Catalog Payload...</span>
              </div>
            ) : filteredCatalogItems.length > 0 ? (
              <div className="space-y-3">
                <div className="max-h-[500px] overflow-y-auto border-2 border-black rounded-sm custom-scrollbar bg-white p-2">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-indigo-50 border-b-2 border-black text-[10px] font-black uppercase text-indigo-900 tracking-wider">
                        <th className="p-2 border-r border-black">Product Details</th>
                        <th className="p-2 border-r border-black">Scraping</th>
                        <th className="p-2 border-r border-black">Configured Retailers & Pricing Details</th>
                        <th className="p-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCatalogItems.slice(0, visibleCatalogCount).map((item: any) => {
                        const storeKeys = Object.keys(item.stores || {});
                        return (
                          <tr key={item.id} className="border-b border-black hover:bg-indigo-50/20 text-black">
                            <td className="p-2.5 border-r border-black leading-normal align-top max-w-[200px]">
                              <span className="font-extrabold text-[#111827] text-xs block">{item.name}</span>
                              <span className="text-[10px] text-gray-500 font-mono block">ID: {item.id}</span>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="bg-gray-100 text-gray-800 text-[9px] font-bold px-1.5 py-0.5 border border-gray-400 capitalize whitespace-nowrap">
                                  {item.category || "Grocery"}
                                </span>
                                <span className="bg-gray-100 text-gray-800 text-[9px] font-bold px-1.5 py-0.5 border border-gray-400 italic whitespace-nowrap">
                                  {item.unit || "unit"}
                                </span>
                              </div>
                            </td>
                            <td className="p-2.5 border-r border-black align-top">
                              {item.requires_scraping ? (
                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-400 text-[9px] font-black uppercase px-2 py-0.5 select-none block text-center whitespace-nowrap">
                                  📡 Scraper Active
                                </span>
                              ) : (
                                <span className="bg-gray-100 text-gray-500 border border-gray-300 text-[9px] font-bold uppercase px-2 py-0.5 select-none block text-center whitespace-nowrap">
                                  Manual Only
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 border-r border-black align-top leading-normal">
                              {storeKeys.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {storeKeys.map((storeKey) => {
                                    const sInfo = item.stores[storeKey];
                                    const isPromo = (sInfo.is_on_sale === 1 || sInfo.is_on_sale === true) && !(sInfo.valid_until && isSaleExpiredAdmin(sInfo.valid_until));
                                    const isTracked = sInfo.track_pricing === true || sInfo.track_pricing === 1;
                                    const isVerified = sInfo.is_verified === true || sInfo.is_verified === 1;
                                    return (
                                      <div
                                        key={storeKey}
                                        className={`p-1.5 border border-black rounded-sm max-w-[240px] text-[10px] space-y-0.5 ${
                                          isPromo ? "bg-amber-50" : "bg-white"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2 font-extrabold text-[9px] uppercase border-b border-gray-150 pb-0.5">
                                          <span className="text-black">{dynamicStoreNames[storeKey] || storeKey}</span>
                                          <div className="flex gap-1 items-center">
                                            {isVerified && <span className="text-[8px] text-blue-700 bg-blue-50 px-1 border border-blue-300" title="Link is verified">✓ Verified</span>}
                                            {isTracked && <span className="text-[8px] text-green-700 bg-green-50 px-1 border border-green-300">Tracking</span>}
                                          </div>
                                        </div>
                                        <div className="font-medium text-gray-700 font-mono flex flex-col">
                                          {sInfo.regular_price != null ? (
                                            <span>Reg: <strong className="text-black">${Number(sInfo.regular_price).toFixed(2)}</strong></span>
                                          ) : (
                                            <span className="text-gray-300">Reg: --</span>
                                          )}
                                          {isPromo && sInfo.sale_price != null ? (
                                            <span className="text-amber-800">
                                              Sale: <strong className="text-red-650">${Number(sInfo.sale_price).toFixed(2)}</strong>
                                            </span>
                                          ) : null}
                                          {sInfo.upc && <span className="text-[8px] text-gray-400">UPC: {sInfo.upc}</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-[10px] text-gray-400 italic font-medium">No store specific definitions mapped</span>
                              )}
                            </td>
                            <td className="p-2.5 align-top text-right space-y-1">
                              <div className="flex justify-end items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditCatalog(item)}
                                  className="p-1 border border-black bg-white hover:bg-indigo-50 text-black flex items-center gap-1 text-[10px] font-black uppercase tracking-wider"
                                  title="Edit catalog details"
                                >
                                  <Edit2 className="w-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteCatalogItem(item.id, item.name)}
                                  className="p-1 border border-black bg-white hover:bg-red-50 text-red-600 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider"
                                  title="Purge catalog item"
                                >
                                  <Trash2 className="w-3" /> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {filteredCatalogItems.length > visibleCatalogCount && (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => setVisibleCatalogCount((prev) => prev + 30)}
                      className="text-xs font-black uppercase bg-white hover:bg-gray-150 border-2 border-black pr-4 pl-4 pt-1.5 pb-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all"
                    >
                      Load More Products (+30)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10 border-2 border-dashed border-gray-300 bg-gray-50">
                <p className="text-sm font-bold text-gray-500">No catalog items found matching filters.</p>
              </div>
            )}
          </div>

          {/* Active Prices Registry Manager Section */}
          <div className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-1.5 border-b-2 border-black">
              <h2 className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-500" /> Scraped Prices Registry CRUD
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddPrice}
                  className="text-xs font-black uppercase tracking-wider text-black hover:bg-emerald-50 border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all bg-emerald-400"
                >
                  + Add Custom Price
                </button>
                {Object.keys(prices).length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllPrices}
                    className="text-xs font-black uppercase tracking-wider text-red-600 hover:bg-red-50 border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all bg-white"
                  >
                    Delete all loaded prices
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-6 font-medium leading-relaxed">
              Verify, edit, create, or delete items inside the raw prices registry. Active, verified prices are automatically matched to products in the Item Catalog that share the corresponding display or scraper search match identifier.
            </p>

            {/* Price Form Neo-Brutalist Drawer / Card */}
            {addingPrice && (
              <form onSubmit={handleSavePriceFormSubmit} className="bg-amber-50 border-2 border-black p-5 mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-fade-in text-black">
                <div className="flex items-center justify-between pb-2 mb-4 border-b border-black">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#92400e]">
                    {editingPriceUpc ? `✏ Edit Price Entry (UPC: ${editingPriceUpc})` : "⚡ Add New Price Entry"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingPrice(false);
                      setEditingPriceUpc(null);
                    }}
                    className="p-1 hover:bg-amber-100 border border-transparent hover:border-black rounded text-black"
                  >
                    <X className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* UPC input */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">UPC / SKU identifier</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. 058779183492"
                        value={priceForm.upc}
                        onChange={(e) => setPriceForm({ ...priceForm, upc: e.target.value })}
                        disabled={!!editingPriceUpc}
                        className="flex-1 px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black disabled:bg-gray-100 disabled:text-gray-500"
                        required
                      />
                      {!editingPriceUpc && (
                        <button
                          type="button"
                          onClick={() => setPriceForm({ ...priceForm, upc: `manual-${Date.now()}` })}
                          className="px-2.5 py-1 text-[10px] uppercase font-black bg-gray-200 border border-black hover:bg-gray-300"
                        >
                          Gen ID
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Item Display Name */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Display Product Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Fresh Red Strawberries"
                      value={priceForm.item_name}
                      onChange={(e) => setPriceForm({ ...priceForm, item_name: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                      required
                    />
                  </div>

                  {/* Scraper Config Name */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Scraper Match ID (leave blank to match Product Name)</label>
                    <input
                      type="text"
                      placeholder="e.g. strawberries"
                      value={priceForm.config_name}
                      onChange={(e) => setPriceForm({ ...priceForm, config_name: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                    />
                  </div>

                  {/* Target Store Select */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Target Grocery Store</label>
                    <select
                      value={getNormalizedStoreKey(priceForm.store_id)}
                      onChange={(e) => {
                        const storeKey = e.target.value;
                        const storeObj = scrapeConfig.stores?.[storeKey] || { store_name: storeKey, store_id: storeKey };
                        setPriceForm({
                          ...priceForm,
                          store_id: storeObj.store_id || storeKey,
                          store_name: storeObj.store_name
                        });
                      }}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                    >
                      {Object.entries(scrapeConfig.stores || {}).map(([key, store]: [string, any]) => (
                        <option key={key} value={key}>
                          {store.store_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const normalizedCurrentStoreKey = getNormalizedStoreKey(priceForm.store_id);
                    const normalizedOriginalStoreKey = originalStoreId ? getNormalizedStoreKey(originalStoreId) : "";
                    const isStoreChanged = normalizedOriginalStoreKey && normalizedCurrentStoreKey !== normalizedOriginalStoreKey;

                    if (!isStoreChanged) return null;

                    const matchingConfigItem = scrapeConfig?.items?.find(
                      (sc: any) => sc.name.toLowerCase() === priceForm.item_name.toLowerCase()
                    );
                    const hasStoreConfig = matchingConfigItem?.stores?.[normalizedCurrentStoreKey];

                    const handleClearFields = () => {
                      setPriceForm(prev => ({
                        ...prev,
                        regular_price: "",
                        sale_price: "",
                        is_on_sale: false,
                        lookup_url: ""
                      }));
                    };

                    const handleAutofillLink = () => {
                      if (hasStoreConfig) {
                        setPriceForm(prev => ({
                          ...prev,
                          lookup_url: hasStoreConfig.url || "",
                          upc: hasStoreConfig.upc || prev.upc
                        }));
                      }
                    };

                    const handleSearchCopy = () => {
                      if (priceForm.item_name) {
                        navigator.clipboard.writeText(priceForm.item_name);
                      }
                    };

                    return (
                      <div className="md:col-span-2 bg-rose-50 border-2 border-red-500 p-4 shadow-[2px_2px_0px_0px_rgba(239,68,68,1)] text-red-950 space-y-2.5 text-left my-2 animate-fade-in">
                        <div className="flex flex-wrap items-center gap-2 font-black text-xs uppercase tracking-wider text-red-800">
                          <span className="bg-red-600 text-white rounded px-1.5 py-0.5 text-[9px] font-black">STORE MISMATCH</span>
                          Changing Target Store from {getStoreDisplayNameDef(scrapeConfig, normalizedOriginalStoreKey)} to {getStoreDisplayNameDef(scrapeConfig, normalizedCurrentStoreKey)}
                        </div>
                        <p className="text-xs font-bold leading-relaxed text-red-900">
                          The current price, sale information, and product detail URL in the form fields belong to <span className="underline">{getStoreDisplayNameDef(scrapeConfig, normalizedOriginalStoreKey)}</span>. Saving this directly under <span className="underline">{getStoreDisplayNameDef(scrapeConfig, normalizedCurrentStoreKey)}</span> would result in incorrect data.
                        </p>

                        <div className="flex flex-wrap gap-2 pt-1 border-t border-dashed border-red-400">
                          <button
                            type="button"
                            onClick={() => handleCreateNewScrapeLinkFromMismatch(normalizedCurrentStoreKey)}
                            className="px-2.5 py-1 text-[10px] font-extrabold uppercase text-white bg-blue-600 hover:bg-blue-700 border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-1"
                          >
                            🆕 Create Scraper Config & Link (Safe)
                          </button>

                          <button
                            type="button"
                            onClick={handleClearFields}
                            className="px-2.5 py-1 text-[10px] font-extrabold uppercase text-white bg-red-600 hover:bg-red-700 border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-1"
                          >
                            🧹 Clear Previous Pricing (Safe)
                          </button>

                          {hasStoreConfig && (
                            <button
                              type="button"
                              onClick={handleAutofillLink}
                              className="px-2.5 py-1 text-[10px] font-extrabold uppercase text-emerald-950 bg-emerald-400 hover:bg-emerald-500 border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-1"
                            >
                              ⚡ Autofill URL & SKU from Config
                            </button>
                          )}

                          <a
                            href={getSearchUrlForStore(normalizedCurrentStoreKey, priceForm.item_name, scrapeConfig)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleSearchCopy}
                            className="px-2.5 py-1 text-[10px] font-extrabold uppercase text-black bg-amber-400 hover:bg-amber-500 border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all inline-flex items-center gap-1"
                          >
                            🔍 Search {getStoreDisplayNameDef(scrapeConfig, normalizedCurrentStoreKey)} (Copies Name)
                          </a>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Regular retail price */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Regular retail price ($)</label>
                    <input
                      type="text"
                      placeholder="e.g. 4.99 (numbers or null)"
                      value={priceForm.regular_price}
                      onChange={(e) => setPriceForm({ ...priceForm, regular_price: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                    />
                  </div>

                  {/* Sale Price */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Active sale price ($)</label>
                    <input
                      type="text"
                      placeholder="e.g. 2.99"
                      value={priceForm.sale_price}
                      onChange={(e) => setPriceForm({ ...priceForm, sale_price: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                    />
                  </div>

                  {/* Sale Valid Until Date */}
                  <div>
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Sale Valid Until (YYYY-MM-DD)</label>
                    <input
                      type="text"
                      placeholder="e.g. 2026-06-10"
                      value={priceForm.valid_until}
                      onChange={(e) => setPriceForm({ ...priceForm, valid_until: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                    />
                  </div>

                  {/* Sale Flag checkbox */}
                  <div className="flex items-center gap-2 mt-4 md:mt-6">
                    <input
                      type="checkbox"
                      id="isOnSaleCheckbox"
                      checked={priceForm.is_on_sale}
                      onChange={(e) => setPriceForm({ ...priceForm, is_on_sale: e.target.checked })}
                      className="accent-black w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="isOnSaleCheckbox" className="text-xs font-black cursor-pointer uppercase select-none text-black">
                      Mark as currently "On Sale"
                    </label>
                  </div>

                  {/* Store lookup url */}
                  <div className="md:col-span-2">
                    <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Product Link / Source URL</label>
                    <input
                      type="url"
                      placeholder="https://www.foodbasics.ca/p/..."
                      value={priceForm.lookup_url}
                      onChange={(e) => setPriceForm({ ...priceForm, lookup_url: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-dashed border-gray-300">
                  <button
                    type="button"
                    onClick={() => {
                      setAddingPrice(false);
                      setEditingPriceUpc(null);
                    }}
                    className="px-4 py-1.5 text-xs font-black uppercase text-black hover:bg-gray-100 border border-black"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-1.5 text-xs font-black uppercase text-white bg-black hover:bg-emerald-600 border border-black"
                  >
                    Save Price Record
                  </button>
                </div>
              </form>
            )}

            {/* Prices Filtering layout */}
            <div className="relative mb-5">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Filter catalog prices (UPC, display name, config name)..."
                value={pricesSearch}
                onChange={(e) => setPricesSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border-2 border-black bg-white focus:outline-none font-bold placeholder-gray-400 text-black"
              />
              {pricesSearch && (
                <button
                  type="button"
                  onClick={() => setPricesSearch("")}
                  className="absolute right-3 top-2.5 text-xs font-bold text-gray-400 hover:text-black uppercase"
                >
                  Clear
                </button>
              )}
            </div>

            {pricesLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="animate-spin rounded-full h-6 w-6 border-2 border-black border-t-transparent" />
              </div>
            ) : Object.keys(prices).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
                {Object.entries(prices)
                  .filter(([upc, entry]: [string, any]) => {
                    if (!pricesSearch.trim()) return true;
                    const term = pricesSearch.toLowerCase();
                    return (
                      upc.toLowerCase().includes(term) ||
                      (entry.item_name || "").toLowerCase().includes(term) ||
                      (entry.config_name || "").toLowerCase().includes(term) ||
                      (entry.store_name || "").toLowerCase().includes(term)
                    );
                  })
                  .map(([upc, entry]: [string, any]) => {
                    const isPriceCorrupted = (price: any): boolean => {
                      if (!price) return true;
                      const regPrice = price.regular_price;
                      const isRegInvalid = regPrice === null || regPrice === undefined || typeof regPrice !== "number" || isNaN(regPrice) || regPrice <= 0;
                      const isOnSale = price.is_on_sale === 1;
                      const salePrice = price.sale_price;
                      const isSaleInvalid = isOnSale && (salePrice === null || salePrice === undefined || typeof salePrice !== "number" || isNaN(salePrice) || salePrice < 0);
                      return isRegInvalid || isSaleInvalid;
                    };

                    const corrupted = isPriceCorrupted(entry);

                    return (
                      <div
                        key={upc}
                        className={`border-2 border-black p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[1px] hover:-translate-y-[1px] transition-all flex flex-col justify-between ${
                          corrupted ? "bg-rose-50" : "bg-white"
                        }`}
                      >
                        <div>
                          {/* Title & Status indicator */}
                          <div className="flex items-start justify-between gap-1 mb-1.5">
                            <h4 className="font-bold text-sm text-black truncate pr-1 text-left w-2/3" title={entry.item_name}>
                              {entry.item_name || entry.config_name || "Untitled Item"}
                            </h4>
                            <div>
                              {corrupted ? (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider text-rose-700 bg-rose-100 px-1.5 py-0.5 border border-rose-600 rounded">
                                  ⚠ CORRUPT
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-1.5 py-0.5 border border-emerald-500 rounded">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Metadata labels */}
                          <div className="space-y-1 text-[10px] text-gray-500 font-extrabold font-mono uppercase tracking-tight text-left">
                            <p>
                              <span className="text-gray-400">UPC:</span> {upc}
                            </p>
                            <p>
                              <span className="text-gray-400">STORE:</span> {entry.store_name || "Food Basics"}
                            </p>
                            {entry.valid_until && (
                              <p>
                                <span className="text-gray-400">VALID UNTIL:</span>{" "}
                                <span className={isSaleExpiredAdmin(entry.valid_until) ? "text-amber-500 font-black" : "text-[#111827] font-black"}>
                                  {entry.valid_until}
                                  {isSaleExpiredAdmin(entry.valid_until) && (
                                    <span className="ml-1 text-[8px] bg-amber-100 text-amber-800 border border-yellow-500 px-1 py-0.2 font-black inline-block uppercase">EXPIRED</span>
                                  )}
                                </span>
                              </p>
                            )}
                            {(entry.config_name && entry.config_name !== entry.item_name) && (
                              <p>
                                <span className="text-gray-400 font-mono">MATCH KEY:</span> {entry.config_name}
                              </p>
                            )}
                            <p>
                              <span className="text-gray-400">LAST SCANNED/UPDATED:</span>{" "}
                              {entry.last_updated ? new Date(entry.last_updated).toLocaleString() : "Never"}
                            </p>
                            
                            {/* Multistore listing */}
                            {entry.stores && typeof entry.stores === "object" && Object.keys(entry.stores).length > 0 && (
                              <div className="mt-2 pt-1.5 border-t border-dashed border-gray-100 flex flex-wrap gap-1">
                                {Object.entries(entry.stores).map(([sKey, sInfo]: [string, any]) => {
                                  const label = getStoreDisplayNameDef(scrapeConfig, sKey);
                                  const expiredVal = sInfo.is_on_sale && sInfo.valid_until && isSaleExpiredAdmin(sInfo.valid_until);
                                  const priceVal = (sInfo.is_on_sale && sInfo.sale_price !== null && sInfo.sale_price !== undefined) ? sInfo.sale_price : sInfo.regular_price;
                                  
                                  const TagContent = (
                                    <>
                                      <span className="text-gray-400">{label}:</span>
                                      <span className="text-black">${priceVal !== null && priceVal !== undefined && typeof priceVal === 'number' ? priceVal.toFixed(2) : "N/A"}</span>
                                      {sInfo.is_on_sale === 1 && (
                                        <span className={expiredVal ? "text-amber-600 font-extrabold ml-0.5 text-[8.5px] uppercase" : "text-red-650 font-extrabold ml-0.5 text-[8.5px] uppercase"} title={expiredVal ? "Expired Sale" : "On Sale"}>
                                          {expiredVal ? "expired" : "sale"}
                                        </span>
                                      )}
                                      {sInfo.valid_until && (
                                        <span className={expiredVal ? "text-amber-700 font-black ml-0.5 font-mono" : "text-gray-450 font-medium ml-0.5 font-mono"}>
                                          ({sInfo.valid_until})
                                        </span>
                                      )}
                                      {sInfo.lookup_url && (
                                        <ExternalLink className="w-2.5 h-2.5 ml-0.5 text-emerald-600 inline-block" />
                                      )}
                                    </>
                                  );

                                  if (sInfo.lookup_url) {
                                    return (
                                      <a
                                        key={sKey}
                                        href={sInfo.lookup_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[8px] sm:text-[9px] bg-emerald-50/50 hover:bg-emerald-100/70 border border-emerald-300 hover:border-emerald-400 px-1.5 py-0.5 font-bold inline-flex items-center gap-0.5 rounded transition-all cursor-pointer"
                                        title={`View product page on ${label}`}
                                      >
                                        {TagContent}
                                      </a>
                                    );
                                  }

                                  return (
                                    <span key={sKey} className="text-[8px] sm:text-[9px] bg-gray-50 border border-gray-200 px-1.5 py-0.5 font-bold text-gray-700 inline-flex flex-wrap items-center gap-0.5 rounded" title={`${label}${sInfo.valid_until ? ` (valid until ${sInfo.valid_until})` : ""}`}>
                                      {TagContent}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Regular & sale values */}
                          <div className="flex items-center gap-3.5 mt-3 pt-2.5 border-t border-dashed border-gray-200">
                            <div className="text-left">
                              <span className="text-[10px] text-gray-400 uppercase font-black block">Regular Price</span>
                              <span className="text-sm font-black text-black">
                                {entry.regular_price !== null && typeof entry.regular_price === "number" && !isNaN(entry.regular_price)
                                  ? `$${entry.regular_price.toFixed(2)}`
                                  : <span className="text-rose-600">null / missing</span>}
                              </span>
                            </div>

                            {entry.is_on_sale === 1 ? (
                              <div className="text-left">
                                <span className="text-[10px] text-red-600 uppercase font-black block flex items-center gap-0.5">Sale price 🔥</span>
                                <span className="text-sm font-black text-red-600">
                                  {entry.sale_price !== null && typeof entry.sale_price === "number" && !isNaN(entry.sale_price)
                                    ? `$${entry.sale_price.toFixed(2)}`
                                    : <span className="text-rose-600">null / missing</span>}
                                </span>
                              </div>
                            ) : (
                              <div className="text-left">
                                <span className="text-[10px] text-gray-400 uppercase font-black block">Sale price</span>
                                <span className="text-xs font-bold text-gray-400">No sale active</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Triggers */}
                        <div className="flex items-center justify-between gap-2 mt-4 pt-2.5 border-t border-gray-100 flex-shrink-0">
                          <div>
                            {entry.lookup_url && (
                              <a
                                href={entry.lookup_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 hover:text-emerald-700 hover:underline"
                              >
                                <span>Inspect Store Link</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-black">
                            <button
                              type="button"
                              onClick={() => handleOpenEditPrice(upc, entry)}
                              className="p-1 px-1.5 text-[10px] font-black uppercase flex items-center gap-0.5 border border-black bg-white hover:bg-gray-100 transition-colors shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                              title="Edit Price fields"
                            >
                              <Edit2 className="w-3 h-3 text-black" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePrice(upc)}
                              className="p-1 px-1.5 text-[10px] font-black uppercase flex items-center gap-0.5 border border-black bg-white text-red-600 hover:bg-red-50 transition-colors shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                              title="Purge Price"
                            >
                              <Trash2 className="w-3 h-3 text-red-600" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="text-center py-10 border-2 border-dashed border-gray-300 bg-gray-50">
                <p className="text-sm font-bold text-gray-500">No prices match your search filter or registry is empty.</p>
                <button
                  type="button"
                  onClick={handleOpenAddPrice}
                  className="mt-3 text-xs font-black uppercase tracking-wider bg-black hover:bg-emerald-600 text-white px-3 py-1.5 border border-black"
                >
                  Create manual price record
                </button>
              </div>
            )}
          </div>

          {/* Catalog & Pricing Importers Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
            {/* Catalog File Import CSV Block */}
            <div className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <h2 className="text-base font-black uppercase tracking-tight mb-4 pb-1.5 border-b-2 border-black">
                CSV Catalog Uploader
              </h2>
              <CsvUpload onUploadComplete={fetchItems} />
              <p className="mt-3 text-xs text-gray-500 font-medium leading-relaxed">
                Accepts simple CSV files containing categories in column A and product names in column B. Great for bulk loading entire shopping menus in one click.
              </p>
            </div>

            {/* Direct JSON Prices Uploader Block */}
            <div className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <h2 className="text-base font-black uppercase tracking-tight mb-4 pb-1.5 border-b-2 border-black">
                Direct JSON Prices Importer
              </h2>
              <JsonPricesUpload onUploadComplete={handlePricesUploaded} />
              <p className="mt-3 text-xs text-gray-500 font-medium leading-relaxed">
                Manually upload or drag-and-drop a custom <code>prices.json</code> configuration. This will update or merge store pricing values directly into the active Combined Catalog Registry database.
              </p>
            </div>

            {/* Google Drive Import/Export Backup Block */}
            <GoogleDriveBackup items={items} scrapeConfig={scrapeConfig} onRestoreComplete={fetchItems} />
          </div>

          {/* Gemini AI Product Matching Test-Bed & Playground (Approach A) */}
          <div className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-black">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-1.5 border-b-2 border-black">
              <h2 className="text-base font-black uppercase tracking-tight flex items-center gap-1.5 text-black">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                🤖 Gemini Product Matcher (Test & Validate)
              </h2>
              <div className="flex items-center gap-2 font-black">
                <button
                  type="button"
                  onClick={runAllMatchTestsInUI}
                  disabled={testRunnerLoading}
                  className="text-xs font-black uppercase tracking-wider bg-black hover:bg-emerald-600 disabled:bg-gray-400 text-white px-3 py-1.5 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all inline-flex items-center gap-1 cursor-pointer"
                >
                  {testRunnerLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Run All Match Tests
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-6 font-medium leading-relaxed">
              Verify the exact product alignment logic. Brand mismatches are treated as acceptable minor penalties, while packaging type differences (pricing avocados per individual unit vs bulk weight bags) or critical style descriptions (creamy vs crunchy, lactose-free) are penalized or rejected. Try a custom text match below, or run the automated spec-tests suite.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Interactive Pairing Playground */}
              <div className="space-y-4 border-2 border-black p-4 bg-gray-50">
                <h3 className="text-xs font-black uppercase tracking-wider text-black pb-1 border-b border-black/10 flex items-center gap-1">
                  <Search className="w-3.5 h-3.5" /> Mismatch Interactive Playground
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                      scraped product title
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 text-xs font-mono p-2.5 border-2 border-black bg-white focus:bg-emerald-50 outline-none text-black font-semibold"
                        placeholder="e.g. Demps Whole Wheat loaf 600g"
                        value={playgroundScrapedText}
                        onChange={(e) => setPlaygroundScrapedText(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => evaluatePlaygroundMatch(playgroundScrapedText)}
                        disabled={playgroundLoading}
                        className="bg-black hover:bg-emerald-600 disabled:bg-gray-400 text-white font-black uppercase text-xs tracking-wider px-3 py-2 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all inline-flex items-center gap-1 cursor-pointer"
                      >
                        {playgroundLoading ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          "Match"
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Playground Result Card */}
                  {playgroundResult && (
                    <div className="bg-white border-2 border-black p-3.5 space-y-2 rounded-sm animate-fade-in text-black">
                      <div className="text-xs flex items-center justify-between border-b border-gray-100 pb-1.5 mb-1.5 text-black">
                        <span className="font-extrabold uppercase text-gray-400 text-[10px]">Evaluation Result:</span>
                        <span className="text-[10px] font-mono font-bold bg-amber-50 rounded px-1.5">
                          {playgroundResult.isFallback ? "Algorithmic Fallback Engine" : "Gemini 3.5 Flash"}
                        </span>
                      </div>

                      {playgroundResult.isFallback && (
                        <div className="bg-amber-50 border border-amber-300 text-amber-900 text-[10px] font-bold p-2 mb-2 flex flex-col gap-1 rounded-sm leading-normal">
                          <div className="flex items-center gap-1 select-none text-amber-800">
                            <CircleAlert className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="uppercase tracking-wider font-extrabold">Local Fallback Engaged</span>
                          </div>
                          <p className="font-semibold text-gray-700">
                            {playgroundResult.isApiError 
                              ? "The Gemini API credits/allowances are depleted. Successfully used offline heuristic matcher."
                              : "Using client-configured heuristic matching rules."}
                          </p>
                        </div>
                      )}

                      <div className="space-y-2.5 text-black">
                        {playgroundResult.matched_id ? (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1 text-black">
                              <span className="text-xs font-bold">Suggested Catalog Item:</span>
                              <span className="text-xs font-black uppercase bg-emerald-100 border border-emerald-500 text-emerald-800 px-1.5 py-0.2">
                                {items.find(i => i.id === playgroundResult.matched_id)?.name || "Linked Entry"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-black font-semibold">Match Confidence:</span>
                              <span className={`text-xs font-black ${playgroundResult.confidence >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {playgroundResult.confidence}%
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs font-bold text-black font-semibold">Match Outcome:</span>
                              <span className="text-xs font-black uppercase bg-red-100 border border-red-500 text-red-800 px-1.5 py-0.2">
                                NO MATCH (&lt;70% confidence)
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 font-semibold mb-2">
                              The scraper name doesn't match an active catalog item. Proposing list creation:
                            </p>
                          </div>
                        )}

                        <p className="text-[11px] text-gray-600 leading-relaxed italic border-l-2 border-black pl-2 font-medium">
                          "{playgroundResult.reason}"
                        </p>

                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 border uppercase ${playgroundResult.unit_match ? 'bg-emerald-50 text-emerald-800 border-emerald-400' : 'bg-red-50 text-red-800 border-red-400'}`}>
                            {playgroundResult.unit_match ? '✔ Compatible Weights/Units' : '⚠ Weight-Unit Mismatch'}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 border uppercase ${playgroundResult.brand_match ? 'bg-emerald-50 text-emerald-800 border-emerald-400' : 'bg-amber-50 text-amber-800 border-amber-400'}`}>
                            {playgroundResult.brand_match ? '✔ Brand Match' : 'ℹ Brand Substitution'}
                          </span>
                        </div>

                        {playgroundResult.proposed_new_item && (
                          <div className="bg-amber-50/50 border border-dashed border-amber-500 p-2.5 text-xs text-black">
                            <span className="font-extrabold uppercase text-[9px] text-amber-800 tracking-wider block mb-1">Proposed Addition:</span>
                            <p className="font-black">Name: <span className="text-amber-950 font-extrabold">{playgroundResult.proposed_new_item.name}</span></p>
                            <p className="font-black mt-0.5">Category: <span className="text-amber-950 font-extrabold">{playgroundResult.proposed_new_item.category}</span></p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Automated Test Suite Spec Coverage */}
              <div className="space-y-4 border-2 border-black p-4 bg-gray-50">
                <h3 className="text-xs font-black uppercase tracking-wider text-black pb-1 border-b border-black/10 flex items-center gap-1">
                  <Database className="w-3.5 h-3.5" /> Spec Test Coverage Report
                </h3>

                {testRunnerResults ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 bg-black text-white p-3 border-2 border-black mb-2 select-none">
                      <div className="text-center flex-1">
                        <span className="block text-[10px] font-bold uppercase text-gray-400">Total Specs</span>
                        <span className="text-xl font-black">{testRunnerResults.total}</span>
                      </div>
                      <div className="text-center flex-1">
                        <span className="block text-[10px] font-bold uppercase text-emerald-400">Passed</span>
                        <span className="text-xl font-black text-emerald-400">{testRunnerResults.passed}</span>
                      </div>
                      <div className="text-center flex-1">
                        <span className="block text-[10px] font-bold uppercase text-rose-400">Failed</span>
                        <span className="text-xl font-black text-rose-400">{testRunnerResults.failed}</span>
                      </div>
                      <div className="text-center flex-1">
                        <span className="block text-[10px] font-bold uppercase text-teal-400">Status</span>
                        <span className={`text-xs font-black uppercase border px-1.5 block mt-1 ${testRunnerResults.failed === 0 ? 'bg-emerald-950 border-emerald-500 text-emerald-400' : 'bg-rose-950 border-rose-500 text-rose-400'}`}>
                          {testRunnerResults.failed === 0 ? "PASSED ALL" : "FAILING"}
                        </span>
                      </div>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto space-y-2 border border-black/10 p-1 bg-white">
                      {testRunnerResults.results.map((r: any) => (
                        <div key={r.caseId} className="p-2 border border-black bg-gray-50 flex flex-col justify-between">
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-gray-400 block font-mono">{r.caseId}</span>
                              <span className="text-xs font-extrabold text-black block">{r.description}</span>
                            </div>
                            <span className={`text-[9px] font-black uppercase px-1 border ${r.passed ? 'bg-emerald-100 border-emerald-500 text-emerald-800' : 'bg-red-100 border-red-500 text-red-800'}`}>
                              {r.passed ? '✔ PASSED' : '❌ FAILED'}
                            </span>
                          </div>
                          
                          <div className="text-[10px] font-mono text-gray-500 mt-1.5 space-y-0.5">
                            <p>Scraped Input: "{r.scrapedName}"</p>
                            <p>Resolved Item: {r.matchedId ? `ID: ${r.matchedId} (${r.confidence}%)` : "No Match"}</p>
                            {r.proposedName && <p>Proposal: "{r.proposedName}" ({r.proposedCategory})</p>}
                            <p className="text-[9px] text-gray-400 italic font-semibold">"{r.reason}"</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 bg-white border-2 border-dashed border-gray-300">
                    <p className="text-xs font-bold text-gray-400 leading-relaxed max-w-[280px] mx-auto">
                      Automated testing suite not executed yet. Click "Run All Match Tests" to evaluate confidence levels, brand substitutions, unit vs bulk weight constraints, and recommendation accuracy.
                    </p>
                    <button
                      type="button"
                      onClick={runAllMatchTestsInUI}
                      className="mt-3 text-xs font-black uppercase tracking-wider bg-black hover:bg-emerald-600 text-white px-3 py-1.5 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
                    >
                      Initialize Test suite
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Real-time Interactive Scraper runner list & Diagnostics */}
          <div className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-base font-black uppercase tracking-tight mb-4 pb-1.5 border-b-2 border-black flex items-center gap-2 text-rose-600">
              <Terminal className="w-5 h-5" /> Diagnostics & Live Scraper Test Bench
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Form / Controls */}
              <div className="space-y-4">
                <div className="bg-amber-50 border-2 border-amber-300 p-4 text-xs text-amber-900 space-y-2">
                  <div className="font-extrabold flex items-center gap-1.5 uppercase text-amber-800">
                    <CircleAlert className="w-4 h-4 flex-shrink-0 animate-pulse" /> Sandbox Proxy Environment Note
                  </div>
                  <p className="leading-relaxed">
                    This preview container is hosted on Google Cloud (Cloud Run). Google Cloud IPs are heavily flagged by Cloudflare, meaning that full price crawlers requesting Food Basics will hit a <strong>Managed Challenge / Turnstile Screen</strong> (Bypass required).
                  </p>
                  <p className="leading-relaxed">
                    If this occurs, you will see a <strong>"Turnstile / Perform security verification"</strong> notice in the terminal stream and screenshots. This is expected behavior for cloud sandboxes. Playwright does not re-install each run; it uses prebuilt local binary.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-black mb-1">
                      Test Specific Product URL (Optional)
                    </label>
                    <input
                      type="text"
                      className="w-full text-xs font-mono p-2 border-2 border-black bg-white focus:bg-amber-50 outline-none"
                      placeholder="e.g. https://www.foodbasics.ca/..."
                      value={testUrl}
                      onChange={(e) => setTestUrl(e.target.value)}
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Leave empty to run the normal scheduled load configuration items queue.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-black mb-1">
                      Execution Queue Limit
                    </label>
                    <select
                      className="w-full text-xs p-2 border-2 border-black bg-white outline-none font-bold"
                      value={scanLimit}
                      onChange={(e) => setScanLimit(parseInt(e.target.value, 10))}
                    >
                      <option value={1}>Limit to First 1 Item (Fast Single check)</option>
                      <option value={2}>Limit to First 2 Items (Fast Double check)</option>
                      <option value={5}>Limit to First 5 Items (Partial sync)</option>
                      <option value={0}>Run Entire Queue (Warning: Slow & Will deplete trial)</option>
                    </select>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      disabled={scraperStatus.isRunning || isRefreshing}
                      onClick={handleStartScraper}
                      className="flex-1 flex items-center justify-center gap-2 text-xs font-black uppercase bg-[#059669] hover:bg-[#047857] text-white border-2 border-black py-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <Play className="w-4 h-4" /> {scraperStatus.isRunning ? "Scraper Active..." : "Start Subprocess"}
                    </button>

                    {scraperStatus.isRunning && (
                      <button
                        type="button"
                        onClick={handleStopScraper}
                        className="flex-1 flex items-center justify-center gap-2 text-xs font-black uppercase bg-rose-600 hover:bg-rose-700 text-white border-2 border-black py-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                      >
                        <Square className="w-4 h-4" /> Abort active check
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={fetchScraperStatus}
                      className="flex items-center justify-center bg-white border-2 border-black p-2.5 hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                      title="Sync Status State"
                    >
                      <RefreshCw className={`w-4 h-4 ${scraperStatus.isRunning ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Terminal Logging Sandbox */}
              <div className="flex flex-col h-full min-h-[300px]">
                <div className="flex justify-between items-center bg-black text-rose-400 p-2 border-t-2 border-x-2 border-black font-semibold text-xs tracking-wider uppercase select-none rounded-t">
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${scraperStatus.isRunning ? "bg-amber-400 animate-ping" : "bg-green-500"}`} />
                    Scraper Pipeline Shell: {scraperStatus.isRunning ? "EXEC_ACTIVE" : "IDLE"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setScraperStatus(prev => ({ ...prev, logs: [] }))}
                    className="text-[10px] bg-gray-800 text-white border border-gray-600 px-1.5 py-0.5 hover:bg-gray-700"
                  >
                    Clear Feed
                  </button>
                </div>
                <div className="bg-black text-[#10B981] font-mono text-[11px] p-4 h-64 overflow-y-auto border-2 border-black rounded-b shadow-inner leading-relaxed select-text custom-scrollbar">
                  {scraperStatus.logs.length === 0 ? (
                    <span className="text-gray-500">Console inactive. Trigger starting the subprocess to output log messages here.</span>
                  ) : (
                    scraperStatus.logs.map((log, index) => {
                      let colorClass = "text-emerald-400";
                      if (log.includes("[STDERR]") || log.includes("failed") || log.includes("Error") || log.includes("attempt failed") || log.includes("✗")) {
                        colorClass = "text-rose-400 font-semibold";
                      } else if (log.includes("⚠️") || log.includes("ALERT") || log.includes("Bot Counter-measures")) {
                        colorClass = "text-amber-400 font-semibold";
                      } else if (log.includes("🧪 TESTMODE") || log.includes("◀")) {
                        colorClass = "text-cyan-400 font-bold";
                      } else if (log.includes("Scraped:")) {
                        colorClass = "text-blue-400 font-semibold";
                      }
                      return <div key={index} className={colorClass}>{log}</div>;
                    })
                  )}
                </div>

                {/* Screenshots Carousel block */}
                {scraperStatus.screenshots.length > 0 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200">
                    <span className="text-xs font-black uppercase text-red-800 block mb-2 flex items-center gap-1.5">
                      <Image className="w-4 h-4" /> Captures evidence ({scraperStatus.screenshots.length} files detected):
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {scraperStatus.screenshots.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setActiveScreenshot(s)}
                          className="text-[10px] font-mono bg-white border border-red-300 px-2.5 py-1 text-red-700 hover:bg-red-100 flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> {s.replace("failed_", "")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Evidence Screenshot Dialog Modal */}
          {activeScreenshot && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white border-2 border-black max-w-4xl w-full p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative flex flex-col">
                <div className="flex justify-between items-center pb-2 mb-2 border-b-2 border-black">
                  <span className="text-xs font-black uppercase text-rose-600 flex items-center gap-1">
                    <CircleAlert className="w-4 h-4" /> Screenshot diagnostic: {activeScreenshot}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveScreenshot(null)}
                    className="p-1 border border-black hover:bg-gray-100 text-black"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="max-h-[550px] overflow-y-auto border-2 border-black bg-gray-100">
                  {activeScreenshot.endsWith(".png") ? (
                    <img
                      src={`/api/scraper/screenshot/${activeScreenshot}`}
                      alt="Captured evidence of blocked crawler page"
                      className="w-full h-auto block"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <iframe
                      src={`/api/scraper/screenshot/${activeScreenshot}`}
                      title="HTML Diagnostics frame source code"
                      className="w-full h-[500px] border-none bg-white font-mono"
                      sandbox=""
                    />
                  )}
                </div>
                
                <div className="mt-4 flex justify-between items-center text-xs text-gray-500 font-medium">
                  <span>Press close to return to the interactive console dashboard.</span>
                  <button
                    type="button"
                    onClick={() => setActiveScreenshot(null)}
                    className="bg-black hover:bg-gray-800 text-white font-black uppercase text-[10px] tracking-wider px-4 py-2 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                  >
                    Close Image
                  </button>
                </div>
              </div>
            </div>
          )}

        </section>
      </div>
    </main>
  );
}
