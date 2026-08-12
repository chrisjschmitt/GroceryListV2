import { chromium } from "playwright";
import { GoogleGenAI, Type } from "@google/genai";
import { blobGetCombinedCatalog, blobSetCombinedCatalog } from "../src/lib/db-store";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load Environment Variables from .env.local
const projectRootEnvPath = path.join(__dirname, "..", ".env.local");
const cwdEnvPath = path.join(process.cwd(), ".env.local");

let envPath = "";
if (fs.existsSync(projectRootEnvPath)) {
  envPath = projectRootEnvPath;
} else if (fs.existsSync(cwdEnvPath)) {
  envPath = cwdEnvPath;
}

if (envPath) {
  dotenv.config({ path: envPath, override: true });
} else {
  dotenv.config({ override: true });
}

const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_KEY) {
  console.error("Error: GEMINI_API_KEY is not defined in environment variables.");
  process.exit(1);
}

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

// Status & Lock File Infrastructure
interface AuditRunStatus {
  startedAt: string | null;
  finishedAt: string | null;
  success: boolean;
  lastSuccessAt: string | null;
  stage: "idle" | "pruning" | "capturing" | "analyzing" | "saving" | "applying" | "failed";
  itemCounts: {
    total: number;
    captured: number;
    analyzed: number;
    matches: number;
    mismatches: number;
    errors: number;
  };
  appliedCount?: number;
  truncated: boolean;
  errorMessage: string | null;
}

const statusFilePath = path.join(process.cwd(), "db-storage", "audit-run-status.json");
const lockFilePath = path.join(process.cwd(), "db-storage", "audit-prices.lock");
let isLockOwner = false;

function getExistingStatus(): AuditRunStatus {
  try {
    if (fs.existsSync(statusFilePath)) {
      const content = fs.readFileSync(statusFilePath, "utf8");
      if (content.trim()) {
        return JSON.parse(content);
      }
    }
  } catch {
    // Ignore parse errors
  }
  return {
    startedAt: null,
    finishedAt: null,
    success: false,
    lastSuccessAt: null,
    stage: "idle",
    itemCounts: { total: 0, captured: 0, analyzed: 0, matches: 0, mismatches: 0, errors: 0 },
    appliedCount: 0,
    truncated: false,
    errorMessage: null
  };
}

function saveRunStatus(partial: Partial<AuditRunStatus>) {
  try {
    const existing = getExistingStatus();
    const dbDir = path.join(process.cwd(), "db-storage");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const updated: AuditRunStatus = {
      startedAt: partial.startedAt !== undefined ? partial.startedAt : existing.startedAt,
      finishedAt: partial.finishedAt !== undefined ? partial.finishedAt : existing.finishedAt,
      success: partial.success !== undefined ? partial.success : existing.success,
      lastSuccessAt: partial.success === true && partial.finishedAt
        ? partial.finishedAt
        : (existing.lastSuccessAt || null),
      stage: partial.stage !== undefined ? partial.stage : existing.stage,
      itemCounts: partial.itemCounts !== undefined ? partial.itemCounts : existing.itemCounts,
      appliedCount: partial.appliedCount !== undefined ? partial.appliedCount : existing.appliedCount,
      truncated: partial.truncated !== undefined ? partial.truncated : existing.truncated,
      errorMessage: partial.errorMessage !== undefined ? partial.errorMessage : existing.errorMessage
    };
    fs.writeFileSync(statusFilePath, JSON.stringify(updated, null, 2), "utf8");
  } catch (err: any) {
    console.error("Error saving run status:", err.message || String(err));
  }
}

function acquireLock(): boolean {
  if (fs.existsSync(lockFilePath)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFilePath, "utf8"));
      const lockPid = lockData.pid;
      if (lockPid) {
        try {
          process.kill(lockPid, 0);
          console.error(`\n❌ [LOCK ERROR] Live lock file exists at db-storage/audit-prices.lock (PID ${lockPid}, started at ${lockData.timestamp || "unknown"}). Another audit is currently running. Exiting.`);
          return false;
        } catch (e: any) {
          if (e.code === "ESRCH") {
            console.warn(`   ⚠️ Found stale lock file from dead PID ${lockPid}. Overwriting lock.`);
          } else {
            console.error(`\n❌ [LOCK ERROR] Could not verify process PID ${lockPid}. Exiting.`);
            return false;
          }
        }
      }
    } catch {
      console.warn("   ⚠️ Unreadable lock file found. Overwriting lock.");
    }
  }

  const dbDir = path.join(process.cwd(), "db-storage");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  fs.writeFileSync(lockFilePath, JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }, null, 2), "utf8");
  isLockOwner = true;
  return true;
}

function releaseLock() {
  if (isLockOwner && fs.existsSync(lockFilePath)) {
    try {
      fs.unlinkSync(lockFilePath);
      isLockOwner = false;
    } catch {
      // Ignore cleanup error
    }
  }
}

// Pruning screenshots
function pruneScreenshots(): void {
  const screenshotsDir = path.join(process.cwd(), "screenshots");
  const prevDir = path.join(process.cwd(), "screenshots-prev");

  console.log("\n[Pruning Screenshots]");
  // Clean out any old images in screenshots-prev to keep exactly 1 previous run
  if (fs.existsSync(prevDir)) {
    const prevFiles = fs.readdirSync(prevDir);
    for (const file of prevFiles) {
      if (file.endsWith(".png")) {
        try { fs.unlinkSync(path.join(prevDir, file)); } catch {}
      }
    }
  } else {
    fs.mkdirSync(prevDir, { recursive: true });
  }

  // Move current screenshots to screenshots-prev
  if (fs.existsSync(screenshotsDir)) {
    const files = fs.readdirSync(screenshotsDir);
    let movedCount = 0;
    for (const file of files) {
      if (file.endsWith(".png")) {
        const src = path.join(screenshotsDir, file);
        const dest = path.join(prevDir, file);
        try {
          fs.renameSync(src, dest);
          movedCount++;
        } catch (err: any) {
          console.warn(`   ⚠️ Could not move screenshot ${file}: ${err.message}`);
        }
      }
    }
    console.log(`   ├─ Moved ${movedCount} existing screenshot(s) to screenshots-prev/`);
  } else {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
}

function restorePrevScreenshots(): void {
  const screenshotsDir = path.join(process.cwd(), "screenshots");
  const prevDir = path.join(process.cwd(), "screenshots-prev");

  if (fs.existsSync(prevDir)) {
    const prevFiles = fs.readdirSync(prevDir);
    let restoredCount = 0;
    for (const file of prevFiles) {
      if (file.endsWith(".png")) {
        const src = path.join(prevDir, file);
        const dest = path.join(screenshotsDir, file);
        try {
          fs.copyFileSync(src, dest);
          restoredCount++;
        } catch {}
      }
    }
    if (restoredCount > 0) {
      console.warn(`   ⚠️ Restored ${restoredCount} screenshot(s) from previous run after capture failure.`);
    }
  }
}

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
        break;
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
  catalogInFlyer: boolean;
  geminiRegular: number | null;
  geminiSale: number | null;
  geminiIsOnSale: boolean;
  geminiValidUntil: string | null;
  geminiUnit: string | null;
  geminiUnits: number | null;
  geminiInFlyer: boolean;
  screenshotFile: string;
  status: "MATCH" | "MISMATCH" | "ERROR";
  discrepancies: string[];
  errorMessage?: string;
  analyzed?: boolean;
}

async function handleCloudflareChallenge(page: any, unattended: boolean): Promise<boolean> {
  const pageTitle = await page.title().catch(() => "");
  const pageContent = await page.content().catch(() => "");
  const isChallenge = pageTitle.includes("Verify you are human") || 
                      pageTitle.includes("Just a moment...") ||
                      pageTitle.includes("Almost there") ||
                      pageContent.includes("cf-challenge") ||
                      pageContent.includes("Verify you are human");

  if (isChallenge) {
    console.warn("\n   ⚠️ [CLOUDFLARE CHALLENGE DETECTED]");
    if (unattended) {
      console.warn("   Unattended mode (--full): skipping stdin prompt and marking item as ERROR.");
      return false;
    }
    console.warn("   Please solve the verification challenge in the headful Chrome window.");
    console.warn("   Once solved and the actual product page loads, return here and press [ENTER] to continue...");
    
    // Play a terminal beep sound
    process.stdout.write("\x07");

    await new Promise<void>((resolve) => {
      process.stdin.once("data", () => {
        resolve();
      });
    });
    return true;
  }
  return true;
}

async function callGeminiWithRetries(ai: GoogleGenAI, base64Image: string, userPrompt: string, systemInstruction: string): Promise<any> {
  const maxRetries = 3;
  const backoffs = [2000, 4000, 8000];
  let attempts = 0;

  while (true) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
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
        }),
        new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error("Gemini request timed out after 15 seconds")), 15000)
        )
      ]);
      return response;
    } catch (err: any) {
      if (attempts < maxRetries) {
        const delayMs = backoffs[attempts];
        attempts++;
        console.warn(`   ⚠️ Gemini API call failed (attempt ${attempts}/${maxRetries}): ${err.message || String(err)}. Retrying in ${delayMs / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }
}

interface ApplyUpdatesResult {
  appliedCount: number;
  totalPending: number;
}

async function applyCatalogUpdates(updatesList?: any[]): Promise<ApplyUpdatesResult> {
  console.log("\n=== Applying Catalog Updates to Production MongoDB ===");

  const deltaPath = path.join(process.cwd(), "db-storage", "audit-pricing-updates.json");
  let allUpdates: any[] = [];

  if (updatesList && Array.isArray(updatesList)) {
    allUpdates = updatesList;
  } else {
    if (!fs.existsSync(deltaPath)) {
      throw new Error(`Delta updates file not found at: ${deltaPath}\nPlease run the audit first using: npx tsx scripts/audit-prices.ts --analyze or --full`);
    }
    try {
      allUpdates = JSON.parse(fs.readFileSync(deltaPath, "utf8"));
      if (!Array.isArray(allUpdates)) {
        throw new Error("Delta updates file must be a JSON array.");
      }
    } catch (err: any) {
      throw new Error(`Error reading delta updates: ${err.message || String(err)}`);
    }
  }

  const pendingUpdates = allUpdates.filter((u: any) => !u.applied);

  if (pendingUpdates.length === 0) {
    console.log("No pending updates to apply. Exiting.");
    return { appliedCount: 0, totalPending: 0 };
  }

  console.log(`Loaded ${pendingUpdates.length} pending pricing update(s) (${allUpdates.length} total in audit record).`);

  console.log("Fetching the latest production catalog from MongoDB...");
  let liveCatalog: any = null;
  try {
    liveCatalog = await blobGetCombinedCatalog();
  } catch (err: any) {
    throw new Error(`Error fetching live catalog: ${err.message || String(err)}`);
  }

  if (!liveCatalog || !Array.isArray(liveCatalog.items)) {
    throw new Error("Invalid or empty catalog returned from MongoDB.");
  }

  console.log("Merging price updates into live catalog...");
  let appliedCount = 0;
  for (const update of pendingUpdates) {
    const liveItem = liveCatalog.items.find((item: any) => item.id === update.itemId);
    if (liveItem) {
      const storeLink = liveItem.stores?.[update.storeKey];
      if (storeLink) {
        if (update.status === "ERROR") {
          storeLink.is_verified = false;
          appliedCount++;
          continue;
        }
        storeLink.regular_price = update.regular_price;
        storeLink.sale_price = update.sale_price;
        storeLink.is_on_sale = update.is_on_sale;
        storeLink.valid_until = update.valid_until;
        if (update.in_flyer !== undefined) {
          storeLink.in_flyer = update.in_flyer;
        }
        storeLink.is_verified = true;

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

  try {
    console.log(`Uploading safely merged catalog (${liveCatalog.items.length} total items, ${appliedCount} updated links) to MongoDB...`);
    await blobSetCombinedCatalog(liveCatalog);
    console.log("\n[SUCCESS] Production catalog successfully updated in MongoDB!");
  } catch (err: any) {
    throw new Error(`Error uploading catalog: ${err.message || String(err)}`);
  }

  const appliedAt = new Date().toISOString();
  for (const update of pendingUpdates) {
    update.applied = true;
    update.appliedAt = appliedAt;
  }

  try {
    const dbDir = path.join(process.cwd(), "db-storage");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(deltaPath, JSON.stringify(allUpdates, null, 2), "utf8");
    console.log(`   ├─ Marked ${pendingUpdates.length} update(s) as applied in db-storage/audit-pricing-updates.json`);
  } catch (saveErr: any) {
    console.warn(`   ⚠️ Warning: Could not update applied status in audit-pricing-updates.json: ${saveErr.message}`);
  }

  return { appliedCount, totalPending: pendingUpdates.length };
}

async function runAudit() {
  const args = process.argv.slice(2);
  const fullMode = args.includes("--full");
  const headfulMode = args.includes("--headful");
  const applyMode = args.includes("--apply");
  const setupMode = args.includes("--setup");
  const forceReanalyze = args.includes("--force");
  const retryErrors = args.includes("--retry-errors") || args.includes("--retry");
  const analyzeOnly = (args.includes("--analyze") || retryErrors) && !fullMode;
  const runAll = args.includes("--all") || fullMode;

  let maxItems = Infinity;
  const maxItemsArgIdx = args.findIndex(arg => arg.startsWith("--max-items"));
  if (maxItemsArgIdx !== -1) {
    const argVal = args[maxItemsArgIdx];
    if (argVal.includes("=")) {
      const val = parseInt(argVal.split("=")[1], 10);
      if (!isNaN(val) && val > 0) maxItems = val;
    } else if (maxItemsArgIdx + 1 < args.length) {
      const val = parseInt(args[maxItemsArgIdx + 1], 10);
      if (!isNaN(val) && val > 0) maxItems = val;
    }
  }

  if (applyMode) {
    try {
      await applyCatalogUpdates();
    } catch (err: any) {
      console.error(err.message || String(err));
      process.exit(1);
    }
    return;
  }

  const storeArgIdx = args.indexOf("--store");
  let filterStoreKey: string | null = null;
  if (storeArgIdx !== -1 && storeArgIdx + 1 < args.length) {
    filterStoreKey = args[storeArgIdx + 1].toLowerCase().trim();
  }

  if (filterStoreKey) {
    console.log(`=== Starting Grocery Price Audit Scraper (Filtering Store: ${filterStoreKey}) ===`);
  } else {
    console.log("=== Starting Grocery Price Audit Scraper ===");
  }

  const startedAt = new Date().toISOString();
  saveRunStatus({
    startedAt,
    finishedAt: null,
    success: false,
    stage: fullMode ? "pruning" : (analyzeOnly ? "analyzing" : "capturing"),
    errorMessage: null,
    truncated: false
  });

  console.log("1. Loading Combined Catalog...");
  
  let catalog: any = null;
  try {
    const localCatalogPath = path.join(process.cwd(), "db-storage", "combined-catalog-updated.json");
    if (fs.existsSync(localCatalogPath)) {
      console.log("   Loading from local cache file db-storage/combined-catalog-updated.json...");
      catalog = JSON.parse(fs.readFileSync(localCatalogPath, "utf8"));
    } else {
      console.log("   Fetching latest live catalog from MongoDB...");
      catalog = await blobGetCombinedCatalog();
    }
  } catch (err: any) {
    console.error("Error loading Combined Catalog:", err.message || String(err));
    saveRunStatus({ finishedAt: new Date().toISOString(), success: false, stage: "failed", errorMessage: err.message || String(err) });
    process.exit(1);
  }

  let targetLinks: { item: any; storeKey: string; storeDetails: any }[] = [];
  if (catalog && Array.isArray(catalog.items)) {
    for (const item of catalog.items) {
      if (item.requires_scraping === true) {
        for (const [storeKey, details] of Object.entries(item.stores || {})) {
          const s = details as any;
          const isVerified = s.is_verified === true || s.is_verified === 1 || String(s.is_verified) === "true";
          const analyzeOnlyMode = args.includes("--analyze");
          if (s.url && (isVerified || analyzeOnlyMode)) {
            if (filterStoreKey && storeKey.toLowerCase().trim() !== filterStoreKey) {
              continue;
            }
            s.url = normalizeStoreUrl(s.url);
            targetLinks.push({ item, storeKey, storeDetails: s });
          }
        }
      }
    }
  }

  let truncated = false;
  if (targetLinks.length > maxItems) {
    console.warn(`\n⚠️ [MAX ITEMS CAP] Catalog identified ${targetLinks.length} target link(s), but --max-items=${maxItems} cap is set. Truncating run.`);
    targetLinks = targetLinks.slice(0, maxItems);
    truncated = true;
  }

  console.log(`\nIdentified ${targetLinks.length} verified store link(s) requiring audit.`);
  if (targetLinks.length === 0) {
    console.log("No verified links require scraping. Exiting.");
    saveRunStatus({
      finishedAt: new Date().toISOString(),
      success: true,
      stage: "idle",
      itemCounts: { total: 0, captured: 0, analyzed: 0, matches: 0, mismatches: 0, errors: 0 },
      truncated,
      errorMessage: null
    });
    return;
  }

  const screenshotsDir = path.join(process.cwd(), "screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const screenshotsOnly = !analyzeOnly && !runAll && !setupMode && !fullMode;
  const profileDir = path.join(process.cwd(), "db-storage", "playwright-profile");
  
  if (setupMode) {
    console.log("\n=== Store Location Setup ===");
    console.log("Launching persistent browser profile directory...");
    console.log(`Profile location: ${profileDir}`);
    
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
    saveRunStatus({ finishedAt: new Date().toISOString(), success: true, stage: "idle", errorMessage: null });
    return;
  }

  // Handle Pruning before capture in full mode or before full run
  if (fullMode) {
    saveRunStatus({ stage: "pruning" });
    pruneScreenshots();
  }

  const auditResults: AuditResult[] = [];
  let capturedCount = 0;
  let captureErrorCount = 0;

  if (screenshotsOnly || runAll || fullMode) {
    saveRunStatus({
      stage: "capturing",
      itemCounts: { total: targetLinks.length, captured: 0, analyzed: 0, matches: 0, mismatches: 0, errors: 0 },
      truncated
    });

    const isHeadless = fullMode ? !headfulMode : false;
    console.log(`\n2. Launching browser (${isHeadless ? "headless" : "headful"}) using persistent profile for page captures...`);
    console.log(`Profile location: ${profileDir}`);
    
    let context: any = null;
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        headless: isHeadless,
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
    } catch (launchErr: any) {
      console.error("Failed to launch Playwright browser:", launchErr.message);
      if (fullMode) {
        restorePrevScreenshots();
      }
      throw launchErr;
    }

    const page = context.pages()[0] || await context.newPage();

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
      const catalogInFlyer = storeDetails.in_flyer === 1 || storeDetails.in_flyer === true;

      const screenshotName = `${item.id}_${storeKey}.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotName);

      if (fs.existsSync(screenshotPath) && !runAll && !fullMode) {
        console.log(`   ├─ [CACHE HIT] Screenshot already exists. Skipping browser navigation.`);
        capturedCount++;
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
          catalogInFlyer,
          geminiRegular: null,
          geminiSale: null,
          geminiIsOnSale: false,
          geminiValidUntil: null,
          geminiUnit: null,
          geminiUnits: null,
          geminiInFlyer: false,
          screenshotFile: screenshotPath,
          status: "MATCH",
          discrepancies: []
        });
        saveRunStatus({
          itemCounts: { total: targetLinks.length, captured: capturedCount, analyzed: 0, matches: 0, mismatches: 0, errors: captureErrorCount },
          truncated
        });
        continue;
      }

      if (i > 0) {
        const delay = Math.floor(Math.random() * 4000) + 3000;
        console.log(`   ├─ Sleeping for ${(delay / 1000).toFixed(1)}s to mimic human behavior...`);
        await page.waitForTimeout(delay);
      }

      try {
        console.log(`   ├─ Navigating browser to URL...`);
        const startTime = Date.now();
        const response = await page.goto(storeDetails.url, { waitUntil: "load", timeout: 60000 });
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`   ├─ Page loaded successfully in ${elapsed}s. Waiting 5s for dynamic content hydration...`);
        
        await page.waitForTimeout(5000);

        const challengeOk = await handleCloudflareChallenge(page, fullMode);
        if (!challengeOk) {
          throw new Error("Cloudflare verification challenge detected in unattended mode.");
        }

        const responseStatus = response ? response.status() : 200;
        if (responseStatus === 404) {
          throw new Error("Page not found (404 status).");
        }

        const pageTitle = await page.title();
        const pageContent = await page.content();
        
        if (pageTitle.includes("Access Denied") || pageContent.includes("Access Denied") || pageContent.includes("You don't have permission to access")) {
          throw new Error("Access Denied / blocked by bot manager.");
        }

        if (
          pageTitle.includes("Page not found") || 
          pageTitle.includes("Page non trouvée") || 
          pageTitle.includes("404") ||
          pageContent.includes("The page you requested could not be found") ||
          pageContent.includes("La page que vous avez demandée est introuvable") ||
          pageContent.includes("Product not found") ||
          pageContent.includes("Produit introuvable")
        ) {
          throw new Error("Product page not found (404/Generic Error).");
        }

        await dismissCookieBanners(page);

        console.log(`   ├─ Capturing screenshot viewport...`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`   └─ [SUCCESS] Saved screenshot: ${screenshotName}`);
        capturedCount++;

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
          catalogInFlyer,
          geminiRegular: null,
          geminiSale: null,
          geminiIsOnSale: false,
          geminiValidUntil: null,
          geminiUnit: null,
          geminiUnits: null,
          geminiInFlyer: false,
          screenshotFile: screenshotPath,
          status: "MATCH",
          discrepancies: []
        });

      } catch (err: any) {
        console.error(`   └─ [ERROR] Scraper failed for this URL: ${err.message || String(err)}`);
        captureErrorCount++;
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
          catalogInFlyer,
          geminiRegular: null,
          geminiSale: null,
          geminiIsOnSale: false,
          geminiValidUntil: null,
          geminiUnit: null,
          geminiUnits: null,
          geminiInFlyer: false,
          screenshotFile: "",
          status: "ERROR",
          discrepancies: [],
          errorMessage: err.message || String(err)
        });
      }

      saveRunStatus({
        itemCounts: { total: targetLinks.length, captured: capturedCount, analyzed: 0, matches: 0, mismatches: 0, errors: captureErrorCount },
        truncated
      });
    }

    await context.close();
    console.log("\n3. Captures completed. Browser context closed.");

    if (capturedCount === 0 && targetLinks.length > 0) {
      restorePrevScreenshots();
    }

    if (screenshotsOnly) {
      console.log("\n=== Screenshot Capture Phase Completed ===");
      console.log(`Captured screenshots for ${targetLinks.length} items.`);
      console.log(`Screenshots are saved in: ${screenshotsDir}`);
      saveRunStatus({ finishedAt: new Date().toISOString(), success: true, stage: "idle", truncated, errorMessage: null });
      return;
    }
  } else if (analyzeOnly) {
    console.log("\n2. Skipping browser capture. Loading existing screenshots and cached audit data...");
    
    let previousUpdates: any[] = [];
    const deltaPath = path.join(process.cwd(), "db-storage", "audit-pricing-updates.json");
    if (fs.existsSync(deltaPath)) {
      try {
        previousUpdates = JSON.parse(fs.readFileSync(deltaPath, "utf8"));
        console.log(`   Loaded ${previousUpdates.length} previous updates from db-storage/audit-pricing-updates.json...`);
      } catch (err: any) {
        console.warn(`   ⚠️ Warning: Could not read previous audit updates: ${err.message}`);
      }
    }

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
      const catalogInFlyer = storeDetails.in_flyer === 1 || storeDetails.in_flyer === true;

      const hasScreenshot = fs.existsSync(screenshotPath);
      if (hasScreenshot) capturedCount++;

      let prevMatch = previousUpdates.length > 0 
        ? previousUpdates.find((u: any) => u.itemId === item.id && u.storeKey === storeKey)
        : null;

      const canUseCache = prevMatch && prevMatch.status !== "ERROR" && !forceReanalyze && (retryErrors || !hasScreenshot);

      if (canUseCache) {
        console.log(`   ├─ [CACHE HIT] "${item.name}" (${storeKey}) using cached Gemini data from audit-pricing-updates.json${!hasScreenshot ? " (screenshot missing)" : ""}.`);
        const cachedResult: AuditResult = {
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
          catalogInFlyer,
          geminiRegular: prevMatch.regular_price ?? null,
          geminiSale: prevMatch.sale_price ?? null,
          geminiIsOnSale: prevMatch.is_on_sale === 1 || prevMatch.is_on_sale === true,
          geminiValidUntil: prevMatch.valid_until || null,
          geminiUnit: prevMatch.unit || null,
          geminiUnits: prevMatch.units != null ? Number(prevMatch.units) : null,
          geminiInFlyer: prevMatch.in_flyer === 1 || prevMatch.in_flyer === true,
          screenshotFile: hasScreenshot ? screenshotPath : "",
          status: "MATCH",
          discrepancies: [],
          analyzed: true
        };
        runDiscrepancyComparison(cachedResult);
        auditResults.push(cachedResult);
      } else if (hasScreenshot) {
        if (prevMatch && prevMatch.status === "ERROR") {
          console.log(`   ├─ [RETRY] "${item.name}" (${storeKey}) had ERROR/TIMEOUT in previous run. Will re-audit.`);
        }
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
          catalogInFlyer,
          geminiRegular: null,
          geminiSale: null,
          geminiIsOnSale: false,
          geminiValidUntil: null,
          geminiUnit: null,
          geminiUnits: null,
          geminiInFlyer: false,
          screenshotFile: screenshotPath,
          status: "MATCH",
          discrepancies: [],
          analyzed: false
        });
      } else {
        console.log(`   ├─ [MISSING SCREENSHOT] "${item.name}" (${storeKey}) screenshot file not found on disk.`);
        captureErrorCount++;
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
          catalogInFlyer,
          geminiRegular: null,
          geminiSale: null,
          geminiIsOnSale: false,
          geminiValidUntil: null,
          geminiUnit: null,
          geminiUnits: null,
          geminiInFlyer: false,
          screenshotFile: "",
          status: "ERROR",
          discrepancies: [],
          errorMessage: `Screenshot file missing: ${screenshotName}`,
          analyzed: true
        });
      }
    }
  }

  // 4. Inspect captured images using Gemini 3.5 Flash
  console.log("\n4. Analyzing images with Gemini 3.5 Flash API...");
  saveRunStatus({ stage: "analyzing" });

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

  let consecutiveFailures = 0;

  for (let i = 0; i < auditResults.length; i++) {
    const result = auditResults[i];
    if (result.analyzed || !result.screenshotFile) {
      continue;
    }

    console.log(`[Audit Progress ${i + 1}/${auditResults.length}] Inspecting image for "${result.itemName}" (${result.storeKey})...`);
    
    try {
      const base64Image = fs.readFileSync(result.screenshotFile).toString("base64");
      
      const userPrompt = `
Analyze this screenshot for the product "${result.itemName}" at store "${result.storeKey}".
Extract regular price, sale price, sale status, flyer validity date, unit type, and unit quantity.
`;

      const response = await callGeminiWithRetries(ai, base64Image, userPrompt, systemInstruction);
      consecutiveFailures = 0;

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
          const parts = valDate.split("-");
          const year = parseInt(parts[0], 10);
          const currentYearVal = new Date().getFullYear();
          if (year < currentYearVal) {
            valDate = `${currentYearVal}-${parts[1]}-${parts[2]}`;
          }
        }
      }
      result.geminiValidUntil = valDate;

      let inFlyer = false;
      if (result.geminiIsOnSale) {
        try {
          const storeConfig = catalog?.stores?.[result.storeKey];
          const postalCode = storeConfig?.postal_code || "K7H3C6";
          let cleanStore = (storeConfig?.store_name || result.storeKey).replace(/perth/gi, "").trim();
          const lowerStore = cleanStore.toLowerCase();
          if (lowerStore.includes("food basics") || lowerStore === "fb" || lowerStore === "foodbasics") cleanStore = "Food Basics";
          else if (lowerStore.includes("no frills") || lowerStore === "nofrills" || lowerStore === "nf") cleanStore = "No Frills";
          else if (lowerStore.includes("your independent grocer") || lowerStore === "yourindependentgrocer" || lowerStore === "yig") cleanStore = "Your Independent Grocer";
          else if (lowerStore.includes("loblaws") || lowerStore === "loblaws" || lowerStore === "lb") cleanStore = "Loblaws";
          else if (lowerStore.includes("metro") || lowerStore === "metro" || lowerStore === "mt") cleanStore = "Metro";
          else if (lowerStore.includes("freshco") || lowerStore.includes("fresco") || lowerStore === "fc" || lowerStore.includes("fresh co") || lowerStore.includes("freschco")) cleanStore = "FreshCo";
          else if (lowerStore.includes("walmart") || lowerStore === "walmart") cleanStore = "Walmart";
          
          let cleanItem = result.itemName
            .replace(/\s*\(\d+[^)]*\)/gi, "") 
            .replace(/\s*-\s*\d+$/gi, "") 
            .replace(/\s*-\s*\w+$/gi, "") 
            .replace(/\s*\b\d+g\b/gi, "")    
            .replace(/\s*\b\d+-pack\b/gi, "") 
            .trim();
          
          const searchTerms = `${cleanStore} ${cleanItem}`.trim();
          let cleanPostal = postalCode.replace(/\s/g, "").toUpperCase();
          if (cleanStore === "FreshCo" && (cleanPostal === "K7H3C6" || cleanPostal === "K7A4S6")) {
            cleanPostal = "K7C3Y4";
          }
          
          const flippApiUrl = `https://backflipp.wishabi.com/flipp/items/search?locale=en-ca&postal_code=${encodeURIComponent(cleanPostal)}&q=${encodeURIComponent(searchTerms)}`;
          
          console.log(`   ├─ Querying Flipp flyer for "${searchTerms}" in "${cleanPostal}"...`);
          const fetchResponse = await fetch(flippApiUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
          });
          
          if (fetchResponse.ok) {
            const data: any = await fetchResponse.json();
            const items = data.items || [];
            const merchantItems = items.filter((it: any) => {
              const itMerchant = (it.merchant_name || "").toLowerCase();
              const targetMerchant = cleanStore.toLowerCase();
              return itMerchant.includes(targetMerchant) || targetMerchant.includes(itMerchant);
            });
            
            if (merchantItems.length > 0) {
              inFlyer = true;
              console.log(`   ├─ [FLYER MATCH] Found in weekly flyer!`);
            } else {
              console.log(`   ├─ [FLYER MISMATCH] Not found in weekly flyer.`);
            }
          }
        } catch (flyerErr: any) {
          console.warn(`   ⚠️ Flyer check failed: ${flyerErr.message}`);
        }
      }
      result.geminiInFlyer = inFlyer;

      const validUnits = ["g", "kg", "ml", "l", "lb", "unit", "count", "pack", "each", "pcs", "roll", "box", "bag", "can", "bunch", "dozen", "piece", "pieces", "pc", "lbs"];
      result.geminiUnit = parsed.unit ? String(parsed.unit).trim().toLowerCase() : null;
      if (result.geminiUnit && !validUnits.includes(result.geminiUnit)) {
        result.geminiUnit = null;
      }
      result.geminiUnits = parsed.unit_quantity != null ? Number(parsed.unit_quantity) : null;
      if (result.geminiUnits !== null && (isNaN(result.geminiUnits) || result.geminiUnits <= 0)) {
        result.geminiUnits = null;
      }
      result.analyzed = true;

      console.log(`   ├─ Extracted regular price: $${result.geminiRegular ?? "--"}`);
      console.log(`   ├─ Extracted sale price:    $${result.geminiSale ?? "--"} (On Sale: ${result.geminiIsOnSale ? "YES" : "NO"})`);
      console.log(`   ├─ Extracted valid until:   ${result.geminiValidUntil ?? "--"}`);
      console.log(`   ├─ Extracted unit:          ${result.geminiUnit ?? "--"} (${result.geminiUnits ?? "--"})`);

      runDiscrepancyComparison(result);

    } catch (err: any) {
      consecutiveFailures++;
      console.error(`   └─ Gemini Analysis Error: ${err.message || String(err)}`);
      result.status = "ERROR";
      result.errorMessage = err.message || String(err);
      result.analyzed = true;

      if (consecutiveFailures >= 4) {
        console.error("\n❌ [FATAL] 4 consecutive Gemini API failures detected. Aborting remaining Gemini analysis stage.");
        for (let j = i + 1; j < auditResults.length; j++) {
          if (!auditResults[j].analyzed && auditResults[j].screenshotFile) {
            auditResults[j].status = "ERROR";
            auditResults[j].errorMessage = "Analysis aborted due to 4 consecutive Gemini API failures";
            auditResults[j].analyzed = true;
          }
        }
        break;
      }
    }

    // Rate limiting delay (1.5s)
    if (i < auditResults.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Update status counts during analysis stage
    const analyzedCount = auditResults.filter(r => r.analyzed).length;
    const matchCount = auditResults.filter(r => r.status === "MATCH").length;
    const mismatchCount = auditResults.filter(r => r.status === "MISMATCH").length;
    const errCount = auditResults.filter(r => r.status === "ERROR").length;
    saveRunStatus({
      itemCounts: {
        total: targetLinks.length,
        captured: capturedCount,
        analyzed: analyzedCount,
        matches: matchCount,
        mismatches: mismatchCount,
        errors: errCount
      },
      truncated
    });
  }

  saveRunStatus({ stage: "saving" });

  // Save updated catalog to local JSON file
  if (analyzeOnly || runAll || fullMode) {
    console.log("\n5. Saving updated combined-catalog database locally...");
    const updatedCatalog = { ...catalog };
    
    let updatedCount = 0;
    for (const res of auditResults) {
      const item = updatedCatalog.items.find((i: any) => i.id === res.itemId);
      if (item) {
        const storeLink = item.stores[res.storeKey];
        if (storeLink) {
          if (res.status === "ERROR") {
            storeLink.is_verified = false;
            continue;
          }
          storeLink.regular_price = res.geminiRegular;
          storeLink.sale_price = res.geminiSale;
          storeLink.is_on_sale = res.geminiIsOnSale ? 1 : 0;
          storeLink.valid_until = res.geminiValidUntil || "";
          storeLink.in_flyer = res.geminiInFlyer ? 1 : 0;
          storeLink.is_verified = true;

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
        in_flyer: r.geminiInFlyer ? 1 : 0,
        status: r.status,
        discrepancies: r.discrepancies
      }));
      
    const deltaPath = path.join(dbDir, "audit-pricing-updates.json");
    fs.writeFileSync(deltaPath, JSON.stringify(updatesDelta, null, 2), "utf8");
    console.log(`   ├─ Delta changes list saved to: db-storage/audit-pricing-updates.json`);
    console.log(`   └─ Audited and updated pricing for ${updatedCount} store links.`);
    if (!fullMode) {
      console.log("\nOnce you verify these changes, push them to production using: npx tsx scripts/audit-prices.ts --apply");
    }
  }

  // 6. Write Markdown Report
  writeMarkdownReport(auditResults);

  // 7. Apply updates to MongoDB (Full Mode)
  let appliedCount = 0;
  if (fullMode) {
    console.log("\n7. Applying catalog updates to MongoDB...");
    saveRunStatus({ stage: "applying" });
    try {
      const applyRes = await applyCatalogUpdates();
      appliedCount = applyRes.appliedCount;
    } catch (err: any) {
      console.error("\n❌ [APPLY ERROR] Failed to apply catalog updates to MongoDB:", err.message || String(err));
      saveRunStatus({
        finishedAt: new Date().toISOString(),
        success: false,
        stage: "failed",
        errorMessage: `Failed to apply updates to MongoDB: ${err.message || String(err)}`
      });
      releaseLock();
      process.exit(1);
    }
  }

  const finishedAt = new Date().toISOString();
  const matchCount = auditResults.filter(r => r.status === "MATCH").length;
  const mismatchCount = auditResults.filter(r => r.status === "MISMATCH").length;
  const errCount = auditResults.filter(r => r.status === "ERROR").length;
  const analyzedCount = auditResults.filter(r => r.analyzed).length;

  saveRunStatus({
    finishedAt,
    success: true,
    stage: "idle",
    appliedCount: fullMode ? appliedCount : undefined,
    itemCounts: {
      total: targetLinks.length,
      captured: capturedCount,
      analyzed: analyzedCount,
      matches: matchCount,
      mismatches: mismatchCount,
      errors: errCount
    },
    truncated,
    errorMessage: null
  });
}

function writeMarkdownReport(results: AuditResult[]) {
  const reportPath = path.join(process.cwd(), "price_audit_report.md");
  
  let md = `# Combined Catalog Price Audit Report\n\n`;
  md += `**Date:** ${new Date().toLocaleString()}\n\n`;
  
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

function runDiscrepancyComparison(result: AuditResult) {
  if (result.status === "ERROR") return;

  const discrepancies: string[] = [];

  if (result.catalogRegular !== result.geminiRegular) {
    discrepancies.push(`Regular Price mismatch: Catalog has $${result.catalogRegular ?? "--"}, Live has $${result.geminiRegular ?? "--"}`);
  }

  if (result.catalogSale !== result.geminiSale) {
    discrepancies.push(`Sale Price mismatch: Catalog has $${result.catalogSale ?? "--"}, Live has $${result.geminiSale ?? "--"}`);
  }

  if (result.catalogInFlyer !== result.geminiInFlyer) {
    discrepancies.push(`Flyer status mismatch: Catalog has ${result.catalogInFlyer ? "YES" : "NO"}, Live has ${result.geminiInFlyer ? "YES" : "NO"}`);
  }

  const normCatalogDate = result.catalogValidUntil ? result.catalogValidUntil.replace(/\s+/g, "") : null;
  const normGeminiDate = result.geminiValidUntil ? result.geminiValidUntil.replace(/\s+/g, "") : null;
  if (normCatalogDate !== normGeminiDate) {
    discrepancies.push(`Validity Date mismatch: Catalog has "${result.catalogValidUntil ?? "--"}", Live has "${result.geminiValidUntil ?? "--"}"`);
  }

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
    result.discrepancies = [];
    console.log(`   └─ [OK] Prices, dates, and units match perfectly.`);
  }
}

// Global 30-minute execution timeout guardrail
const globalTimeout = setTimeout(() => {
  console.error("\n❌ [FATAL] Price audit script reached 30-minute global timeout.");
  saveRunStatus({
    finishedAt: new Date().toISOString(),
    success: false,
    stage: "failed",
    errorMessage: "Execution exceeded 30-minute global timeout"
  });
  releaseLock();
  process.exit(1);
}, 30 * 60 * 1000);
globalTimeout.unref();

// Process Exit & Termination Handlers
process.on("exit", () => {
  releaseLock();
});

process.on("SIGINT", () => {
  console.warn("\n⚠️ [SIGINT] Received interruption signal.");
  saveRunStatus({ finishedAt: new Date().toISOString(), success: false, stage: "failed", errorMessage: "Interrupted by SIGINT" });
  releaseLock();
  process.exit(130);
});

process.on("SIGTERM", () => {
  console.warn("\n⚠️ [SIGTERM] Received termination signal.");
  saveRunStatus({ finishedAt: new Date().toISOString(), success: false, stage: "failed", errorMessage: "Interrupted by SIGTERM" });
  releaseLock();
  process.exit(143);
});

process.on("uncaughtException", (err) => {
  console.error("\n❌ [UNCAUGHT EXCEPTION]:", err.message || String(err));
  saveRunStatus({ finishedAt: new Date().toISOString(), success: false, stage: "failed", errorMessage: err.message || String(err) });
  releaseLock();
  process.exit(1);
});

// Entry Point Execution
if (!acquireLock()) {
  process.exit(1);
}

runAudit().catch((err: any) => {
  console.error("\n❌ [FATAL ERROR]:", err.message || String(err));
  saveRunStatus({ finishedAt: new Date().toISOString(), success: false, stage: "failed", errorMessage: err.message || String(err) });
  releaseLock();
  process.exit(1);
});
