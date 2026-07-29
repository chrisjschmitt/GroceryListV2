<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# BasketWise — Intelligent Grocery List

BasketWise is a smart, offline-first grocery list application designed to optimize your shopping trips, minimize costs, and maximize savings. It automatically tracks item availability and compares prices across multiple local grocery chains to help you make informed decisions on where to shop.

---

## Key Features

- **Smart Basket Indices**: Automatically compares total basket costs across local stores (such as Food Basics and Metro) to flag the **Smart Choice**—the store offering the lowest overall cost or the highest number of lowest-price matches.
- **Savings Estimator**: Dynamically calculates your potential savings based on active discounts (comparing regular prices against active sale prices) for the items in your basket.
- **Offline-First & Auto-Sync**: Uses local client storage (IndexedDB) to ensure your list works perfectly inside grocery stores with poor or no cellular reception. The engine automatically synchronizes changes with your MongoDB server once you are back online, utilizing React refs to prevent stale state closure mismatches and debouncing background saves.
- **Prioritized Staples on Sale**: Floats frequently and recently purchased sale items to the front of the Home tab carousel using a decaying-weight purchase history relevance algorithm.
- **Multi-Product Flyer Ingestion**: Intelligently identifies and splits conjoined brand/product listings on Flipp (e.g. *"Kraft Dressing, Diana or Bull's Eye BBQ Sauce"*) into distinct items using **Gemini 2.5 Flash**, adding each separately to the catalog/shopping list.
- **Pricing Expiry Safeguards**: Automatically detects expired sale fallback prices (when regular price equals sale price) and invalidates them (showing as "N/A"), hiding expired flyer-only items from the catalog drawer.
- **Weekly Flyer Debugger**: Real-time interactive flyer lookup debugger panel displaying query terms, raw Flipp API returns, and custom search testing.
- **Item Catalog**: Maintain a catalog of regular household items. Add them to your list with a single click, or manage custom items with quantities and units.
- **Data Imports**: Import catalog inventory from CSV files or update pricing structures via JSON price sheets directly.
- **Admin Portal**: Integrated `/admin` panel to check database diagnostics, import local price databases, and manage sync metrics.
- **Progressive Web App (PWA)**: Optimized to be installed on mobile devices for native-like performance on the go.

---

## Companion User Script (Tampermonkey & Userscripts)

To clip items directly from Flyer pages (Flipp.com) or supported grocery merchant sites (Food Basics, Metro, Walmart, FreshCo, Loblaws, No Frills, Your Independent Grocer, Canadian Tire) into your grocery list, install the companion user script.

### 1. Install a User Script Manager

Choose one of the following script managers for Safari:

#### Option A: Tampermonkey for Safari (macOS)
1. Open the Mac App Store and search for **Tampermonkey** (available as a Safari extension).
2. Download and install the application.
3. Open Safari and navigate to **Settings...** (or **Preferences...**) > **Extensions**.
4. Check the box next to **Tampermonkey** to enable it.
5. Grant Tampermonkey permission to access the websites by selecting "Always Allow on Every Website" (required to inject action buttons on target grocer sites).

#### Option B: Userscripts for Safari (macOS & iOS)
1. Open the App Store and search for **Userscripts** (by quoid).
2. Download and install the application.
3. Enable **Userscripts** under Safari > Settings > Extensions.
4. Set a custom user scripts directory in the extension panel (e.g. inside iCloud Drive or local Documents).

### 2. Install the User Script
1. Open your script manager dashboard (or save the script inside your Userscripts folder).
2. Create a new user script.
3. Copy the entire contents of the file [groceryscout.user.js.js](file:///Users/christopherschmitt/Library/Mobile%2520Documents/com~apple~CloudDocs/GroceryHub/Code/GroceryListV2/Client-side-scripts/groceryscout.user.js.js).
4. Paste the script content into the editor and save it.

### 3. Configure Ingestion Credentials
On your first use, when you attempt to add an item (or on initial load), the script will prompt you to enter:
1. **GROCERY_SECRET_TOKEN**: A secure, secret authentication token that matches the `GROCERY_SECRET_TOKEN` configured in your backend `.env.local` environment file.
2. **API Base URL** (Optional): The base URL of your BasketWise server. It defaults to the production endpoint `https://grocery-list-v2-navy.vercel.app`. If you are developing locally, you can change this to `http://localhost:3000`.

**Note**: To change or reset these credentials at any time:
- **Tampermonkey**: Click the Tampermonkey extension icon in your browser toolbar, find **GroceryScout**, and select **Set/Update Ingestion Token** or **Set/Update API Base URL**.
- **Safari Userscripts**: Click the small floating gear button (**⚙️ Settings**) rendered directly next to the main green/blue action buttons on supported pages.

### 4. Verify Integration
1. Open Safari and go to **[Flipp.com](https://flipp.com)** or a grocery merchant site.
2. Select any product clipping or detail view.
3. You will see a floating green **Add to BasketWise** button in the bottom-right corner. Click it to immediately ingest the product's details and active sale price directly into your grocery list!

---

## Installation & Setup

Follow these steps to set up and run BasketWise locally on your machine.

### 1. Prerequisites

Make sure you have the following installed:
- **Node.js** (v18 or higher recommended)
- **npm** (comes packaged with Node.js)
- A **MongoDB Atlas** database (for data persistence and synchronization)
- A **Gemini API Key** (for intelligent product comparison and matching)

### 2. Install Dependencies

Open your terminal, navigate to the project root directory, and install the package dependencies:

```bash
npm install
```

### 3. Configure Environment Variables

1. Copy the example environment template to create your local `.env` configuration:
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` and configure the variables defined in `.env.example`:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `APP_URL`: The local endpoint URL, typically `http://localhost:3000`.
   - `GROCERY_SECRET_TOKEN`: A secure, secret token used to validate incoming database payloads or webhooks.
   - `MONGODB_URI`: The connection string for your MongoDB database.

> [!WARNING]
> **Token Rotation Warning**: The initial placeholder token `"GroceryHub2026"` has been deprecated and removed. If your database or configuration still uses this old token, please rotate it immediately to a new unique string in both Vercel and your local `.env.local` settings, and update your Tampermonkey userscript storage accordingly.

### 4. Run the Development Server

Launch the development server (runs both the express backend API and the Vite frontend server):

```bash
npm run dev
```

Open your browser and navigate to **[http://localhost:3000](http://localhost:3000)** to view the application.

---

## Price Audit Scraper

The project includes an automated pricing auditor located in `scripts/audit-prices.ts`. This tool launches Playwright to capture screenshots of target grocery product pages, analyzes them with **Gemini 3.5 Flash**, and compares live prices/promotional dates against your database catalog to generate discrepancy reports.

> [!NOTE]
> Audit execution status (`GET /api/audit-status`) is visible on the local dev server only (`http://localhost:3000/admin`). On Vercel serverless production environments, the status API returns idle mode because cron scraping runs on local machine environments.

### Operations & Unattended Automation Workflow

Follow these options to run pricing audits:

#### 1. Automated Full Audit Run (`--full`)
Run an end-to-end audit with zero manual stdin prompts (prunes previous run screenshots to `screenshots-prev/`, launches headless Playwright, runs Gemini vision analysis, performs discrepancy checks, and writes local cache files):
```bash
# Automated end-to-end unattended audit
npx tsx scripts/audit-prices.ts --full

# Headful debugging mode for manual inspection during a full run
npx tsx scripts/audit-prices.ts --full --headful

# Cap the audit run to N items (e.g. 5 items for testing)
npx tsx scripts/audit-prices.ts --full --max-items=5
```

#### 2. Scheduled Cron Execution (`scripts/cron-audit.sh`)
An executable wrapper script `scripts/cron-audit.sh` is provided for running automated audits via cron or launchd.

##### Dry Run Verification:
```bash
./scripts/cron-audit.sh --dry-run
```
Verifies `.env.local` / `.env` credentials (`GEMINI_API_KEY`, `MONGODB_URI`), Node/NPX binary paths, and process lock status without launching Playwright or Gemini.

##### Crontab Setup Example:
To run the automated audit every Thursday at 4:00 AM (documentational example — do NOT install automatically):
```cron
0 4 * * 4 /path/to/GroceryListV2/scripts/cron-audit.sh
```

##### macOS `launchd` Alternative:
Alternatively, on macOS, create a plist file at `~/Library/LaunchAgents/com.basketwise.audit.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.basketwise.audit</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/GroceryListV2/scripts/cron-audit.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key>
        <integer>4</integer>
        <key>Hour</key>
        <integer>4</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
</dict>
</plist>
```

#### 3. Log, Status & Lock Files
- **Execution Log:** `logs/audit-cron.log` (automatically created and rotated when exceeding 2MB)
- **Execution Status Record:** `db-storage/audit-run-status.json` (stores run duration, stage, item counts, truncation, and error details for Admin UI)
- **Active Process Lock:** `db-storage/audit-prices.lock` (stores active process PID and start timestamp to prevent concurrent runs)
- **Previous Screenshot Backup:** `screenshots-prev/` (holds 1 prior run of screenshots for safety)

#### 4. Troubleshooting
- **Stale Lock File:** If an audit process crashed or was killed forcefully, remove the lock file manually:
  ```bash
  rm db-storage/audit-prices.lock
  ```
- **Cloudflare Challenges:** In unattended mode (`--full`), if a Cloudflare challenge is detected, the item is marked as `ERROR` and the script continues automatically without hanging. For manual interactive resolution, run headful mode:
  ```bash
  npx tsx scripts/audit-prices.ts --headful
  ```
- **Gemini API Retries & Limits:** Built-in guardrails include max 3 retries with exponential backoff (2s/4s/8s), minimum 1.5s delay between requests, and automatic stage termination after 4 consecutive failures.

#### 5. Configure Local Store Profiles (`--setup`)
Configure your store postal code/locations (e.g. Perth, Ontario) and dismiss cookie banners:
```bash
npx tsx scripts/audit-prices.ts --setup
```
This opens all major store homepages in tabs. Set your local store/zip code in the browser window, then return to your terminal and press `[ENTER]`. Playwright will store your cookies and configuration under `db-storage/playwright-profile/` for all subsequent runs.

#### 6. Deploy Updates to Production (`--apply`)
Push the delta updates back into the live production database on MongoDB Atlas:
```bash
npx tsx scripts/audit-prices.ts --apply
```
The merge process downloads the latest live production catalog, applies only the delta modifications (to prevent stomping on concurrent changes), and saves it to MongoDB.


## Flipp Flyer Resolution Engine

BasketWise features a high-visibility, automated flyer matching engine that locates products or merchants on Flipp.com to show the cashier at checkout. It routes through a local backend proxy (`/api/flipp/resolve`) querying the undocumented internal Wishabi (Flipp) search endpoint.

### Multi-Stage Resolution Workflow

When a user clicks **Open Flyer ↗** on a price-matched item, the resolver performs the following multi-stage lookup:

1. **Stage 1: Exact Item Lookup**
   - Cleans the store name and target item (e.g. using `scrapedName` from the price match catalog, stripping trailing package sizes/weights/parentheticals).
   - Queries Wishabi API (e.g., `q = Food Basics Selection Butter`).
   - If a matching item is active in the merchant's regional flyer, it returns the exact flyer clipping:
     `https://flipp.com/item/[flyer_item_id]?postal_code=[postal_code]`

2. **Stage 2: Descriptor Stripping Fallback**
   - If Stage 1 returns 0 results, the resolver strips common flavor/descriptive terms (e.g. `unsalted`, `salted`, `organic`, `fresh`, `frozen`, `sliced`, `whole`) and retries the query.
   - For example, `Food Basics Selection Butter unsalted` simplifies to `Food Basics Selection Butter`, successfully finding the matching product.

3. **Stage 3: Flyer Index Fallback**
   - If specific item matching fails (e.g., the product isn't listed on the flyer), the resolver queries Wishabi for the merchant name alone (`q = Food Basics`).
   - It extracts the active weekly flyer ID from the response (e.g. `7999820`) and redirects to the direct flyer landing page:
     `https://flipp.com/flyer/[flyer_id]?postal_code=[postal_code]`

4. **Stage 4: Generic Search Fallback**
   - If everything else fails, the resolver defaults to a generic search results page query on Flipp.com.

---

## Scripts & Operations

Inside [package.json](file:///Users/christopherschmitt/Library/Mobile%20Documents/com~apple~CloudDocs/GroceryHub/Code/GroceryListV2/package.json), you will find the following commands:

- `npm run dev`: Runs the development server utilizing `tsx` for backend live reload and Vite.
- `npm run build`: Builds the production bundle of the React app and bundles the server using `esbuild`.
- `npm run start`: Runs the built production server from `dist/server.cjs`.
- `npm run clean`: Cleans built artifacts and server outputs.

