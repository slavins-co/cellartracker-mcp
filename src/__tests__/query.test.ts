import { describe, it, expect } from "vitest";
import {
  parseCsv,
  toIsoDate,
  drinkingPriority,
  spendSummary,
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
