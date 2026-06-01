/**
 * Scalable & Robust Grocery Price Scraper
 *
 * Reads config from "scrape-config.json" (local or app base), locales sessions,
 * crawls individual item links, implements false-sale boundaries / weight adjustments,
 * uploads results, and logs telemetry structurally to /api/ScapeLogging.
 */

import { chromium } from "playwright";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// File caches
const CONFIG_FILE = path.join(process.cwd(), "scrape-config.json");
const CONFIG_FALLBACK_FILE = path.join(process.cwd(), "db-storage", "grocerylist-scrape-config.json");
const OUTPUT_FILE = path.join(process.cwd(), "prices.json");
const OUTPUT_FALLBACK_FILE = path.join(process.cwd(), "grocery_prices.json");
const TELEMETRY_FILE = path.join(process.cwd(), "telemetry.json");

const NAVIGATION_TIMEOUT = 35_000;
const SELECTOR_TIMEOUT = 12_000;

// APP_URL defaults to 127.0.0.1:3000 to offer exceptional out-of-the-box local testing capabilities
const APP_URL = process.env.APP_URL || "http://127.0.0.1:3000";
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || "dev-secret-key";

// ── App Endpoint Request Wrapper ────────────────────────────────────

async function fetchFromApp(apiPath, fetchOptions = {}) {
  // Always try 127.0.0.1:3000 first inside the sandboxed builder environment, then fall back to APP_URL
  const urlsToTry = ["http://127.0.0.1:3000", APP_URL];
  const uniqueUrls = [...new Set(urlsToTry)].filter(Boolean);

  let lastError = null;
  for (const baseUrl of uniqueUrls) {
    const fullUrl = `${baseUrl.replace(/\/$/, "")}${apiPath}`;
    try {
      const res = await fetch(fullUrl, fetchOptions);
      if (res.ok) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error(`Failed to fetch ${apiPath} from app`);
}

// ── Telemetry & Unified Logging Sink ────────────────────────────────

async function logTelemetry({ store_key, upc, item_config_name, error_phase, error_message, severity = "error", message }) {
  const entry = {
    timestamp: new Date().toISOString(),
    store_key,
    upc,
    item_config_name,
    error_phase,
    error_message,
    severity,
    message: message || `[${error_phase}] ${error_message || "No error details available"}`
  };

  console.log(`[${severity.toUpperCase()}] [${error_phase || "GENERAL"}] ${entry.message}`);

  // 1. Write metadata to local telemetry file
  try {
    let logs = [];
    if (existsSync(TELEMETRY_FILE)) {
      try {
        logs = JSON.parse(await readFile(TELEMETRY_FILE, "utf-8"));
      } catch {}
    }
    logs.push(entry);
    await writeFile(TELEMETRY_FILE, JSON.stringify(logs.slice(-500), null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to write log to local telemetry.json:", err.message);
  }

  // 2. Post metadata telemetry to `/api/ScapeLogging` endpoint
  try {
    const res = await fetchFromApp("/api/ScapeLogging", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SCRAPER_API_KEY}`
      },
      body: JSON.stringify(entry)
    });
    if (!res.ok) {
      console.warn(`Local server telemetry sink status: ${res.status}`);
    }
  } catch {
    // Fail silently so network issues with server logs never break scraper pipeline
  }
}

// ── Configuration Loader ──────────────────────────────────────────

async function loadConfig() {
  // First attempt: Remote retrieval via loopback/API
  try {
    const res = await fetchFromApp("/api/scrape-config");
    const config = await res.json();
    if (config && config.stores && Object.keys(config.stores).length > 0) {
      console.log("▶ Config loaded successfully from App API.");
      return config;
    }
  } catch (err) {
    console.log(`▶ App endpoint fetch bypass (Details: ${err.message}), falling back to local configurations.`);
  }

  // Second attempt: scrape-config.json
  if (existsSync(CONFIG_FILE)) {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    console.log("▶ Config loaded from workspace root scrape-config.json.");
    return JSON.parse(raw);
  }

  // Third attempt: db-storage nested fallback
  if (existsSync(CONFIG_FALLBACK_FILE)) {
    const raw = await readFile(CONFIG_FALLBACK_FILE, "utf-8");
    console.log("▶ Config loaded from db-storage/grocerylist-scrape-config.json.");
    return JSON.parse(raw);
  }

  throw new Error("No scraper configuration available. Please define configure items or setup links in app first.");
}

// ── Stealth Browser Bootstrap ──────────────────────────────────────

async function createBrowser() {
  const headlessMode = process.env.HEADLESS !== "false";
  const browser = await chromium.launch({
    headless: headlessMode,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security"
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "en-CA",
    timezoneId: "America/Toronto",
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  return { browser, context, page };
}

// ── Food Basics Scraping Module ───────────────────────────────────

async function scrapeFoodBasics(page, context, storeConfig, configItems) {
  const { store_id, postal_code, store_name, base_url } = storeConfig;

  // Localization Phase
  try {
    const domain = new URL(base_url).hostname;
    await context.addCookies([
      { name: "storeId", value: store_id, domain: `.${domain}`, path: "/" },
      { name: "selectedStoreId", value: store_id, domain: `.${domain}`, path: "/" },
    ]);
    console.log(`▶ localization: Anchored session to store ${store_id} (${postal_code})`);

    await page.goto(base_url, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT,
    });
    await waitForChallenge(page);
  } catch (error) {
    await logTelemetry({
      store_key: "foodbasics",
      error_phase: "localization",
      error_message: error.stack || error.message,
      message: `Failed during localization setup for store: ${store_name}. Trying to proceed anyway.`
    });
  }

  const results = {};

  for (const item of configItems) {
    console.log(`\n▶ [Scraping] ${item.name} (UPC: ${item.upc})`);

    let attempts = 0;
    let ok = false;
    let itemPayload = null;

    // Introduce randomized human-like delay before navigating to each subsequent item
    const itemIndex = configItems.indexOf(item);
    if (itemIndex > 0) {
      const organicDelay = Math.floor(Math.random() * 4000) + 4000; // 4 to 8 seconds delay
      console.log(`  └ Human-emulation pacing: Cooling down for ${organicDelay}ms...`);
      await new Promise(r => setTimeout(r, organicDelay));
    }

    while (attempts < 3 && !ok) {
      attempts++;
      try {
        if (attempts > 1) {
          const backoffDelay = Math.floor(Math.random() * 3000) + 2000; // randomized backoff 2-5 seconds
          console.log(`  └ Retry ${attempts}/3 in ${backoffDelay}ms...`);
          await new Promise((r) => setTimeout(r, backoffDelay));
        }

        // Close current page and open a fresh page inside the loop to clear navigation fingerprints,
        // page-level variables, and reset state. Cookies are kept in the context.
        try {
          await page.close().catch(() => {});
        } catch {}
        page = await context.newPage();
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "webdriver", { get: () => false });
        });

        await page.goto(item.url, {
          waitUntil: "domcontentloaded",
          timeout: NAVIGATION_TIMEOUT,
        });
        await waitForChallenge(page);
        await page.waitForTimeout(2000);

        // Locating interactive nodes - state: "attached" is used so cookie banners/modal dialogs
        // don't obstruct locator visibility or cause false timeout errors.
        await page.locator(".pi--prices, .pi--price, .pricing__amount, [data-main-price]").first().waitFor({
          state: "attached",
          timeout: SELECTOR_TIMEOUT,
        });

        // Parse metrics
        const scrapedName = await safeText(page, "h1, .pi--title, .product-details__title") || item.name;

        // original pricing before reduction
        const regularPriceText = await page
          .locator(".pricing__before-price span:not(.invisible-text), .pi--before-discount-price")
          .first().textContent().catch(() => null);
        let regularPrice = parsePrice(regularPriceText);

        // sale tags / marks
        const hasSalePrice = (await page.locator(".pricing__sale-price.promo-price, .pi--sale-price").count()) > 0;
        const hasSaleIcon = (await page.locator(".icon--sale, .pi--sale-badge").count()) > 0;
        let isOnSale = hasSalePrice || hasSaleIcon;

        let salePrice = null;
        if (isOnSale) {
          const mainPriceAttr = await page
            .locator("[data-main-price]").first()
            .getAttribute("data-main-price").catch(() => null);
          if (mainPriceAttr) salePrice = parseFloat(mainPriceAttr);

          if (!salePrice) {
            const salePriceText = await safeText(page, ".pricing__sale-price .price-update, .pi--price .price-update");
            salePrice = parsePrice(salePriceText);
          }
        }

        // Standard lookup if no comparison value was extracted
        if (!regularPrice) {
          const mainPriceText = await safeText(page, "[data-main-price], .pi--price, .pricing__amount");
          regularPrice = parsePrice(mainPriceText);
        }

        // FALSE SALE GUARD check
        if (isOnSale) {
          // If prices match exactly, it's a promotional banner but not discounted
          if (regularPrice === salePrice || !salePrice) {
            isOnSale = false;
            salePrice = null;
          }
        }

        // VARIABLE-WEIGHT MEATS / PACKAGE UNIT PRICE PRIORITIZATION
        const secondaryPriceText = await safeText(page, ".pricing__secondary-price, .pricing__unit-price, .pi--unit-price, .pi--weight-avg-price");
        
        // If there's weight vs ea display, prioritize unit prices
        if (secondaryPriceText && (secondaryPriceText.includes("avg") || secondaryPriceText.includes("ea") || secondaryPriceText.includes("/pkg") || secondaryPriceText.includes("piece"))) {
          const pkgPrice = parsePrice(secondaryPriceText);
          if (pkgPrice && pkgPrice > 0) {
            console.log(`  └ [Weight Guard] Overriding volume/kg price scale. Priority unit package cost: $${pkgPrice.toFixed(2)}`);
            regularPrice = pkgPrice;
            if (isOnSale) {
              salePrice = pkgPrice;
            }
          }
        }

        itemPayload = {
          item_name: scrapedName,
          config_name: item.name,
          store_name: store_name,
          postal_code: postal_code,
          store_id: store_id,
          regular_price: regularPrice,
          sale_price: isOnSale ? salePrice : null,
          is_on_sale: isOnSale ? 1 : 0,
          last_updated: new Date().toISOString(),
          lookup_url: item.url
        };

        const activeDisplay = isOnSale ? salePrice : regularPrice;
        console.log(`  └ Scraped: $${regularPrice?.toFixed(2) ?? "?"} reg → $${activeDisplay?.toFixed(2) ?? "?"} active${isOnSale ? " (SALE)" : ""}`);
        ok = true;
      } catch (err) {
        if (attempts >= 3) {
          await logTelemetry({
            store_key: "foodbasics",
            upc: item.upc,
            item_config_name: item.name,
            error_phase: "dom_parsing",
            error_message: err.stack || err.message,
            message: `Parsing failure for "${item.name}" (UPC: ${item.upc}): ${err.message}`
          });
        }
      }
    }

    if (ok && itemPayload) {
      results[item.upc] = itemPayload;
    }
  }

  return results;
}

// ── Cache loaders & uploads ────────────────────────────────────────

async function loadExistingPrices() {
  for (const filename of [OUTPUT_FILE, OUTPUT_FALLBACK_FILE]) {
    if (existsSync(filename)) {
      try {
        const raw = await readFile(filename, "utf-8");
        return JSON.parse(raw);
      } catch {}
    }
  }
  return {};
}

async function savePricesLocal(data) {
  await writeFile(OUTPUT_FILE, JSON.stringify(data, null, 2), "utf-8");
  await writeFile(OUTPUT_FALLBACK_FILE, JSON.stringify(data, null, 2), "utf-8");
  console.log(`✔ Local cached pricing synchronization target updated successfully.`);
}

async function uploadToApp(data) {
  try {
    const res = await fetchFromApp("/api/prices", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SCRAPER_API_KEY}`
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const payloadResult = await res.json();
    console.log(`✔ API Upload complete: ${payloadResult.count || 0} active pricing points updated in database.`);
    await logTelemetry({
      severity: "success",
      error_phase: "pipeline",
      message: `Scraper pipeline execution succeeded. Exchanged ${Object.keys(data).length} pricing items with server.`
    });
  } catch (error) {
    console.error(`✗ Remote storage upload failed: ${error.message}`);
    await logTelemetry({
      severity: "warning",
      error_phase: "api_upload",
      error_message: error.stack || error.message,
      message: `Local cache updated but failed to push payload to remote: ${error.message}`
    });
  }
}

// ── Low Level Browser Guards ────────────────────────────────────────

async function waitForChallenge(page) {
  const maxLimit = 35_000;
  const start = Date.now();
  
  while (Date.now() - start < maxLimit) {
    const mainBody = await page.locator("body").textContent().catch(() => "");
    const holdsChallenge =
      mainBody?.includes("security verification") ||
      mainBody?.includes("Performing security") ||
      mainBody?.includes("Checking if the site connection is secure") ||
      mainBody?.includes("Enable JavaScript and cookies to continue") ||
      mainBody?.includes("cf-chl-widget");

    const holdsActualContent =
      !holdsChallenge &&
      mainBody &&
      (mainBody.includes("Food Basics") || mainBody.includes("METRO") || mainBody.includes("Add to cart") || mainBody.includes("Search results") || mainBody.includes("Sign in"));

    if (holdsActualContent) return;
    await page.waitForTimeout(1000);
  }
}

async function safeText(page, selector) {
  try {
    const node = page.locator(selector).first();
    if ((await node.count()) === 0) return null;
    const inner = await node.textContent();
    return inner?.trim() || null;
  } catch {
    return null;
  }
}

function parsePrice(text) {
  if (!text) return null;
  const matches = text.match(/\$?([\d]+(?:\.[\d]{2})?)/);
  return matches ? parseFloat(matches[1]) : null;
}

// ── Orchestration Loop ─────────────────────────────────────────────

async function main() {
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    console.error(`✗ Config failure: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const activeStores = Object.entries(config.stores || {}).filter(([, details]) => details.enabled);
  if (activeStores.length === 0) {
    console.log("No store configurations are toggled on. Exiting.");
    return;
  }

  console.log("=================================================");
  console.log("◀ Starting Grocery Scraper Execution Pipeline ◀");
  console.log("=================================================");

  const { browser, context, page } = await createBrowser();
  let accumulatedPrices = await loadExistingPrices();

  try {
    for (const [storeKey, storeDetails] of activeStores) {
      console.log(`\n▶ [Store: ${storeDetails.store_name}]`);

      // 1. Gather all items targeted for this specific store
      const mappedStoreItems = [];
      if (config.items && Array.isArray(config.items)) {
        for (const item of config.items) {
          if (item.stores && item.stores[storeKey]) {
            mappedStoreItems.push({
              name: item.name,
              url: item.stores[storeKey].url,
              upc: item.stores[storeKey].upc || item.stores[storeKey].sku
            });
          }
        }
      }

      // Older legacy structure fallback check
      if (mappedStoreItems.length === 0 && storeDetails.items && Array.isArray(storeDetails.items)) {
        for (const item of storeDetails.items) {
          mappedStoreItems.push({
            name: item.name,
            url: item.url,
            upc: item.upc || item.sku
          });
        }
      }

      if (mappedStoreItems.length === 0) {
        console.log(` No product links configured for ${storeDetails.store_name}. Skipping.`);
        continue;
      }

      let runResultData = {};
      if (storeKey === "foodbasics") {
        runResultData = await scrapeFoodBasics(page, context, storeDetails, mappedStoreItems);
      } else {
        console.log(` Handling for Store: "${storeKey}" not currently implemented. Skipping.`);
        continue;
      }

      // Merge and update results, keeping prior entries untouched if single items failed crawling
      accumulatedPrices = { ...accumulatedPrices, ...runResultData };
    }

    console.log("\n▶ Starting State Cache Storage Sync...");
    await savePricesLocal(accumulatedPrices);
    await uploadToApp(accumulatedPrices);
    console.log("\n✔ Scraper pipeline fully built and processed.\n");

  } catch (err) {
    console.error(`\n✗ Error during crawler pipeline execution: `, err);
    await logTelemetry({
      severity: "error",
      error_phase: "pipeline",
      error_message: err.stack || err.message,
      message: `Fatal script execution failure: ${err.message}`
    });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
