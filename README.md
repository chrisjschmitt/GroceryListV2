<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# GroceryHub — Intelligent Grocery List

GroceryHub is a smart, offline-first grocery list application designed to optimize your shopping trips, minimize costs, and maximize savings. It automatically tracks item availability and compares prices across multiple local grocery chains to help you make informed decisions on where to shop.

---

## Key Features

- **Smart Basket Indices**: Automatically compares total basket costs across local stores (such as Food Basics and Metro) to flag the **Smart Choice**—the store offering the lowest overall cost or the highest number of lowest-price matches.
- **Savings Estimator**: Dynamically calculates your potential savings based on active discounts (comparing regular prices against active sale prices) for the items in your basket.
- **Offline-First & Auto-Sync**: Uses local client storage (IndexedDB) to ensure your list works perfectly inside grocery stores with poor or no cellular reception. The engine automatically synchronizes changes with your MongoDB server once you are back online.
- **Item Catalog**: Maintain a catalog of regular household items. Add them to your list with a single click, or manage custom items with quantities and units.
- **Data Imports**: Import catalog inventory from CSV files or update pricing structures via JSON price sheets directly.
- **Admin Portal**: Integrated `/admin` panel to check database diagnostics, import local price databases, and manage sync metrics.
- **Progressive Web App (PWA)**: Optimized to be installed on mobile devices for native-like performance on the go.

---

## Installation & Setup

Follow these steps to set up and run GroceryHub locally on your machine.

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
2. Open `.env.local` and configure the following variables:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `APP_URL`: The local endpoint URL, typically `http://localhost:3000`.
   - `GROCERY_SECRET_TOKEN`: A secure, secret token used to validate incoming database payloads or webhooks.
   - `MONGODB_URI`: The connection string for your MongoDB database.

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
```
This runs the Gemini 3.5 Flash multimodal API to extract regular prices, sale prices, flyer validity dates, and sale status. It outputs:
* **`price_audit_report.md`**: A detailed comparison markdown dashboard.
* **`db-storage/audit-pricing-updates.json`**: A delta cache containing only the price updates/unverified flags.
* **`db-storage/combined-catalog-updated.json`**: A full backup copy of the updated catalog.

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

GroceryHub features a high-visibility, automated flyer matching engine that locates products or merchants on Flipp.com to show the cashier at checkout. It routes through a local backend proxy (`/api/flipp/resolve`) querying the undocumented internal Wishabi (Flipp) search endpoint.

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

