import React, { useState } from "react";
import { ChevronUp, ChevronDown, Flame } from "lucide-react";

interface StoreSummaryGroup {
  id: string;
  name: string;
  items: any[];
  totalCost: number;
  totalSavings: number;
}

interface StoreSummaryBarProps {
  groups: StoreSummaryGroup[];
}

export default function StoreSummaryBar({ groups }: StoreSummaryBarProps) {
  const [isMinimized, setIsMinimized] = useState(() => {
    try {
      const stored = localStorage.getItem("basketwise_summary_bar_minimized");
      return stored === "true";
    } catch (e) {
      return false;
    }
  });

  const toggleMinimize = () => {
    setIsMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("basketwise_summary_bar_minimized", String(next));
      } catch (e) {
        // Fallback gracefully
      }
      return next;
    });
  };

  // Filter out unassigned
  const storeGroups = groups.filter((g) => g.id !== "unassigned");

  // Calculate overall totals
  const overallTotalCost = storeGroups.reduce((sum, g) => sum + g.totalCost, 0);
  const overallTotalSavings = storeGroups.reduce((sum, g) => sum + g.totalSavings, 0);
  const overallItemCount = storeGroups.reduce((sum, g) => sum + g.items.length, 0);

  const overallRegPrice = overallTotalCost + overallTotalSavings;
  const overallSavingsPercent = overallRegPrice > 0 ? (overallTotalSavings / overallRegPrice) * 100 : 0;

  if (storeGroups.length === 0) {
    return null;
  }

  return (
    <div className="hidden md:block w-full border-2 border-black bg-white text-black rounded-xl shadow-[3px_3px_0px_rgba(0,0,0,1)] overflow-hidden">
      {/* Header/Thin Strip */}
      <div 
        onClick={toggleMinimize}
        className="flex justify-between items-center px-4 py-2.5 bg-gray-50 border-b border-black cursor-pointer hover:bg-gray-150 transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-gray-700">Store Price Summary</span>
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
            {overallItemCount} Store Item{overallItemCount !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs font-bold font-tnum">
            <span>
              Total: <span className="font-extrabold">${overallTotalCost.toFixed(2)}</span>
            </span>
            {overallTotalSavings > 0 && (
              <span className="text-red-650 flex items-center gap-0.5 font-extrabold bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                <Flame size={12} className="fill-red-600 stroke-none" />
                Save: ${overallTotalSavings.toFixed(2)} ({overallSavingsPercent.toFixed(0)}%)
              </span>
            )}
          </div>
          <button 
            type="button"
            className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-500 cursor-pointer"
          >
            {isMinimized ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded view */}
      {!isMinimized && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 bg-white">
          {storeGroups.map((g) => {
            const regPrice = g.totalCost + g.totalSavings;
            const savingsPercent = regPrice > 0 ? (g.totalSavings / regPrice) * 100 : 0;
            return (
              <div 
                key={g.id} 
                className="border-2 border-black rounded-lg p-3 bg-surface-container-lowest shadow-[2px_2px_0px_rgba(0,0,0,1)] flex flex-col justify-between"
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-800">{g.name}</h4>
                  <span className="text-[9px] font-bold bg-secondary-container/20 text-secondary px-2 py-0.5 rounded-full">
                    {g.items.length} Item{g.items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex justify-between items-end font-tnum">
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase block">Cost</span>
                    <span className="text-sm font-black">${g.totalCost.toFixed(2)}</span>
                  </div>
                  {g.totalSavings > 0 ? (
                    <div className="text-right">
                      <span className="text-[10px] text-red-650 font-bold uppercase block">Saved</span>
                      <span className="text-xs font-extrabold text-red-650 flex items-center gap-0.5 justify-end">
                        <Flame size={11} className="fill-red-600 stroke-none" />
                        -${g.totalSavings.toFixed(2)} ({savingsPercent.toFixed(0)}%)
                      </span>
                    </div>
                  ) : (
                    <div className="text-right text-[10px] text-gray-400 font-bold uppercase">
                      No Savings
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
