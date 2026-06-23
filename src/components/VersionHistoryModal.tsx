import React from "react";
import { X, Calendar, GitBranch, Sparkles, Database, Layout, Smartphone, Cloud, FileSpreadsheet, Trash2, Clock, Zap } from "lucide-react";

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
    version: "1.9.11",
    date: "June 2026",
    type: "patch",
    title: "Produce Category Ingestion Keywords Expansion",
    changes: [
      {
        icon: <Zap className="w-4 h-4 text-amber-500" />,
        category: "Userscript Exporter",
        description: "Expanded the local category guesser keyword parser to identify onions, potatoes, carrots, garlic, peppers, tomatoes, citrus, greens, and common herbs as Fresh Produce."
      }
    ]
  },
  {
    version: "1.9.10",
    date: "June 2026",
    type: "patch",
    title: "Catalog Attribute Sync Fix",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-emerald-500" />,
        category: "Ingestion API Pipeline",
        description: "Fixed a shadowing bug in the append-grocery API where re-fetching the catalog during store link creation would overwrite and discard newly ingested catalog unit, units, and category changes."
      }
    ]
  },
  {
    version: "1.9.9",
    date: "June 2026",
    type: "patch",
    title: "Exporter Feedback Status Terminology & Closure Tweaks",
    changes: [
      {
        icon: <Zap className="w-4 h-4 text-amber-500" />,
        category: "Userscript Exporter",
        description: "Renamed the 'URL Existed' status message to 'URL Exists' for cleaner terminology and verified correct auto-closure callback flow upon submission."
      }
    ]
  },
  {
    version: "1.9.8",
    date: "June 2026",
    type: "patch",
    title: "Ingestion URL Normalization & Exporter Closure Fix",
    changes: [
      {
        icon: <Zap className="w-4 h-4 text-amber-500" />,
        category: "Ingestion API Pipeline",
        description: "Introduced advanced URL normalization (stripping subdomains like www, protocol prefixes, trailing slashes, and query parameters) to make matching existing retail links 100% robust."
      },
      {
        icon: <Layout className="w-4 h-4 text-indigo-600" />,
        category: "Userscript Exporter",
        description: "Passed cleanup closure to the submission callback in the Tampermonkey script, resolving a ReferenceError that prevented the modal from auto-closing after successful ingestion."
      }
    ]
  },
  {
    version: "1.9.7",
    date: "June 2026",
    type: "patch",
    title: "Ingestion Matching Feedback in Userscript",
    changes: [
      {
        icon: <Sparkles className="w-4 h-4 text-purple-500" />,
        category: "Userscript Exporter",
        description: "Upgraded the Tampermonkey script modal to display real-time feedback from the ingestion endpoint (e.g. Exact Match, Gemini Match, New Created, or URL Already Exists) using distinct color-coded badges."
      },
      {
        icon: <Database className="w-4 h-4 text-emerald-500" />,
        category: "Ingestion API Pipeline",
        description: "Enhanced the append-grocery API to scan the registry for pre-existing matching URLs and return structured catalog match metadata in the JSON response."
      }
    ]
  },
  {
    version: "1.9.6",
    date: "June 2026",
    type: "patch",
    title: "Clickable Store Details Navigation",
    changes: [
      {
        icon: <Zap className="w-4 h-4 text-amber-500" />,
        category: "Catalog Management",
        description: "Made configured retailer and pricing detail boxes under the Combined Catalog Registry grid clickable, instantly opening the target product URL in a new tab if configured."
      }
    ]
  },
  {
    version: "1.9.5",
    date: "June 2026",
    type: "patch",
    title: "Category & Catalog Item Editor Units Support",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-indigo-600" />,
        category: "Catalog Management",
        description: "Added unit select and units size input fields to the scrape item edit form (when auto-creating new catalog items), the top-level quick catalog creator, and the inline badge editor. Configured badges and grids to render units (size values) inline."
      }
    ]
  },
  {
    version: "1.9.4",
    date: "June 2026",
    type: "patch",
    title: "Tampermonkey Wildcard Subdomain & Domain Matches",
    changes: [
      {
        icon: <Zap className="w-4 h-4 text-amber-500" />,
        category: "Userscript Exporter",
        description: "Expanded the match patterns to support base domains and wildcard subdomains for all grocery chain portals, solving script load and activation issues on pages resolved without www."
      }
    ]
  },
  {
    version: "1.9.3",
    date: "June 2026",
    type: "patch",
    title: "Userscript Metadata Expansion & Real-Time Syncing",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-indigo-600" />,
        category: "Userscript Exporter",
        description: "Added Category selector, Unit of Measurement dropdown, and Units size value input to the Tampermonkey exporter modal. Integrated category title matching and automatic unit size regex parsing from document titles."
      },
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Ingestion API Pipeline",
        description: "Upgraded the append-grocery API endpoint to receive these fields and instantly update the combined-catalog items with these metrics on matches or auto-creations."
      }
    ]
  },
  {
    version: "1.9.2",
    date: "June 2026",
    type: "patch",
    title: "Collapsible Admin Registry Panels & Search Bar Stacking",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-indigo-600" />,
        category: "Admin panel UI",
        description: "Repositioned the Combined Catalog Registry Manager search input vertically above the dropdown filters. Integrated Expand/Minimize toggle button controls (minimized by default) to the Catalog Registry Manager and Grocery Stores Setup forms for improved page layout focus."
      }
    ]
  },
  {
    version: "1.9.1",
    date: "June 2026",
    type: "patch",
    title: "Vercel Blob Cache Busting & Instant Sync",
    changes: [
      {
        icon: <Zap className="w-4 h-4 text-yellow-500" />,
        category: "Blob Storage performance",
        description: "Disabled default Vercel Blob URL edge caching by passing cacheControlMaxAge: 0 on writes, and appended cache-busting timestamp parameters on fetches. Changes ingested via scraper/append API are now visible instantly."
      }
    ]
  },
  {
    version: "1.9.0",
    date: "June 2026",
    type: "minor",
    title: "Store Lookup Selector & Verified Price Tracking Migration",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-indigo-600" />,
        category: "Admin panel UI",
        description: "Implemented a Store selection dropdown filter in the Combined Catalog Registry Manager, enabling instant lookup of products mapped to specific store URLs."
      },
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Database migration",
        description: "Developed and ran an automated migration script to enable price tracking (track_pricing: true) for all verified links, excluding Costco, across local fallbacks, Vercel Blob catalog, and MongoDB prices log."
      }
    ]
  },
  {
    version: "1.8.9",
    date: "June 2026",
    type: "patch",
    title: "Dedicated MongoDB Log Isolation",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Admin panel UI",
        description: "Isolated the Price Ingestion Logs table to display only actual MongoDB scraper logs (using new ?mongodbOnly=true endpoint filter), resolving issue where logs appeared uncleared due to baseline catalog items."
      }
    ]
  },
  {
    version: "1.8.8",
    date: "June 2026",
    type: "patch",
    title: "Clear MongoDB Ingestion Logs",
    changes: [
      {
        icon: <Trash2 className="w-4 h-4 text-rose-500" />,
        category: "Admin panel UI",
        description: "Added a 'Clear Ingestion Logs' button to the MongoDB Price Ingestion Logs section. Purges all price log records from the Atlas collection safely with a warning dialog."
      }
    ]
  },
  {
    version: "1.8.7",
    date: "June 2026",
    type: "patch",
    title: "Catalog CRUD Collapsed by Default",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-emerald-600" />,
        category: "Admin panel UI",
        description: "Configured the Grocery List Catalog CRUD manager panel to be collapsed/minimized by default on Admin portal load, keeping the page layout clean and focused."
      }
    ]
  },
  {
    version: "1.8.6",
    date: "June 2026",
    type: "patch",
    title: "Userscript UI Alignment Optimization",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-indigo-600" />,
        category: "Userscript UI",
        description: "Re-aligned the Tampermonkey popup window modal to the right hand side of the viewable window (30px offset, vertically centered) so that it no longer covers critical pricing information on the host store page."
      }
    ]
  },
  {
    version: "1.8.5",
    date: "June 2026",
    type: "patch",
    title: "Ingestion Logs Sorting & Vercel Blob Caching Heuristics",
    changes: [
      {
        icon: <Clock className="w-4 h-4 text-amber-600" />,
        category: "Admin panel UI",
        description: "Sorted MongoDB Price Ingestion Logs by last_updated in descending order (newest first). Connected 'Refresh Logs' button to reload both prices and catalog datasets concurrently."
      },
      {
        icon: <Zap className="w-4 h-4 text-yellow-500" />,
        category: "Blob Storage performance",
        description: "Implemented high-performance list() promise-deduplication caching to resolve concurrent/parallel API queries and prevent redundant Vercel Blob roundtrips, making syncs instantly fast."
      }
    ]
  },
  {
    version: "1.8.4",
    date: "June 2026",
    type: "patch",
    title: "Store Price Consolidation via Matched Catalog IDs",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Backend merging",
        description: "Updated mergeMongoPrices to map scraped MongoDB store records using matched_catalog_id, consolidating all matching store prices under a single catalog entry in prices.json instead of registering them as separate items."
      }
    ]
  },
  {
    version: "1.8.3",
    date: "June 2026",
    type: "minor",
    title: "Searchable Catalog Autocomplete & Gemini Bypass Heuristics",
    changes: [
      {
        icon: <Layout className="w-4 h-4 text-blue-600" />,
        category: "Userscript UI",
        description: "Implemented a custom searchable dropdown in the Tampermonkey Userscript that dynamically loads catalog items from the API and provides autocomplete suggestions, keyboard navigation, and custom fallbacks."
      },
      {
        icon: <Sparkles className="w-4 h-4 text-purple-600" />,
        category: "AI matching engine",
        description: "Added a programmatic bypass fast-path in evaluateGeminiMatch. Programmatic matches scoring >= 85% now bypass the Gemini model API completely, reducing operational costs."
      }
    ]
  },
  {
    version: "1.8.2",
    date: "June 2026",
    type: "patch",
    title: "Isolated API Ingestion Cache Cleanups",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "API design",
        description: "Removed Vercel Blob prices.json writes from the append-grocery API. The endpoint now writes exclusively to MongoDB Atlas."
      }
    ]
  },
  {
    version: "1.8.1",
    date: "June 2026",
    type: "minor",
    title: "MongoDB Live Price logs Audit panel",
    changes: [
      {
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        category: "Admin Portal",
        description: "Added a live MongoDB prices collection auditor table in the Admin panel that queries, filters, and searches live API ingestion price logs directly from MongoDB Atlas."
      }
    ]
  },
  {
    version: "1.8.0",
    date: "June 2026",
    type: "minor",
    title: "Gemini Schema Hardening & Scraper Ingestion Fix",
    changes: [
      {
        icon: <Sparkles className="w-4 h-4 text-purple-600" />,
        category: "AI matching engine",
        description: "Hardened Gemini prompts, response schemas, and added post-processing regex parser sanitization to prevent conversational text leaks. Fixed duplicate unmatched writes that reset the scraper ingestion toggle."
      },
      {
        icon: <Trash2 className="w-4 h-4 text-rose-600" />,
        category: "API optimization",
        description: "Removed direct writing to Vercel Blob prices.json inside the append-grocery API. The pipeline now writes exclusively to MongoDB Atlas."
      }
    ]
  },
  {
    version: "1.7.9",
    date: "June 2026",
    type: "patch",
    title: "Manual Scraper Input & Direct Sync Pipeline",
    changes: [
      {
        icon: <Cloud className="w-4 h-4 text-indigo-600" />,
        category: "Developer Tooling",
        description: "Added a Neo-Brutalist overlay form to the Tampermonkey exporter script to allow manual input of regular price, sale price, and expiry date. Configured API endpoints to parse and synchronize these values directly to combined-catalog.json and prices.json."
      }
    ]
  },
  {
    version: "1.7.8",
    date: "June 2026",
    type: "patch",
    title: "Developer Server Environment Variables Configuration",
    changes: [
      {
        icon: <Cloud className="w-4 h-4 text-indigo-600" />,
        category: "Developer Tooling",
        description: "Configured dotenv at the entry point of server.ts to load environment variables from .env.local on development server startup, resolving authentication issues on the append-grocery API."
      }
    ]
  },
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
