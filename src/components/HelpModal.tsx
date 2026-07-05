import React from "react";
import { X, Sparkles, ShoppingBasket, HelpCircle, Chrome, Smartphone, Database, Check } from "lucide-react";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div 
        className="bg-surface border-2 border-black max-w-lg w-full rounded-xl overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-on-surface flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-primary text-primary-container p-4 border-b-2 border-black flex justify-between items-center">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5" />
            <h2 className="text-base font-black uppercase tracking-wider">How BasketWise Works</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-black/10 rounded transition-colors text-primary-container"
            aria-label="Close help"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6 text-sm">
          {/* Intro */}
          <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg text-xs leading-relaxed font-medium">
            💡 BasketWise is a smart, grocery saving engine that helps you compare competitor flyer deals and clip items directly from Flipp or grocery merchant sites.
          </div>

          {/* Core Functions */}
          <div className="space-y-4">
            {/* Feature 1 */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-850 flex items-center justify-center shrink-0 border border-emerald-300">
                <Chrome className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-on-surface text-xs uppercase tracking-wider mb-0.5">1. Ingest Flyers via Tampermonkey</h3>
                <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
                  Install the user script in Safari (via Tampermonkey). Open Flipp.com or any grocer page, and click the green <strong className="text-emerald-700">Add to BasketWise</strong> button to instantly push flyers and sale prices to your list.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-850 flex items-center justify-center shrink-0 border border-indigo-300">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-on-surface text-xs uppercase tracking-wider mb-0.5">2. Smart Multi-Product Splitting</h3>
                <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
                  When adding conjoined flyer deals (e.g. <em>"Kawartha or Shaw's Ice Cream"</em>), our AI engine splits them into separate, clean products and updates lists and categories independently.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-850 flex items-center justify-center shrink-0 border border-amber-300">
                <ShoppingBasket className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-on-surface text-xs uppercase tracking-wider mb-0.5">3. Competitor Price Matches</h3>
                <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
                  Select your current grocer in the <strong className="text-primary">Shopping At</strong> menu. If a competitor offers it cheaper, a <span className="bg-amber-100 text-amber-900 px-1 py-0.2 rounded text-[10px] font-black">⚡ Match</span> badge appears, allowing you to open their flyer page instantly.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-850 flex items-center justify-center shrink-0 border border-blue-300">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-on-surface text-xs uppercase tracking-wider mb-0.5">4. Offline PWA Capabilities</h3>
                <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
                  Install BasketWise to your phone's home screen. View and manage lists offline in the store, and changes will automatically synchronize with your database once you are reconnected.
                </p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-850 flex items-center justify-center shrink-0 border border-rose-300">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-on-surface text-xs uppercase tracking-wider mb-0.5">5. Combined Catalog & Filters</h3>
                <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
                  Access the <strong className="text-primary">Admin Portal</strong> to customize grocery scraping configurations, view sync logs, or filter catalog items by store and source (e.g. Flyer vs Standard catalog).
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t-2 border-black flex justify-end">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 bg-black text-white hover:bg-gray-800 font-black text-xs uppercase border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Got It</span>
          </button>
        </div>
      </div>
    </div>
  );
}
