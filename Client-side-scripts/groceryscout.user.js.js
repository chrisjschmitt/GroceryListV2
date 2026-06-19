// ==UserScript==
// @name         GroceryScout - 2.7 Normalized Canonical Exporter
// @namespace    http://tampermonkey.net/
// @version      2.7
// @description  Added pricing fields to submission form
// @author       You
// @match        https://www.foodbasics.ca/*
// @match        https://www.metro.ca/*
// @match        https://www.freshco.com/*
// @match        https://www.walmart.ca/*
// @match        https://www.loblaws.ca/*
// @match        https://www.nofrills.ca/*
// @match		 https://www.yourindependentgrocer.ca/*
// @connect      ais-dev-kynlhucnvvzplwokihj56s-569102779948.us-west2.run.app
// @connect      grocery-list-v2-navy.vercel.app
// @connect      *
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    // 1. Strict Mapping Dictionary matching regular-items.json EXACTLY
    const CANONICAL_NAMES = [
        "2% lactose free cottage cheese",
        "Yogurt LF 1% Natrel",
        "Chicken Breasts Boneless Skinless",
        "Milk LF 2%",
        "Broccoli",
        "Butter unsalted",
        "Eggs - 18",
        "Blueberries - pint",
        "Strawberries 454g",
        "Ground beef Lean 450g",
        "Ground chicken Lean 450g",
        "Raspberries",
        "Olives",
        "Decaf coffee",
        "LF Ice cream"
    ];

    // Helper to find closest lookup string based on product page content
    function determineConfigName(pageTitle) {
        const lowerTitle = pageTitle.toLowerCase();

        if (lowerTitle.includes("ground beef") || lowerTitle.includes("beef single")) return "Ground beef Lean 450g";
        if (lowerTitle.includes("cottage cheese")) return "2% lactose free cottage cheese";
        if (lowerTitle.includes("natrel") && lowerTitle.includes("yogurt")) return "Yogurt LF 1% Natrel";
        if (lowerTitle.includes("chicken breast")) return "Chicken Breasts Boneless Skinless";
        if (lowerTitle.includes("ground chicken")) return "Ground chicken Lean 450g";
        if (lowerTitle.includes("milk") && lowerTitle.includes("2%")) return "Milk LF 2%";
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
        const rawTitle = document.title.split('|')[0].trim();
        const verifiedConfigName = determineConfigName(rawTitle); // <-- Converts string variables here

        const domain = window.location.hostname;
        let storeId = "unknown";
        if (domain.includes("foodbasics")) storeId = "foodbasics";
        else if (domain.includes("metro")) storeId = "metro";
        else if (domain.includes("freshco")) storeId = "freshco";
        else if (domain.includes("walmart")) storeId = "walmart";
        else if (domain.includes("loblaws")) storeId = "loblaws";
        else if (domain.includes("nofrills")) storeId = "nofrills";
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
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
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

        <div style="display:flex; gap:12px;">
            <button id="gs-btn-cancel" style="flex:1; background:#ef4444; color:white; border:2px solid black; padding:10px; font-weight:bold; cursor:pointer; text-transform:uppercase; box-shadow:2px 2px 0px black; font-size:12px; font-family:system-ui;">Cancel</button>
            <button id="gs-btn-submit" style="flex:1; background:#22c55e; color:white; border:2px solid black; padding:10px; font-weight:bold; cursor:pointer; text-transform:uppercase; box-shadow:2px 2px 0px black; font-size:12px; font-family:system-ui;">Submit</button>
        </div>
    `;

    document.body.appendChild(modal);

    function sendPayload(payload) {
        sendBtn.innerHTML = 'Connecting...';
        GM_xmlhttpRequest({
            method: "POST",
            url: "https://grocery-list-v2-navy.vercel.app/api/append-grocery",
            headers: {
                "Content-Type": "application/json",
                "X-GroceryScout-Token": "GroceryHub2026"
            },
            data: JSON.stringify(payload),
            onload: function (response) {
                if (response.status === 200) {
                    sendBtn.innerHTML = `✅ Linked: $${payload.data.regular_price.toFixed(2)}`;
                    sendBtn.style.background = '#22c55e';
                } else {
                    sendBtn.innerHTML = '❌ Server Error';
                    sendBtn.style.background = '#ef4444';
                    console.error("Server Error Details:", response.responseText);
                }
                setTimeout(() => {
                    sendBtn.innerHTML = '📥 Forward to App';
                    sendBtn.style.background = '#0284c7';
                }, 2500);
            },
            onerror: function (err) {
                sendBtn.innerHTML = '❌ Network Error';
                sendBtn.style.background = '#ef4444';
                console.error("Network / CORS Error details:", err);
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
        document.getElementById('gs-reg-price').focus();

        document.getElementById('gs-btn-cancel').onclick = function() {
            modal.style.display = 'none';
        };

        document.getElementById('gs-btn-submit').onclick = function() {
            const regPriceInput = document.getElementById('gs-reg-price').value.trim();
            const salePriceInput = document.getElementById('gs-sale-price').value.trim();
            const validUntilInput = document.getElementById('gs-valid-until').value.trim();

            if (!regPriceInput) {
                alert("Please fill in the Regular Price");
                return;
            }

            const regPrice = parseFloat(regPriceInput);
            if (isNaN(regPrice) || regPrice <= 0) {
                alert("Invalid Regular Price");
                return;
            }

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

            modal.style.display = 'none';
            sendPayload(payload);
        };
    };
})();