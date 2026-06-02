import { GroceryItem, PriceEntry } from "@/lib/types";

interface GroceryItemRowProps {
  key?: string | number;
  item: GroceryItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateQuantity?: (id: string, quantity: number) => void;
  priceInfo?: PriceEntry;
}

export default function GroceryItemRow({ item, onToggle, onRemove, onUpdateQuantity, priceInfo }: GroceryItemRowProps) {
  return (
    <div className="group flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0 text-black">
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
            onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
            className="px-2 h-full hover:bg-gray-100 border-r-2 border-black font-black text-xs text-black transition-colors"
            title="Decrease Quantity"
          >
            -
          </button>
          <input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1) {
                onUpdateQuantity(item.id, val);
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

      <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-sm font-bold ${item.checked ? "line-through text-gray-400 font-normal" : "text-gray-900"}`}>
          {item.name}
          {!item.checked && item.unit !== "unit" && (
            <span className="ml-1.5 text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              ({item.unit})
            </span>
          )}
        </span>

        {priceInfo && !item.checked && (
          <span className={`text-xs font-black uppercase ${priceInfo.is_on_sale ? "text-red-600" : "text-gray-600"}`}>
            ${((priceInfo.is_on_sale && priceInfo.sale_price !== null) ? priceInfo.sale_price : priceInfo.regular_price)?.toFixed(2)}
            {item.quantity > 1 && (
              <span className="text-gray-400 font-bold ml-1 normal-case text-[10px]">
                x {item.quantity} = ${(
                  ((priceInfo.is_on_sale && priceInfo.sale_price !== null) ? priceInfo.sale_price : (priceInfo.regular_price || 0)) * item.quantity
                ).toFixed(2)}
              </span>
            )}
            {priceInfo.is_on_sale === 1 && (
              <span className="ml-1 text-[9px] bg-red-100 text-[#991b1b] border border-black px-1 py-0.2 font-black">SALE</span>
            )}
            <span className="text-gray-400 font-medium ml-1 lowercase text-[10px]">({priceInfo.store_name})</span>
          </span>
        )}
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
