import { Sparkles, TrendingDown, DollarSign } from "lucide-react";

export default function HomeTab() {
  return (
    <div className="space-y-6">
      {/* Hero Welcome banner */}
      <div className="bg-gradient-to-br from-primary to-primary-container text-white p-6 rounded-lg shadow-lg relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10">
          <Sparkles size={160} />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest bg-white/20 px-2 py-1 rounded-full backdrop-blur-xs">
          Smart Grocery Saver
        </span>
        <h2 className="text-2xl font-extrabold mt-3 leading-tight">
          Welcome back to BasketWise
        </h2>
        <p className="text-sm opacity-90 mt-2 max-w-sm">
          Compare prices across Food Basics and Metro to get the highest value on your basket.
        </p>
      </div>

      {/* Grid for Summary Panels */}
      <div className="grid grid-cols-2 gap-4">
        {/* Savings Card */}
        <div className="bg-surface p-4 rounded-lg border border-outline/10 shadow-xs flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Est. Savings
            </span>
            <div className="p-1.5 bg-emerald-50 rounded-md text-primary">
              <TrendingDown size={18} />
            </div>
          </div>
          <div>
            <span className="text-2xl font-extrabold text-primary font-tnum">$0.00</span>
            <p className="text-[10px] text-on-surface-variant mt-1">Based on items in list</p>
          </div>
        </div>

        {/* Total Cost Card */}
        <div className="bg-surface p-4 rounded-lg border border-outline/10 shadow-xs flex flex-col justify-between h-32">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
              Smart Choice
            </span>
            <div className="p-1.5 bg-indigo-50 rounded-md text-secondary">
              <DollarSign size={18} />
            </div>
          </div>
          <div>
            <span className="text-sm font-extrabold text-secondary">Pending List</span>
            <p className="text-[10px] text-on-surface-variant mt-1">Comparing Metro & Food Basics</p>
          </div>
        </div>
      </div>

      {/* Quick Tips / Dashboard section */}
      <div className="bg-surface p-5 rounded-lg border border-outline/10 shadow-xs space-y-4">
        <h3 className="text-sm font-extrabold text-on-surface uppercase tracking-wider">
          BasketWise Tips
        </h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3 text-xs leading-relaxed text-on-surface-variant">
            <span className="text-base">💡</span>
            <p>
              Use the <strong>Lists</strong> tab to manage items and check prices at local stores.
            </p>
          </div>
          <div className="flex items-start gap-3 text-xs leading-relaxed text-on-surface-variant">
            <span className="text-base">🚀</span>
            <p>
              Check the <strong>Baskets</strong> tab to track staples and overall price fluctuations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
