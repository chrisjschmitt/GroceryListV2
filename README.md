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
- **Admin Portal**: Integrated `/admin` panel to check blob diagnostics, import local price databases, and manage sync metrics.
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

## Scripts & Operations

Inside [package.json](file:///Users/christopherschmitt/Library/Mobile%20Documents/com~apple~CloudDocs/GroceryHub/Code/GroceryListV2/package.json), you will find the following commands:

- `npm run dev`: Runs the development server utilizing `tsx` for backend live reload and Vite.
- `npm run build`: Builds the production bundle of the React app and bundles the server using `esbuild`.
- `npm run start`: Runs the built production server from `dist/server.cjs`.
- `npm run clean`: Cleans built artifacts and server outputs.

