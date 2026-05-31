import { StorePrice } from "@/lib/types";

interface PriceComparisonProps {
  prices: StorePrice[];
  bestPrice?: StorePrice;
}

export default function PriceComparison({ prices, bestPrice }: PriceComparisonProps) {
  if (prices.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {prices
        .sort((a, b) => a.price - b.price)
        .map((p) => {
          const isBest = bestPrice?.storeId === p.storeId;
          return (
            <span
              key={p.storeId}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                isBest
                  ? "bg-emerald-100 text-emerald-800 ring-1 ring-ring-emerald-300"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <span className="font-semibold">{p.storeName}</span>
              <span>${p.price.toFixed(2)}</span>
              {p.onSale && (
                <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">SALE</span>
              )}
              {isBest && (
                <span className="text-[10px]">✔ Best</span>
              )}
            </span>
          );
        })}
    </div>
  );
}
