import { GroceryItem, PriceEntry } from "@/lib/types";

interface GroceryItemRowProps {
  key?: string | number;
  item: GroceryItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  priceInfo?: PriceEntry;
}

export default function GroceryItemRow({ item, onToggle, onRemove, priceInfo }: GroceryItemRowProps) {
  return (
    <div className="group flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
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

      <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-sm font-bold ${item.checked ? "line-through text-gray-400 font-normal" : "text-gray-900"}`}>
          {item.name}
          {item.quantity > 0 && (item.quantity !== 1 || item.unit !== "unit") && (
            <span className="ml-2 text-xs text-black font-semibold bg-gray-100 border border-black px-1.5 py-0.5">
              {item.quantity} {item.unit}
            </span>
          )}
        </span>

        {priceInfo && !item.checked && (
          <span className={`text-xs font-black uppercase ${priceInfo.is_on_sale ? "text-red-600" : "text-gray-600"}`}>
            ${((priceInfo.is_on_sale && priceInfo.sale_price !== null) ? priceInfo.sale_price : priceInfo.regular_price)?.toFixed(2)}
            {priceInfo.is_on_sale === 1 && (
              <span className="ml-1 text-[9px] bg-red-100 text-[#991b1b] border border-black px-1 py-0.2 font-black">SALE</span>
            )}
            <span className="text-gray-400 font-medium ml-1 lowercase">({priceInfo.store_name})</span>
          </span>
        )}
      </div>

      <button
        onClick={() => onRemove(item.id)}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all"
        aria-label={`Remove ${item.name}`}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
