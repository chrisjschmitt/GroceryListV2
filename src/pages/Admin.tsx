import { useState, useEffect } from "react";
import Link from "@/components/Link";
import { RegularItem, ScrapeConfig, ScrapeItemConfig, ScrapeStoreConfig } from "@/lib/types";
import CsvUpload from "@/components/CsvUpload";
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
  Grid
} from "lucide-react";

export default function AdminPage() {
  const [items, setItems] = useState<RegularItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSave, setAutoSave] = useState(() =>
    typeof window !== "undefined" ? getAutoSaveEnabled() : false
  );

  // Scrape config state
  const [scrapeConfig, setScrapeConfig] = useState<ScrapeConfig>({ stores: {} });
  const [scrapeLoading, setScrapeLoading] = useState(true);
  
  // Adding Scrape Item states (Option 3 integrated)
  const [addingItem, setAddingItem] = useState(false);
  const [newItemMode, setNewItemMode] = useState<"link" | "create">("link");
  const [newScrapeItem, setNewScrapeItem] = useState({ name: "", upc: "", url: "" });
  const [selectedCatalogName, setSelectedCatalogName] = useState("");
  const [newCatalogCategory, setNewCatalogCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [isCreatingCustomCategory, setIsCreatingCustomCategory] = useState(false);

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

  const [scrapeMsg, setScrapeMsg] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");

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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [itemsRes, configRes] = await Promise.all([
          fetch("/api/regular-items"),
          fetch("/api/scrape-config"),
        ]);
        const itemsData = await itemsRes.json();
        const configData = await configRes.json();
        if (!cancelled) {
          setItems(itemsData.items || []);
          if (configData.stores) setScrapeConfig(configData);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) {
          setLoading(false);
          setScrapeLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Ensure foodbasics store exists in config
  const ensureFoodBasicsStore = (config: ScrapeConfig): ScrapeConfig => {
    if (!config.stores.foodbasics) {
      config.stores.foodbasics = {
        enabled: true,
        store_name: "Food Basics",
        base_url: "https://www.foodbasics.ca",
        postal_code: "K7H3C6",
        store_id: "7923194",
      };
    }
    return config;
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
    };

    const updated = [...items, newItem];
    if (await saveCatalogItems(updated)) {
      setNewGlobalItemName("");
      setNewGlobalCategory("");
      setNewGlobalCustomCat("");
      setGlobalCatIsCustom(false);
    }
  };

  const handleStartEditCatalog = (item: RegularItem) => {
    setEditingCatalogId(item.id);
    setEditCatalogName(item.name);
  };

  const handleEditCatalogItemSubmit = async (id: string) => {
    const trimmed = editCatalogName.trim();
    if (!trimmed) {
      setEditingCatalogId(null);
      return;
    }

    const updated = items.map(item => 
      item.id === id ? { ...item, name: trimmed } : item
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
    if (!config.stores.foodbasics) {
      config.stores.foodbasics = {
        enabled: true,
        store_name: "Food Basics",
        base_url: "https://www.foodbasics.ca",
        postal_code: "K7H3C6",
        store_id: "7923194",
      };
    }

    // Check if UPC exists already in scraper
    let upc = newScrapeItem.upc.trim();
    if (!upc) {
      const match = newScrapeItem.url.match(/\/p\/(\d+)/);
      upc = match ? match[1] : `manual-${Date.now()}`;
    }

    const storeKey = "foodbasics";

    // Update or insert item in unified scraper config
    let existingItem = config.items.find(i => i.name.toLowerCase() === finalItemName.toLowerCase());
    if (existingItem) {
      existingItem.stores[storeKey] = {
        url: newScrapeItem.url.trim(),
        upc,
      };
    } else {
      config.items.push({
        name: finalItemName,
        stores: {
          [storeKey]: {
            url: newScrapeItem.url.trim(),
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
            url: editScrapeForm.url.trim(),
            upc: finalUpc,
          };
          config.items = config.items.filter(i => i.name !== editingScrapeUpc);
        } else {
          itemConfig.name = finalItemName;
          itemConfig.stores[editingScrapeStoreKey] = {
            url: editScrapeForm.url.trim(),
            upc: finalUpc,
          };
        }
      } else {
        itemConfig.stores[editingScrapeStoreKey] = {
          url: editScrapeForm.url.trim(),
          upc: finalUpc,
        };
      }
    } else {
      // Create new config item entry
      config.items.push({
        name: finalItemName,
        stores: {
          [editingScrapeStoreKey]: {
            url: editScrapeForm.url.trim(),
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
    if (confirm(`Remove the ${storeKey} link for "${itemName}" from the Price Checking configuration?`)) {
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
  const categoriesList = Array.from(new Set(items.map(item => item.category))).sort();

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

          {/* Price Check Scraper CRUD Configuration Section */}
          <div className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
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
                        disabled
                        className="w-full px-3 py-2 text-sm border-2 border-black bg-gray-100 font-bold text-gray-600 focus:outline-none cursor-not-allowed"
                        title="Currently, price check automation scripts are configured specifically for Food Basics. Multi-chain scripts can be enabled later."
                      >
                        <option value="foodbasics">Food Basics (Active & Monitored)</option>
                        <option value="metro">Metro (Coming soon...)</option>
                        <option value="loblaws">Loblaws (Coming soon...)</option>
                        <option value="nofrills">No Frills (Coming soon...)</option>
                      </select>
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">
                        ℹ Store price verification scripts currently support Food Basics. Select this store to configure item search lookups.
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
                                href={`https://www.foodbasics.ca/search?searchItem=${encodeURIComponent(selectedCatalogName)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-black uppercase bg-[#059669] hover:bg-emerald-700 text-white border-2 border-black px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                              >
                                <Search className="w-4 h-4" /> Open Food Basics Search
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
                                  href={`https://www.foodbasics.ca/search?searchItem=${encodeURIComponent(newScrapeItem.name.trim())}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-black uppercase bg-[#059669] hover:bg-emerald-700 text-white border-2 border-black px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                >
                                  <Search className="w-4 h-4" /> Open Food Basics Search
                                </a>
                              </div>
                              <p className="text-[10px] text-emerald-700 mt-1.5 font-medium leading-normal">
                                Click to open a direct browser session searching Food Basics, find the target item, and copy-paste its product URL.
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

                    {/* Food Basics URL */}
                    <div>
                      <label className="text-xs font-bold uppercase text-black block mb-0.5">Direct Product Listing Page URL (Required)</label>
                      <input
                        type="text"
                        placeholder="Paste the Food Basics page URL (e.g. https://www.foodbasics.ca/p/...)"
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
                <button
                  onClick={handleClear}
                  className="text-xs font-black uppercase tracking-wider text-red-600 hover:bg-red-50 border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all bg-white"
                >
                  Delete entire catalog
                </button>
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
            <div className="bg-emerald-50 border-2 border-black p-4 mb-6 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              <span className="text-xs font-black text-emerald-800 uppercase tracking-wider block mb-2">⚡ Quick catalog item creator</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Product Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Avocados, French Onion Dip"
                    value={newGlobalItemName}
                    onChange={(e) => setNewGlobalItemName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border-2 border-black bg-white focus:outline-none font-bold text-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-black tracking-wider text-gray-500 block mb-0.5">Category Folder</label>
                  
                  <div className="flex items-center gap-2 mb-1.5 mt-0.5">
                    <input
                      type="checkbox"
                      id="globalCatIsCustom"
                      checked={globalCatIsCustom}
                      onChange={(e) => setGlobalCatIsCustom(e.target.checked)}
                      className="accent-black w-3.5 h-3.5"
                    />
                    <label htmlFor="globalCatIsCustom" className="text-[10px] font-bold text-black">Add brand new category</label>
                  </div>

                  {globalCatIsCustom ? (
                    <input
                      type="text"
                      placeholder="Custom category (e.g. Frozen Food, Deli)"
                      value={newGlobalCustomCat}
                      onChange={(e) => setNewGlobalCustomCat(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs border-2 border-black bg-white focus:outline-none font-bold"
                    />
                  ) : (
                    <select
                      value={newGlobalCategory}
                      onChange={(e) => setNewGlobalCategory(e.target.value)}
                      className="w-full px-2.5 py-1 text-xs border-2 border-black bg-white focus:outline-none font-bold"
                    >
                      <option value="">-- Choose category --</option>
                      {categoriesList.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                  )}
                </div>
              </div>
              <button
                onClick={handleCreateGlobalItem}
                disabled={!newGlobalItemName.trim()}
                className="w-full py-1 text-xs font-black uppercase text-white bg-black hover:bg-emerald-600 disabled:opacity-40 border border-black text-center"
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
                  .sort(([a], [b]) => a.localeCompare(b))
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
                              <div key={item.id} className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-black shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                                <input
                                  type="text"
                                  value={editCatalogName}
                                  onChange={(e) => setEditCatalogName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleEditCatalogItemSubmit(item.id);
                                    if (e.key === "Escape") setEditingCatalogId(null);
                                  }}
                                  className="text-xs outline-none bg-transparent font-bold border-b border-black text-black w-32"
                                  autoFocus
                                />
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
                              <span>{item.name}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleStartEditCatalog(item)}
                                  className="text-gray-400 hover:text-[#059669] transition-colors p-0.5 mr-0.5 border border-transparent rounded hover:bg-gray-150"
                                  title={`Rename ${item.name}`}
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

        </section>
      </div>
    </main>
  );
}
