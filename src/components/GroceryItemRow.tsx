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

export default function GroceryItemRow({ item, onToggle, onRemove, onUpdateQuantity, priceInfo }: GroceryItemRowProps) {
  let finalPrice = undefined;
  let otherPrices: any[] = [];

  if (priceInfo) {
    const rawPrice = (priceInfo.is_on_sale && priceInfo.sale_price !== null) ? priceInfo.sale_price : (priceInfo.regular_price || 0);
    finalPrice = {
      storeId: priceInfo.store_id || "foodbasics",
      storeName: priceInfo.store_name || "Food Basics",
      price: rawPrice,
      onSale: priceInfo.is_on_sale === 1 || !!priceInfo.is_on_sale,
      lookup_url: priceInfo.lookup_url,
      valid_until: priceInfo.valid_until
    };

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
          };
        });
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
          {item.quantity} {item.unit}
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
            {!item.checked && item.unit !== "unit" && (
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                ({item.unit})
              </span>
            )}
          </a>
        ) : (
          <span className={`text-sm font-bold ${item.checked ? "line-through text-gray-400 font-normal" : "text-gray-900"}`}>
            {item.name}
            {!item.checked && item.unit !== "unit" && (
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
