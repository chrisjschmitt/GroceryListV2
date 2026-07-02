# Combined Catalog Price Audit Report

**Date:** 7/2/2026, 7:07:27 AM

## Summary Dashboard

| Total Audited | Matches | Mismatches | Errors |
| --- | --- | --- | --- |
| 213 | 154 | 43 | 16 |

## Audit Registry Details

| Item Name | Store | Status | Catalog Price | Live Price | Catalog Unit / Size | Live Unit / Size | Expiry Match? | Discrepancies / Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Romaine lettuce 3-pack | foodbasics | ✅ MATCH | Sale: $4.99 (Reg: $5.88) | Sale: $4.99 (Reg: $5.88) | unit (3) | unit (3) | Yes | None |
| Romaine lettuce 3-pack | freshco | ✅ MATCH | Sale: $4.77 (Reg: $5.99) | Sale: $4.77 (Reg: $5.99) | unit (3) | count (3) | Yes | None |
| Romaine lettuce 3-pack | metro | ✅ MATCH | Sale: $3.99 (Reg: $6.99) | Sale: $3.99 (Reg: $6.99) | unit (3) | unit (3) | Yes | None |
| Pilsbury crescent rolls | foodbasics | ✅ MATCH | Reg: $2.49 | Reg: $2.49 | g (226) | g (226) | Yes | None |
| Pilsbury crescent rolls | metro | ✅ MATCH | Reg: $2.99 | Reg: $2.99 | g (226) | g (226) | Yes | None |
| Natrel 1% Lactose Free Milk | yourindependentgrocer | ❌ ERROR | Reg: $7.29 | Reg: $-- | l (2) | -- (--) | Yes | Error: {"error":{"code":429,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing. Learn more at https://ai.google.dev/gemini-api/docs/billing#prepay. ","status":"RESOURCE_EXHAUSTED"}} |
| 2% Lactose Free Milk | yourindependentgrocer | ✅ MATCH | Reg: $7.29 | Reg: $7.29 | l (2) | l (2) | Yes | None |
| Eggs - 30 | foodbasics | ✅ MATCH | Reg: $9.59 | Reg: $9.59 | unit (30) | unit (30) | Yes | None |
| Eggs - 30 | freshco | ✅ MATCH | Reg: $9.18 | Reg: $9.18 | unit (30) | count (30) | Yes | None |
| Eggs - 30 | metro | ✅ MATCH | Reg: $9.99 | Reg: $9.99 | unit (30) | unit (30) | Yes | None |
| Whipping Cream - LF | freshco | ✅ MATCH | Reg: $5.19 | Reg: $5.19 | ml (473) | ml (473) | Yes | None |
| Butter unsalted | foodbasics | ✅ MATCH | Reg: $5.99 | Reg: $5.99 | g (454) | g (454) | Yes | None |
| Butter unsalted | costco | ❌ ERROR | Reg: $5.79 | Reg: $-- | g (454) | -- (--) | Yes | Error: Screenshot file missing: regular-1779915020670-118-o1289_costco.png |
| Butter unsalted | freshco | ✅ MATCH | Reg: $5.99 | Reg: $5.99 | g (454) | g (454) | Yes | None |
| Butter unsalted | metro | ✅ MATCH | Reg: $5.99 | Reg: $5.99 | g (454) | g (454) | Yes | None |
| Cheezies snacks | foodbasics | ✅ MATCH | Reg: $2.88 | Reg: $2.88 | g (285) | g (285) | Yes | None |
| Cheezies snacks | metro | ✅ MATCH | Reg: $3.49 | Reg: $3.49 | g (285) | g (285) | Yes | None |
| Lactose free cream cheese 227g | foodbasics | ✅ MATCH | Reg: $6.99 | Reg: $6.99 | g (227) | g (227) | Yes | None |
| Lactose free cream cheese 227g | freshco | ⚠️ MISMATCH | Reg: $2.99 | Reg: $2.99 | g (227) | g (250) | Yes | Unit Quantity mismatch: Catalog has 227, Live has 250 |
| Lactose free cream cheese 227g | metro | ✅ MATCH | Reg: $6.99 | Reg: $6.99 | g (227) | g (227) | Yes | None |
| Lactose fee Feta cheese 200g | freshco | ✅ MATCH | Reg: $6.99 | Reg: $6.99 | g (200) | g (200) | Yes | None |
| Peaches | foodbasics | ✅ MATCH | Sale: $4.39 (Reg: $6.59) | Sale: $4.39 (Reg: $6.59) | kg (1) | kg (1) | Yes | None |
| Peaches | metro | ✅ MATCH | Sale: $6.59 (Reg: $13.21) | Sale: $6.59 (Reg: $13.21) | kg (1) | kg (1) | Yes | None |
| Lactose free mozzarella cheese | freshco | ⚠️ MISMATCH | Reg: $2.3 | Sale: $4.99 (Reg: $5.49) | g (450) | g (320) | No | Regular Price mismatch: Catalog has $2.3, Live has $5.49; Sale Price mismatch: Catalog has $--, Live has $4.99; Validity Date mismatch: Catalog has "--", Live has "2026-07-08"; Unit Quantity mismatch: Catalog has 450, Live has 320 |
| Lactose free mozzarella cheese | foodbasics | ❌ ERROR | Reg: $5.79 | Reg: $-- | g (450) | -- (--) | Yes | Error: Screenshot file missing: regular-1779915020670-136-wkbu5_foodbasics.png |
| Lactose free mozzarella cheese | metro | ❌ ERROR | Reg: $-- | Reg: $-- | g (450) | -- (--) | Yes | Error: Screenshot file missing: regular-1779915020670-136-wkbu5_metro.png |
| Lactose Free cheese | foodbasics | ⚠️ MISMATCH | Sale: $4.99 (Reg: $6.49) | Reg: $-- | g (200) | g (200) | No | Regular Price mismatch: Catalog has $6.49, Live has $--; Sale Price mismatch: Catalog has $4.99, Live has $--; Validity Date mismatch: Catalog has "2026-07-08", Live has "--" |
| Lactose Free cheese | freshco | ⚠️ MISMATCH | Reg: $5.99 | Reg: $5.99 | g (200) | g (400) | Yes | Unit Quantity mismatch: Catalog has 200, Live has 400 |
| Lactose Free cheese | metro | ✅ MATCH | Sale: $7.99 (Reg: $9.29) | Sale: $7.99 (Reg: $9.29) | g (200) | g (200) | Yes | None |
| Lactose free Greek yogurt | foodbasics | ✅ MATCH | Sale: $6.99 (Reg: $7.49) | Sale: $6.99 (Reg: $7.49) | g (750) | g (750) | Yes | None |
| Lactose free Greek yogurt | freshco | ✅ MATCH | Sale: $6.49 (Reg: $7.49) | Sale: $6.49 (Reg: $7.49) | g (750) | g (750) | Yes | None |
| Lactose free Greek yogurt | metro | ✅ MATCH | Sale: $6.99 (Reg: $7.99) | Sale: $6.99 (Reg: $7.99) | g (750) | g (750) | Yes | None |
| LF Ice cream | foodbasics | ✅ MATCH | Reg: $7.99 | Reg: $7.99 | l (1) | l (1) | Yes | None |
| LF Ice cream | metro | ✅ MATCH | Reg: $7.99 | Reg: $7.99 | l (1) | l (1) | Yes | None |
| LF Ice cream | freshco | ⚠️ MISMATCH | Reg: $7.99 | Reg: $7.99 | l (1) | ml (1000) | Yes | Unit mismatch: Catalog has "l", Live has "ml"; Unit Quantity mismatch: Catalog has 1, Live has 1000 |
| Ground beef Lean 450g | foodbasics | ⚠️ MISMATCH | Reg: $7 | Reg: $7 | g (450) | g (350) | Yes | Unit Quantity mismatch: Catalog has 450, Live has 350 |
| Ground beef Lean 450g | freshco | ✅ MATCH | Reg: $9.5 | Reg: $9.5 | g (450) | g (450) | Yes | None |
| Ground beef Lean 450g | metro | ⚠️ MISMATCH | Sale: $6.39 (Reg: $8.30907246820545e-310) | Sale: $6.39 (Reg: $10.71) | g (450) | g (450) | Yes | Regular Price mismatch: Catalog has $8.30907246820545e-310, Live has $10.71 |
| Ground Chicken Lean 450g | foodbasics | ✅ MATCH | Reg: $7.99 | Reg: $7.99 | g (454) | g (454) | Yes | None |
| Ground Chicken Lean 450g | freshco | ⚠️ MISMATCH | Reg: $8 | Reg: $8 | g (454) | g (450) | Yes | Unit Quantity mismatch: Catalog has 454, Live has 450 |
| Ground Chicken Lean 450g | metro | ✅ MATCH | Reg: $9.99 | Reg: $9.99 | g (454) | g (454) | Yes | None |
| Strawberries 454g | foodbasics | ✅ MATCH | Sale: $2.99 (Reg: $4.99) | Sale: $2.99 (Reg: $4.99) | g (454) | g (454) | Yes | None |
| Strawberries 454g | freshco | ⚠️ MISMATCH | Sale: $2 (Reg: $5.99) | Sale: $2 (Reg: $5.99) | g (454) | g (454) | Yes | Flyer status mismatch: Catalog has NO, Live has YES |
| Strawberries 454g | metro | ✅ MATCH | Sale: $3.99 (Reg: $4.99) | Sale: $3.99 (Reg: $4.99) | g (454) | g (454) | Yes | None |
| Lamb | foodbasics | ✅ MATCH | Reg: $12.99 | Reg: $12.99 | g (454) | g (454) | Yes | None |
| Lamb | metro | ✅ MATCH | Reg: $13.99 | Reg: $13.99 | g (454) | g (454) | Yes | None |
| Pork back ribs | foodbasics | ✅ MATCH | Reg: $13.99 | Reg: $13.99 | g (600) | g (600) | Yes | None |
| Pork back ribs | metro | ✅ MATCH | Sale: $11.99 (Reg: $17.99) | Sale: $11.99 (Reg: $17.99) | g (600) | g (600) | Yes | None |
| Sausages - Chicken | costco | ❌ ERROR | Sale: $13.49 (Reg: $16.99) | Reg: $-- | pack (--) | -- (--) | No | Error: Screenshot file missing: regular-1779915020670-180-7cjti_costco.png |
| Pinto beans 15 oz | foodbasics | ✅ MATCH | Reg: $3.99 | Reg: $3.99 | g (907) | g (907) | Yes | None |
| Pinto beans 15 oz | metro | ✅ MATCH | Reg: $3.99 | Reg: $3.99 | g (907) | g (907) | Yes | None |
| Cashews | foodbasics | ✅ MATCH | Reg: $2.99 | Reg: $2.99 | g (200) | g (200) | Yes | None |
| Cashews | metro | ❌ ERROR | Reg: $-- | Reg: $-- | g (200) | -- (--) | Yes | Error: Screenshot file missing: regular-1779915020670-219-1couy_metro.png |
| Avocados 6-pack | freshco | ⚠️ MISMATCH | Reg: $5.99 | Reg: $5.99 | unit (6) | count (4) | Yes | Unit Quantity mismatch: Catalog has 6, Live has 4 |
| Avocados 6-pack | foodbasics | ✅ MATCH | Sale: $2.98 (Reg: $5.88) | Sale: $2.98 (Reg: $5.88) | unit (6) | unit (6) | Yes | None |
| Avocados 6-pack | metro | ✅ MATCH | Reg: $5.99 | Reg: $5.99 | unit (6) | count (6) | Yes | None |
| Olives | foodbasics | ✅ MATCH | Reg: $1.99 | Reg: $1.99 | ml (398) | ml (398) | Yes | None |
| Olives | metro | ✅ MATCH | Reg: $2.99 | Reg: $2.99 | ml (398) | ml (398) | Yes | None |
| Maple syrup | metro | ✅ MATCH | Sale: $13.99 (Reg: $15.99) | Sale: $13.99 (Reg: $15.99) | ml (540) | ml (540) | Yes | None |
| Egg Noodles | foodbasics | ✅ MATCH | Reg: $3.29 | Reg: $3.29 | g (340) | g (340) | Yes | None |
| Egg Noodles | metro | ✅ MATCH | Reg: $3.49 | Reg: $3.49 | g (340) | g (340) | Yes | None |
| Beets | foodbasics | ✅ MATCH | Reg: $4.98 | Reg: $4.98 | unit (1) | unit (1) | Yes | None |
| Beets | metro | ✅ MATCH | Reg: $4.99 | Reg: $4.99 | unit (1) | unit (1) | Yes | None |
| Cesar salad dressing - Costco | freshco | ✅ MATCH | Sale: $4.99 (Reg: $5.99) | Sale: $4.99 (Reg: $5.99) | ml (591) | ml (591) | Yes | None |
| Broccoli | foodbasics | ✅ MATCH | Sale: $2.5 (Reg: $2.98) | Sale: $2.5 (Reg: $2.98) | unit (1) | unit (1) | Yes | None |
| Broccoli | metro | ✅ MATCH | Sale: $2.49 (Reg: $3.99) | Sale: $2.49 (Reg: $3.99) | unit (1) | unit (1) | Yes | None |
| Broccoli | freshco | ✅ MATCH | Reg: $3.99 | Reg: $3.99 | unit (1) | unit (1) | Yes | None |
| Bananas 5-6 | costco | ❌ ERROR | Reg: $1.69 | Reg: $-- | kg (1) | -- (--) | Yes | Error: Screenshot file missing: regular-1779915020670-3-5fdno_costco.png |
| Bananas 5-6 | foodbasics | ✅ MATCH | Reg: $1.52 | Reg: $1.52 | kg (1) | kg (1) | Yes | None |
| Bananas 5-6 | freshco | ✅ MATCH | Reg: $1.52 | Reg: $1.52 | kg (1) | kg (1) | Yes | None |
| Bananas 5-6 | metro | ✅ MATCH | Reg: $1.96 | Reg: $1.96 | kg (1) | kg (1) | Yes | None |
| Carrots | freshco | ⚠️ MISMATCH | Reg: $3.73 | Reg: $3.73 | g (200) | kg (1) | Yes | Unit mismatch: Catalog has "g", Live has "kg"; Unit Quantity mismatch: Catalog has 200, Live has 1 |
| Carrots | foodbasics | ✅ MATCH | Reg: $0.88 | Reg: $0.88 | g (200) | g (200) | Yes | None |
| Carrots | metro | ⚠️ MISMATCH | Reg: $0.88 | Reg: $0.88 | g (200) | unit (1) | Yes | Unit mismatch: Catalog has "g", Live has "unit"; Unit Quantity mismatch: Catalog has 200, Live has 1 |
| Frozen corn | foodbasics | ⚠️ MISMATCH | Reg: $5.99 | Reg: $-- | g (750) | g (750) | Yes | Regular Price mismatch: Catalog has $5.99, Live has $-- |
| Frozen corn | metro | ✅ MATCH | Reg: $3.99 | Reg: $3.99 | g (750) | g (750) | Yes | None |
| Yogurt tubes | foodbasics | ✅ MATCH | Sale: $2.5 (Reg: $3.79) | Sale: $2.5 (Reg: $3.79) | g (448) | g (448) | Yes | None |
| Yogurt tubes | metro | ✅ MATCH | Sale: $2.99 (Reg: $3.49) | Sale: $2.99 (Reg: $3.49) | g (448) | g (448) | Yes | None |
| Pineapple | foodbasics | ✅ MATCH | Reg: $2.29 | Reg: $2.29 | ml (540) | ml (540) | Yes | None |
| Pineapple | metro | ✅ MATCH | Reg: $2.49 | Reg: $2.49 | ml (540) | ml (540) | Yes | None |
| Celery | foodbasics | ✅ MATCH | Sale: $2.99 (Reg: $3.99) | Sale: $2.99 (Reg: $3.99) | unit (1) | unit (1) | Yes | None |
| Celery | freshco | ✅ MATCH | Reg: $3.77 | Reg: $3.77 | unit (1) | unit (1) | Yes | None |
| Celery | metro | ✅ MATCH | Reg: $3.99 | Reg: $3.99 | unit (1) | unit (1) | Yes | None |
| Cauliflower | foodbasics | ✅ MATCH | Reg: $4.99 | Reg: $4.99 | unit (1) | unit (1) | Yes | None |
| Cauliflower | freshco | ⚠️ MISMATCH | Sale: $4.77 (Reg: $4.97) | Sale: $4.77 (Reg: $4.97) | unit (1) | count (1) | Yes | Flyer status mismatch: Catalog has NO, Live has YES |
| Cauliflower | metro | ✅ MATCH | Reg: $4.99 | Reg: $4.99 | unit (1) | unit (1) | Yes | None |
| Blackberries | foodbasics | ✅ MATCH | Sale: $3.99 (Reg: $4.99) | Sale: $3.99 (Reg: $4.99) | g (170) | g (170) | Yes | None |
| Blackberries | freshco | ⚠️ MISMATCH | Sale: $2.99 (Reg: $4.49) | Sale: $2.99 (Reg: $4.49) | g (170) | g (170) | Yes | Flyer status mismatch: Catalog has NO, Live has YES |
| Blackberries | metro | ✅ MATCH | Reg: $4.99 | Reg: $4.99 | g (170) | g (170) | Yes | None |
| Iceberg lettuce | freshco | ✅ MATCH | Reg: $2.97 | Reg: $2.97 | unit (1) | count (1) | Yes | None |
| Iceberg lettuce | foodbasics | ✅ MATCH | Sale: $2.99 (Reg: $3.99) | Sale: $2.99 (Reg: $3.99) | unit (1) | unit (1) | Yes | None |
| Iceberg lettuce | metro | ✅ MATCH | Reg: $3.99 | Reg: $3.99 | unit (1) | unit (1) | Yes | None |
| Blueberries | foodbasics | ⚠️ MISMATCH | Reg: $4.99 | Reg: $4.99 | ml (551) | unit (1) | Yes | Unit mismatch: Catalog has "ml", Live has "unit"; Unit Quantity mismatch: Catalog has 551, Live has 1 |
| Blueberries | freshco | ⚠️ MISMATCH | Reg: $5.99 | Reg: $5.99 | ml (551) | g (340) | Yes | Unit mismatch: Catalog has "ml", Live has "g"; Unit Quantity mismatch: Catalog has 551, Live has 340 |
| Blueberries | metro | ✅ MATCH | Reg: $5.99 | Reg: $5.99 | ml (551) | ml (551) | Yes | None |
| Cremini | foodbasics | ✅ MATCH | Reg: $4.99 | Reg: $4.99 | g (454) | g (454) | Yes | None |
| Cremini | metro | ✅ MATCH | Reg: $5.49 | Reg: $5.49 | g (454) | g (454) | Yes | None |
| Raspberries | foodbasics | ✅ MATCH | Sale: $3.99 (Reg: $4.99) | Sale: $3.99 (Reg: $4.99) | g (170) | g (170) | Yes | None |
| Raspberries | metro | ✅ MATCH | Reg: $4.99 | Reg: $4.99 | g (170) | g (170) | Yes | None |
| Green Onions | metro | ✅ MATCH | Reg: $1.99 | Reg: $1.99 | count (1) | unit (1) | Yes | None |
| Green Onions | freshco | ✅ MATCH | Reg: $1.47 | Reg: $1.47 | count (1) | unit (1) | Yes | None |
| Yellow onions | freshco | ⚠️ MISMATCH | Reg: $4.49 | Reg: $4.49 | lb (2) | kg (2.27) | Yes | Unit mismatch: Catalog has "lb", Live has "kg"; Unit Quantity mismatch: Catalog has 2, Live has 2.27 |
| Yellow onions | foodbasics | ✅ MATCH | Reg: $2.99 | Reg: $2.99 | lb (2) | lb (2) | Yes | None |
| Yellow onions | metro | ✅ MATCH | Reg: $3.49 | Reg: $3.49 | lb (2) | lb (2) | Yes | None |
| Russet potatoes | foodbasics | ✅ MATCH | Sale: $3.99 (Reg: $4.99) | Sale: $3.99 (Reg: $4.99) | lb (5) | lb (5) | Yes | None |
| Russet potatoes | freshco | ⚠️ MISMATCH | Reg: $4.39 | Reg: $4.39 | lb (5) | kg (1) | Yes | Unit mismatch: Catalog has "lb", Live has "kg"; Unit Quantity mismatch: Catalog has 5, Live has 1 |
| Russet potatoes | metro | ✅ MATCH | Reg: $4.99 | Reg: $4.99 | lb (5) | lb (5) | Yes | None |
| Red peppers | foodbasics | ⚠️ MISMATCH | Sale: $1.98 (Reg: $3.29) | Sale: $6.59 (Reg: $10.98) | kg (1) | kg (1) | Yes | Regular Price mismatch: Catalog has $3.29, Live has $10.98; Sale Price mismatch: Catalog has $1.98, Live has $6.59 |
| Red peppers | metro | ⚠️ MISMATCH | Sale: $8.8 (Reg: $11) | Sale: $2.64 (Reg: $3.3) | kg (1) | g (300) | Yes | Regular Price mismatch: Catalog has $11, Live has $3.3; Sale Price mismatch: Catalog has $8.8, Live has $2.64; Unit mismatch: Catalog has "kg", Live has "g"; Unit Quantity mismatch: Catalog has 1, Live has 300 |
| Spinach -Costco | foodbasics | ✅ MATCH | Reg: $5.98 | Reg: $5.98 | g (312) | g (312) | Yes | None |
| Spinach -Costco | metro | ✅ MATCH | Reg: $6.99 | Reg: $6.99 | g (312) | g (312) | Yes | None |
| Spaghetti pasta | foodbasics | ✅ MATCH | Reg: $2.49 | Reg: $2.49 | g (900) | g (900) | Yes | None |
| Spaghetti pasta | metro | ✅ MATCH | Reg: $2.99 | Reg: $2.99 | g (900) | g (900) | Yes | None |
| Crushed Canned Tomatoes | foodbasics | ✅ MATCH | Reg: $1.99 | Reg: $1.99 | ml (796) | ml (796) | Yes | None |
| Crushed Canned Tomatoes | freshco | ✅ MATCH | Reg: $2.69 | Reg: $2.69 | ml (796) | ml (796) | Yes | None |
| Crushed Canned Tomatoes | metro | ✅ MATCH | Reg: $1.99 | Reg: $1.99 | ml (796) | ml (796) | Yes | None |
| Lemons | foodbasics | ✅ MATCH | Sale: $4.99 (Reg: $5.99) | Sale: $4.99 (Reg: $5.99) | lb (2) | lb (2) | Yes | None |
| Lemons | metro | ✅ MATCH | Sale: $3.99 (Reg: $5.99) | Sale: $3.99 (Reg: $5.99) | lb (2) | lb (2) | Yes | None |
| Zucchini | foodbasics | ✅ MATCH | Sale: $4.39 (Reg: $6.57) | Sale: $4.39 (Reg: $6.57) | kg (1) | kg (1) | Yes | None |
| Zucchini | freshco | ✅ MATCH | Reg: $5.45 | Reg: $5.45 | kg (1) | kg (1) | Yes | None |
| Zucchini | metro | ✅ MATCH | Sale: $5.49 (Reg: $6.59) | Sale: $5.49 (Reg: $6.59) | kg (1) | kg (1) | Yes | None |
| Baguette | freshco | ✅ MATCH | Reg: $1 | Reg: $1 | g (235) | g (235) | Yes | None |
| Burger buns | foodbasics | ✅ MATCH | Reg: $2.99 | Reg: $2.99 | unit (8) | unit (8) | Yes | None |
| Burger buns | metro | ✅ MATCH | Reg: $4.49 | Reg: $4.49 | unit (8) | unit (8) | Yes | None |
| Sausage buns cut on top | foodbasics | ✅ MATCH | Sale: $2.67 (Reg: $4.19) | Sale: $2.67 (Reg: $4.19) | unit (6) | unit (6) | Yes | None |
| Sausage buns cut on top | metro | ⚠️ MISMATCH | Reg: $4.29 | Reg: $4.29 | unit (6) | -- (6) | Yes | Unit mismatch: Catalog has "unit", Live has "--" |
| Pizza sauce - GS | foodbasics | ✅ MATCH | Reg: $1.69 | Reg: $1.69 | ml (213) | ml (213) | Yes | None |
| Pizza sauce - GS | metro | ✅ MATCH | Reg: $1.99 | Reg: $1.99 | ml (213) | ml (213) | Yes | None |
| No Salt Added Canned Diced Tomatoes | foodbasics | ✅ MATCH | Reg: $1.99 | Reg: $1.99 | ml (398) | ml (398) | Yes | None |
| No Salt Added Canned Diced Tomatoes | freshco | ⚠️ MISMATCH | Reg: $2 | Reg: $2 | ml (398) | ml (796) | Yes | Unit Quantity mismatch: Catalog has 398, Live has 796 |
| No Salt Added Canned Diced Tomatoes | metro | ✅ MATCH | Reg: $1.99 | Reg: $1.99 | ml (398) | ml (398) | Yes | None |
| Tomato paste 156ml | freshco | ✅ MATCH | Reg: $1.49 | Reg: $1.49 | ml (156) | ml (156) | Yes | None |
| Tomato paste 156ml | foodbasics | ✅ MATCH | Reg: $1.29 | Reg: $1.29 | ml (156) | ml (156) | Yes | None |
| Tomato paste 156ml | metro | ✅ MATCH | Reg: $1.29 | Reg: $1.29 | ml (156) | ml (156) | Yes | None |
| Decaf coffee - Nescafé | metro | ✅ MATCH | Reg: $10.79 | Reg: $10.79 | g (90) | g (90) | Yes | None |
| Deodorant for men | foodbasics | ✅ MATCH | Reg: $4.99 | Reg: $4.99 | g (85) | g (85) | Yes | None |
| Deodorant for men | metro | ✅ MATCH | Reg: $5.49 | Reg: $5.49 | g (85) | g (85) | Yes | None |
| Toothpaste | metro | ✅ MATCH | Sale: $3.49 (Reg: $3.99) | Sale: $3.49 (Reg: $3.99) | ml (70) | ml (70) | Yes | None |
| Toothpaste | foodbasics | ✅ MATCH | Sale: $1.99 (Reg: $2.49) | Sale: $1.99 (Reg: $2.49) | ml (70) | ml (70) | Yes | None |
| Garbage bags 34l clear | canadiantireperth | ❌ ERROR | Reg: $12.99 | Reg: $-- | l (35) | -- (--) | Yes | Error: Screenshot file missing: regular-1779915020671-363-ac84d_canadiantireperth.png |
| Flour | foodbasics | ✅ MATCH | Sale: $5.49 (Reg: $5.99) | Sale: $5.49 (Reg: $5.99) | kg (2.5) | kg (2.5) | Yes | None |
| Flour | freshco | ✅ MATCH | Reg: $6.29 | Reg: $6.29 | kg (2.5) | kg (2.5) | Yes | None |
| Flour | metro | ✅ MATCH | Reg: $7.49 | Reg: $7.49 | kg (2.5) | kg (2.5) | Yes | None |
| Paper plates - large | foodbasics | ✅ MATCH | Sale: $7.99 (Reg: $8.99) | Sale: $7.99 (Reg: $8.99) | unit (40) | unit (40) | Yes | None |
| Paper plates - large | metro | ✅ MATCH | Reg: $10.99 | Reg: $10.99 | unit (40) | unit (40) | Yes | None |
| Paper plates - small | foodbasics | ✅ MATCH | Sale: $4.99 (Reg: $5.99) | Sale: $4.99 (Reg: $5.99) | unit (40) | unit (40) | Yes | None |
| Paper plates - small | metro | ✅ MATCH | Reg: $10.99 | Reg: $10.99 | unit (40) | unit (40) | Yes | None |
| 2-ply paper towels - 3-pack | walmart | ✅ MATCH | Sale: $6.96 (Reg: $7.46) | Sale: $6.96 (Reg: $7.46) | roll (3) | roll (3) | Yes | None |
| 2-ply paper towels - 3-pack | foodbasics | ⚠️ MISMATCH | Sale: $7.99 (Reg: $10.99) | Sale: $7.99 (Reg: $10.99) | roll (3) | unit (3) | Yes | Unit mismatch: Catalog has "roll", Live has "unit" |
| 2-ply paper towels - 3-pack | metro | ⚠️ MISMATCH | Sale: $8.99 (Reg: $11.99) | Sale: $8.99 (Reg: $11.99) | roll (3) | unit (3) | Yes | Unit mismatch: Catalog has "roll", Live has "unit" |
| 2-ply paper towels - 3-pack | freshco | ⚠️ MISMATCH | Sale: $6.99 (Reg: $10.99) | Sale: $6.99 (Reg: $10.99) | roll (3) | unit (3) | Yes | Unit mismatch: Catalog has "roll", Live has "unit" |
| Natrel 2% Lactose-Free Milk | freshco | ✅ MATCH | Reg: $6.49 | Reg: $6.49 | l (2) | l (2) | Yes | None |
| Natrel 2% Lactose-Free Milk | foodbasics | ✅ MATCH | Reg: $6.99 | Reg: $6.99 | l (2) | l (2) | Yes | None |
| Lactancia 1% Lactose Free Milk | foodbasics | ✅ MATCH | Sale: $5.99 (Reg: $6.69) | Sale: $5.99 (Reg: $6.69) | l (2) | l (2) | Yes | None |
| Lactancia 1% Lactose Free Milk | metro | ✅ MATCH | Sale: $6.49 (Reg: $6.79) | Sale: $6.49 (Reg: $6.79) | l (2) | l (2) | Yes | None |
| Boneless Chicken Breasts | foodbasics | ⚠️ MISMATCH | Reg: $17.61 | Reg: $10.74 | count (4) | g (610) | Yes | Regular Price mismatch: Catalog has $17.61, Live has $10.74; Unit mismatch: Catalog has "count", Live has "g"; Unit Quantity mismatch: Catalog has 4, Live has 610 |
| Boneless Chicken Breasts | freshco | ✅ MATCH | Reg: $14 | Reg: $14 | count (4) | count (4) | Yes | None |
| Boneless Chicken Breasts | metro | ❌ ERROR | Reg: $-- | Reg: $-- | count (4) | -- (--) | Yes | Error: Screenshot file missing: regular-1780000536215-5uz0s_metro.png |
| Lactancia 2% Lactose Free Milk | foodbasics | ✅ MATCH | Sale: $5.99 (Reg: $6.69) | Sale: $5.99 (Reg: $6.69) | l (2) | l (2) | Yes | None |
| Lactancia 2% Lactose Free Milk | metro | ✅ MATCH | Sale: $6.49 (Reg: $6.79) | Sale: $6.49 (Reg: $6.79) | l (2) | l (2) | Yes | None |
| 2% lactose free cottage cheese | foodbasics | ✅ MATCH | Reg: $5.49 | Reg: $5.49 | g (450) | g (450) | Yes | None |
| 2% lactose free cottage cheese | freshco | ✅ MATCH | Reg: $5.29 | Reg: $5.29 | g (450) | g (450) | Yes | None |
| 2% lactose free cottage cheese | metro | ✅ MATCH | Reg: $5.99 | Reg: $5.99 | g (450) | g (450) | Yes | None |
| Decaf coffee | foodbasics | ✅ MATCH | Reg: $7.99 | Reg: $7.99 | g (100) | g (100) | Yes | None |
| Decaf coffee | metro | ✅ MATCH | Reg: $10.29 | Reg: $10.29 | g (100) | g (100) | Yes | None |
| Coke Zero caffeine free 12-pack | foodbasics | ✅ MATCH | Reg: $8.49 | Reg: $8.49 | ml (4260) | ml (4260) | Yes | None |
| Coke Zero caffeine free 12-pack | metro | ✅ MATCH | Sale: $7.49 (Reg: $9.49) | Sale: $7.49 (Reg: $9.49) | ml (4260) | ml (4260) | Yes | None |
| Ginger ale 12-pack | foodbasics | ✅ MATCH | Reg: $8.49 | Reg: $8.49 | ml (4260) | ml (4260) | Yes | None |
| Ginger ale 12-pack | metro | ✅ MATCH | Sale: $7.49 (Reg: $9.49) | Sale: $7.49 (Reg: $9.49) | ml (4260) | ml (4260) | Yes | None |
| Whole wheat english muffins | metro | ✅ MATCH | Reg: $3.49 | Reg: $3.49 | g (342) | g (342) | Yes | None |
| Whole wheat english muffins | freshco | ✅ MATCH | Reg: $2.29 | Reg: $2.29 | g (342) | g (342) | Yes | None |
| Beer - Corona Alcohol free | foodbasics | ✅ MATCH | Sale: $21.49 (Reg: $23.99) | Sale: $21.49 (Reg: $23.99) | ml (4260) | ml (4260) | Yes | None |
| Beer - Corona Alcohol free | freshco | ✅ MATCH | Reg: $21.99 | Reg: $21.99 | ml (4260) | ml (4260) | Yes | None |
| Beer - Corona Alcohol free | metro | ✅ MATCH | Reg: $24.99 | Reg: $24.99 | ml (4260) | ml (4260) | Yes | None |
| Lactose free plain yogurt | foodbasics | ✅ MATCH | Reg: $3.27 | Reg: $3.27 | g (750) | g (750) | Yes | None |
| Lactose free plain yogurt | freshco | ✅ MATCH | Sale: $3.29 (Reg: $3.69) | Sale: $3.29 (Reg: $3.69) | g (750) | g (750) | Yes | None |
| Lactose free plain yogurt | metro | ✅ MATCH | Sale: $3.49 (Reg: $4.49) | Sale: $3.49 (Reg: $4.49) | g (750) | g (750) | Yes | None |
| English Cucumber | foodbasics | ✅ MATCH | Sale: $0.99 (Reg: $1.99) | Sale: $0.99 (Reg: $1.99) | unit (1) | unit (1) | Yes | None |
| English Cucumber | freshco | ✅ MATCH | Reg: $1.47 | Reg: $1.47 | unit (1) | count (1) | Yes | None |
| English Cucumber | metro | ✅ MATCH | Sale: $1.99 (Reg: $2.99) | Sale: $1.99 (Reg: $2.99) | unit (1) | unit (1) | Yes | None |
| Cheetos Crunchy Flamin Hot Cheese Snacks | foodbasics | ✅ MATCH | Sale: $3.5 (Reg: $4.69) | Sale: $3.5 (Reg: $4.69) | g (285) | g (285) | Yes | None |
| Cheetos Crunchy Flamin Hot Cheese Snacks | metro | ⚠️ MISMATCH | Sale: $4.5 (Reg: $4.5) | Sale: $3.49 (Reg: $5.49) | g (285) | g (285) | No | Regular Price mismatch: Catalog has $4.5, Live has $5.49; Sale Price mismatch: Catalog has $4.5, Live has $3.49; Validity Date mismatch: Catalog has "2026-07-01", Live has "2026-07-08" |
| Pizza Cheese | foodbasics | ❌ ERROR | Sale: $4.99 (Reg: $5.99) | Reg: $-- | g (400) | -- (--) | Yes | Error: Screenshot file missing: regular-unmatched-1782220337218-jg4wg_foodbasics.png |
| Pizza Cheese | metro | ❌ ERROR | Reg: $-- | Reg: $-- | g (400) | -- (--) | Yes | Error: Screenshot file missing: regular-unmatched-1782220337218-jg4wg_metro.png |
| Cheese | foodbasics | ❌ ERROR | Sale: $4.99 (Reg: $5.99) | Reg: $-- | g (400) | -- (--) | Yes | Error: Screenshot file missing: regular-unmatched-1782220359076-8t1sd_foodbasics.png |
| Cheese | metro | ❌ ERROR | Reg: $-- | Reg: $-- | g (400) | -- (--) | Yes | Error: Screenshot file missing: regular-unmatched-1782220359076-8t1sd_metro.png |
| Striploin Beef Steak | foodbasics | ⚠️ MISMATCH | Sale: $13.99 (Reg: $22.99) | Reg: $44.75 | lb (1) | g (883) | No | Regular Price mismatch: Catalog has $22.99, Live has $44.75; Sale Price mismatch: Catalog has $13.99, Live has $--; Validity Date mismatch: Catalog has "2026-07-01", Live has "--"; Unit mismatch: Catalog has "lb", Live has "g"; Unit Quantity mismatch: Catalog has 1, Live has 883 |
| Striploin Beef Steak | metro | ❌ ERROR | Reg: $-- | Reg: $-- | lb (1) | -- (--) | Yes | Error: Screenshot file missing: regular-unmatched-1782379485486-dnh8a_metro.png |
| Light Caesar Salad Dressing | foodbasics | ⚠️ MISMATCH | Sale: $4.99 (Reg: $5.88) | Reg: $5.88 | ml (355) | ml (355) | Yes | Sale Price mismatch: Catalog has $4.99, Live has $-- |
| Light Caesar Salad Dressing | metro | ✅ MATCH | Reg: $6.99 | Reg: $6.99 | ml (355) | ml (355) | Yes | None |
| Bavarian Multigrain Bread | foodbasics | ⚠️ MISMATCH | Sale: $2.99 (Reg: $3.99) | Reg: $3.99 | g (500) | g (500) | Yes | Sale Price mismatch: Catalog has $2.99, Live has $-- |
| Bavarian Multigrain Bread | freshco | ✅ MATCH | Reg: $3.99 | Reg: $3.99 | g (500) | g (500) | Yes | None |
| Bavarian Multigrain Bread | metro | ✅ MATCH | Reg: $4.29 | Reg: $4.29 | g (500) | g (500) | Yes | None |
| 35% Whipping Cream | foodbasics | ⚠️ MISMATCH | Sale: $3.99 (Reg: $5.09) | Sale: $3.49 (Reg: $4.99) | ml (473) | ml (473) | No | Regular Price mismatch: Catalog has $5.09, Live has $4.99; Sale Price mismatch: Catalog has $3.99, Live has $3.49; Validity Date mismatch: Catalog has "2026-07-01", Live has "2026-07-08" |
| 35% Whipping Cream | metro | ✅ MATCH | Reg: $5.29 | Reg: $5.29 | ml (473) | ml (473) | Yes | None |
| Classic Potato Chips | foodbasics | ⚠️ MISMATCH | Sale: $2.88 (Reg: $3.99) | Reg: $3.99 | g (235) | g (235) | Yes | Sale Price mismatch: Catalog has $2.88, Live has $-- |
| Classic Potato Chips | metro | ⚠️ MISMATCH | Sale: $2.99 (Reg: $5.29) | Sale: $3.99 (Reg: $5.29) | g (235) | g (235) | No | Sale Price mismatch: Catalog has $2.99, Live has $3.99; Validity Date mismatch: Catalog has "2026-07-01", Live has "2026-07-29" |
| Wooden Compostable Cutlery Selection Eco | foodbasics | ⚠️ MISMATCH | Reg: $9.99 | Reg: $9.99 | g (400) | unit (150) | Yes | Unit mismatch: Catalog has "g", Live has "unit"; Unit Quantity mismatch: Catalog has 400, Live has 150 |
| Wooden Compostable Cutlery Selection Eco | metro | ⚠️ MISMATCH | Sale: $5.49 (Reg: $6.99) | Reg: $1 | g (400) | -- (100) | No | Regular Price mismatch: Catalog has $6.99, Live has $1; Sale Price mismatch: Catalog has $5.49, Live has $--; Validity Date mismatch: Catalog has "2026-06-24", Live has "--"; Unit mismatch: Catalog has "g", Live has "--"; Unit Quantity mismatch: Catalog has 400, Live has 100 |
| Original Flavour Garden Veggie Straws Sensible Portions | foodbasics | ⚠️ MISMATCH | Sale: $2.99 (Reg: $3.49) | Sale: $2.99 (Reg: $3.49) | g (142) | g (142) | No | Validity Date mismatch: Catalog has "2026-07-01", Live has "2026-07-08" |
| Original Flavour Garden Veggie Straws Sensible Portions | metro | ✅ MATCH | Reg: $3.49 | Reg: $3.49 | g (142) | g (142) | Yes | None |
| 1% Chocolate Milk | foodbasics | ⚠️ MISMATCH | Sale: $2.49 (Reg: $3.9) | Sale: $1.99 (Reg: $3.19) | l (1) | l (1) | No | Regular Price mismatch: Catalog has $3.9, Live has $3.19; Sale Price mismatch: Catalog has $2.49, Live has $1.99; Flyer status mismatch: Catalog has NO, Live has YES; Validity Date mismatch: Catalog has "2026-07-01", Live has "2026-07-08" |
| 1% Chocolate Milk | metro | ⚠️ MISMATCH | Sale: $2.99 (Reg: $3.99) | Sale: $2.49 (Reg: $3.99) | l (1) | l (1) | No | Sale Price mismatch: Catalog has $2.99, Live has $2.49; Validity Date mismatch: Catalog has "2026-06-30", Live has "2026-07-29" |
| White Mushrooms | foodbasics | ⚠️ MISMATCH | Sale: $3.99 (Reg: $4.99) | Reg: $4.99 | g (454) | g (454) | No | Sale Price mismatch: Catalog has $3.99, Live has $--; Validity Date mismatch: Catalog has "2026-07-01", Live has "--" |
| White Mushrooms | metro | ✅ MATCH | Reg: $5.49 | Reg: $5.49 | g (454) | g (454) | Yes | None |
| Portobellini Mushrooms | foodbasics | ✅ MATCH | Reg: $5.99 | Reg: $5.99 | g (334) | g (334) | Yes | None |
| Portobellini Mushrooms | metro | ⚠️ MISMATCH | Reg: $-- | Reg: $9 | g (334) | g (334) | Yes | Regular Price mismatch: Catalog has $--, Live has $9 |
| Honeycrisp Apples | foodbasics | ⚠️ MISMATCH | Reg: $3.98 | Reg: $1.4 | g (160) | unit (1) | Yes | Regular Price mismatch: Catalog has $3.98, Live has $1.4; Unit mismatch: Catalog has "g", Live has "unit"; Unit Quantity mismatch: Catalog has 160, Live has 1 |
| Honeycrisp Apples | metro | ⚠️ MISMATCH | Reg: $1.41 | Reg: $1.41 | g (160) | unit (1) | Yes | Unit mismatch: Catalog has "g", Live has "unit"; Unit Quantity mismatch: Catalog has 160, Live has 1 |
| Quick Oats | foodbasics | ✅ MATCH | Reg: $2.88 | Reg: $2.88 | kg (1) | kg (1) | Yes | None |
| Quick Oats | metro | ✅ MATCH | Reg: $2.99 | Reg: $2.99 | kg (1) | kg (1) | Yes | None |
| RV Toilet Treatment Drop-Ins | canadiantireperth | ❌ ERROR | Sale: $31.49 (Reg: $34.99) | Reg: $-- | unit (1) | -- (--) | No | Error: Screenshot file missing: regular-unmatched-1782496542417-mmhs5_canadiantireperth.png |
| Fibreglass Screen | canadiantireperth | ❌ ERROR | Sale: $23.93 (Reg: $34.99) | Reg: $-- | unit (1) | -- (--) | Yes | Error: Screenshot file missing: regular-unmatched-1782831648409-2chga_canadiantireperth.png |
