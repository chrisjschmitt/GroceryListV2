/**
 * Grocery Price Scraper
 *
 * Reads scrape-config.json for store/item definitions, scrapes prices
 * from each enabled store, saves to local grocery_prices.json, and
 * uploads to Vercel Blob for the app to read.
 *
 * Usage:
 *   npm run scrape                           # scrape all enabled stores
 *   BLOB_READ_WRITE_TOKEN=... npm run scrape # also upload to Vercel Blob
 */

import { chromium } from "playwright";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), "scrape-config.json");
const OUTPUT_FILE = path.join(process.cwd(), "grocery_prices.json");
const NAVIGATION_TIMEOUT = 30_000;
const SELECTOR_TIMEOUT = 10_000;

// ── Config Loading ─────────────────────────────────────────────────

async function loadConfig() {
  // Try fetching config from the deployed app first
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try {
      const res = await fetch(`${appUrl}/api/scrape-config`);
      if (res.ok) {
        const config = await res.json();
        if (config.stores && Object.keys(config.stores).length > 0) {
          console.log("   Config loaded from app API.");
          return config;
        }
      }
    } catch {
      console.log("   Could not fetch config from app, falling back to local file.");
    }
  }

  // Fallback to local file
  if (!existsSync(CONFIG_FILE)) {
    throw new Error(`Config file not found: ${CONFIG_FILE}`);
  }
  const raw = await readFile(CONFIG_FILE, "utf-8");
  console.log("   Config loaded from local file.");
  return JSON.parse(raw);
}

// ── Browser Setup ──────────────────────────────────────────────────

async function createBrowser() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-CA",
    timezoneId: "America/Toronto",
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  return { browser, context, page };
}

// ── Food Basics Scraper ────────────────────────────────────────────

async function scrapeFoodBasics(page, context, storeConfig) {
  const { store_id, postal_code, store_name, base_url, items } = storeConfig;

  // Inject store cookies
  const domain = new URL(base_url).hostname;
  await context.addCookies([
    { name: "storeId", value: store_id, domain: `.${domain}`, path: "/" },
    { name: "selectedStoreId", value: store_id, domain: `.${domain}`, path: "/" },
  ]);
  console.log(`   Store cookies injected (${store_id}).`);

  // Warm session through Cloudflare
  await page.goto(base_url, {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT,
  });
  await waitForChallenge(page);
  console.log("   Session initialized.");

  const results = {};

  for (const item of items) {
    console.log(`\n   Scraping: ${item.name} (${item.upc})...`);

    try {
      await page.goto(item.url, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT,
      });
      await waitForChallenge(page);
      await page.waitForTimeout(2000);

      // Wait for price section
      await page.locator(".pi--prices").first().waitFor({
        state: "visible",
        timeout: SELECTOR_TIMEOUT,
      });

      // Product name
      const itemName = await safeText(page, "h1") || item.name;

      // Regular price
      const regularPriceText = await page
        .locator(".pricing__before-price span:not(.invisible-text)")
        .first().textContent().catch(() => null);
      const regularPrice = parsePrice(regularPriceText);

      // Sale detection
      const hasSalePrice = (await page.locator(".pricing__sale-price.promo-price").count()) > 0;
      const hasSaleIcon = (await page.locator(".icon--sale").count()) > 0;
      const isOnSale = hasSalePrice || hasSaleIcon;

      // Sale price
      let salePrice = null;
      if (isOnSale) {
        const mainPriceAttr = await page
          .locator("[data-main-price]").first()
          .getAttribute("data-main-price").catch(() => null);
        if (mainPriceAttr) salePrice = parseFloat(mainPriceAttr);

        if (!salePrice) {
          const salePriceText = await safeText(page, ".pricing__sale-price .price-update");
          salePrice = parsePrice(salePriceText);
        }
      }

      results[item.upc] = {
        item_name: itemName,
        config_name: item.name,
        store_name: store_name,
        postal_code: postal_code,
        store_id: store_id,
        regular_price: regularPrice,
        sale_price: isOnSale ? salePrice : null,
        is_on_sale: isOnSale ? 1 : 0,
        last_updated: new Date().toISOString(),
      };

      const active = isOnSale ? salePrice : regularPrice;
      console.log(`     $${regularPrice?.toFixed(2) ?? "?"} regular → $${active?.toFixed(2) ?? "?"} active${isOnSale ? " (SALE)" : ""}`);
    } catch (e) {
      console.error(`     ✗ Failed: ${e.message}`);
    }
  }

  return results;
}

// ── Data Storage ───────────────────────────────────────────────────

async function loadPriceData() {
  if (!existsSync(OUTPUT_FILE)) return {};
  try {
    return JSON.parse(await readFile(OUTPUT_FILE, "utf-8"));
  } catch {
    return {};
  }
}

async function savePriceDataLocal(data) {
  await writeFile(OUTPUT_FILE, JSON.stringify(data, null, 2), "utf-8");
  console.log(`\n   Saved locally → ${OUTPUT_FILE}`);
}

async function uploadToApp(data) {
  const appUrl = process.env.APP_URL;
  const apiKey = process.env.SCRAPER_API_KEY;

  if (!appUrl || !apiKey) {
    console.log("   APP_URL or SCRAPER_API_KEY not set — skipping upload.");
    console.log("   Set APP_URL=https://your-app.vercel.app and SCRAPER_API_KEY=... to upload.");
    return;
  }

  try {
    const res = await fetch(`${appUrl}/api/prices`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }

    const result = await res.json();
    console.log(`   Uploaded to app → ${result.items} item(s)`);
  } catch (e) {
    console.error(`   ✗ Upload failed: ${e.message}`);
  }
}

// ── Utilities ──────────────────────────────────────────────────────

async function waitForChallenge(page) {
  const maxWait = 45_000;
  const start = Date.now();
  let lastLog = 0;

  while (Date.now() - start < maxWait) {
    const bodyText = await page.locator("body").textContent().catch(() => "");

    const isChallenge =
      bodyText?.includes("security verification") ||
      bodyText?.includes("Performing security") ||
      bodyText?.includes("Checking if the site connection is secure") ||
      bodyText?.includes("Enable JavaScript and cookies to continue") ||
      bodyText?.includes("cf-chl-widget");

    const hasRealContent =
      !isChallenge &&
      bodyText &&
      (bodyText.includes("Food Basics") || bodyText.includes("METRO") || bodyText.includes("Add to cart"));

    if (hasRealContent) return;

    const elapsed = Date.now() - start;
    if (elapsed - lastLog > 5000) {
      console.log(`   Waiting for Cloudflare challenge... (${Math.round(elapsed / 1000)}s)`);
      lastLog = elapsed;
    }

    await page.waitForTimeout(1000);
  }

  console.warn("   Cloudflare challenge may not have resolved after 45s — continuing.");
}

async function safeText(page, selector) {
  try {
    const el = page.locator(selector).first();
    if ((await el.count()) === 0) return null;
    const text = await el.textContent();
    return text?.trim() || null;
  } catch {
    return null;
  }
}

function parsePrice(text) {
  if (!text) return null;
  const match = text.match(/\$?([\d]+\.[\d]{2})/);
  return match ? parseFloat(match[1]) : null;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const config = await loadConfig();
  const enabledStores = Object.entries(config.stores).filter(([, s]) => s.enabled);

  if (enabledStores.length === 0) {
    console.log("No enabled stores in scrape-config.json.");
    return;
  }

  const totalItems = enabledStores.reduce((n, [, s]) => n + s.items.length, 0);
  console.log("═══════════════════════════════════════════════════");
  console.log("  Grocery Price Scraper");
  console.log(`  ${enabledStores.length} store(s), ${totalItems} item(s)`);
  console.log("═══════════════════════════════════════════════════");

  const { browser, context, page } = await createBrowser();
  let allPrices = await loadPriceData();

  try {
    for (const [storeKey, storeConfig] of enabledStores) {
      console.log(`\n── ${storeConfig.store_name} (${storeKey}) ──`);

      let results = {};
      if (storeKey === "foodbasics") {
        results = await scrapeFoodBasics(page, context, storeConfig);
      } else {
        console.log(`   Scraper not implemented for "${storeKey}" — skipping.`);
        continue;
      }

      allPrices = { ...allPrices, ...results };
    }

    console.log("\n── Saving ──");
    await savePriceDataLocal(allPrices);
    await uploadToApp(allPrices);

    console.log("\n✓ Done.\n");
    console.log(JSON.stringify(allPrices, null, 2));
  } catch (error) {
    console.error(`\n✗ Error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
