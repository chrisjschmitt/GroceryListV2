// ==UserScript==
// @name         GroceryScout - 2.10.0 Normalized Canonical Exporter
// @namespace    http://tampermonkey.net/
// @version      2.10.0
// @description  Added Canadian Tire & Loblaws dairy product normalization
// @author       You
// @match        https://*.foodbasics.ca/*
// @match        https://foodbasics.ca/*
// @match        https://*.metro.ca/*
// @match        https://metro.ca/*
// @match        https://*.freshco.com/*
// @match        https://freshco.com/*
// @match        https://*.walmart.ca/*
// @match        https://walmart.ca/*
// @match        https://*.loblaws.ca/*
// @match        https://loblaws.ca/*
// @match        https://*.nofrills.ca/*
// @match        https://nofrills.ca/*
// @match        https://*.canadiantire.ca/*
// @match        https://canadiantire.ca/*
// @match        https://*.flipp.ca/*
// @match        https://flipp.ca/*
// @match        https://*.flipp.com/*
// @match        https://flipp.com/*
// @match        https://*.yourindependentgrocer.ca/*
// @match        https://yourindependentgrocer.ca/*
// @connect      ais-dev-kynlhucnvvzplwokihj56s-569102779948.us-west2.run.app
// @connect      grocery-list-v2-navy.vercel.app
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_API_BASE = "https://grocery-list-v2-navy.vercel.app";
    const STORAGE_KEYS = {
        apiBase: "basketwise_api_base",
        token: "GROCERY_SECRET_TOKEN",
    };

    // In-memory cache after async load (Userscripts cannot do sync storage reads)
    const storageCache = {
        apiBase: null,
        token: null,
        initialized: false,
    };

    function isUserscripts() {
        return typeof GM !== "undefined" && typeof GM.getValue === "function";
    }

    function isTampermonkey() {
        return typeof GM_getValue === "function" && typeof GM_setValue === "function";
    }

    async function storageGet(key) {
        if (isUserscripts()) {
            return await GM.getValue(key);
        }
        if (isTampermonkey()) {
            return GM_getValue(key);
        }
        return null;
    }

    async function storageSet(key, value) {
        if (isUserscripts()) {
            await GM.setValue(key, value);
            return;
        }
        if (isTampermonkey()) {
            GM_setValue(key, value);
            return;
        }
    }

    async function loadStorageCache() {
        if (storageCache.initialized) return;
        let apiBase = await storageGet(STORAGE_KEYS.apiBase);
        if (!apiBase) {
            apiBase = DEFAULT_API_BASE;
            await storageSet(STORAGE_KEYS.apiBase, apiBase);
        }
        storageCache.apiBase = String(apiBase).replace(/\/$/, "");
        storageCache.token = (await storageGet(STORAGE_KEYS.token)) || null;
        if (storageCache.token) storageCache.token = String(storageCache.token).trim();
        storageCache.initialized = true;
    }

    function getApiBaseSync() {
        return storageCache.apiBase || DEFAULT_API_BASE;
    }

    async function ensureToken(promptIfMissing) {
        await loadStorageCache();
        if (storageCache.token) return storageCache.token;

        if (!promptIfMissing) return null;

        const entered = prompt(
            "BasketWise: Enter your GROCERY_SECRET_TOKEN\n(same value as server .env.local / Vercel):",
            ""
        );
        if (!entered || !entered.trim()) {
            alert("BasketWise Ingestion Token is required. Operation aborted.");
            return null;
        }
        storageCache.token = entered.trim();
        await storageSet(STORAGE_KEYS.token, storageCache.token);
        return storageCache.token;
    }

    async function configureSettingsMenu() {
        await loadStorageCache();
        
        const currentToken = storageCache.token || "";
        const newToken = prompt("BasketWise: Enter new GROCERY_SECRET_TOKEN:", currentToken);
        if (newToken !== null) {
            storageCache.token = newToken.trim();
            await storageSet(STORAGE_KEYS.token, storageCache.token);
        }

        const currentBase = storageCache.apiBase || DEFAULT_API_BASE;
        const newBase = prompt("BasketWise: Enter new API Base URL:", currentBase);
        if (newBase !== null) {
            storageCache.apiBase = newBase.trim().replace(/\/$/, "");
            await storageSet(STORAGE_KEYS.apiBase, storageCache.apiBase);
        }
        
        alert("BasketWise settings updated successfully!");
    }

    function createSettingsButton(bottomPx, rightPx) {
        const btn = document.createElement('button');
        btn.innerHTML = '⚙️';
        btn.title = 'BasketWise Settings';
        btn.style = `position:fixed; bottom:${bottomPx}px; right:${rightPx}px; z-index:999999; background:#475569; color:white; width:36px; height:36px; border-radius:50%; font-family:system-ui; font-size:16px; border:none; box-shadow:0 4px 10px rgba(0,0,0,0.3); cursor:pointer; display:flex; align-items:center; justify-content:center;`;
        btn.onclick = async function(e) {
            e.stopPropagation();
            await configureSettingsMenu();
        };
        document.body.appendChild(btn);
        return btn;
    }

    if (typeof GM_registerMenuCommand !== "undefined") {
        GM_registerMenuCommand("Set/Update Ingestion Token", async function() {
            await loadStorageCache();
            const currentToken = storageCache.token || "";
            const newToken = prompt("Enter new GROCERY_SECRET_TOKEN:", currentToken);
            if (newToken !== null) {
                storageCache.token = newToken.trim();
                await storageSet(STORAGE_KEYS.token, storageCache.token);
                alert("Token updated successfully!");
            }
        });

        GM_registerMenuCommand("Set/Update API Base URL", async function() {
            await loadStorageCache();
            const currentBase = storageCache.apiBase || DEFAULT_API_BASE;
            const newBase = prompt("Enter new API Base URL (e.g. http://localhost:3000):", currentBase);
            if (newBase !== null) {
                storageCache.apiBase = newBase.trim().replace(/\/$/, "");
                await storageSet(STORAGE_KEYS.apiBase, storageCache.apiBase);
                alert("API Base URL updated successfully!");
            }
        });
    }

    const isFlipp = window.location.hostname.includes("flipp.ca") || window.location.hostname.includes("flipp.com");

    const CANONICAL_NAMES = [
        "Milk LF 1%",
        "Milk LF 2%",
        "Butter unsalted",
        "Yogurt LF 1% Natrel",
        "2% lactose free cottage cheese",
        "Chicken Breasts Boneless Skinless",
        "Eggs - 18",
        "Blueberries - pint",
        "Strawberries 454g",
        "Ground beef Lean 450g",
        "Ground chicken Lean 450g",
        "Raspberries",
        "Olives",
        "Decaf coffee",
        "LF Ice cream",
        "Broccoli"
    ];

    let catalogItems = CANONICAL_NAMES.map(name => ({ name, id: null }));

    // Inject Custom Autocomplete CSS
    const style = document.createElement('style');
    style.innerHTML = `
        .gs-dropdown-item {
            padding: 8px 12px;
            cursor: pointer;
            font-weight: bold;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 13px;
            border-bottom: 1px solid #e5e7eb;
            background: white;
            color: black;
            transition: background 0.15s ease, color 0.15s ease;
        }
        .gs-dropdown-item:hover {
            background: #f3f4f6;
            color: #111827;
        }
        .gs-dropdown-item.gs-active {
            background: #0284c7;
            color: white;
        }
        /* custom scrollbar */
        #gs-item-dropdown::-webkit-scrollbar {
            width: 6px;
        }
        #gs-item-dropdown::-webkit-scrollbar-track {
            background: #f1f1f1;
        }
        #gs-item-dropdown::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 3px;
        }
        #gs-item-dropdown::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }
    `;
    document.head.appendChild(style);

    function fetchCatalog() {
        GM_xmlhttpRequest({
            method: "GET",
            url: getApiBaseSync() + "/api/regular-items",
            onload: function (response) {
                if (response.status === 200) {
                    try {
                        const parsed = JSON.parse(response.responseText);
                        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
                            catalogItems = parsed.items;
                            console.log("GroceryScout: Successfully loaded " + catalogItems.length + " catalog items from API.");
                        }
                    } catch (e) {
                        console.error("GroceryScout: Failed to parse catalog response", e);
                    }
                } else {
                    console.warn("GroceryScout: Non-200 response from API: " + response.status);
                }
            },
            onerror: function (err) {
                console.error("GroceryScout: API catalog fetch error", err);
            }
        });
    }

    async function init() {
        await loadStorageCache();

        if (isFlipp) {
            // Flipp Ingestion UI flow: floating action button in the bottom right corner
            const flippBtn = document.createElement('button');
            flippBtn.innerHTML = '⚡ Add to BasketWise';
            flippBtn.style = 'position:fixed; bottom:30px; right:30px; z-index:999999; background:#10b981; color:white; padding:14px 20px; border-radius:10px; font-family:system-ui, -apple-system, sans-serif; font-weight:bold; border:none; box-shadow:0 4px 14px rgba(0,0,0,0.3); cursor:pointer; font-size:14px; display:none;';
            document.body.appendChild(flippBtn);

            const settingsBtn = createSettingsButton(30, 220);
            settingsBtn.style.display = 'none';

            // Check URL periodically for item detail pages
            setInterval(() => {
                const isItemPage = window.location.href.includes("/item/");
                flippBtn.style.display = isItemPage ? 'block' : 'none';
                settingsBtn.style.display = isItemPage ? 'flex' : 'none';
            }, 1000);

            flippBtn.onclick = async function() {
                const rawQuantity = prompt("Enter quantity to add to Shopping List:", "1");
                if (rawQuantity === null) return; // User cancelled
                const quantity = parseInt(rawQuantity);
                if (isNaN(quantity) || quantity <= 0) {
                    alert("Invalid quantity. Please enter a positive number.");
                    return;
                }

                const token = await ensureToken(true);
                if (!token) return;

                flippBtn.disabled = true;
                flippBtn.innerHTML = '⏳ Adding...';

                GM_xmlhttpRequest({
                    method: "POST",
                    url: getApiBaseSync() + "/api/flipp/add-item",
                    headers: {
                        "Content-Type": "application/json",
                        "X-GroceryScout-Token": token
                    },
                    data: JSON.stringify({
                        url: window.location.href,
                        quantity: quantity
                    }),
                    onload: function(response) {
                        flippBtn.disabled = false;
                        flippBtn.innerHTML = '⚡ Add to BasketWise';
                        console.log("[Flipp Ingestion Client] Status:", response.status);
                        console.log("[Flipp Ingestion Client] Response:", response.responseText);
                        
                        try {
                            const resObj = JSON.parse(response.responseText);
                            if (response.status === 200) {
                                alert("Success: Item added to shopping list!");
                            } else {
                                alert("Error: " + (resObj.error || "Failed to add item."));
                            }
                        } catch (e) {
                            if (response.status === 200) {
                                alert("Success: Item added to shopping list!");
                            } else {
                                alert("Failed to add item. Server returned status " + response.status);
                            }
                        }
                    },
                    onerror: function(err) {
                        flippBtn.disabled = false;
                        flippBtn.innerHTML = '⚡ Add to BasketWise';
                        alert("Error: Network request failed.");
                    }
                });
            };
        } else {
            // Call on startup
            fetchCatalog();
            createSettingsButton(110, 220); // bottom: 110px, right: 220px (next to blue sendBtn)
        }
    }

    init();

    function getProductTitle() {
        // Try h1 elements first for SPAs (Loblaws/Independent Grocers) to bypass generic shell titles
        const selectors = [
            'h1[class*="product-name"]',
            'h1[class*="title"]',
            '.product-name',
            '.product-title',
            'h1'
        ];
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent) {
                const txt = element.textContent.trim();
                if (txt.length > 2 && !/^(my shop|shop online|your independent|loblaws|no frills|metro|food basics|freshco|walmart|canadian tire)/i.test(txt)) {
                    return txt;
                }
            }
        }
        // Fallback to title and strip store suffix (e.g. "- My Shop" or "| My Shop")
        let title = document.title || "";
        const parts = title.split(/[|\-]/);
        if (parts.length > 0) {
            const candidate = parts[0].trim();
            if (candidate && candidate.length > 2 && !/^(my shop|shop online)/i.test(candidate)) {
                return candidate;
            }
        }
        return title.split('|')[0].trim();
    }

    // Helper to find closest lookup string based on product page content
    function determineConfigName(pageTitle) {
        const lowerTitle = pageTitle.toLowerCase();

        if (lowerTitle.includes("ground beef") || lowerTitle.includes("beef single")) return "Ground beef Lean 450g";
        if (lowerTitle.includes("cottage cheese")) return "2% lactose free cottage cheese";
        if (lowerTitle.includes("natrel") && lowerTitle.includes("yogurt")) return "Yogurt LF 1% Natrel";
        if (lowerTitle.includes("chicken breast")) return "Chicken Breasts Boneless Skinless";
        if (lowerTitle.includes("ground chicken")) return "Ground chicken Lean 450g";
        if ((lowerTitle.includes("milk") || lowerTitle.includes("dairy product")) && lowerTitle.includes("1%")) return "Milk LF 1%";
        if ((lowerTitle.includes("milk") || lowerTitle.includes("dairy product")) && lowerTitle.includes("2%")) return "Milk LF 2%";
        if (lowerTitle.includes("butter")) return "Butter unsalted";
        if (lowerTitle.includes("egg") && lowerTitle.includes("18")) return "Eggs - 18";
        if (lowerTitle.includes("blueberr")) return "Blueberries - pint";
        if (lowerTitle.includes("strawberr")) return "Strawberries 454g";
        if (lowerTitle.includes("raspberr")) return "Raspberries";
        if (lowerTitle.includes("olive")) return "Olives";
        if (lowerTitle.includes("decaf") || lowerTitle.includes("decaffeinated")) return "Decaf coffee";
        if (lowerTitle.includes("ice cream")) return "LF Ice cream";
        if (lowerTitle.includes("broccoli")) return "Broccoli";

        // Fallback to original title if no rules match
        return pageTitle;
    }

    function determineCategory(pageTitle) {
        const lowerTitle = pageTitle.toLowerCase();
        if (lowerTitle.includes("produce") || lowerTitle.includes("fruit") || lowerTitle.includes("veg") || lowerTitle.includes("salad") || lowerTitle.includes("apple") || lowerTitle.includes("banana") || lowerTitle.includes("broccoli") || lowerTitle.includes("onion") || lowerTitle.includes("potato") || lowerTitle.includes("carrot") || lowerTitle.includes("pepper") || lowerTitle.includes("tomato") || lowerTitle.includes("garlic") || lowerTitle.includes("lemon") || lowerTitle.includes("lime") || lowerTitle.includes("berry") || lowerTitle.includes("berries") || lowerTitle.includes("pear") || lowerTitle.includes("orange") || lowerTitle.includes("grape") || lowerTitle.includes("lettuce") || lowerTitle.includes("celery") || lowerTitle.includes("cucumber") || lowerTitle.includes("avocado") || lowerTitle.includes("spinach") || lowerTitle.includes("herb") || lowerTitle.includes("parsley") || lowerTitle.includes("cilantro")) return "Fresh Produce";
        if (lowerTitle.includes("bakery") || lowerTitle.includes("bread") || lowerTitle.includes("bun") || lowerTitle.includes("muffin") || lowerTitle.includes("croissant")) return "Bakery & Breads";
        if (lowerTitle.includes("meat") || lowerTitle.includes("seafood") || lowerTitle.includes("fish") || lowerTitle.includes("chicken") || lowerTitle.includes("beef") || lowerTitle.includes("pork") || lowerTitle.includes("turkey") || lowerTitle.includes("salmon")) return "Meat & Seafood";
        if (lowerTitle.includes("dairy") || lowerTitle.includes("egg") || lowerTitle.includes("milk") || lowerTitle.includes("cheese") || lowerTitle.includes("butter") || lowerTitle.includes("yogurt")) return "Dairy & Eggs";
        if (lowerTitle.includes("baking") || lowerTitle.includes("spice") || lowerTitle.includes("flour") || lowerTitle.includes("sugar")) return "Baking & Spices";
        if (lowerTitle.includes("beverage") || lowerTitle.includes("drink") || lowerTitle.includes("snack") || lowerTitle.includes("candy") || lowerTitle.includes("frozen") || lowerTitle.includes("chip") || lowerTitle.includes("soda") || lowerTitle.includes("juice") || lowerTitle.includes("coffee") || lowerTitle.includes("ice cream")) return "Snacks & Beverages";
        if (lowerTitle.includes("household") || lowerTitle.includes("clean") || lowerTitle.includes("personal") || lowerTitle.includes("health") || lowerTitle.includes("pharmacy") || lowerTitle.includes("soap") || lowerTitle.includes("detergent") || lowerTitle.includes("toilet")) return "Health, Personal & Household";
        if (lowerTitle.includes("beer") || lowerTitle.includes("wine") || lowerTitle.includes("liquor") || lowerTitle.includes("alcohol") || lowerTitle.includes("spirit")) return "Beer, Wine & Spirits";
        return "Pantry Staples";
    }

    function determineUnitAndSize(pageTitle) {
        const lowerTitle = pageTitle.toLowerCase();
        const regex = /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|lb|oz|gal|dozen|pack|bag|can|box|bunch|unit)s?\b/;
        const match = lowerTitle.match(regex);
        if (match) {
            return {
                units: parseFloat(match[1]),
                unitOfMeasurement: match[2]
            };
        }
        return {
            units: 1,
            unitOfMeasurement: "unit"
        };
    }

    function findClosestCatalogMatch(pageTitle) {
        if (!catalogItems || catalogItems.length === 0) {
            return determineConfigName(pageTitle);
        }

        const ruleMatch = determineConfigName(pageTitle);
        const matchByRule = catalogItems.find(item => item.name.toLowerCase() === ruleMatch.toLowerCase());
        if (matchByRule) {
            return matchByRule.name;
        }

        // Perform programmatic client-side token matching
        const cleanTitle = pageTitle.toLowerCase()
            .replace(/\blactose[- ]free\b/g, "lf")
            .replace(/\bdecaffeinated\b/g, "decaf")
            .replace(/[\s,()\-]+/g, " ");
        const titleWords = cleanTitle.split(" ").filter(w => w.length > 2 || w === "lf" || /^\d+%?$/.test(w));

        let bestMatchName = null;
        let maxScore = 0;

        for (const item of catalogItems) {
            const cleanCatalog = item.name.toLowerCase()
                .replace(/\blactose[- ]free\b/g, "lf")
                .replace(/\bdecaffeinated\b/g, "decaf")
                .replace(/[\s,()\-]+/g, " ");
            const catalogWords = cleanCatalog.split(" ").filter(w => w.length > 2 || w === "lf" || /^\d+%?$/.test(w));

            if (catalogWords.length === 0) continue;

            const intersection = catalogWords.filter(w => titleWords.some(tw => {
                const cleanW = w.endsWith("s") ? w.slice(0, -1) : w;
                const cleanTw = tw.endsWith("s") ? tw.slice(0, -1) : tw;
                return cleanW === cleanTw;
            }));

            let score = intersection.length * 10;
            if (score > 0) {
                if (intersection.length === catalogWords.length) {
                    score += 25;
                }

                const isLfScraped = cleanTitle.includes("lf");
                const isLfCatalog = cleanCatalog.includes("lf");
                if (isLfScraped !== isLfCatalog) score -= 30;

                const isCrunchyScraped = cleanTitle.includes("crunchy") || cleanTitle.includes("chunky");
                const isCrunchyCatalog = cleanCatalog.includes("crunchy") || cleanCatalog.includes("chunky");
                if (isCrunchyScraped !== isCrunchyCatalog) score -= 25;

                if (score > maxScore) {
                    maxScore = score;
                    bestMatchName = item.name;
                }
            }
        }

        return maxScore >= 20 ? bestMatchName : ruleMatch;
    }

    function getCanonicalKey(rawUrl) {
        try {
            const urlObj = new URL(rawUrl);
            let domain = urlObj.hostname.replace('www.', '');
            let path = urlObj.pathname;
            if (path.endsWith('/')) path = path.slice(0, -1);
            return `${domain}${path}`;
        } catch (e) {
            return null;
        }
    }

    function extractItemData() {
        const canonicalKey = getCanonicalKey(window.location.href);
        const rawTitle = getProductTitle();
        const verifiedConfigName = findClosestCatalogMatch(rawTitle);

        const domain = window.location.hostname;
        let storeId = "unknown";
        if (domain.includes("foodbasics")) storeId = "foodbasics";
        else if (domain.includes("metro")) storeId = "metro";
        else if (domain.includes("freshco")) storeId = "freshco";
        else if (domain.includes("walmart")) storeId = "walmart";
        else if (domain.includes("loblaws")) storeId = "loblaws";
        else if (domain.includes("nofrills")) storeId = "nofrills";
        else if (domain.includes("canadiantire")) storeId = "canadiantire";
        else if (domain.includes("flipp")) storeId = "flipp";
        else if (domain.includes("yourindependentgrocer")) storeId = "yourindependentgrocer";

        return {
            "key": canonicalKey,
            "data": {
                "config_name": verifiedConfigName,
                "store_id": storeId,
                "raw_share_url": window.location.href,
                "last_updated": new Date().toISOString().split('T')[0]
            }
        };
    }

    const sendBtn = document.createElement('button');
    sendBtn.innerHTML = '📥 Forward to App';
    sendBtn.style = 'position:fixed; bottom:110px; right:30px; z-index:999999; background:#0284c7; color:white; padding:14px 20px; border-radius:10px; font-family:system-ui; font-weight:bold; border:none; box-shadow:0 4px 14px rgba(0,0,0,0.3); cursor:pointer; font-size:14px;';
    document.body.appendChild(sendBtn);

    // Create the modal container
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '50%';
    modal.style.right = '30px';
    modal.style.left = 'auto';
    modal.style.transform = 'translateY(-50%)';
    modal.style.zIndex = '1000000';
    modal.style.background = 'white';
    modal.style.border = '4px solid black';
    modal.style.boxShadow = '8px 8px 0px 0px rgba(0,0,0,1)';
    modal.style.padding = '24px';
    modal.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    modal.style.width = '320px';
    modal.style.display = 'none';

    modal.innerHTML = `
        <h3 style="margin-top:0; margin-bottom:16px; font-size:18px; font-weight:900; text-transform:uppercase; border-bottom:3px solid black; padding-bottom:8px; font-family:system-ui;">📥 Pricing Details</h3>
        
        <div style="margin-bottom:12px; position:relative;">
            <label style="display:block; font-weight:bold; font-size:12px; text-transform:uppercase; margin-bottom:4px; font-family:system-ui;">Catalog Item Match *</label>
            <input type="text" id="gs-item-search" placeholder="Type to search catalog..." autocomplete="off" style="width:100%; border:2px solid black; padding:6px 8px; font-weight:bold; box-sizing:border-box; outline:none; font-family:system-ui;" required />
            <div id="gs-item-dropdown" style="display:none; position:absolute; top:100%; left:0; right:0; max-height:180px; overflow-y:auto; border:2px solid black; background:white; z-index:1000010; box-shadow:4px 4px 0px rgba(0,0,0,1);">
                <!-- populated dynamically -->
            </div>
        </div>

        <div style="margin-bottom:12px;">
            <label style="display:block; font-weight:bold; font-size:12px; text-transform:uppercase; margin-bottom:4px; font-family:system-ui;">Regular Price ($) *</label>
            <input type="number" id="gs-reg-price" step="0.01" min="0" placeholder="e.g. 5.99" style="width:100%; border:2px solid black; padding:6px 8px; font-weight:bold; box-sizing:border-box; outline:none; font-family:system-ui;" required />
        </div>

        <div style="margin-bottom:12px;">
            <label style="display:block; font-weight:bold; font-size:12px; text-transform:uppercase; margin-bottom:4px; font-family:system-ui;">Sale Price ($) (Optional)</label>
            <input type="number" id="gs-sale-price" step="0.01" min="0" placeholder="e.g. 3.99" style="width:100%; border:2px solid black; padding:6px 8px; font-weight:bold; box-sizing:border-box; outline:none; font-family:system-ui;" />
        </div>

        <div style="margin-bottom:20px;">
            <label style="display:block; font-weight:bold; font-size:12px; text-transform:uppercase; margin-bottom:4px; font-family:system-ui;">Sale Expiry (Optional)</label>
            <input type="date" id="gs-valid-until" style="width:100%; border:2px solid black; padding:6px 8px; font-weight:bold; box-sizing:border-box; outline:none; font-family:system-ui;" />
        </div>

        <div style="margin-bottom:12px;">
            <label style="display:block; font-weight:bold; font-size:12px; text-transform:uppercase; margin-bottom:4px; font-family:system-ui;">Item Category *</label>
            <select id="gs-category" style="width:100%; border:2px solid black; padding:6px 8px; font-weight:bold; box-sizing:border-box; outline:none; font-family:system-ui; background:white; cursor:pointer;" required>
                <option value="Dairy & Eggs">Dairy & Eggs</option>
                <option value="Fresh Produce">Fresh Produce</option>
                <option value="Bakery & Breads">Bakery & Breads</option>
                <option value="Meat & Seafood">Meat & Seafood</option>
                <option value="Pantry Staples">Pantry Staples</option>
                <option value="Baking & Spices">Baking & Spices</option>
                <option value="Snacks & Beverages">Snacks & Beverages</option>
                <option value="Health, Personal & Household">Health, Personal & Household</option>
                <option value="Beer, Wine & Spirits">Beer, Wine & Spirits</option>
            </select>
        </div>

        <div style="margin-bottom:20px; display:flex; gap:8px;">
            <div style="flex:1;">
                <label style="display:block; font-weight:bold; font-size:12px; text-transform:uppercase; margin-bottom:4px; font-family:system-ui;">Units (Size Value) *</label>
                <input type="number" id="gs-units" step="any" min="0" placeholder="e.g. 450" style="width:100%; border:2px solid black; padding:6px 8px; font-weight:bold; box-sizing:border-box; outline:none; font-family:system-ui;" required />
            </div>
            <div style="flex:1;">
                <label style="display:block; font-weight:bold; font-size:12px; text-transform:uppercase; margin-bottom:4px; font-family:system-ui;">Unit of Measure *</label>
                <select id="gs-unit" style="width:100%; border:2px solid black; padding:6px 8px; font-weight:bold; box-sizing:border-box; outline:none; font-family:system-ui; background:white; cursor:pointer;" required>
                    <option value="unit">unit</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                    <option value="lb">lb</option>
                    <option value="oz">oz</option>
                    <option value="gal">gal</option>
                    <option value="dozen">dozen</option>
                    <option value="bunch">bunch</option>
                    <option value="bag">bag</option>
                    <option value="can">can</option>
                    <option value="box">box</option>
                    <option value="pack">pack</option>
                </select>
            </div>
        </div>

        <div style="display:flex; gap:12px;">
            <button id="gs-btn-cancel" style="flex:1; background:#ef4444; color:white; border:2px solid black; padding:10px; font-weight:bold; cursor:pointer; text-transform:uppercase; box-shadow:2px 2px 0px black; font-size:12px; font-family:system-ui;">Cancel</button>
            <button id="gs-btn-submit" style="flex:1; background:#22c55e; color:white; border:2px solid black; padding:10px; font-weight:bold; cursor:pointer; text-transform:uppercase; box-shadow:2px 2px 0px black; font-size:12px; font-family:system-ui;">Submit</button>
        </div>
    `;

    document.body.appendChild(modal);

    async function sendPayload(payload, submitBtn, cancelBtn, callback) {
        const token = await ensureToken(true);
        if (!token) {
            if (submitBtn) {
                submitBtn.innerHTML = 'Submit';
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            }
            if (cancelBtn) {
                cancelBtn.disabled = false;
                cancelBtn.style.opacity = '1';
            }
            if (sendBtn) {
                sendBtn.innerHTML = '📥 Forward to App';
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
                sendBtn.style.background = '#0284c7';
            }
            return;
        }

        if (submitBtn) {
            submitBtn.innerHTML = 'Connecting...';
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.8';
        }
        if (cancelBtn) {
            cancelBtn.disabled = true;
            cancelBtn.style.opacity = '0.5';
        }
        sendBtn.innerHTML = 'Connecting...';

        console.log("GroceryScout: Sending payload:", payload);

        GM_xmlhttpRequest({
            method: "POST",
            url: getApiBaseSync() + "/api/append-grocery",
            headers: {
                "Content-Type": "application/json",
                "X-GroceryScout-Token": token
            },
            data: JSON.stringify(payload),
            onload: function (response) {
                console.log("GroceryScout: Server response status:", response.status);
                let statusText = 'Linked';
                let statusBg = '#22c55e';

                if (response.status === 200) {
                    try {
                        const resObj = JSON.parse(response.responseText);
                        console.log("GroceryScout: Parsed server response:", resObj);
                        if (resObj && resObj.catalogMatch) {
                            const cm = resObj.catalogMatch;
                            if (cm.urlAlreadyExists) {
                                statusText = '🔗 URL Exists';
                                statusBg = '#eab308';
                            } else if (cm.matchType === 'exact') {
                                statusText = '🎯 Exact Match';
                                statusBg = '#22c55e';
                            } else if (cm.matchType === 'gemini') {
                                statusText = '🤖 Gemini Match';
                                statusBg = '#3b82f6';
                            } else if (cm.matchType === 'created') {
                                statusText = '✨ Created';
                                statusBg = '#a855f7';
                            } else {
                                statusText = '✅ Linked';
                                statusBg = '#22c55e';
                            }
                        } else {
                            statusText = '✅ Linked';
                            statusBg = '#22c55e';
                        }
                    } catch (e) {
                        console.error("GroceryScout: Failed to parse JSON response:", e, response.responseText);
                        statusText = '✅ Linked';
                        statusBg = '#22c55e';
                    }
                } else {
                    statusText = '❌ Server Error';
                    statusBg = '#ef4444';
                    console.error("GroceryScout: Server returned error status " + response.status + ":", response.responseText);
                }

                // Update modal submit button
                if (submitBtn) {
                    submitBtn.innerHTML = statusText;
                    submitBtn.style.background = statusBg;
                    submitBtn.style.opacity = '1';
                }

                // Update floating button
                sendBtn.innerHTML = statusText + `: $${payload.data.regular_price.toFixed(2)}`;
                sendBtn.style.background = statusBg;

                // Close modal after delay, or re-enable buttons if it failed
                setTimeout(() => {
                    if (response.status === 200) {
                        if (callback) callback();
                    } else {
                        if (submitBtn) {
                            submitBtn.innerHTML = 'Submit';
                            submitBtn.style.background = '#22c55e';
                            submitBtn.disabled = false;
                        }
                        if (cancelBtn) {
                            cancelBtn.disabled = false;
                            cancelBtn.style.opacity = '1';
                        }
                    }
                }, 3000);

                setTimeout(() => {
                    sendBtn.innerHTML = '📥 Forward to App';
                    sendBtn.style.background = '#0284c7';
                }, 6000);
            },
            onerror: function (err) {
                console.error("GroceryScout: Network/CORS error details:", err);
                const statusText = '❌ Network Error';
                const statusBg = '#ef4444';

                if (submitBtn) {
                    submitBtn.innerHTML = statusText;
                    submitBtn.style.background = statusBg;
                    submitBtn.style.opacity = '1';
                }

                sendBtn.innerHTML = statusText;
                sendBtn.style.background = statusBg;

                setTimeout(() => {
                    if (submitBtn) {
                        submitBtn.innerHTML = 'Submit';
                        submitBtn.style.background = '#22c55e';
                        submitBtn.disabled = false;
                    }
                    if (cancelBtn) {
                        cancelBtn.disabled = false;
                        cancelBtn.style.opacity = '1';
                    }
                }, 3000);

                setTimeout(() => {
                    sendBtn.innerHTML = '📥 Forward to App';
                    sendBtn.style.background = '#0284c7';
                }, 6000);
            }
        });
    }

    sendBtn.onclick = function () {
        const payload = extractItemData();
        if (!payload.key) return alert("❌ URL Key error");

        modal.style.display = 'block';
        document.getElementById('gs-reg-price').value = '';
        document.getElementById('gs-sale-price').value = '';
        document.getElementById('gs-valid-until').value = '';

        const itemSearchInput = document.getElementById('gs-item-search');
        const itemDropdown = document.getElementById('gs-item-dropdown');
        const categorySelect = document.getElementById('gs-category');
        const unitsInput = document.getElementById('gs-units');
        const unitSelect = document.getElementById('gs-unit');

        const rawTitle = getProductTitle();
        categorySelect.value = determineCategory(rawTitle);
        const parsedSize = determineUnitAndSize(rawTitle);
        unitsInput.value = parsedSize.units;
        unitSelect.value = parsedSize.unitOfMeasurement;

        itemSearchInput.value = payload.data.config_name;
        document.getElementById('gs-reg-price').focus();

        let activeIndex = -1;
        let filteredItems = [];

        function renderDropdown() {
            const query = itemSearchInput.value.trim().toLowerCase();
            filteredItems = catalogItems.filter(item => item.name.toLowerCase().includes(query));

            const itemsToShow = filteredItems.slice(0, 10);

            if (itemsToShow.length === 0) {
                itemDropdown.style.display = 'none';
                return;
            }

            itemDropdown.innerHTML = itemsToShow.map((item, idx) => {
                const isActive = idx === activeIndex ? ' gs-active' : '';
                return `<div class="gs-dropdown-item${isActive}" data-name="${item.name}">${item.name}</div>`;
            }).join('');

            itemDropdown.style.display = 'block';

            const items = itemDropdown.querySelectorAll('.gs-dropdown-item');
            items.forEach((el, idx) => {
                el.onclick = function () {
                    itemSearchInput.value = el.getAttribute('data-name');
                    itemDropdown.style.display = 'none';
                    activeIndex = -1;
                };
            });
        }

        itemSearchInput.onfocus = function () {
            activeIndex = -1;
            renderDropdown();
        };

        itemSearchInput.oninput = function () {
            activeIndex = -1;
            renderDropdown();
        };

        itemSearchInput.onkeydown = function (e) {
            const items = itemDropdown.querySelectorAll('.gs-dropdown-item');
            if (itemDropdown.style.display === 'block' && items.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    activeIndex = (activeIndex + 1) % items.length;
                    renderDropdown();
                    const activeEl = itemDropdown.querySelector('.gs-dropdown-item.gs-active');
                    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    activeIndex = (activeIndex - 1 + items.length) % items.length;
                    renderDropdown();
                    const activeEl = itemDropdown.querySelector('.gs-dropdown-item.gs-active');
                    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
                } else if (e.key === 'Enter') {
                    if (activeIndex >= 0 && activeIndex < items.length) {
                        e.preventDefault();
                        itemSearchInput.value = items[activeIndex].getAttribute('data-name');
                        itemDropdown.style.display = 'none';
                        activeIndex = -1;
                    }
                } else if (e.key === 'Escape') {
                    itemDropdown.style.display = 'none';
                    activeIndex = -1;
                }
            }
        };

        const clickOutsideHandler = function (e) {
            if (e.target !== itemSearchInput && !itemDropdown.contains(e.target)) {
                itemDropdown.style.display = 'none';
            }
        };
        document.addEventListener('click', clickOutsideHandler);

        function cleanupModal() {
            modal.style.display = 'none';
            document.removeEventListener('click', clickOutsideHandler);
        }

        document.getElementById('gs-btn-cancel').onclick = function () {
            cleanupModal();
        };

        document.getElementById('gs-btn-submit').onclick = function () {
            const regPriceInput = document.getElementById('gs-reg-price').value.trim();
            const salePriceInput = document.getElementById('gs-sale-price').value.trim();
            const validUntilInput = document.getElementById('gs-valid-until').value.trim();
            const selectedItemSearch = itemSearchInput.value.trim();
            const selectedCategory = categorySelect.value;
            const selectedUnitsInput = unitsInput.value.trim();
            const selectedUnit = unitSelect.value;

            if (!selectedItemSearch) {
                alert("Please select or specify a Catalog Item");
                return;
            }

            if (!regPriceInput) {
                alert("Please fill in the Regular Price");
                return;
            }

            const regPrice = parseFloat(regPriceInput);
            if (isNaN(regPrice) || regPrice <= 0) {
                alert("Invalid Regular Price");
                return;
            }

            if (!selectedUnitsInput) {
                alert("Please specify the Units count/size");
                return;
            }
            const selectedUnits = parseFloat(selectedUnitsInput);
            if (isNaN(selectedUnits) || selectedUnits <= 0) {
                alert("Invalid Units count/size");
                return;
            }

            payload.data.config_name = selectedItemSearch;
            payload.data.regular_price = regPrice;
            if (salePriceInput) {
                const salePrice = parseFloat(salePriceInput);
                if (!isNaN(salePrice) && salePrice > 0) {
                    payload.data.sale_price = salePrice;
                    payload.data.is_on_sale = true;
                }
            } else {
                payload.data.sale_price = null;
                payload.data.is_on_sale = false;
            }

            if (validUntilInput) {
                payload.data.valid_until = validUntilInput;
            } else {
                payload.data.valid_until = null;
            }

            payload.data.category = selectedCategory;
            payload.data.unit = selectedUnit;
            payload.data.units = selectedUnits;

            const submitBtn = document.getElementById('gs-btn-submit');
            const cancelBtn = document.getElementById('gs-btn-cancel');
            sendPayload(payload, submitBtn, cancelBtn, cleanupModal);
        };
    };
})();