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

The project includes an automated pricing auditor located in `scripts/audit-prices.ts`. This tool launches a headful browser to capture screenshots of target grocery product pages, analyzes them with **Gemini 3.5 Flash**, and compares live prices/promotional dates against your database catalog to generate discrepancy reports.

### Operations Workflow

Follow these steps to run pricing audits:

#### 1. Configure Local Store Profiles (`--setup`)
Configure your store postal code/locations (e.g. Perth, Ontario) and dismiss cookie banners:
```bash
npx tsx scripts/audit-prices.ts --setup
```
This opens all major store homepages in tabs. Set your local store/zip code in the browser window, then return to your terminal and press `[ENTER]`. Playwright will store your cookies and configuration under `db-storage/playwright-profile/` for all subsequent runs.

#### 2. Capture Screenshots (Default Mode)
Capture screenshots of target items:
```bash
# Capture screenshots for all stores
npx tsx scripts/audit-prices.ts

# Capture screenshots only for a specific store (e.g. Metro)
npx tsx scripts/audit-prices.ts --store metro
```
* **Performance Caching:** The script automatically skips navigation for items that already have a screenshot saved under `screenshots/`. If you want to force-capture a specific item, simply delete its screenshot file from the `screenshots/` directory and rerun this command.
* **Anti-Blocking Stability:** Mimics human browsing behavior by introducing a randomized delay (3 to 7 seconds) between page navigations.

#### 3. Analyze and Audit (`--analyze`)
Process the screenshots and run Gemini vision auditing:
```bash
# Analyze all captured screenshots
npx tsx scripts/audit-prices.ts --analyze

# Analyze only captured screenshots for a specific store (e.g. Metro)
npx tsx scripts/audit-prices.ts --analyze --store metro

# Retry only items that had errors or timed out in the previous run
npx tsx scripts/audit-prices.ts --retry-errors
```
This runs the Gemini 3.5 Flash multimodal API to extract regular prices, sale prices, flyer validity dates, and sale status. It outputs:
* **`price_audit_report.md`**: A detailed comparison markdown dashboard.
* **`db-storage/audit-pricing-updates.json`**: A delta cache containing only the price updates/unverified flags.
* **`db-storage/combined-catalog-updated.json`**: A full backup copy of the updated catalog.

* **Retry Errors Optimization:** If the Gemini API requests time out or fail, you can run the script with `--retry-errors` (or `--retry`). This skips successfully audited items by reading the cached status from `db-storage/audit-pricing-updates.json` and only invokes Gemini on the items that failed.

#### 4. Automated Weekly Flyer Validation
During the `--analyze` phase, if the Gemini API identifies that an item is actively on sale, the script automatically queries the Flipp/Wishabi flyer search API for the store's configured postal code (from the database) to verify if the product is featured in the merchant's active weekly flyer. It sets the `in_flyer` boolean indicator to `true` (otherwise `false`) in the database metadata so the frontend can display visual flyer badges.

#### 5. Deploy Updates to Production (`--apply`)
Push the delta updates back into the live production database on MongoDB Atlas:
```bash
npx tsx scripts/audit-prices.ts --apply
```
The merge process downloads the latest live production catalog, applies only the delta modifications (to prevent stomping on concurrent changes), and saves it to MongoDB.

#### 6. Scraper Error & Block Handling
If a URL fails to load, returns an HTTP `404 Not Found` status, or triggers a bot manager screen/generic error (e.g. *"The page you requested could not be found"* or Akamai blocking), the script logs the status as `"ERROR"`. In this case, **no pricing updates** are written, and the link's `is_verified` state is automatically set to `false` (unchecked) when `--apply` is run, excluding it from future scrape cycles until manually re-evaluated and updated.
* **Manual Verification Handler**: If the scraper encounters a Cloudflare puzzle/CAPTCHA, it plays a terminal beep sound and pauses. You can click the checkbox in the opened Chrome window and press `[ENTER]` in the terminal to resume navigation.

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

