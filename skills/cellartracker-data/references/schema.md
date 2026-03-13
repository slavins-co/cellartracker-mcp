# CellarTracker Export Schema Reference

Complete column definitions for all 8 CT export tables. Generated from live export on 2026-03-13.

## Join Key

`iWine` (integer) — Universal wine identifier across all tables. Use this to cross-reference between tables.

---

## Table: List (Current Cellar Inventory)

The primary inventory table. Each row = one wine in the cellar (may have Quantity > 1).

### Identity & Classification
| Column | Type | Description |
|---|---|---|
| iWine | int | Unique wine ID (join key) |
| WineBarcode | str | CT barcode format `W{iWine}_{size}` |
| Vintage | int | Vintage year; `1001` = non-vintage |
| Wine | str | Full wine name |
| Locale | str | Full geographic path (e.g., "France, Burgundy, Cote de Nuits, Vosne-Romanee") |
| Country | str | Country |
| Region | str | Region (e.g., "Burgundy", "California") |
| SubRegion | str | Sub-region (e.g., "Cote de Nuits", "Sonoma Coast") |
| Appellation | str | Appellation (e.g., "Vosne-Romanee", "Barolo") |
| Producer | str | Producer name |
| SortProducer | str | Inverted sort name (e.g., "Besson, Domaine Adrien") |
| Type | str | Wine type (e.g., "Red", "White", "White - Sparkling") |
| Color | str | Color (e.g., "Red", "White", "Rose") |
| Category | str | Category (e.g., "Dry", "Sparkling", "Sweet/Dessert") |
| Varietal | str | Specific varietal(s) |
| MasterVarietal | str | Master varietal grouping (e.g., "Pinot Noir", "Champagne Blend") |
| Designation | str | Special designation (e.g., "Brut Grande Reserve", "Fossati") |
| Vineyard | str | Vineyard name if applicable |

### Inventory & Storage
| Column | Type | Description |
|---|---|---|
| Quantity | int | Number of bottles |
| Pending | int | Bottles ordered but not delivered |
| Location | str | Physical storage location (Wine Fridge, Bar Cabinet, Rack, Boxed) |
| Bin | str | Specific position (e.g., "1-3" for fridge row-slot, "Drawer 2", "Shelf Rack") |
| Size | str | Bottle format (e.g., "750ml", "375ml", "1500ml") |

### Pricing & Valuation
| Column | Type | Description |
|---|---|---|
| Price | float | Purchase price per bottle (USD). `0` = gift or unknown |
| Valuation | float | Current estimated value (CT algorithm) |
| MyValue | float | User-set value override |
| WBValue | float | WineBid value estimate |
| CTValue | float | CellarTracker value estimate |
| MenuPrice | float | Restaurant menu price if applicable |
| Currency | str | Always "USD" for this account |

### Drinking Window
| Column | Type | Description |
|---|---|---|
| BeginConsume | int | Start of drinking window (year) |
| EndConsume | int | End of drinking window (year) |

### Professional Scores
All score columns are float. Empty string = no score.

| Column | Reviewer |
|---|---|
| WA | Wine Advocate |
| WS | Wine Spectator |
| IWC | International Wine Cellar (Tanzer) |
| BH | Burghound (Allen Meadows) |
| AG | Antonio Galloni / Vinous |
| WE | Wine Enthusiast |
| JR | Jancis Robinson |
| RH | Richard Hemming |
| JG | John Gilman (View from the Cellar) |
| GV | Galloni's Vinous |
| JK | JK (James Kissick / Kissack) |
| LD | Le Du |
| CW | CellarWatch |
| WFW | Wine for the World |
| PR | Purple Pages / PurplePages |
| SJ | Seckford Wines / Stephen Tanzer |
| WD | Wine Dogs |
| RR | Robert Reeves |
| JH | James Halliday |
| MFW | My Favorite Wines |
| WWR | Wine & Whiskey Review |
| IWR | Italian Wine Review |
| CHG | Christy Heintz / Huon Hooke |
| TT | Tom Talbot |
| TWF | The Wine Front |
| DR | Decanter / Decanter Review |
| FP | Falstaff / Fine Palate |
| JM | Jeb Dunnuck / Jeff Myers |
| PG | Pinotgrigio.wine |
| WAL | Wineanorak (Jamie Goode) |
| JS | James Suckling |
| CT | CellarTracker community average |
| MY | User's personal score |

### Other
| Column | Type | Description |
|---|---|---|
| UPC | str | Universal Product Code / barcode |

---

## Table: Notes (Tasting Notes)

User tasting notes and community context.

| Column | Type | Description |
|---|---|---|
| iNote | int | Unique note ID |
| iWine | int | Wine ID (join key) |
| Type | str | Wine type |
| iUser | int | User ID |
| Vintage | int | Vintage |
| Wine | str | Full wine name |
| SortWine | str | Sort-formatted name |
| Locale | str | Full locale path |
| Producer | str | Producer |
| Varietal | str | Varietal |
| MasterVarietal | str | Master varietal |
| Designation | str | Designation |
| Vineyard | str | Vineyard |
| Country / Region / SubRegion / Appellation | str | Geography |
| Color | str | Color |
| TastingDate | str | Date tasted (M/D/YYYY format) |
| Defective | str | "True" / "False" — was the bottle flawed? |
| fAllowComments | str | Whether comments are enabled |
| Views | int | Number of views on CT |
| Name | str | CT username |
| fHelpful | str | Marked helpful flag |
| fFavorite | str | Marked favorite flag |
| Rating | int | User's numeric rating (0-100 scale) |
| EventLocation | str | Where tasted (if at event) |
| EventTitle | str | Event name |
| iEvent | int | Event ID |
| EventDate / EventEndDate | str | Event dates |
| TastingNotes | str | Free-text tasting notes (may be empty) |
| fLikeIt | str | "True" / "False" — thumbs up? |
| CNotes | int | Count of community notes for this wine |
| CScore | float | Community average score |
| LikeVotes / LikePercent | int/float | Community engagement |
| Votes / Comments | int | Community interaction |
| cLabels | int | Label count |

---

## Table: Purchase (Purchase History)

Every purchase ever made, including gifts.

| Column | Type | Description |
|---|---|---|
| iWine | int | Wine ID (join key) |
| iPurchase | int | Unique purchase ID |
| PurchaseDate | str | Purchase date (M/D/YYYY) |
| DeliveryDate | str | Delivery date |
| StoreName | str | Retailer / source (e.g., "LastBottle", "Wine.com", "Unknown") |
| Currency | str | Currency code |
| ExchangeRate | float | Exchange rate to USD |
| Price | float | Price per bottle. `0` = gift or unknown |
| NativePrice | float | Price in native currency |
| NativePriceCurrency | str | Native currency code |
| Quantity | int | Bottles purchased |
| Remaining | int | Bottles still in cellar from this purchase |
| OrderNumber | str | Order number or note (e.g., "Gift from Liz") |
| Delivered | str | "True" / "False" |
| Size / SortSize | str/int | Bottle format |
| Vintage | int | Vintage |
| Wine / SortWine | str | Wine name |
| Locale | str | Geographic path |
| Type / Color / Category | str | Classification |
| Producer | str | Producer |
| Varietal / MasterVarietal | str | Grape |
| Designation / Vineyard | str | Specifics |
| Country / Region / SubRegion / Appellation | str | Geography |
| cLabels | int | Label count |

---

## Table: Consumed (Consumption Log)

Every bottle opened/consumed.

| Column | Type | Description |
|---|---|---|
| iConsumed | int | Unique consumption ID |
| iWine | int | Wine ID (join key) |
| Type | str | Wine type |
| Consumed | str | Consumption date (M/D/YYYY) |
| ConsumedYear / ConsumedQuarter / ConsumedMonth / ConsumedDay / ConsumedWeekday | various | Parsed date components |
| Size / SortSize | str/int | Bottle format |
| ShortType | str | How consumed: "Drank", "Drank family", "Gave away", "Traded" |
| Currency / ExchangeRate | str/float | Currency info |
| Value | float | Estimated value at consumption |
| Price | float | Original purchase price |
| NativePrice / NativePriceCurrency | float/str | Native currency |
| MenuPrice | float | Menu price if at restaurant |
| cNotes | int | Number of notes |
| iNote | int | Linked note ID (join to Notes table) |
| cLabels | int | Label count |
| ConsumptionNote | str | Free-text note about the occasion (e.g., "Drank with friends, casual dinner") |
| PurchaseNote | str | Note from original purchase |
| BottleNote | str | Note on the specific bottle |
| Location / Bin | str | Where it was stored before opening |
| Vintage | int | Vintage |
| Wine / SortWine | str | Wine name |
| Locale | str | Geographic path |
| Color / Category | str | Classification |
| Varietal / MasterVarietal | str | Grape |
| Designation / Vineyard | str | Specifics |
| Country / Region / SubRegion / Appellation | str | Geography |

---

## Table: Availability (Maturity & Professional Scores)

The richest scoring and maturity data. One row per wine in inventory.

### Maturity Curve Fields
| Column | Type | Description |
|---|---|---|
| Available | float | Overall maturity percentage. <1 = before peak, ~1 = at peak, >1 = past peak |
| Linear | float | Linear maturity model |
| Bell | float | Bell curve maturity model |
| Early | float | Early-drinking model |
| Late | float | Late-drinking model |
| Fast | float | Fast-maturing model |
| TwinPeak | float | Two-peak maturity model |
| Simple | float | Simple maturity model |

### Inventory Counts
| Column | Type | Description |
|---|---|---|
| Purchases / ActualPurchases | int | Total purchased |
| Pending / ActualPending | int | Pending delivery |
| Consumed / ActualConsumed | int | Total consumed |
| Inventory / ActualInventory | int | Current inventory |
| LocalQuantityActual / LocalQuantity | int | Local quantity |

### Drinking Windows (Multiple Sources)
Each professional source provides its own begin/end window:
- `PersonalBegin` / `PersonalEnd` — User's personal window
- `WABegin` / `WAEnd` — Wine Advocate window
- `WSBegin` / `WSEnd` — Wine Spectator window
- `ComBegin` / `ComEnd` — Community consensus window
- (etc. for each reviewer — see full pattern: `{Code}Begin` / `{Code}End`)

### Consensus Window
| Column | Type | Description |
|---|---|---|
| BeginConsume | str | Consensus start (date: M/D/YYYY or year) |
| EndConsume | str | Consensus end (date: M/D/YYYY or year) |
| Source | str | Where consensus window comes from: "Personal", "Community", or reviewer name |

### Professional Scores (Extended)
Each reviewer has three columns:
- `{Code}` — The score itself (float)
- `{Code}Web` — URL to the review
- `{Code}Sort` — Numeric sort value

Plus personal and community:
- `PNotes` / `PScore` / `PScoreSort` — User's personal notes count and score
- `CNotes` / `CScore` / `CScoreSort` — Community notes count and score

---

## Table: Tag (Wishlists & Custom Lists)

| Column | Type | Description |
|---|---|---|
| ListName | str | List name (e.g., "*Wishlist") |
| ListNotes | str | Notes about the list |
| Private | str | "True" / "False" |
| WinesNotes | str | Why this wine is on the list (e.g., "Reddit QPR white burgundy", "BP Rec") |
| MaxPrice / MaxPriceCurrency | float/str | Price limit for list |
| Size | str | Bottle format |
| Vintage | int | Vintage |
| Wine / SortWine | str | Wine name |
| Locale | str | Geographic path |
| iWine | int | Wine ID (join key) |
| Type / Color / Category | str | Classification |
| Producer / SortProducer | str | Producer |
| Varietal / MasterVarietal | str | Grape |
| Designation / Vineyard | str | Specifics |
| Country / Region / SubRegion / Appellation | str | Geography |
| UPCCode | str | Barcode |

---

## Table: Bottles (Individual Bottle Records)

Granular per-bottle view combining cellar + consumed. More rows than List because it includes consumed bottles.

| Column | Type | Description |
|---|---|---|
| BottleState | int | 0 = consumed, 1 = in cellar |
| Barcode | str | Bottle barcode |
| iWine | int | Wine ID (join key) |
| Vintage | int | Vintage |
| Wine | str | Wine name |
| Locale | str | Geographic path |
| Country / Region / SubRegion / Appellation | str | Geography |
| Producer / SortProducer | str | Producer |
| Type | str | Wine type |
| Varietal / MasterVarietal | str | Grape |
| Designation / Vineyard | str | Specifics |
| Quantity | int | Quantity (usually 1 at bottle level) |
| BottleSize | str | Format (e.g., "750ml") |
| Location | str | Storage location |
| Bin | str | Specific position |
| Store | str | Where purchased |
| PurchaseDate | str | Purchase date |
| DeliveryDate | str | Delivery date |
| BottleCost / BottleCostCurrency | float/str | Cost per bottle |
| BottleNote | str | Note on specific bottle |
| PurchaseNote | str | Purchase note |
| ConsumptionDate | str | When consumed (empty if still in cellar) |
| ConsumptionType | str | Full type (e.g., "Drank from my cellar") |
| ShortType | str | Short type (e.g., "Drank") |
| ConsumptionNote | str | Note about drinking occasion |
| ConsumptionRevenue / ConsumptionRevenueCurrency | float/str | Revenue if sold |
| BeginConsume / EndConsume | int | Drinking window years |

---

## Table: Pending (In-Transit Orders)

Same schema as Purchase table. Only populated when bottles are ordered but not yet delivered. Empty (header-only) when nothing is in transit.

---

## Notes on Data Quality

- **Price = 0**: Means gift, unknown, or not recorded — not free wine
- **Vintage = 1001**: Non-vintage (Champagne, fortified, etc.)
- **Empty strings**: Mean no data, not zero. Check with `if row.get('WA', ''):`
- **CT scores are often long decimals**: e.g., `88.7777777777778` — always round for display
- **Locale hierarchy**: Country > Region > SubRegion > Appellation. Not all levels always populated.
- **HTML entities in notes**: ConsumptionNote may contain HTML entities (e.g., `&#65532;`) — ignore or strip
