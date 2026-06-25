import { chromium } from "playwright";
import { list, put } from "@vercel/blob";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// 1. Load Environment Variables from .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // fallback to default .env
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!BLOB_TOKEN) {
  console.error("Error: BLOB_READ_WRITE_TOKEN is not defined in environment variables.");
  process.exit(1);
}

if (!GEMINI_KEY) {
  console.error("Error: GEMINI_API_KEY is not defined in environment variables.");
  process.exit(1);
}

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

function normalizeStoreUrl(url: string): string {
  if (!url) return url;
  let normalized = url;
  if (normalized.includes("yourindependentgrocer.ca") && !normalized.includes("www.yourindependentgrocer.ca")) {
    normalized = normalized.replace("yourindependentgrocer.ca", "www.yourindependentgrocer.ca");
  }
  if (normalized.includes("loblaws.ca") && !normalized.includes("www.loblaws.ca")) {
    normalized = normalized.replace("loblaws.ca", "www.loblaws.ca");
  }
  if (normalized.includes("nofrills.ca") && !normalized.includes("www.nofrills.ca")) {
    normalized = normalized.replace("nofrills.ca", "www.nofrills.ca");
  }
  return normalized;
}

async function dismissCookieBanners(page: any) {
  const cookieSelectors = [
    "#onetrust-accept-btn-handler",
    "#accept-cookies",
    "#accept-cookie",
    "button:has-text('Accept All')",
    "button:has-text('Accept')",
    "button:has-text('Agree')",
    "button:has-text('Accepter')",
    "button:has-text('Accepter tout')"
  ];

  for (const selector of cookieSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1500 })) {
        await button.click();
        console.log(`   ├─ Dismissed cookie banner using selector: "${selector}"`);
        await page.waitForTimeout(1000);
        break; // Stop checking once one cookie banner is successfully dismissed
      }
    } catch {
      // Ignore
    }
  }
}

interface AuditResult {
  itemId: string;
  itemName: string;
  storeKey: string;
  url: string;
  catalogRegular: number | null;
  catalogSale: number | null;
  catalogIsOnSale: boolean;
  catalogValidUntil: string | null;
  catalogUnit: string | null;
  catalogUnits: number | null;
  geminiRegular: number | null;
  geminiSale: number | null;
  geminiIsOnSale: boolean;
  geminiValidUntil: string | null;
  geminiUnit: string | null;
  geminiUnits: number | null;
  screenshotFile: string;
  status: "MATCH" | "MISMATCH" | "ERROR";
  discrepancies: string[];
  errorMessage?: string;
}

async function runAudit() {
  const args = process.argv.slice(2);
  const applyMode = args.includes("--apply");

  if (applyMode) {
    console.log("\n=== Applying Catalog Updates to Production Vercel Blob ===");
    
    // 1. Read local delta updates
    const deltaPath = path.join(process.cwd(), "db-storage", "audit-pricing-updates.json");
    if (!fs.existsSync(deltaPath)) {
      console.error(`Error: Delta updates file not found at: ${deltaPath}`);
      console.error("Please run the audit first using: npx tsx scripts/audit-prices.ts --analyze");
      process.exit(1);
    }
    
    let updates: any[] = [];
    try {
      updates = JSON.parse(fs.readFileSync(deltaPath, "utf8"));
      if (!Array.isArray(updates)) {
        throw new Error("Delta updates file must be a JSON array.");
      }
    } catch (err: any) {
      console.error("Error reading delta updates:", err.message || String(err));
      process.exit(1);
    }

    if (updates.length === 0) {
      console.log("No updates to apply. Exiting.");
      return;
    }

    console.log(`Loaded ${updates.length} pricing update(s) from local cache.`);

    // 2. Fetch the latest live catalog from Vercel Blob
    console.log("Fetching the latest production catalog from Vercel Blob...");
    let liveCatalog: any = null;
    try {
      const { blobs } = await list({ token: BLOB_TOKEN });
      const targetBlob = blobs.find(b => b.pathname === "grocerylist/combined-catalog.json");
      if (!targetBlob) {
        throw new Error("combined-catalog.json was not found in Vercel Blob store.");
      }
      
      let res = await fetch(targetBlob.url);
      if (!res.ok) {
        res = await fetch(targetBlob.url, {
          headers: { Authorization: `Bearer ${BLOB_TOKEN}` }
        });
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch live catalog: ${res.statusText}`);
      }
      liveCatalog = await res.json();
    } catch (err: any) {
      console.error("Error fetching live catalog:", err.message || String(err));
      process.exit(1);
    }

    // 3. Merge only the price changes into the live catalog
    console.log("Merging price updates into live catalog...");
    let appliedCount = 0;
    for (const update of updates) {
      const liveItem = liveCatalog.items.find((item: any) => item.id === update.itemId);
      if (liveItem) {
        const storeLink = liveItem.stores[update.storeKey];
        if (storeLink) {
          if (update.status === "ERROR") {
            storeLink.is_verified = false; // Uncheck verified url checkbox on error
            appliedCount++;
            continue;
          }
          storeLink.regular_price = update.regular_price;
          storeLink.sale_price = update.sale_price;
          storeLink.is_on_sale = update.is_on_sale;
          storeLink.valid_until = update.valid_until;
          storeLink.is_verified = true; // Mark link as verified active

          // Update parent item's global unit and units if extracted
          if (update.unit) {
            liveItem.unit = update.unit;
          }
          if (update.units !== undefined && update.units !== null) {
            liveItem.units = update.units;
          }

          appliedCount++;
        } else {
          console.warn(`   ⚠️ Warning: Store "${update.storeKey}" not found on live item "${update.itemName}" (${update.itemId}). Skipping.`);
        }
      } else {
        console.warn(`   ⚠️ Warning: Item "${update.itemName}" (${update.itemId}) not found in the live catalog. Skipping.`);
      }
    }

    // 4. Upload the safely merged catalog to Vercel Blob
    try {
      console.log(`Uploading safely merged catalog (${liveCatalog.items.length} total items, ${appliedCount} updated links) to private Vercel Blob...`);
      await put("grocerylist/combined-catalog.json", JSON.stringify(liveCatalog, null, 2), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token: BLOB_TOKEN
      });
      console.log("\n[SUCCESS] Production combined-catalog.json successfully updated on Vercel Blob!");
    } catch (err: any) {
      console.error("Error uploading catalog:", err.message || String(err));
      process.exit(1);
    }
    return;
  }

  console.log("=== Starting Grocery Price Audit Scraper ===");
  console.log("1. Fetching Combined Catalog from Vercel Blob...");
  
  let catalog: any = null;
  try {
    const { blobs } = await list({ token: BLOB_TOKEN });
    const targetBlob = blobs.find(b => b.pathname === "grocerylist/combined-catalog.json");
    if (!targetBlob) {
      throw new Error("combined-catalog.json was not found in Vercel Blob store.");
    }
    console.log(`Found catalog blob at: ${targetBlob.url}`);
    let res = await fetch(targetBlob.url);
    if (!res.ok) {
      console.log("Direct fetch failed or was unauthorized. Retrying with authorization token...");
      res = await fetch(targetBlob.url, {
        headers: {
          Authorization: `Bearer ${BLOB_TOKEN}`
        }
      });
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch catalog from Vercel Blob: ${res.statusText} (${res.status})`);
    }
    catalog = await res.json();
  } catch (err: any) {
    console.error("Error fetching Combined Catalog:", err.message || String(err));
    process.exit(1);
  }

  // 2. Identify items that require scraping and have verified store links
  const targetLinks: { item: any; storeKey: string; storeDetails: any }[] = [];
  if (catalog && Array.isArray(catalog.items)) {
    for (const item of catalog.items) {
      if (item.requires_scraping === true) {
        for (const [storeKey, details] of Object.entries(item.stores || {})) {
          const s = details as any;
          const isVerified = s.is_verified === true || s.is_verified === 1 || String(s.is_verified) === "true";
          if (isVerified && s.url) {
            s.url = normalizeStoreUrl(s.url);
            targetLinks.push({ item, storeKey, storeDetails: s });
          }
        }
      }
    }
  }

  console.log(`\nIdentified ${targetLinks.length} verified store link(s) requiring audit.`);
  if (targetLinks.length === 0) {
    console.log("No verified links require scraping. Exiting.");
    return;
  }

  // Create screenshots directory
  const screenshotsDir = path.join(process.cwd(), "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const setupMode = args.includes("--setup");
  const analyzeOnly = args.includes("--analyze");
  const runAll = args.includes("--all");
  const screenshotsOnly = !analyzeOnly && !runAll && !setupMode;

  const profileDir = path.join(process.cwd(), "db-storage", "playwright-profile");
  
  if (setupMode) {
    console.log("\n=== Store Location Setup ===");
    console.log("Launching persistent browser profile directory...");
    console.log(`Profile location: ${profileDir}`);
    
    // Launch persistent browser context
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      channel: "chrome",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "en-CA",
      timezoneId: "America/Toronto",
      geolocation: { latitude: 44.9008, longitude: -76.2492 },
      permissions: ["geolocation"],
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-infobars"
      ]
    });

    const sites = [
      "https://www.foodbasics.ca",
      "https://www.metro.ca",
      "https://www.loblaws.ca",
      "https://www.nofrills.ca",
      "https://freshco.com",
      "https://www.walmart.ca",
      "https://www.yourindependentgrocer.ca"
    ];

    console.log("\nOpening store homepages in tabs...");
    const page1 = context.pages()[0] || await context.newPage();
    await page1.goto(sites[0]);
    
    for (let i = 1; i < sites.length; i++) {
      try {
        const page = await context.newPage();
        await page.goto(sites[i]);
      } catch (err: any) {
        console.warn(`Failed to open ${sites[i]}: ${err.message}`);
      }
    }

    console.log("\n============================================================");
    console.log("ACTION REQUIRED:");
    console.log("1. In the opened browser window, set your preferred store or");
    console.log("   postal code to Perth, Ontario (e.g., K7H 3C6) on EACH page.");
    console.log("2. Accept any cookie/location requests if prompted.");
    console.log("3. Once you have successfully configured the store on all tabs,");
    console.log("   return here and press [ENTER] to save cookies and exit.");
    console.log("============================================================\n");

    await new Promise<void>((resolve) => {
      process.stdin.once("data", () => {
        resolve();
      });
    });

    await context.close();
    console.log("Location profile configured and closed successfully!");
    console.log("You can now run the scraper normally to capture Perth-specific pricing.");
    return;
  }

  const auditResults: AuditResult[] = [];

  if (screenshotsOnly || runAll) {
    // 3. Launch Playwright and capture screenshots
    console.log("\n2. Launching headful browser using persistent profile for page captures...");
    console.log(`Profile location: ${profileDir}`);
    
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false, // Running headful is the most reliable way to avoid Cloudflare/Akamai blocking locally
      channel: "chrome",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
      locale: "en-CA",
      timezoneId: "America/Toronto",
      geolocation: { latitude: 44.9008, longitude: -76.2492 },
      permissions: ["geolocation"],
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-infobars"
      ]
    });

    const page = context.pages()[0] || await context.newPage();

    // Mask webdriver indicator
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    for (let i = 0; i < targetLinks.length; i++) {
      const { item, storeKey, storeDetails } = targetLinks[i];
      const progressLabel = `[Progress ${i + 1}/${targetLinks.length}]`;
      console.log(`\n------------------------------------------------------------`);
      console.log(`${progressLabel} Target: "${item.name}" at "${storeKey.toUpperCase()}"`);
      console.log(`   ├─ Product ID:   ${item.id}`);
      console.log(`   ├─ Target URL:   ${storeDetails.url}`);
      
      const catalogRegular = storeDetails.regular_price != null ? Number(storeDetails.regular_price) : null;
      const catalogSale = storeDetails.sale_price != null ? Number(storeDetails.sale_price) : null;
      const catalogIsOnSale = storeDetails.is_on_sale === 1 || storeDetails.is_on_sale === true;
      const catalogValidUntil = storeDetails.valid_until ? String(storeDetails.valid_until).trim() : null;
      const catalogUnit = item.unit ? String(item.unit) : null;
      const catalogUnits = item.units != null ? Number(item.units) : null;

      console.log(`   ├─ Catalog regular price: $${catalogRegular ?? "--"}`);
      console.log(`   ├─ Catalog sale price:    $${catalogSale ?? "--"} (On Sale: ${catalogIsOnSale ? "YES" : "NO"})`);
      console.log(`   ├─ Catalog valid until:   ${catalogValidUntil ?? "--"}`);
      console.log(`   ├─ Catalog unit:          ${catalogUnit ?? "--"} (${catalogUnits ?? "--"})`);

      const screenshotName = `${item.id}_${storeKey}.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotName);

      if (fs.existsSync(screenshotPath) && !runAll) {
        console.log(`   ├─ [CACHE HIT] Screenshot already exists. Skipping browser navigation.`);
        auditResults.push({
          itemId: item.id,
          itemName: item.name,
          storeKey,
          url: storeDetails.url,
          catalogRegular,
          catalogSale,
          catalogIsOnSale,
          catalogValidUntil,
          catalogUnit,
          catalogUnits,
          geminiRegular: null,
          geminiSale: null,
          geminiIsOnSale: false,
          geminiValidUntil: null,
          geminiUnit: null,
          geminiUnits: null,
          screenshotFile: screenshotPath,
          status: "MATCH",
          discrepancies: []
        });
        continue;
      }

      try {
        console.log(`   ├─ Navigating browser to URL...`);
        const startTime = Date.now();
        await page.goto(storeDetails.url, { waitUntil: "load", timeout: 60000 });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   ├─ Page loaded successfully in ${elapsed}s. Waiting 5s for dynamic content hydration...`);
        
        // Wait for dynamic loads/hydration
        await page.waitForTimeout(5000);

        // Check for Access Denied / blocked pages
        const pageTitle = await page.title();
        const pageContent = await page.content();
        if (pageTitle.includes("Access Denied") || pageContent.includes("Access Denied") || pageContent.includes("You don't have permission to access")) {
          throw new Error("Access Denied / blocked by bot manager.");
        }

        // Dismiss cookie banners to ensure they do not cover prices or date details
        await dismissCookieBanners(page);

        console.log(`   ├─ Capturing screenshot viewport...`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`   └─ [SUCCESS] Saved screenshot: ${screenshotName}`);

        // Initialize template audit entry
        auditResults.push({
          itemId: item.id,
          itemName: item.name,
          storeKey,
          url: storeDetails.url,
          catalogRegular,
          catalogSale,
          catalogIsOnSale,
          catalogValidUntil,
          catalogUnit,
          catalogUnits,
          geminiRegular: null,
          geminiSale: null,
          geminiIsOnSale: false,
          geminiValidUntil: null,
          geminiUnit: null,
          geminiUnits: null,
          screenshotFile: screenshotPath,
          status: "MATCH",
          discrepancies: []
        });

      } catch (err: any) {
        console.error(`   └─ [ERROR] Scraper failed for this URL: ${err.message || String(err)}`);
        auditResults.push({
          itemId: item.id,
          itemName: item.name,
          storeKey,
          url: storeDetails.url,
          catalogRegular,
          catalogSale,
          catalogIsOnSale,
          catalogValidUntil,
          catalogUnit,
          catalogUnits,
          geminiRegular: null,
          geminiSale: null,
          geminiIsOnSale: false,
          geminiValidUntil: null,
          geminiUnit: null,
          geminiUnits: null,
          screenshotFile: "",
          status: "ERROR",
          discrepancies: [],
          errorMessage: err.message || String(err)
        });
      }
    }

    await context.close();
    console.log("\n3. Captures completed. Browser context closed.");

    if (screenshotsOnly) {
      console.log("\n=== Screenshot Capture Phase Completed ===");
      console.log(`Captured screenshots for ${targetLinks.length} items.`);
      console.log(`Screenshots are saved in: ${screenshotsDir}`);
      console.log("\nAs requested, the script has stopped before starting the Gemini API analysis.");
      console.log("To run the Gemini API analysis using these screenshots, run:");
      console.log("  npx tsx scripts/audit-prices.ts --analyze\n");
      return;
    }
  } else if (analyzeOnly) {
    console.log("\n2. Skipping browser capture. Loading existing screenshots for Gemini analysis...");
    for (let i = 0; i < targetLinks.length; i++) {
      const { item, storeKey, storeDetails } = targetLinks[i];
      const screenshotName = `${item.id}_${storeKey}.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotName);
      
      const catalogRegular = storeDetails.regular_price != null ? Number(storeDetails.regular_price) : null;
      const catalogSale = storeDetails.sale_price != null ? Number(storeDetails.sale_price) : null;
      const catalogIsOnSale = storeDetails.is_on_sale === 1 || storeDetails.is_on_sale === true;
      const catalogValidUntil = storeDetails.valid_until ? String(storeDetails.valid_until).trim() : null;
      const catalogUnit = item.unit ? String(item.unit) : null;
      const catalogUnits = item.units != null ? Number(item.units) : null;

      const hasScreenshot = fs.existsSync(screenshotPath);
      if (hasScreenshot) {
        auditResults.push({
          itemId: item.id,
          itemName: item.name,
          storeKey,
          url: storeDetails.url,
          catalogRegular,
          catalogSale,
          catalogIsOnSale,
          catalogValidUntil,
          catalogUnit,
          catalogUnits,
          geminiRegular: null,
          geminiSale: null,
          geminiIsOnSale: false,
          geminiValidUntil: null,
          geminiUnit: null,
          geminiUnits: null,
          screenshotFile: screenshotPath,
          status: "MATCH",
          discrepancies: []
        });
      } else {
        auditResults.push({
          itemId: item.id,
          itemName: item.name,
          storeKey,
          url: storeDetails.url,
          catalogRegular,
          catalogSale,
          catalogIsOnSale,
          catalogValidUntil,
          catalogUnit,
          catalogUnits,
          geminiRegular: null,
          geminiSale: null,
          geminiIsOnSale: false,
          geminiValidUntil: null,
          geminiUnit: null,
          geminiUnits: null,
          screenshotFile: "",
          status: "ERROR",
          discrepancies: [],
          errorMessage: `Screenshot file missing: ${screenshotName}`
        });
      }
    }
  }

  // 4. Inspect captured images using Gemini 3.5 Flash
  console.log("\n4. Analyzing images with Gemini 3.5 Flash API...");
  
  const currentYear = new Date().getFullYear();
  const currentDateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const systemInstruction = `
You are a precision grocery price auditing bot. Your task is to analyze the screenshot of a grocery item product page and extract the exact pricing details and unit measurement information.
The current date is ${currentDateStr} (Year ${currentYear}). If the flyer/screenshot displays a date without a year (e.g. "August 12" or "valid until Aug 12"), assume the current year is ${currentYear} and construct the YYYY-MM-DD date.

Please extract the following fields:
1. "regular_price": The standard regular retail price of the item. It must be a number (e.g. 5.49). Set to null if not found.
2. "sale_price": The active promotional sale price of the item. It must be a number (e.g. 3.99). Set to null if no active sale/discount is visible.
3. "is_on_sale": A boolean indicating if the item is currently on sale/discount.
4. "valid_until": The expiration or end date of the active flyer/promotional sale in format "YYYY-MM-DD" (e.g. "${currentYear}-06-24"). Set to null if no expiry date or no active sale is found.
5. "unit": The unit type/measurement type of the item as displayed. Common values include:
   - "kg" or "lb" for weighted items (e.g. Bananas sold at 1.52 per kg has unit "kg" or "lb").
   - "g" or "ml" or "l" for packaged products (e.g. 450 g has unit "g", 1.5 L has unit "l" or "ml").
   - "unit" or "count" or "pack" for count-based or packaged items (e.g. "30 count eggs" has unit "count" or "unit", "3 units per package" has unit "unit" or "pack").
   - Use lowercase and standard abbreviations (e.g., "g", "kg", "ml", "l", "lb", "unit", "count", "pack"). If not visible or unclear, set to null.
6. "unit_quantity": The numeric quantity, count, weight, or volume size corresponding to the unit (e.g. 30 for 30 count eggs, 3 for a package of 3 romaine lettuce hearts, 1 for bananas priced per kg, 450 for a 450g package). It must be a number (e.g., 30, 3, 1, 450). Set to null if not found or unclear.

Look for currency symbols ($, ¢). Be precise and double check your numbers and unit information.
`;

  for (let i = 0; i < auditResults.length; i++) {
    const result = auditResults[i];
    if (result.status === "ERROR" || !result.screenshotFile) {
      continue;
    }

    console.log(`[Audit Progress ${i + 1}/${auditResults.length}] Inspecting image for "${result.itemName}" (${result.storeKey})...`);
    
    try {
      const base64Image = fs.readFileSync(result.screenshotFile).toString("base64");
      
      const userPrompt = `
Analyze this screenshot for the product "${result.itemName}" at store "${result.storeKey}".
Extract regular price, sale price, sale status, flyer validity date, unit type, and unit quantity.
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: base64Image,
              mimeType: "image/png"
            }
          },
          userPrompt
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["regular_price", "sale_price", "is_on_sale", "valid_until", "unit", "unit_quantity"],
            properties: {
              regular_price: {
                type: Type.NUMBER,
                description: "The standard regular price of the item, or null if not found."
              },
              sale_price: {
                type: Type.NUMBER,
                description: "The active sale price of the item, or null if not found."
              },
              is_on_sale: {
                type: Type.BOOLEAN,
                description: "Whether the item is currently discounted."
              },
              valid_until: {
                type: Type.STRING,
                description: " Flyer end date in format YYYY-MM-DD, or null if not found."
              },
              unit: {
                type: Type.STRING,
                description: "The measurement or packaging unit type (e.g., 'kg', 'g', 'ml', 'lb', 'unit', 'count', 'pack'), or null if not found."
              },
              unit_quantity: {
                type: Type.NUMBER,
                description: "The numeric size, weight, or quantity of units (e.g. 30 for 30 count, 3 for 3 units, 1 for per kg/lb, 450 for 450g), or null if not found."
              }
            }
          }
        }
      });

      const text = response.text || "{}";
      const parsed = JSON.parse(text);

      result.geminiRegular = parsed.regular_price != null ? Number(parsed.regular_price) : null;
      if (result.geminiRegular !== null && result.geminiRegular <= 0) {
        result.geminiRegular = null;
      }

      result.geminiIsOnSale = !!parsed.is_on_sale;
      result.geminiSale = parsed.sale_price != null ? Number(parsed.sale_price) : null;
      if (result.geminiSale !== null && result.geminiSale <= 0) {
        result.geminiSale = null;
      }

      let valDate = parsed.valid_until ? String(parsed.valid_until).trim() : null;

      // If the model determined it is not on sale, or if the sale price is null, clean both and clear validity date
      if (!result.geminiIsOnSale || result.geminiSale === null) {
        result.geminiIsOnSale = false;
        result.geminiSale = null;
        valDate = null;
      }

      if (valDate) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(valDate) || valDate.startsWith("0000") || valDate.startsWith("1970")) {
          valDate = null;
        } else {
          // If the year extracted is less than the current year, correct it to the current year
          const parts = valDate.split("-");
          const year = parseInt(parts[0], 10);
          const currentYear = new Date().getFullYear();
          if (year < currentYear) {
            valDate = `${currentYear}-${parts[1]}-${parts[2]}`;
          }
        }
      }
      result.geminiValidUntil = valDate;

      const validUnits = ["g", "kg", "ml", "l", "lb", "unit", "count", "pack", "each", "pcs", "roll", "box", "bag", "can", "bunch", "dozen", "piece", "pieces", "pc", "lbs"];
      result.geminiUnit = parsed.unit ? String(parsed.unit).trim().toLowerCase() : null;
      if (result.geminiUnit && !validUnits.includes(result.geminiUnit)) {
        result.geminiUnit = null;
      }
      result.geminiUnits = parsed.unit_quantity != null ? Number(parsed.unit_quantity) : null;
      if (result.geminiUnits !== null && (isNaN(result.geminiUnits) || result.geminiUnits <= 0)) {
        result.geminiUnits = null;
      }

      console.log(`   ├─ Extracted regular price: $${result.geminiRegular ?? "--"}`);
      console.log(`   ├─ Extracted sale price:    $${result.geminiSale ?? "--"} (On Sale: ${result.geminiIsOnSale ? "YES" : "NO"})`);
      console.log(`   ├─ Extracted valid until:   ${result.geminiValidUntil ?? "--"}`);
      console.log(`   ├─ Extracted unit:          ${result.geminiUnit ?? "--"} (${result.geminiUnits ?? "--"})`);

      // 5. Compare Gemini findings against Combined Catalog
      const discrepancies: string[] = [];

      // Regular price check
      if (result.catalogRegular !== result.geminiRegular) {
        discrepancies.push(`Regular Price mismatch: Catalog has $${result.catalogRegular ?? "--"}, Live has $${result.geminiRegular ?? "--"}`);
      }

      // Sale price check
      if (result.catalogSale !== result.geminiSale) {
        discrepancies.push(`Sale Price mismatch: Catalog has $${result.catalogSale ?? "--"}, Live has $${result.geminiSale ?? "--"}`);
      }

      // Flyer expiration date check
      const normCatalogDate = result.catalogValidUntil ? result.catalogValidUntil.replace(/\s+/g, "") : null;
      const normGeminiDate = result.geminiValidUntil ? result.geminiValidUntil.replace(/\s+/g, "") : null;
      if (normCatalogDate !== normGeminiDate) {
        discrepancies.push(`Validity Date mismatch: Catalog has "${result.catalogValidUntil ?? "--"}", Live has "${result.geminiValidUntil ?? "--"}"`);
      }

      // Unit check
      const normalizeUnit = (u: string | null) => {
        if (!u) return null;
        const lowered = u.trim().toLowerCase();
        if (lowered === "each" || lowered === "count" || lowered === "pcs" || lowered === "pieces" || lowered === "pc") {
          return "unit";
        }
        if (lowered === "lbs") {
          return "lb";
        }
        return lowered;
      };

      const normCatalogUnit = normalizeUnit(result.catalogUnit);
      const normGeminiUnit = normalizeUnit(result.geminiUnit);
      if (normCatalogUnit !== normGeminiUnit) {
        discrepancies.push(`Unit mismatch: Catalog has "${result.catalogUnit ?? "--"}", Live has "${result.geminiUnit ?? "--"}"`);
      }

      // Unit Quantity check
      if (result.catalogUnits !== result.geminiUnits) {
        discrepancies.push(`Unit Quantity mismatch: Catalog has ${result.catalogUnits ?? "--"}, Live has ${result.geminiUnits ?? "--"}`);
      }

      if (discrepancies.length > 0) {
        result.status = "MISMATCH";
        result.discrepancies = discrepancies;
        console.log(`   └─ [DISCREPANCY FOUND]:`);
        discrepancies.forEach(d => console.log(`      • ${d}`));
      } else {
        result.status = "MATCH";
        console.log(`   └─ [OK] Prices, dates, and units match perfectly.`);
      }

    } catch (err: any) {
      console.error(`   └─ Gemini Analysis Error: ${err.message || String(err)}`);
      result.status = "ERROR";
      result.errorMessage = err.message || String(err);
    }

    // Rate limiting delay (15 RPM limits)
    if (i < auditResults.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
  }

  // Save updated catalog to a local JSON file
  if (analyzeOnly || runAll) {
    console.log("\n5. Saving updated combined-catalog database locally...");
    const updatedCatalog = { ...catalog };
    
    // Process results and update in-memory catalog
    let updatedCount = 0;
    for (const res of auditResults) {
      const item = updatedCatalog.items.find((i: any) => i.id === res.itemId);
      if (item) {
        const storeLink = item.stores[res.storeKey];
        if (storeLink) {
          if (res.status === "ERROR") {
            storeLink.is_verified = false; // Uncheck verified url checkbox on error
            continue;
          }
          storeLink.regular_price = res.geminiRegular;
          storeLink.sale_price = res.geminiSale;
          storeLink.is_on_sale = res.geminiIsOnSale ? 1 : 0;
          storeLink.valid_until = res.geminiValidUntil || "";
          storeLink.is_verified = true; // Mark link as verified active

          // Update global unit and units size on parent catalog item
          if (res.geminiUnit) {
            item.unit = res.geminiUnit;
          }
          if (res.geminiUnits !== null) {
            item.units = res.geminiUnits;
          }

          updatedCount++;
        }
      }
    }
    
    const dbDir = path.join(process.cwd(), "db-storage");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const updatedPath = path.join(dbDir, "combined-catalog-updated.json");
    fs.writeFileSync(updatedPath, JSON.stringify(updatedCatalog, null, 2), "utf8");
    console.log(`   ├─ Full updated catalog saved to: db-storage/combined-catalog-updated.json`);

    // Write a clean delta JSON file containing only the updates
    const updatesDelta = auditResults
      .filter(r => r.status === "MATCH" || r.status === "MISMATCH" || r.status === "ERROR")
      .map(r => ({
        itemId: r.itemId,
        itemName: r.itemName,
        storeKey: r.storeKey,
        regular_price: r.geminiRegular,
        sale_price: r.geminiSale,
        is_on_sale: r.geminiIsOnSale ? 1 : 0,
        valid_until: r.geminiValidUntil || "",
        unit: r.geminiUnit,
        units: r.geminiUnits,
        status: r.status,
        discrepancies: r.discrepancies
      }));
      
    const deltaPath = path.join(dbDir, "audit-pricing-updates.json");
    fs.writeFileSync(deltaPath, JSON.stringify(updatesDelta, null, 2), "utf8");
    console.log(`   ├─ Delta changes list saved to: db-storage/audit-pricing-updates.json`);
    console.log(`   └─ Audited and updated pricing for ${updatedCount} store links.`);
    console.log("\nOnce you verify these changes, push them to production using: npx tsx scripts/audit-prices.ts --apply");
  }

  // 6. Write Markdown Report
  writeMarkdownReport(auditResults);
}

function writeMarkdownReport(results: AuditResult[]) {
  const reportPath = path.join(process.cwd(), "price_audit_report.md");
  
  let md = `# Combined Catalog Price Audit Report\n\n`;
  md += `**Date:** ${new Date().toLocaleString()}\n\n`;
  
  // Status breakdown
  const total = results.length;
  const matches = results.filter(r => r.status === "MATCH").length;
  const mismatches = results.filter(r => r.status === "MISMATCH").length;
  const errors = results.filter(r => r.status === "ERROR").length;
  
  md += `## Summary Dashboard\n\n`;
  md += `| Total Audited | Matches | Mismatches | Errors |\n`;
  md += `| --- | --- | --- | --- |\n`;
  md += `| ${total} | ${matches} | ${mismatches} | ${errors} |\n\n`;

  md += `## Audit Registry Details\n\n`;
  md += `| Item Name | Store | Status | Catalog Price | Live Price | Catalog Unit / Size | Live Unit / Size | Expiry Match? | Discrepancies / Error |\n`;
  md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

  for (const r of results) {
    const catalogPriceStr = r.catalogIsOnSale 
      ? `Sale: $${r.catalogSale ?? "--"} (Reg: $${r.catalogRegular ?? "--"})`
      : `Reg: $${r.catalogRegular ?? "--"}`;
      
    const livePriceStr = r.geminiIsOnSale
      ? `Sale: $${r.geminiSale ?? "--"} (Reg: $${r.geminiRegular ?? "--"})`
      : `Reg: $${r.geminiRegular ?? "--"}`;

    const catalogUnitSize = `${r.catalogUnit ?? "--"} (${r.catalogUnits ?? "--"})`;
    const liveUnitSize = `${r.geminiUnit ?? "--"} (${r.geminiUnits ?? "--"})`;

    const dateMatchStr = r.catalogValidUntil === r.geminiValidUntil ? "Yes" : "No";

    let statusBadge = "❌ ERROR";
    if (r.status === "MATCH") statusBadge = "✅ MATCH";
    if (r.status === "MISMATCH") statusBadge = "⚠️ MISMATCH";

    const descStr = r.status === "ERROR" 
      ? `Error: ${r.errorMessage}` 
      : r.discrepancies.join("; ") || "None";

    md += `| ${r.itemName} | ${r.storeKey} | ${statusBadge} | ${catalogPriceStr} | ${livePriceStr} | ${catalogUnitSize} | ${liveUnitSize} | ${dateMatchStr} | ${descStr} |\n`;
  }

  fs.writeFileSync(reportPath, md, "utf8");
  console.log(`\n=== Audit Report successfully written to: ${reportPath} ===`);
}

runAudit();
