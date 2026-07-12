import { describe, it, expect, vi, afterEach } from "vitest";
import {
  aggregate,
  parseCsv,
  search,
  foldDiacritics,
  toIsoDate,
  drinkingPriority,
  spendSummary,
  deliverySummary,
  vintageLabel,
  type Row,
} from "../query.js";

// ---------------------------------------------------------------------------
// parseCsv  (exercises parseCsvLine indirectly)
// ---------------------------------------------------------------------------
describe("parseCsv", () => {
  it("parses basic CSV with headers and rows", () => {
    const csv = "Name,Vintage,Color\nChateau Margaux,2015,Red\nSancerre,2020,White";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Name: "Chateau Margaux", Vintage: "2015", Color: "Red" });
    expect(rows[1]).toEqual({ Name: "Sancerre", Vintage: "2020", Color: "White" });
  });

  it("handles quoted fields with embedded commas", () => {
    const csv = 'Wine,Region\n"Penfolds, Grange",Barossa Valley';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Wine).toBe("Penfolds, Grange");
    expect(rows[0].Region).toBe("Barossa Valley");
  });

  it("handles escaped quotes (doubled quotes inside quoted fields)", () => {
    const csv = 'Name,Note\n"The ""Grand"" Cuvée",Great wine';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe('The "Grand" Cuvée');
    expect(rows[0].Note).toBe("Great wine");
  });

  it("handles empty fields", () => {
    const csv = "A,B,C\n,middle,\nfirst,,last";
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ A: "", B: "middle", C: "" });
    expect(rows[1]).toEqual({ A: "first", B: "", C: "last" });
  });

  it("handles trailing commas (extra empty field)", () => {
    const csv = "A,B\nfoo,bar,";
    const rows = parseCsv(csv);
    // Extra value beyond headers is ignored; mapped by header index
    expect(rows[0]).toEqual({ A: "foo", B: "bar" });
  });

  it("returns empty array for header-only CSV", () => {
    const csv = "Name,Vintage,Color";
    const rows = parseCsv(csv);
    expect(rows).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("   \n  \n  ")).toEqual([]);
  });

  it("fills missing values with empty string when row has fewer fields than headers", () => {
    const csv = "A,B,C\nonly_one";
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual({ A: "only_one", B: "", C: "" });
  });

  it("handles mid-field quotes in unquoted fields (relaxed quoting)", () => {
    const csv = 'Wine,Region\nO"Brien\'s Vineyard,Napa Valley';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].Wine).toContain("Brien");
    expect(rows[0].Region).toBe("Napa Valley");
  });

  it("handles a mix of quoted and unquoted fields", () => {
    const csv = 'Wine,Price,Notes\n"Opus One",350,"Rich, bold, complex"';
    const rows = parseCsv(csv);
    expect(rows[0].Wine).toBe("Opus One");
    expect(rows[0].Price).toBe("350");
    expect(rows[0].Notes).toBe("Rich, bold, complex");
  });
});

// ---------------------------------------------------------------------------
// foldDiacritics
// ---------------------------------------------------------------------------
describe("foldDiacritics", () => {
  it("strips combining marks and lowercases", () => {
    expect(foldDiacritics("Rhône")).toBe("rhone");
    expect(foldDiacritics("Côte")).toBe("cote");
    expect(foldDiacritics("Grüner")).toBe("gruner");
  });

  it("leaves plain ASCII behavior equivalent to lowercasing", () => {
    expect(foldDiacritics("RHONE")).toBe("rhone");
    expect(foldDiacritics("Chateauneuf")).toBe("chateauneuf");
  });

  it("folds German ß to ss (no NFD decomposition)", () => {
    expect(foldDiacritics("Faß")).toBe("fass");
    // Combines an NFD umlaut fold (ä→a) with the ß→ss substitution
    expect(foldDiacritics("Großes Gewächs")).toBe("grosses gewachs");
  });

  it("folds European ligatures æ/œ/ø, including uppercase forms", () => {
    expect(foldDiacritics("æ")).toBe("ae");
    expect(foldDiacritics("Œil de Perdrix")).toBe("oeil de perdrix");
    expect(foldDiacritics("Ø")).toBe("o");
    expect(foldDiacritics("ẞ")).toBe("ss"); // capital sharp-s → ss
  });
});

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------
describe("search", () => {
  it("matches a plain-ASCII query against accented data", () => {
    const rows: Row[] = [{ Wine: "Côtes du Rhône" }, { Wine: "Napa Cabernet" }];
    const result = search(rows, { Wine: "rhone" });
    expect(result).toHaveLength(1);
    expect(result[0].Wine).toBe("Côtes du Rhône");
  });

  it("matches an accented query against plain-ASCII data", () => {
    const rows: Row[] = [{ Wine: "Rhone Valley Blend" }, { Wine: "Napa Cabernet" }];
    const result = search(rows, { Wine: "Rhône" });
    expect(result).toHaveLength(1);
    expect(result[0].Wine).toBe("Rhone Valley Blend");
  });

  it("matches cote/Côte and gruner/Grüner bidirectionally", () => {
    const rows: Row[] = [
      { Wine: "Côte Rôtie" },
      { Wine: "Cote Blend" },
      { Wine: "Grüner Veltliner" },
      { Wine: "Gruner Selection" },
    ];
    expect(search(rows, { Wine: "cote" }).map((r) => r.Wine)).toEqual(["Côte Rôtie", "Cote Blend"]);
    expect(search(rows, { Wine: "Côte" }).map((r) => r.Wine)).toEqual(["Côte Rôtie", "Cote Blend"]);
    expect(search(rows, { Wine: "gruner" }).map((r) => r.Wine)).toEqual(["Grüner Veltliner", "Gruner Selection"]);
    expect(search(rows, { Wine: "Grüner" }).map((r) => r.Wine)).toEqual(["Grüner Veltliner", "Gruner Selection"]);
  });

  it("matches an ASCII query against German ß data (real cellar case)", () => {
    const rows: Row[] = [
      { Wine: "Keller Großes Gewächs Riesling" },
      { Wine: "Napa Cabernet" },
    ];
    expect(search(rows, { Wine: "grosses" }).map((r) => r.Wine)).toEqual([
      "Keller Großes Gewächs Riesling",
    ]);
  });

  it("returns all rows when no filters are active", () => {
    const rows: Row[] = [{ Wine: "A" }, { Wine: "B" }];
    expect(search(rows, { Wine: undefined })).toEqual(rows);
  });
});

// ---------------------------------------------------------------------------
// aggregate
// ---------------------------------------------------------------------------
describe("aggregate", () => {
  it("counts by Quantity field, not row count", () => {
    const rows: Row[] = [
      { Color: "Red", Quantity: "6" },
      { Color: "Red", Quantity: "3" },
      { Color: "White", Quantity: "2" },
    ];
    const result = aggregate(rows, "Color");
    expect(result.Red).toBe(9);    // 6 + 3, not 2 rows
    expect(result.White).toBe(2);  // 2, not 1 row
  });

  it("defaults to 0 when Quantity is missing (matches cellar-stats)", () => {
    const rows: Row[] = [
      { Color: "Red" },
      { Color: "Red" },
    ];
    const result = aggregate(rows, "Color");
    expect(result.Red).toBe(0);
  });

  it("treats Quantity 0 as 0, not 1", () => {
    const rows: Row[] = [
      { Color: "Red", Quantity: "0" },
      { Color: "Red", Quantity: "5" },
    ];
    const result = aggregate(rows, "Color");
    expect(result.Red).toBe(5);  // 0 + 5, not 1 + 5
  });

  it("groups unknown keys as (unknown)", () => {
    const rows: Row[] = [
      { Color: "", Quantity: "3" },
      { Color: "Red", Quantity: "1" },
    ];
    const result = aggregate(rows, "Color");
    expect(result["(unknown)"]).toBe(3);
    expect(result.Red).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// toIsoDate
// ---------------------------------------------------------------------------
describe("toIsoDate", () => {
  it("converts M/D/YYYY to YYYY-MM-DD", () => {
    expect(toIsoDate("3/14/2026")).toBe("2026-03-14");
  });

  it("pads single-digit month and day", () => {
    expect(toIsoDate("1/5/2020")).toBe("2020-01-05");
  });

  it("passes through YYYY-MM-DD unchanged", () => {
    expect(toIsoDate("2026-03-14")).toBe("2026-03-14");
  });

  it("returns empty string for empty/undefined input", () => {
    expect(toIsoDate("")).toBe("");
    expect(toIsoDate(undefined)).toBe("");
    expect(toIsoDate("   ")).toBe("");
  });

  it("returns empty string for malformed input", () => {
    expect(toIsoDate("not-a-date")).toBe("");
    expect(toIsoDate("13-2026")).toBe("");
    expect(toIsoDate("2026/03/14")).toBe("");
  });

  it("handles double-digit month and day", () => {
    expect(toIsoDate("12/25/2023")).toBe("2023-12-25");
  });

  describe("date-parse warning", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("logs a single stderr warning for a repeated unparseable value", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      toIsoDate("bogus-date-46a");
      toIsoDate("bogus-date-46a");
      toIsoDate("bogus-date-46a");
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("stays silent for empty or undefined input", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      toIsoDate("");
      toIsoDate(undefined);
      toIsoDate("   ");
      expect(spy).not.toHaveBeenCalled();
    });

    it("stays silent for parseable input", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      toIsoDate("3/14/2026");
      toIsoDate("2026-03-14");
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// vintageLabel
// ---------------------------------------------------------------------------
describe("vintageLabel", () => {
  it("renders CellarTracker's 1001 NV sentinel as NV", () => {
    expect(vintageLabel({ Vintage: "1001" })).toBe("NV");
  });

  it("renders an empty vintage as NV", () => {
    expect(vintageLabel({ Vintage: "" })).toBe("NV");
  });

  it("renders a missing Vintage field as NV", () => {
    expect(vintageLabel({})).toBe("NV");
  });

  it("passes through a real vintage year unchanged", () => {
    expect(vintageLabel({ Vintage: "2015" })).toBe("2015");
  });
});

// ---------------------------------------------------------------------------
// drinkingPriority
// ---------------------------------------------------------------------------
describe("drinkingPriority", () => {
  const makeListRow = (iWine: string, wine: string): Row => ({
    iWine,
    Wine: wine,
    Vintage: "2015",
  });

  const makeAvailRow = (
    iWine: string,
    available: string,
    endConsume: string
  ): Row => ({
    iWine,
    Available: available,
    EndConsume: endConsume,
  });

  it("sorts past-peak wines (Available > 1.0) first", () => {
    const list = [
      makeListRow("1", "In Window Wine"),
      makeListRow("2", "Past Peak Wine"),
    ];
    const avail = [
      makeAvailRow("1", "0.8", "2030"),
      makeAvailRow("2", "1.5", "2020"),
    ];
    const result = drinkingPriority(list, avail, 2026);
    expect(result[0].Wine).toBe("Past Peak Wine");
    expect(result[1].Wine).toBe("In Window Wine");
  });

  it("sorts window-closing wines before in-window wines", () => {
    const list = [
      makeListRow("1", "In Window"),
      makeListRow("2", "Window Closing"),
    ];
    const avail = [
      makeAvailRow("1", "0.8", "2030"),
      makeAvailRow("2", "0.5", "2025"), // EndConsume <= currentYear
    ];
    const result = drinkingPriority(list, avail, 2026);
    expect(result[0].Wine).toBe("Window Closing");
    expect(result[1].Wine).toBe("In Window");
  });

  it("sorts no-data wines last", () => {
    const list = [
      makeListRow("1", "No Data Wine"),
      makeListRow("2", "Past Peak Wine"),
    ];
    const avail = [
      makeAvailRow("2", "1.2", "2020"),
      // No availability data for wine 1
    ];
    const result = drinkingPriority(list, avail, 2026);
    expect(result[0].Wine).toBe("Past Peak Wine");
    expect(result[1].Wine).toBe("No Data Wine");
  });

  it("sorts all five tiers correctly", () => {
    const list = [
      makeListRow("1", "No Data"),
      makeListRow("2", "Approaching"),
      makeListRow("3", "In Window"),
      makeListRow("4", "Window Closing"),
      makeListRow("5", "Past Peak"),
    ];
    const avail = [
      // No data for wine 1
      makeAvailRow("2", "0.5", "2035"),   // approaching (0.3-0.7, end far away)
      makeAvailRow("3", "0.8", "2030"),   // in window (0.7-1.0)
      makeAvailRow("4", "0.5", "2025"),   // window closing (endConsume <= 2026)
      makeAvailRow("5", "1.3", "2020"),   // past peak (> 1.0)
    ];
    const result = drinkingPriority(list, avail, 2026);
    expect(result.map((r) => r.Wine)).toEqual([
      "Past Peak",
      "Window Closing",
      "In Window",
      "Approaching",
      "No Data",
    ]);
  });

  it("handles empty inputs", () => {
    expect(drinkingPriority([], [], 2026)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// spendSummary
// ---------------------------------------------------------------------------
describe("spendSummary", () => {
  const makePurchaseRow = (
    wine: string,
    price: string,
    qty: string,
    store: string,
    date: string
  ): Row => ({
    Wine: wine,
    Price: price,
    Quantity: qty,
    StoreName: store,
    PurchaseDate: date,
  });

  it("computes correct totals", () => {
    const rows = [
      makePurchaseRow("Wine A", "20", "2", "Store 1", "1/1/2026"),
      makePurchaseRow("Wine B", "50", "1", "Store 2", "2/1/2026"),
    ];
    const result = spendSummary(rows);
    expect(result.total_spent).toBe(90); // 20*2 + 50*1
    expect(result.bottle_count).toBe(3);
    expect(result.avg_price).toBe(30); // 90/3
  });

  it("filters by date range", () => {
    const rows = [
      makePurchaseRow("Wine A", "20", "1", "Store", "1/15/2026"),
      makePurchaseRow("Wine B", "30", "1", "Store", "3/15/2026"),
      makePurchaseRow("Wine C", "40", "1", "Store", "6/15/2026"),
    ];
    const result = spendSummary(rows, "2026-02-01", "2026-04-01");
    expect(result.total_spent).toBe(30);
    expect(result.bottle_count).toBe(1);
  });

  it("computes per-store breakdown", () => {
    const rows = [
      makePurchaseRow("Wine A", "20", "1", "K&L", "1/1/2026"),
      makePurchaseRow("Wine B", "30", "2", "K&L", "2/1/2026"),
      makePurchaseRow("Wine C", "50", "1", "Total Wine", "3/1/2026"),
    ];
    const result = spendSummary(rows);
    expect(result.by_store["K&L"]).toEqual({ total: 80, count: 3 });
    expect(result.by_store["Total Wine"]).toEqual({ total: 50, count: 1 });
  });

  it("returns zeros for empty input", () => {
    const result = spendSummary([]);
    expect(result.total_spent).toBe(0);
    expect(result.bottle_count).toBe(0);
    expect(result.avg_price).toBe(0);
    expect(result.by_store).toEqual({});
    expect(result.recent).toEqual([]);
  });

  it("limits recent to 10 purchases", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      makePurchaseRow(`Wine ${i}`, "10", "1", "Store", `${i + 1}/1/2026`)
    );
    const result = spendSummary(rows);
    expect(result.recent).toHaveLength(10);
  });

  it("skips rows with zero price", () => {
    const rows = [
      makePurchaseRow("Free Wine", "0", "1", "Gift", "1/1/2026"),
      makePurchaseRow("Paid Wine", "25", "1", "Store", "2/1/2026"),
    ];
    const result = spendSummary(rows);
    expect(result.total_spent).toBe(25);
    expect(result.bottle_count).toBe(1);
  });

  it("sorts stores by total descending", () => {
    const rows = [
      makePurchaseRow("A", "10", "1", "Small Store", "1/1/2026"),
      makePurchaseRow("B", "100", "1", "Big Store", "2/1/2026"),
    ];
    const result = spendSummary(rows);
    const storeNames = Object.keys(result.by_store);
    expect(storeNames[0]).toBe("Big Store");
    expect(storeNames[1]).toBe("Small Store");
  });
});

// ---------------------------------------------------------------------------
// deliverySummary
// ---------------------------------------------------------------------------
describe("deliverySummary", () => {
  const makeDeliveryRow = (
    wine: string,
    deliveryDate: string,
    delivered: string,
    qty: string,
    store = "Test Store"
  ): Row => ({
    Wine: wine,
    DeliveryDate: deliveryDate,
    Delivered: delivered,
    Quantity: qty,
    Price: "100",
    StoreName: store,
  });

  it("counts delivered lines and bottles within the window", () => {
    const rows = [
      makeDeliveryRow("Wine A", "6/2/2026", "true", "6"),
      makeDeliveryRow("Wine B", "6/2/2026", "true", "12"),
    ];
    const result = deliverySummary(rows, "2026-06-01", "2026-06-30");
    expect(result.line_count).toBe(2);
    expect(result.bottle_count).toBe(18);
  });

  it("matches real CellarTracker casing (Delivered='True', capital T)", () => {
    // Live Purchase exports store the flag as "True", not "true";
    // deliverySummary must stay case-insensitive or it silently returns nothing.
    const rows = [makeDeliveryRow("Cap T", "6/2/2026", "True", "3")];
    const result = deliverySummary(rows, "2026-06-01", "2026-06-30");
    expect(result.line_count).toBe(1);
    expect(result.bottle_count).toBe(3);
  });

  it("excludes rows outside the date window", () => {
    const rows = [
      makeDeliveryRow("In", "6/15/2026", "true", "6"),
      makeDeliveryRow("Before", "5/31/2026", "true", "6"),
      makeDeliveryRow("After", "7/1/2026", "true", "6"),
    ];
    const result = deliverySummary(rows, "2026-06-01", "2026-06-30");
    expect(result.line_count).toBe(1);
    expect(result.deliveries[0].Wine).toBe("In");
  });

  it("excludes pending placeholder rows (Delivered=false)", () => {
    const rows = [
      makeDeliveryRow("Delivered", "6/2/2026", "true", "6"),
      makeDeliveryRow("Pending", "6/2/2026", "false", "6"),
    ];
    const result = deliverySummary(rows, "2026-06-01", "2026-06-30");
    expect(result.line_count).toBe(1);
    expect(result.deliveries[0].Wine).toBe("Delivered");
  });

  it("excludes rows with no delivery date", () => {
    const rows = [makeDeliveryRow("No Date", "", "true", "6")];
    const result = deliverySummary(rows, "2026-06-01", "2026-06-30");
    expect(result.line_count).toBe(0);
  });

  it("treats window bounds as inclusive", () => {
    const rows = [
      makeDeliveryRow("First", "6/1/2026", "true", "1"),
      makeDeliveryRow("Last", "6/30/2026", "true", "1"),
    ];
    const result = deliverySummary(rows, "2026-06-01", "2026-06-30");
    expect(result.line_count).toBe(2);
  });

  it("sorts deliveries newest first", () => {
    const rows = [
      makeDeliveryRow("Older", "6/2/2026", "true", "1"),
      makeDeliveryRow("Newer", "6/20/2026", "true", "1"),
    ];
    const result = deliverySummary(rows, "2026-06-01", "2026-06-30");
    expect(result.deliveries[0].Wine).toBe("Newer");
    expect(result.deliveries[1].Wine).toBe("Older");
  });

  it("returns zeros for empty input", () => {
    const result = deliverySummary([], "2026-06-01", "2026-06-30");
    expect(result.line_count).toBe(0);
    expect(result.bottle_count).toBe(0);
    expect(result.deliveries).toEqual([]);
  });
});
