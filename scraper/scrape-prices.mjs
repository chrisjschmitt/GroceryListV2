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
  console.log(`▶ Bootstrapping browser launch with headlessness: ${headlessMode}`);

  const browser = await chromium.launch({
    headless: headlessMode,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars'
    ]
  });
  return browser;
}

// ── Food Basics Scraping Module ───────────────────────────────────

async function scrapeFoodBasics(context, storeConfig, configItems) {
  const { store_id, postal_code, store_name, base_url } = storeConfig;
  const results = {};

  for (const item of configItems) {
    console.log(`\n▶ [Scraping] ${item.name} (UPC: ${item.upc})`);

    let attempts = 0;
    let ok = false;
    let itemPayload = null;

    // Introduce randomized human-like delay before navigating to each subsequent item
    const itemIndex = configItems.indexOf(item);
    if (itemIndex > 0) {
      const organicDelay = Math.floor(Math.random() * 3000) + 3000; // 3 to 6 seconds delay
      console.log(`  └ Human-emulation pacing: Cooling down for ${organicDelay}ms...`);
      await new Promise(r => setTimeout(r, organicDelay));
    }

    while (attempts < 3 && !ok) {
      attempts++;
      
      let page = null;
      
      try {
        console.log(`  └ Opening new page on browser context (Attempt ${attempts}/3)...`);

        // Set store cookies on the context level
        const domain = new URL(base_url).hostname;
        let cookieDomain = domain;
        if (domain.startsWith("www.")) {
          cookieDomain = domain.substring(3); // e.g. .foodbasics.ca
        } else if (!domain.startsWith(".")) {
          cookieDomain = "." + domain;
        }

        // Set cookies on multiple domains (.foodbasics.ca and www.foodbasics.ca) to ensure proper coverage
        const domainsToSet = [cookieDomain, domain];
        const cookies = [];
        for (const dom of domainsToSet) {
          cookies.push(
            { name: "storeId", value: store_id, domain: dom, path: "/" },
            { name: "selectedStoreId", value: store_id, domain: dom, path: "/" },
            { name: "OptanonConsent", value: "isIABGlobal=false&datashare=true&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1", domain: dom, path: "/" },
            { name: "OptanonAlertBoxClosed", value: new Date().toISOString(), domain: dom, path: "/" }
          );
        }
        await context.addCookies(cookies);

        page = await context.newPage();

        let isBlocked = false;
        let blockReason = "";

        // Wrap page navigation in a try/catch block to detect Cloudflare block/stuck
        try {
          // 1. Initial warm-up routing to the home page to let cookies register
          console.log("  └ Warm-routing/localizing browser context...");
          const warmRes = await page.goto(base_url, {
            waitUntil: "domcontentloaded",
            timeout: NAVIGATION_TIMEOUT,
          });

          if (warmRes && warmRes.status() === 403) {
            isBlocked = true;
            blockReason = "Cloudflare returned HTTP 403 Forbidden on warm-up route.";
          }

          if (!isBlocked) {
            await waitForChallenge(page);
            await acceptCookiesIfPresent(page);
            await page.waitForTimeout(1000);

            // 2. Direct navigation to the product detail URL
            console.log(`  └ Navigating directly to: ${item.url}`);
            const mainRes = await page.goto(item.url, {
              waitUntil: "domcontentloaded",
              timeout: NAVIGATION_TIMEOUT,
            });

            if (mainRes && mainRes.status() === 403) {
              isBlocked = true;
              blockReason = "Cloudflare returned HTTP 403 Forbidden on product URL route.";
            }
          }

          if (!isBlocked) {
            await waitForChallenge(page);
            await acceptCookiesIfPresent(page);
            await page.waitForTimeout(3000); // 3 seconds stable paint transition
            
            // Double check if we got stuck on Cloudflare
            const mainHtml = await page.content().catch(() => "");
            const holdsChallenge =
              mainHtml?.includes("security verification") ||
              mainHtml?.includes("Performing security") ||
              mainHtml?.includes("Checking if the site connection is secure") ||
              mainHtml?.includes("Enable JavaScript and cookies to continue") ||
              mainHtml?.includes("cf-chl-widget") ||
              mainHtml?.includes("Turnstile");

            if (holdsChallenge) {
              isBlocked = true;
              blockReason = "Browser gets stuck on Cloudflare security challenge.";
            }
          }
        } catch (navErr) {
          isBlocked = true;
          blockReason = `Navigation failed or got stuck: ${navErr.message}`;
        }

        // If Cloudflare returns a 403 or gets stuck: capture context-level failure diagnostic measures
        if (isBlocked) {
          console.error(`  └ 🚨 Cloudflare Detection Trap: ${blockReason}`);
          
          // Capture a visual screenshot
          try {
            const fs = await import("fs/promises");
            const publicApiDir = path.join(process.cwd(), "public", "api");
            await fs.mkdir(publicApiDir, { recursive: true }).catch(() => {});
            
            const screenshotPath = path.join(process.cwd(), "public", "api", "cloudflare-trap.png");
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`  └ 📸 Cloudflare trap screenshot captured at: ${screenshotPath}`);
          } catch (scrErr) {
            console.warn(`  └ Failed to write screenshot to ./public/api/cloudflare-trap.png: ${scrErr.message}`);
          }

          // Append a structured log entry detailing the failure to our /api/ScapeLogging file/endpoint
          const logPayload = {
            timestamp: new Date().toISOString(),
            store_key: "foodbasics",
            upc: item.upc,
            item_config_name: item.name,
            error_phase: "cloudflare_trap",
            error_message: blockReason,
            severity: "error",
            message: `Cloudflare Trap triggered on "${item.name}" (UPC: ${item.upc}): ${blockReason}. Screenshot captured at ./public/api/cloudflare-trap.png`
          };

          // Local telemetry.json write
          try {
            let logs = [];
            if (existsSync(TELEMETRY_FILE)) {
              try {
                logs = JSON.parse(await readFile(TELEMETRY_FILE, "utf-8"));
              } catch {}
            }
            logs.push(logPayload);
            await writeFile(TELEMETRY_FILE, JSON.stringify(logs.slice(-500), null, 2), "utf-8");
          } catch {}

          // Host PUT `/api/ScapeLogging` endpoint sync
          try {
            await fetchFromApp("/api/ScapeLogging", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SCRAPER_API_KEY}`
              },
              body: JSON.stringify(logPayload)
            });
            console.log("  └ 📄 Telemetry Appended to /api/ScapeLogging endpoint safely.");
          } catch (telErr) {
            console.warn(`  └ Local server logging error: ${telErr.message}`);
          }

          throw new Error(blockReason);
        }

        // 3. Locate interactive nodes (Wait for VISIBLE state, not attached!)
        await page.locator(".pi--prices, .pi--price, .pricing__amount, [data-main-price], [itemprop='price'], .pricing__price, .price-update").first().waitFor({
          state: "visible",
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
          if (regularPrice === salePrice || !salePrice) {
            isOnSale = false;
            salePrice = null;
          }
        }

        // VARIABLE-WEIGHT MEATS / PACKAGE UNIT PRICE PRIORITIZATION
        const secondaryPriceText = await safeText(page, ".pricing__secondary-price, .pricing__unit-price, .pi--unit-price, .pi--weight-avg-price");
        
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
        console.error(`  └ Attempt failed: ${err.message}`);
        
        // Take diagnostic measures - dump screenshot and HTML source to workspace
        if (page) {
          try {
            const fs = await import("fs/promises");
            await fs.mkdir("./debug-screenshots", { recursive: true }).catch(() => {});
            
            const sanitizedLabel = item.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
            const screenshotName = `failed_${sanitizedLabel}_item_attempt_${attempts}.png`;
            const htmlName = `failed_${sanitizedLabel}_item_attempt_${attempts}.html`;
            
            const screenshotPath = path.join(process.cwd(), "debug-screenshots", screenshotName);
            const htmlPath = path.join(process.cwd(), "debug-screenshots", htmlName);
            
            await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
            const rawHtml = await page.content().catch(() => "");
            await fs.writeFile(htmlPath, rawHtml, "utf-8").catch(() => {});
            
            console.log(`  └ 📸 Diagnostic screenshot captured: ${screenshotPath}`);
            console.log(`  └ 📄 Diagnostic page HTML source dump saved: ${htmlPath}`);

            // Inspect page text for anti-bot indicators
            const lowerHtml = rawHtml.toLowerCase();
            if (lowerHtml.includes("cloudflare") || lowerHtml.includes("turnstile") || lowerHtml.includes("security check") || lowerHtml.includes("attention required") || lowerHtml.includes("checking if the site connection is secure")) {
              console.warn(`  └ ⚠️ ALERT: Detected Bot Counter-measures on page! The request/IP was blocked or restricted by Cloudflare.`);
            }
          } catch (diagnosticErr) {
            console.warn(`  └ Could not compile diagnostic screenshots: ${diagnosticErr.message}`);
          }
        }

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
      } finally {
        if (page) {
          await page.close().catch(() => {});
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

async function acceptCookiesIfPresent(page) {
  try {
    // Dynamically inject a CSS stylesheet to force hide the cookie consent overlay
    await page.addStyleTag({
      content: `
        #onetrust-consent-sdk,
        #onetrust-banner-sdk,
        .onetrust-pc-sdk,
        #onetrust-pc-sdk,
        .ot-sdk-container,
        #onetrust-button-group-parent,
        #onetrust-close-btn-container,
        .remodal-overlay,
        .remodal-wrapper,
        .remodal,
        #newsletter-popup-container,
        .newsletter-box-wrapper,
        .store-selector,
        .login-side-panel,
        .mini-cart-side-panel,
        .st_panel,
        .replaceMePlease,
        .modal-add-to-cart-other-flavours,
        #cartGeniusModal {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          height: 0 !important;
          max-height: 0 !important;
          width: 0 !important;
          max-width: 0 !important;
          z-index: -9999 !important;
          position: absolute !important;
          top: -9999px !important;
          left: -9999px !important;
        }
      `
    }).catch(() => {});

    const selectors = [
      "#onetrust-accept-btn-handler",
      "#onetrust-reject-all-handler",
      ".ot-pc-refuse-all-handler",
      "#close-pc-btn-handler",
      ".onetrust-close-btn-handler",
      "#accept-recommended-btn-handler",
    ];

    for (let attempt = 0; attempt < 3; attempt++) {
      let clicked = false;
      for (const selector of selectors) {
        const locator = page.locator(selector).first();
        if ((await locator.count()) > 0 && (await locator.isVisible())) {
          console.log(`  └ Detected visible cookie/OneTrust element: "${selector}". Performing force click...`);
          await locator.click({ timeout: 2000, force: true }).catch(() => {});
          await page.waitForTimeout(1000);
          clicked = true;
          break;
        }
      }
      if (!clicked) {
        break;
      }
    }
  } catch (err) {
    console.warn(`  └ Cookie consent handler warning: ${err.message}`);
  }
}

async function waitForChallenge(page) {
  const maxLimit = 45_000;
  const start = Date.now();
  console.log("  └ [Security Guard] Monitoring for Cloudflare verification...");
  
  while (Date.now() - start < maxLimit) {
    try {
      // Gentle cursor jitter to emulate user attention / mouse activity
      const x = Math.floor(Math.random() * 500) + 100;
      const y = Math.floor(Math.random() * 500) + 100;
      await page.mouse.move(x, y).catch(() => {});

      const mainHtml = await page.content().catch(() => "");
      const holdsChallenge =
        mainHtml?.includes("security verification") ||
        mainHtml?.includes("Performing security") ||
        mainHtml?.includes("Checking if the site connection is secure") ||
        mainHtml?.includes("Enable JavaScript and cookies to continue") ||
        mainHtml?.includes("cf-chl-widget") ||
        mainHtml?.includes("Turnstile");

      if (!holdsChallenge) {
        const mainBody = await page.locator("body").textContent().catch(() => "");
        if (mainBody && mainBody.trim().length > 150) {
          console.log(`  └ [Security Guard] Bypassed challenge page successfully in ${Math.round((Date.now() - start) / 1000)}s.`);
          return;
        }
      } else {
        // Log status to assist diagnosis on execution streams
        console.log(`  └ [Security Guard] Cloudflare active (Elapsed: ${Math.round((Date.now() - start) / 1000)}s / Max: 45s)...`);
      }
    } catch (err) {
      // Ignore transient errors
    }
    await page.waitForTimeout(1500);
  }
  console.warn("  └ [Security Guard] Warning: Security challenge monitor timed out.");
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
  const args = process.argv.slice(2);
  const testUrlIndex = args.indexOf("--test-url");
  const testUrl = testUrlIndex !== -1 ? args[testUrlIndex + 1] : null;
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : null;

  let config;
  if (testUrl) {
    console.log(`\n🧪 TESTMODE ACTIVE: Diagnostics requested for single product URL: ${testUrl}`);
    config = {
      stores: {
        foodbasics: {
          enabled: true,
          store_name: "Food Basics Test Store",
          base_url: "https://www.foodbasics.ca",
          postal_code: "K7H3C6",
          store_id: "7923194"
        }
      },
      items: [
        {
          name: "Url Diagnostic Target",
          stores: {
            foodbasics: {
              url: testUrl,
              upc: `test_single_${Date.now()}`
            }
          }
        }
      ]
    };
  } else {
    try {
      config = await loadConfig();
    } catch (err) {
      console.error(`✗ Config failure: ${err.message}`);
      process.exitCode = 1;
      return;
    }
  }

  const activeStores = Object.entries(config.stores || {}).filter(([, details]) => details.enabled);
  if (activeStores.length === 0) {
    console.log("No store configurations are toggled on. Exiting.");
    return;
  }

  console.log("=================================================");
  console.log("◀ Starting Grocery Scraper Execution Pipeline ◀");
  if (testUrl) {
    console.log("◀ Mode: SINGLE PRODUCT TEST RUNNER               ◀");
  } else if (limit) {
    console.log(`◀ Mode: LIMIT WORKLOAD TO FIRST ${limit} ITEMS       ◀`);
  } else {
    console.log("◀ Mode: GENERAL FULL HARVEST SYNC                ◀");
  }
  console.log("=================================================");

  let browser = null;
  let context = null;

  try {
    browser = await createBrowser();
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-CA',
      timezoneId: 'America/Toronto',
      viewport: { width: 1366, height: 768 }
    });

    // Mask browser automation footprint at context level
    await context.addInitScript(() => {
      // Completely delete the webdriver property (get: () => undefined)
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override navigator.platform to match Intel Mac User-Agent
      Object.defineProperty(navigator, 'platform', {
        get: () => 'MacIntel',
      });

      // Spoof window.chrome
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };

      // Spoof plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Pre-inject cookie bypass properties check for OneTrust so JS-level queries block
      window.OnetrustActiveGroups = ",C0001,C0002,C0003,C0004,";

      // Inject stylesheet immediately onto documentElement so it applies before DOMContentLoaded or scripts
      const style = document.createElement('style');
      style.innerHTML = `
        #onetrust-consent-sdk,
        #onetrust-banner-sdk,
        .onetrust-pc-sdk,
        #onetrust-pc-sdk,
        .ot-sdk-container,
        #onetrust-button-group-parent,
        #onetrust-close-btn-container,
        .remodal-overlay,
        .remodal-wrapper,
        .remodal,
        #newsletter-popup-container,
        .newsletter-box-wrapper,
        .store-selector,
        .login-side-panel,
        .mini-cart-side-panel,
        .st_panel,
        .replaceMePlease,
        .modal-add-to-cart-other-flavours,
        #cartGeniusModal {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          height: 0 !important;
          max-height: 0 !important;
          width: 0 !important;
          max-width: 0 !important;
          z-index: -9999 !important;
          position: absolute !important;
          top: -9999px !important;
          left: -9999px !important;
        }
      `;
      if (document.documentElement) {
        document.documentElement.appendChild(style);
      }
    });

    let accumulatedPrices = await loadExistingPrices();

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

      let finalStoreItems = mappedStoreItems;
      if (limit && limit > 0) {
        finalStoreItems = mappedStoreItems.slice(0, limit);
        console.log(`💡 Sliced harvest queue: Limited to first ${limit} elements via --limit option.`);
      }

      let runResultData = {};
      if (storeKey === "foodbasics") {
        runResultData = await scrapeFoodBasics(context, storeDetails, finalStoreItems);
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
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

main();
