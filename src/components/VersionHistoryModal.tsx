import React from "react";
import { X, Calendar, GitBranch, Sparkles, Database, Layout, Smartphone } from "lucide-react";

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion: string;
}

interface VersionEntry {
  version: string;
  date: string;
  type: "major" | "minor" | "patch";
  title: string;
  changes: {
    icon: React.ReactNode;
    category: string;
    description: string;
  }[];
}

const VERSIONS: VersionEntry[] = [
  {
    version: "1.1.0",
    date: "June 2026",
    type: "minor",
    title: "The Retail & Portability Update",
    changes: [
      {
        icon: <Smartphone className="w-4 h-4 text-emerald-600" />,
        category: "PWA Integration",
        description: "Added a complete Web Manifest and a stylized high-contrast SVG launcher icon, supporting full home-screen installation on iOS, Android, and desktop.",
      },
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "External Retail Links",
        description: "Enabled automatic store mapping. Items with catalog matches are now clickable, redirecting to real-world retailer landing pages via direct pricing URLs.",
      },
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "List Compression",
        description: "Optimized item catalog lists to remove dividers and reduce row-padding, recovering valuable vertical real estate and facilitating more simultaneous items on-screen.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "May 2026",
    type: "major",
    title: "GroceryHub Core Launch",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-indigo-600" />,
        category: "Offline-First Sync Engine",
        description: "Configured full persistence utilizing IndexedDB local store databases coupled with active conflict detection and dirty-state database synchronization queues.",
      },
      {
        icon: <Layout className="w-4 h-4 text-indigo-600" />,
        category: "Bento Grid Dashboard",
        description: "Constructed high-impact dashboard blocks displaying shopping progress percentages, automatic pricing calculations, and live synchronization trackers.",
      },
    ],
  },
];

export default function VersionHistoryModal({ isOpen, onClose, currentVersion }: VersionHistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Background Mask */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Neo-brutalist Modal Container */}
      <div className="relative w-full max-w-lg bg-white border-4 border-black text-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] z-10 max-h-[85vh] overflow-y-auto animate-fade-in flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-5">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-1.5 mb-1">
              <GitBranch className="w-3.5 h-3.5 text-gray-700" />
              Application Release History
            </span>
            <h2 className="text-2xl font-black tracking-tight flex items-baseline gap-2">
              Changelog
              <span className="text-xs bg-[#059669] text-white px-1.5 py-0.5 font-bold uppercase select-none rounded">
                v{currentVersion}
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="border-2 border-black p-1 hover:bg-red-50 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 transition-all"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="space-y-6 overflow-y-auto pr-1 flex-1">
          {VERSIONS.map((v) => (
            <div key={v.version} className="border-2 border-black bg-gray-50 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              {/* Version Head */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black uppercase px-2 py-0.5 border ${
                    v.type === "major" 
                      ? "bg-indigo-100 text-indigo-800 border-indigo-300" 
                      : "bg-emerald-100 text-emerald-850 border-emerald-300"
                  }`}>
                    v{v.version}
                  </span>
                  <span className="text-sm font-black text-gray-950">{v.title}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <Calendar className="w-3 h-3" />
                  <span>{v.date}</span>
                </div>
              </div>

              {/* Changes items */}
              <div className="space-y-3">
                {v.changes.map((change, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <div className="p-1 border border-black bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] shrink-0 mt-0.5">
                      {change.icon}
                    </div>
                    <div className="text-xs">
                      <span className="font-extrabold text-gray-900 block sm:inline mr-1.5">
                        {change.category}:
                      </span>
                      <span className="text-gray-600 font-medium">
                        {change.description}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer info banner */}
        <div className="mt-5 pt-4 border-t border-gray-200 flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          <span>Local storage reconciled</span>
          <span className="text-emerald-600">● Live synchronization enabled</span>
        </div>
      </div>
    </div>
  );
}
