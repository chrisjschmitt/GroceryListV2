import { GroceryItem, PriceEntry } from "@/lib/types";
import { ExternalLink } from "lucide-react";

export function abbreviateStoreName(name: string): string {
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

interface GroceryItemRowProps {
  key?: string | number;
  item: GroceryItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateQuantity?: (id: string, quantity: number) => void;
  priceInfo?: PriceEntry;
  primaryStoreId?: string;
}

export function isSaleExpired(validUntil?: string | null): boolean {
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

function getFlippSearchUrl(storeName: string, itemName: string, configName?: string, postalCode?: string): string {
  let queryStore = storeName || "";
  if (queryStore.toLowerCase().includes("food basics")) queryStore = "Food Basics";
  else if (queryStore.toLowerCase().includes("no frills")) queryStore = "No Frills";
  else if (queryStore.toLowerCase().includes("your independent grocer")) queryStore = "Your Independent Grocer";
  else if (queryStore.toLowerCase().includes("loblaws")) queryStore = "Loblaws";
  else if (queryStore.toLowerCase().includes("metro")) queryStore = "Metro";
  else if (queryStore.toLowerCase().includes("freshco")) queryStore = "FreshCo";
  else if (queryStore.toLowerCase().includes("walmart")) queryStore = "Walmart";

  let queryItem = itemName || "";
  if (configName) {
    queryItem = configName;
  }
  queryItem = queryItem
    .replace(/\s*-\s*\d+$/gi, "") 
    .replace(/\s*-\s*\w+$/gi, "") 
    .replace(/\s*\(\d+g\)/gi, "")  
    .replace(/\s*\d+g\b/gi, "")    
    .replace(/\s*\d+-pack\b/gi, "") 
    .trim();

  const fullQuery = `${queryStore} ${queryItem}`.trim();
  let url = `https://flipp.com/search?q=${encodeURIComponent(fullQuery)}`;
  if (postalCode) {
    url += `&postal_code=${encodeURIComponent(postalCode.trim())}`;
  }
  return url;
}

export default function GroceryItemRow({ item, onToggle, onRemove, onUpdateQuantity, priceInfo, primaryStoreId }: GroceryItemRowProps) {
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
              height: 100vh;
              margin: 0;
              background-color: #0f172a;
              color: #f8fafc;
            }
            .container {
              text-align: center;
              background: rgba(30, 41, 59, 0.7);
              backdrop-filter: blur(12px);
              padding: 2.5rem 1.75rem;
              border-radius: 1.25rem;
              border: 1px solid rgba(255, 255, 255, 0.08);
              box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.5);
              width: 90%;
              max-width: 360px;
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
              font-size: 1.75rem;
              font-weight: 800;
              margin: 0 0 0.75rem;
              letter-spacing: -0.03em;
              line-height: 1.25;
              transition: all 0.3s ease;
            }
            p {
              font-size: 0.875rem;
              color: #94a3b8;
              margin: 0;
              line-height: 1.4;
              transition: all 0.3s ease;
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
          </div>
        </body>
      </html>
    `);

    const qParams = new URLSearchParams({
      storeName: storeName || "",
      itemName: itemName || "",
      configName: configName || "",
      postalCode: postalCode || "K7H3C6",
      scrapedName: scrapedName || ""
    });

    const handleRedirect = (targetUrl: string, isMatch: boolean) => {
      if (isMatch || !storeUrl) {
        newTab.location.href = targetUrl;
      } else {
        try {
          const doc = newTab.document;
          if (doc) {
            const titleEl = doc.getElementById("status-title");
            const descEl = doc.getElementById("status-desc");
            const spinnerEl = doc.getElementById("spinner");
            if (titleEl) titleEl.innerText = "Flyer Deal Not Found";
            if (descEl) descEl.innerText = "This item is not in the active weekly flyer. Redirecting to the store product page...";
            if (spinnerEl) spinnerEl.style.borderTopColor = "#f59e0b"; // Warning amber color
          }
        } catch (e) {
          console.error("Error updating sub-tab DOM:", e);
        }
        setTimeout(() => {
          newTab.location.href = storeUrl;
        }, 2200);
      }
    };

    fetch("/api/flipp/resolve?" + qParams.toString())
      .then(r => r.json())
      .then(data => {
        if (data && data.url) {
          handleRedirect(data.url, !!data.isMatch);
        } else {
          handleRedirect(getFlippSearchUrl(storeName, itemName, configName, postalCode), false);
        }
      })
      .catch(() => {
        handleRedirect(getFlippSearchUrl(storeName, itemName, configName, postalCode), false);
      });
  };

  let finalPrice = undefined;
  let otherPrices: any[] = [];
  let bestCompetitorPrice: any = undefined;

  if (priceInfo) {
    if (primaryStoreId) {
      const storeKey = primaryStoreId.toLowerCase();
      const storeData = priceInfo.stores?.[storeKey];
      if (storeData) {
        const regular = typeof storeData.regular_price === "number" ? storeData.regular_price : parseFloat(storeData.regular_price) || 0;
        const pVal = (storeData.is_on_sale && storeData.sale_price !== null) ? storeData.sale_price : regular;
        finalPrice = {
          storeId: storeKey,
          storeName: storeData.store_name || storeKey,
          price: pVal,
          onSale: storeData.is_on_sale === 1 || !!storeData.is_on_sale,
          lookup_url: storeData.lookup_url,
          valid_until: storeData.valid_until,
          postal_code: storeData.postal_code || priceInfo.postal_code
        };
      }
    }

    if (!finalPrice) {
      const rawPrice = (priceInfo.is_on_sale && priceInfo.sale_price !== null) ? priceInfo.sale_price : (priceInfo.regular_price || 0);
      finalPrice = {
        storeId: priceInfo.store_id || "foodbasics",
        storeName: priceInfo.store_name || "Food Basics",
        price: rawPrice,
        onSale: priceInfo.is_on_sale === 1 || !!priceInfo.is_on_sale,
        lookup_url: priceInfo.lookup_url,
        valid_until: priceInfo.valid_until,
        postal_code: priceInfo.postal_code
      };
    }

    if (priceInfo.stores && typeof priceInfo.stores === "object") {
      otherPrices = Object.entries(priceInfo.stores)
        .filter(([storeId]) => storeId !== finalPrice?.storeId)
        .map(([storeId, storeInfo]: [string, any]) => {
          const regular = typeof storeInfo.regular_price === "number" ? storeInfo.regular_price : parseFloat(storeInfo.regular_price) || 0;
          const pVal = (storeInfo.is_on_sale && storeInfo.sale_price !== null && storeInfo.sale_price !== undefined) 
            ? storeInfo.sale_price 
            : regular;
          return {
            storeId: storeId,
            storeName: storeInfo.store_name || storeId,
            price: pVal,
            onSale: storeInfo.is_on_sale === 1 || !!storeInfo.is_on_sale,
            lookup_url: storeInfo.lookup_url || "",
            valid_until: storeInfo.valid_until,
            postal_code: storeInfo.postal_code || priceInfo.postal_code
          };
        });
    }

    // Determine if there is a competitor with a lower price
    if (primaryStoreId && finalPrice.storeId === primaryStoreId.toLowerCase()) {
      let lowestPrice = finalPrice.price;
      for (const op of otherPrices) {
        if (op.price > 0 && op.price < lowestPrice) {
          lowestPrice = op.price;
          bestCompetitorPrice = op;
        }
      }
    }
  } else {
    finalPrice = item.bestPrice;
    otherPrices = item.prices && item.prices.length > 1
      ? item.prices.filter(p => p.storeId !== finalPrice?.storeId)
      : [];
  }

  const linkUrl = finalPrice?.lookup_url || priceInfo?.lookup_url;

  return (
    <div className="group flex items-center gap-3 py-1 text-black">
      <button
        onClick={() => onToggle(item.id)}
        className={`w-6 h-6 border-2 border-black flex-shrink-0 flex items-center justify-center transition-all ${
          item.checked
            ? "bg-black text-white hover:bg-gray-800"
            : "bg-white text-black hover:bg-emerald-50 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        }`}
        aria-label={item.checked ? `Uncheck ${item.name}` : `Check off ${item.name}`}
        title={item.checked ? "Click to restore" : "Check off"}
      >
        {item.checked && (
          <div className="w-2.5 h-2.5 bg-white rotate-45"></div>
        )}
      </button>

      {/* Quantity Editor: displays adjusters when unchecked, static label when checked */}
      {!item.checked && onUpdateQuantity ? (
        <div className="flex items-center border-2 border-black h-7 bg-white shrink-0 overflow-hidden shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
          <button
            type="button"
            onClick={() => {
              const nextVal = item.quantity - 1;
              if (nextVal <= 0) {
                onRemove(item.id);
              } else {
                onUpdateQuantity(item.id, nextVal);
              }
            }}
            className="px-2 h-full hover:bg-gray-100 border-r-2 border-black font-black text-xs text-black transition-colors"
            title="Decrease Quantity"
          >
            -
          </button>
          <input
            type="number"
            min="0"
            value={item.quantity}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) {
                if (val <= 0) {
                  onRemove(item.id);
                } else {
                  onUpdateQuantity(item.id, val);
                }
              }
            }}
            className="w-8 text-center text-xs font-black bg-white focus:outline-none focus:bg-amber-50 h-full text-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            title="Type Quantity"
          />
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
            className="px-2 h-full hover:bg-gray-100 border-l-2 border-black font-black text-xs text-black transition-colors"
            title="Increase Quantity"
          >
            +
          </button>
        </div>
      ) : (
        <span className="text-xs font-black bg-gray-100 border border-black px-1.5 py-0.5 shrink-0 text-black">
          {item.quantity}{item.unit && item.unit.toLowerCase() !== "unit" ? ` ${item.unit}` : ""}
        </span>
      )}

      <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 animate-fade-in">
        {linkUrl ? (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm font-bold inline-flex items-center gap-1 hover:underline group/link cursor-pointer ${
              item.checked ? "line-through text-gray-400 font-normal" : "text-gray-900 hover:text-emerald-700"
            }`}
            title="Open on grocery store website"
          >
            <span>{item.name}</span>
            <ExternalLink className="w-3 h-3 text-gray-400 group-hover/link:text-emerald-600 transition-colors" />
            {!item.checked && item.unit && item.unit.toLowerCase() !== "unit" && (
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                ({item.unit})
              </span>
            )}
          </a>
        ) : (
          <span className={`text-sm font-bold ${item.checked ? "line-through text-gray-400 font-normal" : "text-gray-900"}`}>
            {item.name}
            {!item.checked && item.unit && item.unit.toLowerCase() !== "unit" && (
              <span className="ml-1.5 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                ({item.unit})
              </span>
            )}
          </span>
        )}

        {finalPrice && !item.checked && (() => {
          const isExpired = finalPrice.onSale && finalPrice.valid_until && isSaleExpired(finalPrice.valid_until);
          return (
            <span className="text-xs font-black uppercase text-gray-600 inline-flex flex-wrap items-center gap-1">
              <span className={isExpired ? "text-amber-500 font-extrabold" : finalPrice.onSale ? "text-red-650" : "text-black"}>
                <span className={isExpired ? "text-amber-500 font-black" : ""}>$</span>
                {finalPrice.price.toFixed(2)}
                <span className="text-gray-400 font-medium ml-1 lowercase text-[10px]">
                  ({abbreviateStoreName(finalPrice.storeName || "")})
                </span>
              </span>
              {item.quantity > 1 && (
                <span className="text-gray-400 font-bold normal-case text-[10px]">
                  x {item.quantity} = ${(
                    finalPrice.price * item.quantity
                  ).toFixed(2)}
                </span>
              )}
              {finalPrice.onSale && (
                isExpired ? (
                  <span className="ml-1 text-[9px] bg-amber-100 text-amber-800 border border-amber-500 px-1 py-0.2 font-black">EXPIRED SALE</span>
                ) : (
                  <span className="ml-1 text-[9px] bg-red-100 text-[#991b1b] border border-black px-1 py-0.2 font-black">SALE</span>
                )
              )}
              {finalPrice.onSale && finalPrice.valid_until && (
                <span className="text-[9px] text-gray-400 font-bold lowercase normal-case ml-1" title={`Valid until ${finalPrice.valid_until}`}>
                  (until {finalPrice.valid_until})
                </span>
              )}
              {otherPrices.length > 0 && (
                <span className="text-[10px] text-gray-400 font-bold border-l border-gray-300 pl-1.5 inline-flex flex-wrap items-center gap-1 normal-case">
                  <span>vs</span>
                  {otherPrices.map((op) => {
                    const opExpired = op.onSale && op.valid_until && isSaleExpired(op.valid_until);
                    return (
                      <span key={op.storeId} className="text-[9px] bg-gray-50 border border-gray-200 px-1 py-0.2 font-semibold text-gray-650 inline-flex items-center gap-0.5" title={`${op.storeName}${op.valid_until ? ` (valid until ${op.valid_until})` : ""}`}>
                        <span>{abbreviateStoreName(op.storeName)}:</span>
                        <span className={opExpired ? "text-amber-500 font-black" : ""}>$</span>
                        <span>{op.price.toFixed(2)}</span>
                        {op.onSale && (
                          <span className={opExpired ? "text-amber-600 font-black ml-0.5 text-[7px]" : "text-red-650 font-black ml-0.5 text-[7px]"} title={opExpired ? "Expired Sale" : "Active Sale"}>
                            %
                          </span>
                        )}
                        {op.onSale && op.valid_until && (
                          <span className="text-[8px] text-gray-400 font-medium normal-case ml-0.5">
                            ({op.valid_until})
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
              )}
              {bestCompetitorPrice && (
                <span className="inline-flex flex-wrap items-center gap-1.5 ml-2 normal-case">
                  <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded shadow-[1px_1px_0px_rgba(0,0,0,1)] uppercase tracking-wider animate-pulse flex items-center gap-0.5">
                    ⚡ Match ${bestCompetitorPrice.price.toFixed(2)} ({abbreviateStoreName(bestCompetitorPrice.storeName)})
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openFlyerForStoreItem(
                        bestCompetitorPrice.storeName,
                        item.name,
                        priceInfo?.config_name,
                        bestCompetitorPrice.postal_code || priceInfo?.postal_code,
                        priceInfo?.item_name || bestCompetitorPrice.item_name,
                        bestCompetitorPrice.lookup_url || priceInfo?.lookup_url
                      );
                    }}
                    className="text-[9px] font-black uppercase bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-650 px-1.5 py-0.5 rounded shadow-[1px_1px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-0.5 hover:underline cursor-pointer text-center text-xs"
                    title={`Open flyer for ${bestCompetitorPrice.storeName}`}
                  >
                    Open Flyer ↗
                  </button>
                </span>
              )}
            </span>
          );
        })()}
      </div>

      <button
        onClick={() => onRemove(item.id)}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all shrink-0"
        aria-label={`Remove ${item.name}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
