import { useState, useMemo, useEffect } from "react";
import { useOfflineStore } from "@/lib/client/use-offline-store";
import { GroceryItem, PriceEntry } from "@/lib/types";
import { ChevronDown, ChevronUp, Trash2, Plus, Minus, ListPlus, ExternalLink, RefreshCw } from "lucide-react";
import CatalogDrawer from "../../components/CatalogDrawer";
import SyncIndicator from "../../components/SyncIndicator";
import { isSaleExpired } from "../../components/GroceryItemRow";

function normalizeStoreKey(storeId: string): string {
  if (!storeId) return "foodbasics";
  const lower = String(storeId).toLowerCase().trim();
  if (lower.includes("metro")) return "metro";
  if (lower.includes("loblaws")) return "loblaws";
  if (lower.includes("nofrills")) return "nofrills";
  if (lower.includes("freshco") || lower.includes("freschco") || lower.includes("fresco") || lower.includes("fresh co")) return "freshco";
  if (lower.includes("yourindependentgrocer")) return "yourindependentgrocer";
  if (lower === "7923194" || lower.includes("foodbasics") || lower.includes("food basics")) return "foodbasics";
  if (lower.includes("walmart")) return "walmart";
  if (lower.includes("costco")) return "costco";
  return lower;
}

function getStoreActivePrice(storeInfo: any): number | null {
  if (!storeInfo) return null;
  const hasReg = storeInfo.regular_price !== null && storeInfo.regular_price !== undefined && storeInfo.regular_price > 0;
  const hasSale = storeInfo.is_on_sale && storeInfo.sale_price !== null && storeInfo.sale_price !== undefined && storeInfo.sale_price > 0;
  if (!hasReg && !hasSale) return null;
  
  if (storeInfo.is_on_sale && storeInfo.sale_price !== null && storeInfo.sale_price !== undefined && storeInfo.sale_price > 0) {
    return typeof storeInfo.sale_price === "number" ? storeInfo.sale_price : parseFloat(storeInfo.sale_price) || null;
  }
  return typeof storeInfo.regular_price === "number" ? storeInfo.regular_price : parseFloat(storeInfo.regular_price) || null;
}

const CATEGORY_WALKTHROUGH_ORDER = [
  "produce",
  "bakery",
  "meat",
  "dairy",
  "pantry",
  "frozen",
  "other"
];

function getCategoryWalkthroughIndex(categoryName: string): number {
  const lower = (categoryName || "").toLowerCase().trim();
  if (lower.includes("produce") || lower.includes("fruit") || lower.includes("veg")) return 0;
  if (lower.includes("bakery") || lower.includes("bread")) return 1;
  if (lower.includes("meat") || lower.includes("seafood") || lower.includes("poultry")) return 2;
  if (lower.includes("dairy") || lower.includes("egg") || lower.includes("cheese")) return 3;
  if (lower.includes("pantry") || lower.includes("pasta") || lower.includes("dry") || lower.includes("canned") || lower.includes("grocery")) return 4;
  if (lower.includes("frozen")) return 5;
  
  const idx = CATEGORY_WALKTHROUGH_ORDER.findIndex(c => lower.includes(c));
  return idx !== -1 ? idx : 999; // unknown category goes to the end
}

function abbreviateStoreName(name: string): string {
  if (!name) return "";
  const normalized = name.toLowerCase().trim();
  if (normalized.includes("food basics") || normalized === "fb" || normalized === "foodbasics") return "FB";
  if (normalized.includes("metro") || normalized === "mt") return "MT";
  if (normalized.includes("freshco") || normalized === "freshco") return "FC";
  if (normalized.includes("loblaws") || normalized === "loblaws") return "LB";
  if (normalized.includes("no frills") || normalized === "nofrills") return "NF";
  if (normalized.includes("your independent grocer") || normalized === "yourindependentgrocer") return "YIG";
  if (normalized.includes("walmart")) return "WM";
  if (normalized.includes("costco")) return "CC";
  return name.substring(0, 3).toUpperCase();
}

function getFlippSearchUrl(storeName: string, itemName: string, configName?: string, postalCode?: string): string {
  let queryStore = storeName || "";
  if (queryStore.toLowerCase().includes("food basics")) queryStore = "Food Basics";
  else if (queryStore.toLowerCase().includes("no frills")) queryStore = "No Frills";
  else if (queryStore.toLowerCase().includes("your independent grocer")) queryStore = "Your Independent Grocer";
  else if (queryStore.toLowerCase().includes("loblaws")) queryStore = "Loblaws";
  else if (queryStore.toLowerCase().includes("metro")) queryStore = "Metro";
  else if (queryStore.toLowerCase().includes("freshco") || queryStore.toLowerCase().includes("fresco") || queryStore.toLowerCase().includes("fresh co") || queryStore.toLowerCase().includes("freschco")) queryStore = "FreshCo";
  else if (queryStore.toLowerCase().includes("walmart")) queryStore = "Walmart";
  else if (queryStore.toLowerCase().includes("costco")) queryStore = "Costco";

  let queryItem = itemName || "";
  if (configName) {
    queryItem = configName;
  }
  queryItem = queryItem.replace(/lactancia/gi, "Lactantia");
  queryItem = queryItem
    .replace(/\s*\b\d+(?:\.\d+)?%/g, "") 
    .replace(/\s*\b\d+(?:g|l|ml|oz|kg|lb|pack)\b/gi, "") 
    .replace(/\s*\(\d+[^)]*\)/gi, "") 
    .replace(/\s*-\s*\d+$/gi, "") 
    .replace(/\s*-\s*\w+$/gi, "") 
    .trim();

  const fullQuery = `${queryStore} ${queryItem}`.trim();
  let url = `https://flipp.com/search?q=${encodeURIComponent(fullQuery)}`;
  if (postalCode) {
    url += `&postal_code=${encodeURIComponent(postalCode.trim())}`;
  }
  return url;
}

export default function ListsTab() {
  const store = useOfflineStore();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"byStore" | "all">("all");
  const [primaryStoreId, setPrimaryStoreId] = useState<string | null>(() => {
    return localStorage.getItem("primaryStoreId") || null;
  });

  const openFlyerForStoreItem = (
    storeName: string,
    itemName: string,
    configName?: string,
    postalCode?: string,
    scrapedName?: string,
    storeUrl?: string
  ) => {
    const newTab = window.open("about:blank", "_blank");
    if (!newTab) return;
    newTab.document.write(`
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Loading Flyer...</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background-color: #0f172a;
              color: #f8fafc;
              padding: 1.5rem;
              box-sizing: border-box;
            }
            .container {
              text-align: center;
              background: rgba(30, 41, 59, 0.7);
              backdrop-filter: blur(12px);
              padding: 2rem 1.5rem;
              border-radius: 1.25rem;
              border: 1px solid rgba(255, 255, 255, 0.08);
              box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.5);
              width: 100%;
              max-width: 480px;
              box-sizing: border-box;
            }
            .spinner {
              border: 3px solid rgba(255, 255, 255, 0.1);
              border-top: 3px solid #10b981;
              border-radius: 50%;
              width: 48px;
              height: 48px;
              animation: spin 0.8s linear infinite;
              margin: 0 auto 1.5rem;
              transition: all 0.3s ease;
            }
            h1 {
              font-size: 1.5rem;
              font-weight: 800;
              margin: 0 0 0.75rem;
              letter-spacing: -0.03em;
              line-height: 1.25;
            }
            p {
              font-size: 0.875rem;
              color: #94a3b8;
              margin: 0;
              line-height: 1.4;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div id="spinner" class="spinner"></div>
            <h1 id="status-title">Locating Weekly Flyer</h1>
            <p id="status-desc">Searching Flipp.com for local ${storeName.replace(/'/g, "\\'")} deals...</p>
            
            <div id="debug-panel" style="text-align: left; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); width: 100%;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <h3 style="margin: 0; font-size: 0.875rem; font-weight: 700; color: #10b981;">Flyer Debugger</h3>
                <button id="btn-pause" style="background: #334155; border: none; color: #f8fafc; font-size: 0.7rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-weight: 700;">Pause Redirect</button>
              </div>
              
              <div style="font-size: 0.75rem; color: #cbd5e1; line-height: 1.5;">
                <div style="margin-bottom: 0.4rem;"><strong>Store Name:</strong> <span id="debug-store"></span></div>
                <div style="margin-bottom: 0.4rem;"><strong>Original Item:</strong> <span id="debug-item"></span></div>
                <div style="margin-bottom: 0.4rem;"><strong>Clean Query:</strong> <span id="debug-query"></span></div>
                <div style="margin-bottom: 0.4rem;"><strong>Postal Code:</strong> <span id="debug-postal"></span></div>
                <div style="margin-bottom: 0.6rem;"><strong>Flipp API URL:</strong> <a id="debug-api-link" href="#" target="_blank" style="color: #3b82f6; text-decoration: underline; word-break: break-all;"></a></div>
              </div>
              
              <div style="margin-top: 0.75rem;">
                <div style="font-size: 0.75rem; font-weight: 700; margin-bottom: 0.4rem; color: #94a3b8;">Flipp Search Returns:</div>
                <div id="debug-results" style="max-height: 180px; overflow-y: auto; background: #0f172a; padding: 0.6rem; border-radius: 0.375rem; font-family: monospace; font-size: 0.7rem; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.05); line-height: 1.4;">
                  Loading results...
                </div>
              </div>
              
              <div style="margin-top: 1rem; display: flex; gap: 0.25rem;">
                <input id="input-custom-q" type="text" placeholder="Try custom query..." style="flex: 1; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 0.25rem; padding: 0.35rem 0.5rem; color: #f8fafc; font-size: 0.75rem; outline: none;">
                <button id="btn-custom-search" style="background: #10b981; border: none; color: white; border-radius: 0.25rem; padding: 0.35rem 0.75rem; font-size: 0.75rem; cursor: pointer; font-weight: 700;">Search</button>
              </div>
            </div>
          </div>

          <script>
            const storeName = "${storeName.replace(/'/g, "\\'")}";
            const itemName = "${itemName.replace(/'/g, "\\'")}";
            const configName = "${(configName || "").replace(/'/g, "\\'")}";
            const postalCode = "${(postalCode || "K7H3C6").replace(/'/g, "\\'")}";
            const scrapedName = "${(scrapedName || "").replace(/'/g, "\\'")}";
            const storeUrl = "${(storeUrl || "").replace(/'/g, "\\'")}";
            
            let redirectPaused = false;
            let redirectTimeout = null;
            
            document.getElementById('debug-store').innerText = storeName;
            document.getElementById('debug-item').innerText = itemName;
            document.getElementById('debug-postal').innerText = postalCode;
            
            let countdownInterval = null;
            let redirectUrl = null;
            let currentMessage = "";
            let secondsRemaining = 12;

            const btnPause = document.getElementById('btn-pause');
            
            function updateCountdownText() {
              if (redirectPaused) {
                document.getElementById('status-desc').innerText = currentMessage + " (Redirect Paused)";
              } else {
                document.getElementById('status-desc').innerText = currentMessage + " in " + secondsRemaining + "s...";
              }
            }

            btnPause.addEventListener('click', () => {
              redirectPaused = !redirectPaused;
              if (redirectPaused) {
                btnPause.innerText = 'Resume Redirect';
                btnPause.style.background = '#10b981';
                document.getElementById('spinner').style.animationPlayState = 'paused';
                if (countdownInterval) {
                  clearInterval(countdownInterval);
                  countdownInterval = null;
                }
              } else {
                btnPause.innerText = 'Pause Redirect';
                btnPause.style.background = '#334155';
                document.getElementById('spinner').style.animationPlayState = 'running';
                startCountdownTimer();
              }
              updateCountdownText();
            });

            function startCountdown(url, message) {
              redirectUrl = url;
              currentMessage = message;
              secondsRemaining = 12;
              
              if (countdownInterval) clearInterval(countdownInterval);
              
              if (!redirectPaused) {
                startCountdownTimer();
              }
              updateCountdownText();
            }

            function startCountdownTimer() {
              countdownInterval = setInterval(() => {
                secondsRemaining--;
                if (secondsRemaining <= 0) {
                  clearInterval(countdownInterval);
                  window.location.href = redirectUrl;
                } else {
                  updateCountdownText();
                }
              }, 1000);
            }
            
            function performLookup(customQ) {
              const qParams = new URLSearchParams({
                storeName: storeName,
                itemName: itemName,
                configName: configName,
                postalCode: postalCode,
                scrapedName: customQ || scrapedName
              });
              
              const fetchUrl = "/api/flipp/resolve?" + qParams.toString();
              
              let cleanItem = customQ || scrapedName || configName || itemName;
              cleanItem = cleanItem.replace(/lactancia/gi, "Lactantia");
              
              cleanItem = cleanItem
                .replace(/\\s*\\b\\d+(?:\\.\\d+)?%/g, "")
                .replace(/\\s*\\b\\d+(?:g|l|ml|oz|kg|lb|pack)\\b/gi, "")
                .replace(/\\s*\\(\\d+[^)]*\\)/gi, "")
                .replace(/\\s*-\\s*\\d+$/gi, "")
                .replace(/\\s*-\\s*\\w+$/gi, "")
                .trim();
                
              const finalQuery = (storeName + " " + cleanItem).trim();
              document.getElementById('debug-query').innerText = finalQuery;
              
              const targetPostal = postalCode.trim().toUpperCase().replace(/\\s/g, "");
              const flippApiUrl = "https://backflipp.wishabi.com/flipp/items/search?locale=en-ca&postal_code=" + targetPostal + "&q=" + encodeURIComponent(finalQuery);
              
              const apiLink = document.getElementById('debug-api-link');
              apiLink.href = flippApiUrl;
              apiLink.innerText = flippApiUrl;
              
              document.getElementById('debug-results').innerText = "Querying Flipp API...";
              
              fetch(fetchUrl)
                .then(r => r.json())
                .then(data => {
                  fetch(flippApiUrl)
                    .then(fr => fr.json())
                    .then(fData => {
                      const items = fData.items || [];
                      if (items.length === 0) {
                        document.getElementById('debug-results').innerHTML = '<span style="color: #f87171;">No items found on Flipp for this query.</span>';
                      } else {
                        let html = "";
                        items.forEach(it => {
                          const isMerchantMatch = (it.merchant_name || "").toLowerCase().includes(storeName.toLowerCase()) || storeName.toLowerCase().includes((it.merchant_name || "").toLowerCase());
                          const color = isMerchantMatch ? "#34d399" : "#94a3b8";
                          const itemUrl = it.flyer_id
                            ? 'https://flipp.com/flyer/' + it.flyer_id + '?item_id=' + it.id + '&postal_code=' + postalCode
                            : 'https://flipp.com/item/' + it.id + '?postal_code=' + postalCode;
                          html += '<div style="margin-bottom: 0.6rem; padding-bottom: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.03); color: ' + color + ';">' +
                            '[' + it.merchant_name + '] <strong>' + it.name + '</strong><br/>' +
                            'Price: ' + (it.price ? '$' + it.price : 'N/A') + ' | ' +
                            '<a href="' + itemUrl + '" target="_blank" style="color: #3b82f6; text-decoration: underline; font-weight: bold;">Open Item ↗</a>' +
                            '</div>';
                        });
                        document.getElementById('debug-results').innerHTML = html;
                      }
                    })
                    .catch(err => {
                      document.getElementById('debug-results').innerText = "Error loading raw Flipp results: " + err.message;
                    });
                    
                  if (data && data.url) {
                    if (data.isMatch) {
                      document.getElementById('status-title').innerText = "Flyer Deal Found!";
                      startCountdown(data.url, "Redirecting to flyer deal");
                    } else {
                      document.getElementById('status-title').innerText = "Opening Flyer Search";
                      startCountdown(data.url, "Flyer deal not matched. Opening fallback flyer search");
                    }
                  } else {
                    document.getElementById('status-title').innerText = "No Match Found";
                    startCountdown(storeUrl || "https://flipp.com", "Redirecting to store page");
                  }
                })
                .catch(err => {
                  document.getElementById('debug-results').innerText = "API Error: " + err.message;
                  document.getElementById('status-title').innerText = "Error Occurred";
                  startCountdown("https://flipp.com/search?q=" + encodeURIComponent(finalQuery) + "&postal_code=" + postalCode, "Redirecting to Flipp search");
                });
            }
            
            performLookup();
            
            document.getElementById('btn-custom-search').addEventListener('click', () => {
              const customVal = document.getElementById('input-custom-q').value;
              if (customVal.trim()) {
                redirectPaused = true;
                btnPause.innerText = 'Resume Redirect';
                btnPause.style.background = '#10b981';
                document.getElementById('spinner').style.animationPlayState = 'paused';
                if (countdownInterval) {
                  clearInterval(countdownInterval);
                  countdownInterval = null;
                }
                performLookup(customVal);
              }
            });
          </script>
        </body>
      </html>
    `);
    newTab.document.close();
  };

  useEffect(() => {
    if (primaryStoreId) {
      localStorage.setItem("primaryStoreId", primaryStoreId);
    } else {
      localStorage.removeItem("primaryStoreId");
    }
  }, [primaryStoreId]);

  // Build name ➔ price lookup from scraped data (match on config_name and item_name)
  const priceLookup = useMemo(() => {
    const map = new Map<string, PriceEntry>();
    for (const entry of Object.values(store.prices)) {
      if (!entry) continue;

      const keysToRegister = [];
      if (entry.config_name) keysToRegister.push(entry.config_name.toLowerCase());
      if (entry.item_name) keysToRegister.push(entry.item_name.toLowerCase());

      for (const nameKey of keysToRegister) {
        const existing = map.get(nameKey);
        if (existing) {
          const mergedStores: Record<string, any> = {};

          const addOrMergeStore = (sId: string, sInfo: any) => {
            const normId = normalizeStoreKey(sId);
            const currentStorePrice = getStoreActivePrice(sInfo);
            if (currentStorePrice === null) return;
              
            const existingStorePriceInfo = mergedStores[normId];
            const existingStorePrice = existingStorePriceInfo
              ? (getStoreActivePrice(existingStorePriceInfo) ?? Infinity)
              : Infinity;

            if (!existingStorePriceInfo || currentStorePrice < existingStorePrice) {
              mergedStores[normId] = {
                ...sInfo,
                store_id: normId,
              };
            }
          };

          if (existing.stores && typeof existing.stores === "object") {
            for (const [sId, sInfo] of Object.entries(existing.stores)) {
              addOrMergeStore(sId, sInfo);
            }
          } else {
            const existingStoreId = existing.store_id || "foodbasics";
            addOrMergeStore(existingStoreId, {
              store_name: existing.store_name || "Food Basics",
              postal_code: existing.postal_code || "",
              store_id: existingStoreId,
              regular_price: existing.regular_price,
              sale_price: existing.sale_price,
              is_on_sale: existing.is_on_sale,
              lookup_url: existing.lookup_url,
              valid_until: existing.valid_until,
            });
          }

          if (entry.stores && typeof entry.stores === "object") {
            for (const [sId, sInfo] of Object.entries(entry.stores)) {
              addOrMergeStore(sId, sInfo);
            }
          } else {
            const entryStoreId = entry.store_id || "foodbasics";
            addOrMergeStore(entryStoreId, {
              store_name: entry.store_name || "Food Basics",
              postal_code: entry.postal_code || "",
              store_id: entryStoreId,
              regular_price: entry.regular_price,
              sale_price: entry.sale_price,
              is_on_sale: entry.is_on_sale,
              lookup_url: entry.lookup_url,
              valid_until: entry.valid_until,
            });
          }

          let bestStoreId = "";
          let bestPriceVal = Infinity;
          for (const [sId, sInfo] of Object.entries(mergedStores) as [string, any]) {
            const pVal = getStoreActivePrice(sInfo);
            if (pVal !== null && pVal < bestPriceVal) {
              bestPriceVal = pVal;
              bestStoreId = sId;
            }
          }

          const bestStoreInfo = mergedStores[bestStoreId] || {
            store_name: "Food Basics",
            postal_code: "",
            store_id: "foodbasics",
            regular_price: null,
            sale_price: null,
            is_on_sale: 0,
            lookup_url: "",
            valid_until: "",
          };

          map.set(nameKey, {
            ...existing,
            ...bestStoreInfo,
            stores: mergedStores,
          });
        } else {
          const initialStores: Record<string, any> = {};
          if (entry.stores && typeof entry.stores === "object") {
            for (const [sId, sInfo] of Object.entries(entry.stores)) {
              const normId = normalizeStoreKey(sId);
              initialStores[normId] = {
                ...sInfo,
                store_id: normId,
              };
            }
          } else {
            const entryStoreId = entry.store_id || "foodbasics";
            const normStoreId = normalizeStoreKey(entryStoreId);
            initialStores[normStoreId] = {
              store_name: entry.store_name || "Food Basics",
              postal_code: entry.postal_code || "",
              store_id: normStoreId,
              regular_price: entry.regular_price,
              sale_price: entry.sale_price,
              is_on_sale: entry.is_on_sale,
              lookup_url: entry.lookup_url,
              valid_until: entry.valid_until,
            };
          }

          map.set(nameKey, {
            ...entry,
            stores: initialStores,
          });
        }
      }
    }
    return map;
  }, [store.prices]);

  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return store.groceryItems;
    return store.groceryItems.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      (item.category || "").toLowerCase().includes(q)
    );
  }, [store.groceryItems, searchQuery]);

  const shoppingListNames = useMemo(
    () => new Set(store.groceryItems.map((i) => i.name.toLowerCase())),
    [store.groceryItems]
  );

  // Group items by the store where they are cheapest
  const groupedByStore = useMemo(() => {
    const storeMap: Record<string, { name: string; items: GroceryItem[]; totalCost: number; totalSavings: number }> = {
      foodbasics: { name: "Food Basics", items: [], totalCost: 0, totalSavings: 0 },
      metro: { name: "Metro", items: [], totalCost: 0, totalSavings: 0 },
      unassigned: { name: "No Price Checking Configured", items: [], totalCost: 0, totalSavings: 0 }
    };

    for (const item of filteredItems) {
      const priceInfo = priceLookup.get(item.name.toLowerCase());
      if (priceInfo) {
        let bestStoreId = "";
        let bestPriceVal = Infinity;
        let bestStoreInfo: any = null;
        
        if (priceInfo.stores && typeof priceInfo.stores === "object") {
          for (const [sId, sInfo] of Object.entries(priceInfo.stores) as [string, any][]) {
            const val = getStoreActivePrice(sInfo);
            if (val !== null && val < bestPriceVal) {
              bestPriceVal = val;
              bestStoreId = sId;
              bestStoreInfo = sInfo;
            }
          }
        } else {
          const val = getStoreActivePrice(priceInfo);
          if (val !== null) {
            bestPriceVal = val;
            bestStoreId = priceInfo.store_id || "foodbasics";
            bestStoreInfo = priceInfo;
          }
        }
        
        const normStoreId = bestStoreId ? normalizeStoreKey(bestStoreId) : "unassigned";
        
        if (!storeMap[normStoreId]) {
          const prettyName = bestStoreInfo?.store_name || bestStoreId;
          storeMap[normStoreId] = { name: prettyName, items: [], totalCost: 0, totalSavings: 0 };
        }
        
        storeMap[normStoreId].items.push(item);

        if (bestPriceVal !== Infinity && bestStoreInfo) {
          const regularPrice = typeof bestStoreInfo.regular_price === "number"
            ? bestStoreInfo.regular_price
            : parseFloat(bestStoreInfo.regular_price) || bestPriceVal;
          const onSale = bestStoreInfo.is_on_sale === 1 || !!bestStoreInfo.is_on_sale;
          
          storeMap[normStoreId].totalCost += bestPriceVal * item.quantity;
          if (onSale && regularPrice > bestPriceVal) {
            storeMap[normStoreId].totalSavings += (regularPrice - bestPriceVal) * item.quantity;
          }
        }
      } else {
        storeMap.unassigned.items.push(item);
      }
    }

    // Sort items within each store by checked status (unchecked first), category walkthrough order, then alphabetically by name
    for (const storeId in storeMap) {
      storeMap[storeId].items.sort((a, b) => {
        if (a.checked !== b.checked) {
          return a.checked ? 1 : -1;
        }
        const idxA = getCategoryWalkthroughIndex(a.category || "");
        const idxB = getCategoryWalkthroughIndex(b.category || "");
        if (idxA !== idxB) return idxA - idxB;
        return a.name.localeCompare(b.name);
      });
    }

    return Object.entries(storeMap)
      .filter(([_, data]) => data.items.length > 0)
      .map(([id, data]) => ({ id, ...data }));
  }, [filteredItems, priceLookup]);

  // Group all items by category (for All Items view)
  const groupedByCategory = useMemo(() => {
    const categoriesMap: Record<string, GroceryItem[]> = {};
    for (const item of filteredItems) {
      const cat = item.category || "Other";
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(item);
    }

    // Sort items alphabetically within each category, with checked items falling to the bottom
    for (const catName in categoriesMap) {
      categoriesMap[catName].sort((a, b) => {
        if (a.checked !== b.checked) {
          return a.checked ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
      });
    }

    return Object.entries(categoriesMap)
      .map(([name, items]) => ({ id: name.toLowerCase(), name, items }))
      .sort((a, b) => {
        const idxA = getCategoryWalkthroughIndex(a.name);
        const idxB = getCategoryWalkthroughIndex(b.name);
        if (idxA !== idxB) return idxA - idxB;
        return a.name.localeCompare(b.name);
      });
  }, [filteredItems]);

  const activeGroups = viewMode === "byStore" ? groupedByStore : groupedByCategory;

  const totalItems = store.groceryItems.length;
  const storeCount = groupedByStore.filter(g => g.id !== "unassigned").length;

  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleAddFromCatalog = async (catalogItem: any) => {
    // Adds a catalog regular item to the grocery list
    await store.addSelectedToGroceryList([catalogItem]);
  };

  const handleRemoveFromCatalog = async (name: string) => {
    // Removes by name
    await store.removeGroceryItemByName(name);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* List Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-extrabold text-on-surface">Weekly Grocery List</h2>
          <p className="text-xs text-on-surface-variant mt-0.5 font-medium">
            {totalItems === 0
              ? "List is empty"
              : `${totalItems} item${totalItems !== 1 ? "s" : ""} across ${storeCount} store${storeCount !== 1 ? "s" : ""}`}
          </p>
        </div>

        {store.hasPendingChanges && (
          <button
            onClick={store.saveChanges}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold rounded-lg border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-px hover:translate-y-px transition-all"
            title="Save pending changes to database"
          >
            <RefreshCw size={14} className="animate-spin" />
            <span>Save Changes</span>
          </button>
        )}
      </div>

      {/* Sync Indicator at Top of Page */}
      <div className="bg-surface p-3 rounded-lg border border-outline/10 shadow-xs">
        <SyncIndicator
          status={store.syncStatus}
          isOnline={store.isOnline}
          lastSynced={store.lastSynced}
          hasPendingChanges={store.hasPendingChanges}
          lastSavedBy={store.lastSavedBy}
          onSave={store.saveChanges}
          onRefresh={store.refreshFromServer}
        />
      </div>

      {/* Search Bar Container */}
      {totalItems > 0 && (
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-on-surface-variant/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search list items or categories..."
            className="w-full pl-10 pr-10 py-2.5 bg-surface border border-outline/10 rounded-xl text-base font-bold placeholder-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-xs text-on-surface"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-on-surface-variant/50 hover:text-on-surface cursor-pointer"
              aria-label="Clear search"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Shopping At Store Selector Card */}
      <div className="flex items-center justify-between gap-3 p-3.5 bg-surface border border-outline/10 rounded-xl shadow-xs">
        <span className="text-xs font-black uppercase text-on-surface-variant tracking-wider flex items-center gap-1.5">
          🛒 Shopping At:
        </span>
        <select
          value={primaryStoreId || ""}
          onChange={(e) => setPrimaryStoreId(e.target.value || null)}
          className="text-xs font-black uppercase bg-surface border border-outline/25 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer text-on-surface"
        >
          <option value="">(Select Store)</option>
          <option value="foodbasics">Food Basics</option>
          <option value="metro">Metro</option>
          <option value="freshco">FreshCo</option>
          <option value="loblaws">Loblaws</option>
          <option value="nofrills">No Frills</option>
          <option value="yourindependentgrocer">Your Independent Grocer</option>
          <option value="walmart">Walmart</option>
          <option value="costco">Costco</option>
        </select>
      </div>

      {/* Control Actions Row (Clear and edit buttons) */}
      {totalItems > 0 && (
        <div className="flex gap-2 justify-end">
          <button
            onClick={store.clearCheckedGroceryItems}
            className="text-[10px] font-bold uppercase tracking-wide bg-surface hover:bg-surface-container-low text-on-surface border border-outline/20 px-3 py-1.5 rounded-md transition-all shadow-xs"
          >
            Clear Checked
          </button>
          <button
            onClick={store.clearAllGroceryItems}
            className="text-[10px] font-bold uppercase tracking-wide bg-red-50 hover:bg-red-100 text-red-700 border border-red-200/50 px-3 py-1.5 rounded-md transition-all shadow-xs"
          >
            Clear List
          </button>
        </div>
      )}

      {/* View Mode Toggle Segmented Control */}
      {totalItems > 0 && (
        <div className="flex bg-surface-container-low p-1 rounded-xl w-full max-w-xs mx-auto border border-outline/5">
          <button
            onClick={() => setViewMode("all")}
            className={`flex-1 py-1.5 px-4 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              viewMode === "all"
                ? "bg-primary text-on-primary shadow-xs"
                : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            All Items
          </button>
          <button
            onClick={() => setViewMode("byStore")}
            className={`flex-1 py-1.5 px-4 rounded-lg font-bold text-xs transition-all cursor-pointer ${
              viewMode === "byStore"
                ? "bg-primary text-on-primary shadow-xs"
                : "text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            By Store
          </button>
        </div>
      )}

      {/* Dynamic Store / Category Groups */}
      {totalItems > 0 ? (
        filteredItems.length === 0 ? (
          <div className="border border-outline-variant bg-surface rounded-xl flex flex-col items-center justify-center py-12 px-4 text-center">
            <span className="text-3xl mb-3">🔍</span>
            <h3 className="text-sm font-black uppercase text-on-surface">No matching items found</h3>
            <p className="text-xs text-on-surface-variant max-w-xs mx-auto mt-1.5 leading-relaxed font-medium">
              Try adjusting your search query or clear the search to view all items on your list.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
          {activeGroups.map((group) => (
            <section key={group.id} className="space-y-3">
              {/* Store Title Bar */}
              <div className="flex items-center justify-between pb-1 border-b border-outline/10">
                <h3 className="text-sm font-extrabold text-secondary flex items-center gap-1.5 flex-wrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  {group.name}
                  {viewMode === "byStore" && group.id !== "unassigned" && (group as any).totalCost > 0 && (
                    <span className="text-xs text-on-surface-variant font-bold ml-2">
                      (${(group as any).totalCost.toFixed(2)} total
                      {(group as any).totalSavings > 0 && (
                        <span className="text-red-650 ml-1.5 font-extrabold">
                          • save ${(group as any).totalSavings.toFixed(2)}
                        </span>
                      )}
                      )
                    </span>
                  )}
                </h3>
                <span className="text-[10px] font-bold bg-secondary-container/20 text-secondary px-2.5 py-0.5 rounded-full">
                  {group.items.length} Item{group.items.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Items in store */}
              <div className="space-y-2">
                {group.items.map((item) => {
                  const isExpanded = expandedItems.has(item.id);
                  const priceInfo = priceLookup.get(item.name.toLowerCase());
                  
                  // Compute prices
                  let cheapestPriceVal: number | null = null;
                  let matchedStoreName = "";
                  let bestCompetitorInfo: any = null;
                  let primaryStorePrice: number | null = null;

                  if (priceInfo) {
                    // 1. Get primary store price if configured
                    if (primaryStoreId) {
                      const storeKey = primaryStoreId.toLowerCase();
                      const storeData = priceInfo.stores?.[storeKey];
                      if (storeData) {
                        primaryStorePrice = getStoreActivePrice(storeData);
                      }
                    }

                    // 2. Get cheapest price overall
                    let minP = Infinity;
                    let bestStoreData: any = null;
                    if (priceInfo.stores && typeof priceInfo.stores === "object") {
                      for (const [sId, sInfo] of Object.entries(priceInfo.stores) as [string, any][]) {
                        const val = getStoreActivePrice(sInfo);
                        if (val !== null && val < minP) {
                          minP = val;
                          bestStoreData = sInfo;
                        }
                      }
                    } else {
                      const val = getStoreActivePrice(priceInfo);
                      if (val !== null) {
                        minP = val;
                        bestStoreData = priceInfo;
                      }
                    }
                    if (minP !== Infinity) {
                      cheapestPriceVal = minP;
                      matchedStoreName = bestStoreData?.store_name || "Food Basics";
                      bestCompetitorInfo = bestStoreData;
                    }
                  }

                  // Determine display price and if a match is suggested
                  const displayPriceVal = primaryStorePrice !== null ? primaryStorePrice : cheapestPriceVal;
                  const showPriceMatch = primaryStorePrice !== null && cheapestPriceVal !== null && cheapestPriceVal < primaryStorePrice;

                  // Determine if the displayed price is a sale price
                  const sourceStoreInfo = (primaryStorePrice !== null)
                    ? priceInfo?.stores?.[primaryStoreId?.toLowerCase() || ""]
                    : bestCompetitorInfo;
                  const isOnSale = sourceStoreInfo
                    ? (sourceStoreInfo.is_on_sale === 1 || !!sourceStoreInfo.is_on_sale)
                    : false;
                  const isExpired = isOnSale && sourceStoreInfo?.valid_until
                    ? isSaleExpired(sourceStoreInfo.valid_until)
                    : false;

                  return (
                    <div
                      key={item.id}
                      className={`bg-surface border border-outline-variant rounded-lg overflow-hidden transition-all duration-200 ${
                        item.checked ? "opacity-60" : ""
                      }`}
                    >
                      {/* Interactive Header Row */}
                      <div
                        onClick={displayPriceVal !== null ? () => toggleExpand(item.id) : undefined}
                        className={`flex items-center justify-between p-3.5 select-none ${
                          displayPriceVal !== null ? "cursor-pointer hover:bg-surface-container-low" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Checked checkbox */}
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => store.toggleGroceryItem(item.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 rounded-md border-2 border-outline-variant text-primary focus:ring-primary transition-all custom-checkbox cursor-pointer shrink-0"
                          />

                          {/* Item text / description */}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-bold text-on-surface truncate transition-all ${
                                item.checked ? "line-through text-on-surface-variant/70" : ""
                              }`}
                            >
                              {item.name}
                              {item.units !== undefined && item.unit && (
                                <span className="font-medium text-on-surface-variant/80 text-xs ml-1.5 lowercase shrink-0">
                                  {item.units} {item.unit}
                                </span>
                              )}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wider block">
                                {item.category || "Other"}
                              </span>
                              {showPriceMatch && !item.checked && (
                                <div className="flex items-center gap-1 shrink-0 select-none" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-1 py-0.2 rounded-sm uppercase tracking-wider animate-pulse flex items-center gap-0.5">
                                    ⚡ Match ${cheapestPriceVal!.toFixed(2)} at {abbreviateStoreName(matchedStoreName)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openFlyerForStoreItem(
                                        matchedStoreName,
                                        item.name,
                                        priceInfo?.config_name,
                                        bestCompetitorInfo?.postal_code || priceInfo?.postal_code,
                                        bestCompetitorInfo?.brand_name || priceInfo?.brand_name || priceInfo?.item_name || bestCompetitorInfo?.item_name,
                                        bestCompetitorInfo?.lookup_url || priceInfo?.lookup_url
                                      );
                                    }}
                                    className="text-[8px] font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 px-1 py-0.2 rounded-sm shadow-[0.5px_0.5px_0px_rgba(0,0,0,0.1)] flex items-center gap-0.5 hover:underline cursor-pointer text-center"
                                    title={`Open flyer for ${matchedStoreName}`}
                                  >
                                    Open Flyer ↗
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quantity Selector - Compact Horizontal Layout */}
                        {!item.checked ? (
                          <div
                            className="flex items-center border border-outline-variant bg-surface rounded-md overflow-hidden shrink-0 mr-2 ml-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (item.quantity <= 1) {
                                  store.removeGroceryItem(item.id);
                                } else {
                                  store.updateGroceryItemQuantity(item.id, item.quantity - 1);
                                }
                              }}
                              className="px-2 py-1.5 hover:bg-surface-container-low text-primary font-extrabold border-r border-outline-variant transition-colors"
                              title="Decrease Quantity"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="w-7 text-center text-xs font-bold font-tnum select-none">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => store.updateGroceryItemQuantity(item.id, item.quantity + 1)}
                              className="px-2 py-1.5 hover:bg-surface-container-low text-primary font-extrabold border-l border-outline-variant transition-colors"
                              title="Increase Quantity"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-extrabold bg-surface-container-low text-on-surface-variant px-2 py-0.5 rounded-md mr-1 ml-1 font-tnum shrink-0">
                            {item.quantity}x
                          </span>
                        )}

                        {/* Price & Expand button */}
                        <div className="flex items-center gap-3 shrink-0 font-tnum ml-2">
                          {displayPriceVal !== null && (
                            <div className="text-right flex flex-col items-end">
                              <span className={`text-sm font-extrabold ${showPriceMatch ? "text-amber-600" : isExpired ? "text-amber-500" : isOnSale ? "text-red-650" : "text-primary"}`}>
                                ${(displayPriceVal * item.quantity).toFixed(2)}
                              </span>
                              
                              {(item.quantity > 1 || showPriceMatch || isOnSale) && (
                                <div className="text-[9px] text-on-surface-variant font-medium flex flex-col items-end">
                                  {item.quantity > 1 && (
                                    <span>
                                      {item.quantity} × ${displayPriceVal.toFixed(2)}
                                    </span>
                                  )}
                                  {isOnSale && (
                                    isExpired ? (
                                      <span className="text-[8px] bg-amber-100 text-amber-800 border border-amber-400 px-1 py-0.2 font-black mt-0.5 select-none uppercase rounded-sm">
                                        Expired Sale
                                      </span>
                                    ) : (
                                      <span className="text-[8px] bg-red-100 text-[#991b1b] border border-red-300 px-1 py-0.2 font-black mt-0.5 select-none uppercase rounded-sm">
                                        Sale
                                      </span>
                                    )
                                  )}
                                  {showPriceMatch && (
                                    <span className="text-[8px] text-amber-600 font-bold uppercase mt-0.5">
                                      Save ${( (displayPriceVal - cheapestPriceVal!) * item.quantity ).toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          
                          {displayPriceVal !== null && (
                            isExpanded ? (
                              <ChevronUp size={16} className="text-on-surface-variant" />
                            ) : (
                              <ChevronDown size={16} className="text-on-surface-variant" />
                            )
                          )}
                        </div>
                      </div>

                      {/* Expandable Accordion Panel */}
                      {isExpanded && displayPriceVal !== null && (
                        <div className="px-3.5 pb-3.5 pt-0 border-t border-outline/5 bg-surface-container-lowest animate-fade-in">
                          <div className="mt-3 bg-surface-container-low border border-primary/20 p-3.5 rounded-lg space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                                  Verification Detail
                                </h4>
                                <p className="text-xs font-bold text-on-surface mt-0.5">
                                  {item.name}
                                  {item.units !== undefined && item.unit && (
                                    <span className="font-medium text-on-surface-variant/80 ml-1.5 lowercase">
                                      {item.units} {item.unit}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className="text-[10px] font-black uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-sm">
                                cheapest store
                              </span>
                            </div>

                            {/* Store price list details */}
                            <div className="space-y-1.5">
                              {priceInfo && priceInfo.stores ? (
                                (Object.entries(priceInfo.stores) as [string, any][]).map(([storeId, storeInfo]) => {
                                  const activePrice = getStoreActivePrice(storeInfo);
                                  const isCheapest = activePrice === cheapestPriceVal;
                                  const isStoreSale = storeInfo.is_on_sale === 1 || !!storeInfo.is_on_sale;
                                  const isStoreExpired = isStoreSale && storeInfo.valid_until && isSaleExpired(storeInfo.valid_until);
                                  return (
                                    <div key={storeId} className="flex justify-between items-center text-xs">
                                      <span className="text-on-surface-variant font-medium">
                                        {storeInfo.store_name}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        {isStoreSale && (
                                          isStoreExpired ? (
                                            <span className="bg-amber-50 text-amber-700 border border-amber-300 text-[9px] px-1 py-0.5 font-bold rounded-sm uppercase select-none">
                                              EXPIRED
                                            </span>
                                          ) : (
                                            <span className="bg-red-50 text-red-700 border border-red-200 text-[9px] px-1 py-0.5 font-bold rounded-sm uppercase select-none">
                                              SALE
                                            </span>
                                          )
                                        )}
                                        <span className={`font-bold ${isCheapest ? "text-primary font-black" : "text-on-surface"}`}>
                                          {activePrice !== null ? `$${activePrice.toFixed(2)}` : "—"}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-xs text-on-surface-variant/70 italic">
                                  No stores comparison available.
                                </div>
                              )}
                            </div>

                            {/* Action Buttons Row */}
                            <div className="flex justify-end items-center pt-2 border-t border-outline/5 gap-2 text-xs">
                              {(bestCompetitorInfo || priceInfo) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFlyerForStoreItem(
                                      matchedStoreName || bestCompetitorInfo?.store_name || priceInfo?.store_name || "",
                                      item.name,
                                      priceInfo?.config_name,
                                      bestCompetitorInfo?.postal_code || priceInfo?.postal_code,
                                      bestCompetitorInfo?.brand_name || priceInfo?.brand_name || priceInfo?.item_name || bestCompetitorInfo?.item_name,
                                      bestCompetitorInfo?.lookup_url || priceInfo?.lookup_url
                                    );
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-250 text-emerald-700 rounded-md transition-colors font-bold text-xs"
                                  title="Open flyer in new tab"
                                >
                                  <ExternalLink size={12} />
                                  <span>Open Flyer</span>
                                </button>
                              )}

                              <button
                                onClick={() => store.removeGroceryItem(item.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-155 border border-red-100 text-red-650 hover:text-red-750 rounded-md transition-colors font-bold text-xs"
                                title="Delete item"
                              >
                                <Trash2 size={12} />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) ) : (
        /* Empty State */
        <div className="border-2 border-dashed border-outline-variant bg-surface rounded-xl flex flex-col items-center justify-center py-16 px-4 text-center mt-3">
          <span className="text-4xl mb-3">🛍</span>
          <h3 className="text-sm font-extrabold uppercase text-on-surface">Your Shopping List is Empty</h3>
          <p className="text-xs text-on-surface-variant max-w-xs mx-auto mt-1 leading-relaxed">
            Tap the floating action button in the bottom right corner to browse items from the catalog.
          </p>
        </div>
      )}

      {/* Floating Action Button (FAB) to open catalog */}
      <button
        onClick={() => setIsCatalogOpen(true)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40 cursor-pointer"
        title="Browse Grocery Catalog"
      >
        <ListPlus size={26} className="stroke-[2.5px]" />
      </button>

      {/* Catalog Drawer Modal */}
      <CatalogDrawer
        isOpen={isCatalogOpen}
        onClose={async () => {
          setIsCatalogOpen(false);
          if (store.hasPendingChanges) {
            await store.saveChanges();
          }
        }}
        regularItems={store.regularItems}
        alreadyInList={shoppingListNames}
        priceLookup={priceLookup}
        onAdd={handleAddFromCatalog}
        onRemove={handleRemoveFromCatalog}
      />
    </div>
  );
}
