import { ShieldCheck, ArrowUpDown, Info } from "lucide-react";

export default function BasketsTab() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-extrabold text-on-surface">Staples Basket</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Core grocery items tracked for price stability.
          </p>
        </div>
        <button className="text-xs font-bold text-secondary border border-secondary/20 hover:bg-secondary/5 px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5">
          <ArrowUpDown size={14} />
          Sort Price
        </button>
      </div>

      {/* Info Alert Box */}
      <div className="bg-indigo-50/50 border border-secondary/10 p-4 rounded-lg flex gap-3 text-xs text-secondary leading-relaxed">
        <Info size={18} className="shrink-0 mt-0.5" />
        <div>
          <strong>Staples Price Tracking</strong>
          <p className="mt-0.5 opacity-95">
            This basket contains regular pantry items. We monitor their prices weekly to evaluate store-level value metrics.
          </p>
        </div>
      </div>

      {/* List of tracked staple items */}
      <div className="bg-surface rounded-lg border border-outline/10 shadow-xs divide-y divide-outline/5 overflow-hidden">
        {[
          { name: "2% Milk (4L bag)", category: "Dairy", basics: "$5.89", metro: "$5.99" },
          { name: "White Bread (675g)", category: "Bakery", basics: "$2.99", metro: "$3.29" },
          { name: "Large Eggs (Dozen)", category: "Dairy/Eggs", basics: "$4.29", metro: "$4.19" },
          { name: "Bananas (per lb)", category: "Produce", basics: "$0.69", metro: "$0.69" },
          { name: "Unsalted Butter (454g)", category: "Dairy", basics: "$6.49", metro: "$6.99" },
        ].map((item, idx) => (
          <div key={idx} className="p-4 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-bold text-on-surface">{item.name}</h4>
              <span className="text-[10px] font-semibold text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-md mt-1 inline-block">
                {item.category}
              </span>
            </div>
            <div className="text-right space-y-1 font-tnum">
              <div className="text-xs text-on-surface-variant flex items-center gap-2 justify-end">
                <span>basics:</span>
                <span className="font-bold text-on-surface">{item.basics}</span>
              </div>
              <div className="text-xs text-on-surface-variant flex items-center gap-2 justify-end">
                <span>metro:</span>
                <span className="font-bold text-on-surface">{item.metro}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Verification Shield */}
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-on-surface-variant">
        <ShieldCheck size={16} className="text-primary" />
        <span>Price audits run automatically via Gemini.</span>
      </div>
    </div>
  );
}
