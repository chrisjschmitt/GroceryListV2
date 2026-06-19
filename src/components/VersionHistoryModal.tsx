import React from "react";
import { X, Calendar, GitBranch, Sparkles, Database, Layout, Smartphone, Cloud, FileSpreadsheet, Trash2 } from "lucide-react";

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
    version: "1.7.7",
    date: "June 2026",
    type: "patch",
    title: "Production Database Synchronizer",
    changes: [
      {
        icon: <Cloud className="w-4 h-4 text-indigo-600" />,
        category: "Developer Tooling",
        description: "Created a database sync utility script allowing developers to pull fresh combined catalog databases, prices, and scraper configurations directly from production Vercel Blob stores into local dev environments."
      }
    ]
  },
  {
    version: "1.7.5",
    date: "June 2026",
    type: "patch",
    title: "Flyer Date Parsing & Expiry Mismatch Fix",
    changes: [
      {
        icon: <Calendar className="w-4 h-4 text-emerald-600" />,
        category: "AI Pricing Scraper",
        description: "Injected current year context dynamically to Gemini instructions and built date fallback year-handling post-validation to correct year-parsing cutoff anomalies (e.g. resolving 2024 to 2026)."
      }
    ]
  },
  {
    version: "1.7.4",
    date: "June 2026",
    type: "patch",
    title: "Unconfigured Store Pricing Filter",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-indigo-600" />,
        category: "Smart Basket Calculations",
        description: "Ignored store pricing records lacking valid regular or sale price values, avoiding incorrect $0.00 pricing calculations in lowest-price card matches and metrics."
      }
    ]
  },
  {
    version: "1.7.3",
    date: "June 2026",
    type: "patch",
    title: "Interactive Lowest Price Details Modal",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "UI Dashboard Enhancements",
        description: "Added a Neo-Brutalist overlay modal detailing all items matching the lowest price for any clicked grocery store card inside the Smart Basket Indices panel."
      }
    ]
  },
  {
    version: "1.7.2",
    date: "June 2026",
    type: "patch",
    title: "Failed Scrapes Link De-verification Fix",
    changes: [
      {
        icon: <Trash2 className="w-4 h-4 text-emerald-600" />,
        category: "Price Audit Scraper",
        description: "Modified the catalog price auditor to automatically toggle off store link verification status on failed scrapes instead of updating prices to a placeholder $1.00."
      }
    ]
  },
  {
    version: "1.7.1",
    date: "June 2026",
    type: "patch",
    title: "Catalog Minimization & Verification Filtering",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "UI Minimization & Flow",
        description: "Implemented a Minimize/Expand toggle for the Grocery List Catalog CRUD card, allowing users to collapse the long category item badges to reclaim page space."
      },
      {
        icon: <Database className="w-4 h-4 text-indigo-600" />,
        category: "Verification Filter Addition",
        description: "Added a 'Verification' dropdown filter to the Combined Catalog search bar to allow filtering items by whether their store overrides are marked verified active."
      }
    ]
  },
  {
    version: "1.7.0",
    date: "June 2026",
    type: "minor",
    title: "Unified Catalog Integration",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-indigo-600" />,
        category: "Consolidation & Cleanup",
        description: "Re-engineered the Quick Catalog Creator to write product entries directly to the master Combined Catalog Registry (combined-catalog.json). This unifies product definition pipelines, optimizes database structures, and completely removes the legacy, duplicate regular-items registry files and unused server endpoints."
      }
    ]
  },
  {
    version: "1.6.0",
    date: "June 2026",
    type: "minor",
    title: "Price Scraper Subsystem Decommissioning",
    changes: [
      {
        icon: <Trash2 className="w-4 h-4 text-emerald-600" />,
        category: "Engine & Subsystem Removal",
        description: "Decommissioned and deleted the background price scraper module, including its associated Playwright scripts, background runners, GitHub workflow schedules, logs, diagnostics screenshot viewer, and server endpoints. This optimizes storage footprint and reduces background execution overhead."
      }
    ]
  },
  {
    version: "1.5.6",
    date: "June 2026",
    type: "patch",
    title: "Store Override Link Verification Update",
    changes: [
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "Catalog Modifications",
        description: "Ensured the 'Link is Verified Active' option works on thorough, robust boolean logic inline to prevent string-to-boolean deserialization issues. Configured the dropdown retailer option renderer to display 'Active Link' if a store override contains either a URL or carries a true verified status, resolving user validation saving visual feedback issues.",
      }
    ]
  },
  {
    version: "1.5.5",
    date: "June 2026",
    type: "patch",
    title: "Admin Portal Layout Reorganization",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-indigo-600" />,
        category: "UI Hierarchy & Navigation",
        description: "Reorganized the Admin panel layout by placing the Manage Grocery Stores settings lower in the page flow directly after the primary Combined Catalog Registry Manager sections for improved user onboarding rhythm.",
      }
    ]
  },
  {
    version: "1.5.4",
    date: "June 2026",
    type: "patch",
    title: "Legacy Pricing Registry Cleanup",
    changes: [
      {
        icon: <Trash2 className="w-4 h-4 text-emerald-600" />,
        category: "Registry & API Cleanup",
        description: "Removed legacy manual prices registry CRUD actions, DB-based JSON price importers, custom price editor forms, and corresponding server integration endpoints, establishing the Scraper Configuration Link structure as the single source of truth.",
      }
    ]
  },
  {
    version: "1.5.3",
    date: "June 2026",
    type: "patch",
    title: "Store & Pricing Display Refinement",
    changes: [
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "Pricing & Badges",
        description: "Implemented store and badge state rules in Item Catalog: Hide empty pricing records with URLs, display specific Green & 'SALE' / 'EXPIRED' badges for active and expired temporary flyer savings, and show a polished Yellow badge for items with direct URLs that are currently not on sale. Cleaned up trailing visual noise by removing inline expiry dates.",
      }
    ]
  },
  {
    version: "1.5.2",
    date: "June 2026",
    type: "patch",
    title: "Price Checking Refactoring & UI Cleanup",
    changes: [
      {
        icon: <Trash2 className="w-4 h-4 text-emerald-600" />,
        category: "Refactoring & Cleanup",
        description: "Removed the deprecated live Price Checking dialog and reference configurations from the Item Catalog to streamline the responsive list design.",
      },
    ],
  },
  {
    version: "1.5.1",
    date: "June 2026",
    type: "patch",
    title: "Pricing Display Polishing & Status Synchronization",
    changes: [
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "Pricing Bug Fixes",
        description: "Fixed pricing display formatting in the Item Catalog form by stripping out redundant trailing '00' or '%' marks and replacing them with clean 'sale' / 'expired' context pill labels.",
      },
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Manual Price Sync",
        description: "Standardized boolean conversion flags for 'is_on_sale' to prevent empty sale price strings or unexpected string-to-boolean type comparison casting.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "June 2026",
    type: "minor",
    title: "Store-Walk Sequence & Core Category Standardization",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "Logical Category Reordering",
        description: "Reordered all grocery categories to map to a standard 'store-walk' sequence (starting with Fresh Produce, Bakery & Breads, Meat & Seafood, Dairy & Eggs) to streamline shopping paths.",
      },
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Taxonomy Unification",
        description: "Mapped all catalog and active items into the 9 proposed master categories and integrated the new mapping criteria directly into the Gemini match service.",
      },
    ],
  },
  {
    version: "1.4.9",
    date: "June 2026",
    type: "patch",
    title: "Layout Cleanliness & Shopping List Suffix Optimization",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "UI Cleanliness",
        description: "Optimized alignment check in the Quick Catalog Item Creator panel, removed the redundant unit display from catalog item badges, and conditioned the shopping list unit label to omit displaying case-insensitive 'unit' values.",
      },
    ],
  },
  {
    version: "1.4.8",
    date: "June 2026",
    type: "patch",
    title: "Grocery List Catalog Unit Selector Integration",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Catalog CRUD Enhancement",
        description: "Added a versatile Unit dropdown picker to the top Quick Catalog Item Creator and inline edit badges inside the Grocery List Catalog CRUD panel, allowing participants to save correct base units directly.",
      },
    ],
  },
  {
    version: "1.4.7",
    date: "June 2026",
    type: "patch",
    title: "Robust Store Fields Checkbox State Synchronization",
    changes: [
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "State Preservation",
        description: "Fixed a bug where checking/unchecking 'Track Store Prices' would clear the checkbox status for 'Link is Verified Active' under catalog store edit forms by ensuring default and loaded parameters are thoroughly merged on edit transitions.",
      },
    ],
  },
  {
    version: "1.4.6",
    date: "June 2026",
    type: "patch",
    title: "Unified Single-Source-of-Truth Catalog Integration",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Single Data Store Integration",
        description: "Unified the general regular items and the master combined catalog into a single data source logic. Synchronized catalog changes instantly with the main page's Item Catalog form.",
      },
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "Smart Unit Mapping",
        description: "Enabled dynamic unit mappings when selecting items from the catalog, ensuring they retain their proper unit (e.g. g, ml, lb, custom types) when added to the Shopping List.",
      },
    ],
  },
  {
    version: "1.4.5",
    date: "June 2026",
    type: "patch",
    title: "Unified Master Catalog & Scraper Configuration",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Master Catalog CRUD Core",
        description: "Implemented a full-featured, live CRUD manager for combined-catalog.json, allowing admins to add products, adjust categories, and instantly define URL maps directly from the UI.",
      },
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "Interface Streamlining",
        description: "Safely hid the outdated 'Price Check Links & URLs' configuration block since product price mapping rules and url paths are now fully consolidated under the new Combined Catalog Manager.",
      },
    ],
  },
  {
    version: "1.4.4",
    date: "June 2026",
    type: "patch",
    title: "Live Database Syncing & Robust Dynamic Repair",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "MongoDB Real-Time Sync",
        description: "Wired both GET /api/sync and GET /api/prices to pull and merge actual price tracking history from the remote MongoDB collection. Prices, URLs, and scraping metadata are now natively kept in lockstep.",
      },
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "Interactive Pricing Repair",
        description: "Fixed the interactive pricing modal trigger for the yellow '$' indicators. Users can now tap any expired or untracked state to immediately open the manual repair window to write back to the live database.",
      },
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "Ingestion URL Matcher",
        description: "Upgraded the isUrl detection logic inside the ingestion pipeline to parse all web store and domain variations, safeguarding the product UPC from address corruption.",
      },
    ],
  },
  {
    version: "1.4.3",
    date: "June 2026",
    type: "patch",
    title: "Pricing URL Population & Interactive Flow Enhancements",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "Consolidated Tables",
        description: "Fixed a bug where configured catalog items without active pricing did not populate in the Consolidated Pricing Table. Now, the table lists all active URLs for full inspection and easy editing across any grocery target.",
      },
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "API Match Guard",
        description: "Hardened the /api/append-grocery parser to prevent incoming product URLs from spilling into the UPC field in case of regex mismatches. Added custom URL matchers and fallbacks to data.upc.",
      },
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "Data Merge Engine",
        description: "Improved database synchronization so incoming scrape-URLs do not discard or clear existing prices. They are now merged and preserved seamlessly with existing pricing structures on the fly.",
      },
    ],
  },
  {
    version: "1.4.2",
    date: "June 2026",
    type: "patch",
    title: "Automated Ingestion Catalog Spawning Control",
    changes: [
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "Ingestion Core",
        description: "Fixed a bug where scraping unmatched items resulted in no action in the interface. Real-time API uploads for unmatched commodities (e.g., 'English Muffins') are now parsed and auto-spawned in both regular lists and catalog models as active candidates.",
      },
    ],
  },
  {
    version: "1.4.1",
    date: "June 2026",
    type: "patch",
    title: "API URL Match Safety & Manual Override Enhancements",
    changes: [
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "API Match Safety",
        description: "Fixed a bug in /api/append-grocery where incoming HTTP URLs in the UPC parameter were incorrectly written as the UPC instead of the locator URL. Clean UPC codes are now automatically extracted and mapped.",
      },
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "Manual Price Editor",
        description: "Added helper controls for 'Flyer Wednesday' date picks, validation enforcing 'valid_until' constraints, weekly price tracking toggles, and external scraper title overrides.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "June 2026",
    type: "minor",
    title: "Unified Database & Combined Catalog Engine",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Unified Schema Engine",
        description: "Migrated the multi-file setup into a single, fully coherent combined catalog JSON repository mapping items, multi-retailer stores, scraping states, and active pricings in one single file.",
      },
      {
        icon: <Sparkles className="w-4 h-4 text-emerald-600" />,
        category: "Automated Integrity Tests",
        description: "Added a comprehensive self-diagnostic test suite executing at server startup to validate URL uniqueness, prevent double lookup mappings, and maintain data purity.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "June 2026",
    type: "minor",
    title: "Google Drive Sync & Portal Upgrades",
    changes: [
      {
        icon: <Cloud className="w-4 h-4 text-emerald-600" />,
        category: "Google Drive Integration",
        description: "Added full integration with Google Drive to securely back up and restore your regular items catalog in either JSON or CSV formats at any time.",
      },
      {
        icon: <FileSpreadsheet className="w-4 h-4 text-emerald-600" />,
        category: "Smart Exporter Column",
        description: "Introduced a new boolean column in the regular items CSV exporter signifying whether an item is currently mapped to an active scraper config record.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "June 2026",
    type: "minor",
    title: "The Price Integrity & Routing Update",
    changes: [
      {
        icon: <Calendar className="w-4 h-4 text-emerald-600" />,
        category: "Sale Expiration Support",
        description: "Implemented full 'valid_until' validation and visual state tracking across all item catalogs, list views, and the Scrape Prices Registry detail pages to flag expired pricing automatically.",
      },
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "SPA History Rewrites",
        description: "Updated vercel.json configurations to support seamless client-side SPA history routing, preventing 404 navigation errors when users reload deep pages.",
      },
    ],
  },
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
