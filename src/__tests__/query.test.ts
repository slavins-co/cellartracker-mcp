import { describe, it, expect, vi, afterEach } from "vitest";
import {
  aggregate,
  parseCsv,
  search,
  foldDiacritics,
  toIsoDate,
  drinkingPriority,
  windowYear,
  maturityStatus,
  spendSummary,
  deliverySummary,
  mostRecentDeliveryDate,
  pendingOrders,
  bottleDetails,
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
// windowYear
// ---------------------------------------------------------------------------
describe("windowYear", () => {
  it("parses a bare year", () => expect(windowYear("2028")).toBe(2028));
  it("parses M/D/YYYY", () => expect(windowYear("12/31/2028")).toBe(2028));
  it("parses YYYY-MM-DD", () => expect(windowYear("2028-12-31")).toBe(2028));
  it("returns null for empty, whitespace, undefined and garbage", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(windowYear("")).toBeNull();
    expect(windowYear("   ")).toBeNull();
    expect(windowYear(undefined)).toBeNull();
    expect(windowYear("abc")).toBeNull();
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// maturityStatus
// ---------------------------------------------------------------------------
describe("maturityStatus", () => {
  it("falls back to BeginDrink/EndDrink when the Consume columns are blank", () => {
    const m = maturityStatus({ BeginConsume: "", EndConsume: "", BeginDrink: "2024", EndDrink: "2030" }, 2026);
    expect(m.label).toBe("In listed window (2024-2030)");
    expect(m.window).toBe("2024-2030");
  });

  it("reports window 'unknown' when no bounds are listed", () => {
    expect(maturityStatus({}, 2026).window).toBe("unknown");
  });

  const noMisleading = /PAST PEAK|drink now/i;

  it.each([
    [{}, 2026, "No listed window"],
    [{ BeginConsume: "2030", EndConsume: "2035" }, 2026, "Before listed window (opens 2030)"],
    [{ BeginConsume: "2030" }, 2026, "Before listed window (opens 2030)"],
    [{ BeginConsume: "2015", EndConsume: "2024" }, 2026, "Past listed window (2024)"],
    [{ EndConsume: "2024" }, 2026, "Past listed window (2024)"],
    [{ BeginConsume: "2020", EndConsume: "2026" }, 2026, "Late in listed window (2020-2026)"],
    [{ EndConsume: "2026" }, 2026, "Late in listed window (?-2026)"],
    [{ BeginConsume: "2020", EndConsume: "2030" }, 2026, "In listed window (2020-2030)"],
    [{ BeginConsume: "2020" }, 2026, "In listed window (2020-?)"],
    [{ BeginDrink: "2020", EndDrink: "2030" }, 2026, "In listed window (2020-2030)"],
    [{ BeginConsume: "1/1/2023", EndConsume: "12/31/2028" }, 2026, "In listed window (2023-2028)"],
  ] as [Row, number, string][])("labels %j at %i as %s", (row, year, label) => {
    expect(maturityStatus(row, year).label).toBe(label);
  });

  it("never lets the index affect the label", () => {
    const base = { BeginConsume: "2020", EndConsume: "2030" };
    for (const available of ["-5", "0.2", "1.5", "250", ""]) {
      expect(maturityStatus({ ...base, Available: available }, 2026).label).toBe(
        "In listed window (2020-2030)"
      );
    }
  });

  it("parses source and index", () => {
    const m = maturityStatus({ Source: " Personal ", Available: "x" }, 2026);
    expect(m.windowSource).toBe("Personal");
    expect(m.drinkabilityIndex).toBeNull();
    expect(maturityStatus({}, 2026).windowSource).toBe("");
    expect(maturityStatus({ Available: "-3.5" }, 2026).drinkabilityIndex).toBe(-3.5);
  });

  it("regression: 2019 Chardonnay (index 1.47) is in window, not past peak", () => {
    const m = maturityStatus(
      {
        Wine: "2019 Chardonnay",
        BeginConsume: "1/1/2023",
        EndConsume: "12/31/2028",
        Source: "Personal",
        Inventory: "2",
        Consumed: "1",
        Pending: "0",
        Available: "1.46944751381215",
        Early: "1.46944751381215",
        Linear: "0.882701962574167",
      },
      2026
    );
    expect(m.label).toBe("In listed window (2023-2028)");
    expect(m.label).not.toMatch(noMisleading);
    expect(m.drinkabilityIndex).toBeCloseTo(1.4694, 4);
    expect(m.windowBegin).toBe(2023);
    expect(m.windowEnd).toBe(2028);
    expect(m.windowSource).toBe("Personal");
  });

  it("regression: 2024 Sauvignon Blanc (index 1.588) is in window, not past peak", () => {
    const m = maturityStatus(
      {
        Wine: "2024 Sauvignon Blanc",
        BeginConsume: "1/1/2025",
        EndConsume: "12/31/2027",
        Source: "Personal",
        Inventory: "2",
        Consumed: "0",
        Pending: "0",
        Available: "1.588",
        Early: "1.588",
        Linear: "1.17733089579525",
      },
      2026
    );
    expect(m.label).toBe("In listed window (2025-2027)");
    expect(m.label).not.toMatch(noMisleading);
    expect(m.drinkabilityIndex).toBe(1.588);
  });
});

// ---------------------------------------------------------------------------
// drinkingPriority
// ---------------------------------------------------------------------------
describe("drinkingPriority", () => {
  const makeListRow = (iWine: string, wine: string, endConsume = ""): Row => ({
    iWine,
    Wine: wine,
    Vintage: "2015",
    EndConsume: endConsume,
  });

  const makeAvailRow = (
    iWine: string,
    available: string,
    endConsume: string,
    beginConsume = ""
  ): Row => ({
    iWine,
    Available: available,
    EndConsume: endConsume,
    BeginConsume: beginConsume,
  });

  const names = (rows: Row[]) => rows.map((r) => r.Wine);

  it("sorts past-window and final-year wines before high-index in-window wines", () => {
    const list = [
      makeListRow("1", "2019 Chardonnay"),
      makeListRow("2", "2024 Sauvignon Blanc"),
      makeListRow("3", "Past Window"),
      makeListRow("4", "Final Year"),
    ];
    const avail = [
      makeAvailRow("1", "1.46944751381215", "12/31/2028", "1/1/2023"),
      makeAvailRow("2", "1.588", "12/31/2027", "1/1/2025"),
      makeAvailRow("3", "-2", "2024", "2015"),
      makeAvailRow("4", "-1", "2026", "2018"),
    ];
    const result = names(drinkingPriority(list, avail, 2026));
    expect(result.slice(0, 2)).toEqual(["Past Window", "Final Year"]);
    // SB ends 2027, Chardonnay 2028: earliest end first, index is only a tie-break
    expect(result.slice(2)).toEqual(["2024 Sauvignon Blanc", "2019 Chardonnay"]);
  });

  it("orders past-window wines oldest end first", () => {
    const list = [makeListRow("1", "Ended 2024"), makeListRow("2", "Ended 2020")];
    const avail = [makeAvailRow("1", "", "2024"), makeAvailRow("2", "", "2020")];
    expect(names(drinkingPriority(list, avail, 2026))).toEqual(["Ended 2020", "Ended 2024"]);
  });

  it("orders in-window wines earliest end first", () => {
    const list = [makeListRow("1", "Ends 2030"), makeListRow("2", "Ends 2028")];
    const avail = [makeAvailRow("1", "", "2030"), makeAvailRow("2", "", "2028")];
    expect(names(drinkingPriority(list, avail, 2026))).toEqual(["Ends 2028", "Ends 2030"]);
  });

  it("breaks ties by higher drinkability index first, null last", () => {
    const list = [
      makeListRow("1", "Low"),
      makeListRow("2", "High"),
      makeListRow("3", "None"),
    ];
    const avail = [
      makeAvailRow("1", "0.5", "2030"),
      makeAvailRow("2", "3.2", "2030"),
      makeAvailRow("3", "", "2030"),
    ];
    expect(names(drinkingPriority(list, avail, 2026))).toEqual(["High", "Low", "None"]);
  });

  it("uses the Availability M/D/YYYY end date when the List value is empty", () => {
    const list = [
      makeListRow("1", "From Avail"), // EndConsume empty on List
      makeListRow("2", "Ends 2029", "2029"),
    ];
    const avail = [makeAvailRow("1", "", "12/31/2028"), makeAvailRow("2", "", "2029")];
    // 2028 (not 12) -> in window, ahead of 2029; 12 would have been "past window"
    const result = drinkingPriority(list, avail, 2026);
    expect(names(result)).toEqual(["From Avail", "Ends 2029"]);
    expect(maturityStatus(result[0], 2026).windowEnd).toBe(2028);
  });

  it("puts not-yet-open wines after in-window, earliest begin first, then no-data last", () => {
    const list = [
      makeListRow("1", "No Data"),
      makeListRow("2", "Opens 2032"),
      makeListRow("3", "In Window"),
      makeListRow("4", "Opens 2028"),
      makeListRow("5", "Past Window"),
    ];
    const avail = [
      makeAvailRow("2", "-9", "2040", "2032"),
      makeAvailRow("3", "1", "2035", "2020"),
      makeAvailRow("4", "-9", "2040", "2028"),
      makeAvailRow("5", "1", "2020", "2010"),
    ];
    expect(names(drinkingPriority(list, avail, 2026))).toEqual([
      "Past Window",
      "In Window",
      "Opens 2028",
      "Opens 2032",
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

// ---------------------------------------------------------------------------
// mostRecentDeliveryDate
// ---------------------------------------------------------------------------
describe("mostRecentDeliveryDate", () => {
  const makeDeliveryRow = (
    wine: string,
    deliveryDate: string,
    delivered: string
  ): Row => ({
    Wine: wine,
    DeliveryDate: deliveryDate,
    Delivered: delivered,
  });

  it("returns the latest delivered date, ignoring any window", () => {
    const rows = [
      makeDeliveryRow("Older", "4/26/2026", "true"),
      makeDeliveryRow("Newest", "6/2/2026", "true"),
      makeDeliveryRow("Middle", "5/1/2026", "true"),
    ];
    expect(mostRecentDeliveryDate(rows)).toBe("2026-06-02");
  });

  it("is case-insensitive on the Delivered flag (real exports use 'True')", () => {
    const rows = [makeDeliveryRow("Cap T", "6/2/2026", "True")];
    expect(mostRecentDeliveryDate(rows)).toBe("2026-06-02");
  });

  it("ignores undelivered (pending) rows", () => {
    const rows = [makeDeliveryRow("Pending", "6/2/2026", "false")];
    expect(mostRecentDeliveryDate(rows)).toBe("");
  });

  it("returns empty string when there are no delivered rows", () => {
    expect(mostRecentDeliveryDate([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// pendingOrders
// ---------------------------------------------------------------------------
describe("pendingOrders", () => {
  const makePendingRow = (
    wine: string,
    purchaseDate: string,
    delivered: string,
    qty: string,
    store = "Test Store"
  ): Row => ({
    Wine: wine,
    PurchaseDate: purchaseDate,
    Delivered: delivered,
    Quantity: qty,
    Price: "100",
    StoreName: store,
  });

  it("counts pending lines and bottles", () => {
    const rows = [
      makePendingRow("Wine A", "6/2/2026", "false", "6"),
      makePendingRow("Wine B", "6/3/2026", "false", "12"),
    ];
    const result = pendingOrders(rows);
    expect(result.line_count).toBe(2);
    expect(result.bottle_count).toBe(18);
  });

  it("excludes rows already marked Delivered=true", () => {
    const rows = [
      makePendingRow("Still Pending", "6/2/2026", "false", "6"),
      makePendingRow("Already Delivered", "6/1/2026", "true", "6"),
    ];
    const result = pendingOrders(rows);
    expect(result.line_count).toBe(1);
    expect(result.orders[0].Wine).toBe("Still Pending");
  });

  it("is case-insensitive on the Delivered flag", () => {
    const rows = [makePendingRow("Cap T", "6/2/2026", "True", "6")];
    const result = pendingOrders(rows);
    expect(result.line_count).toBe(0);
  });

  it("sorts orders oldest-first", () => {
    const rows = [
      makePendingRow("Newer", "6/20/2026", "false", "1"),
      makePendingRow("Older", "6/2/2026", "false", "1"),
    ];
    const result = pendingOrders(rows);
    expect(result.orders[0].Wine).toBe("Older");
    expect(result.orders[1].Wine).toBe("Newer");
  });

  it("sorts a row with a missing PurchaseDate to the end, not the start", () => {
    // toIsoDate() maps missing/unparseable dates to "" — an ascending sort
    // on the raw string would put "" (this row) first, the opposite of
    // every other date sort in query.ts, which treats "" as sorting last.
    const rows = [
      makePendingRow("Unknown Date", "", "false", "1"),
      makePendingRow("Older", "6/2/2026", "false", "1"),
      makePendingRow("Newer", "6/20/2026", "false", "1"),
    ];
    const result = pendingOrders(rows);
    expect(result.orders.map((r) => r.Wine)).toEqual(["Older", "Newer", "Unknown Date"]);
  });

  it("returns zeros for empty input", () => {
    const result = pendingOrders([]);
    expect(result.line_count).toBe(0);
    expect(result.bottle_count).toBe(0);
    expect(result.orders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// bottleDetails
// ---------------------------------------------------------------------------
describe("bottleDetails", () => {
  // Mirrors the real Bottles table: BottleState "1" = in cellar, "0" = consumed.
  const makeBottle = (over: Partial<Row> = {}): Row => ({
    BottleState: "1",
    Barcode: "0000000001",
    Wine: "Test Wine",
    Vintage: "2020",
    BottleSize: "750ml",
    Location: "Wine Fridge",
    Bin: "1-1",
    ...over,
  });

  it("filters by wine name, diacritic- and case-insensitively", () => {
    const rows = [
      makeBottle({ Wine: "Château Margaux" }),
      makeBottle({ Wine: "Sancerre" }),
    ];
    const result = bottleDetails(rows, { wine: "chateau" });
    expect(result).toHaveLength(1);
    expect(result[0].Wine).toBe("Château Margaux");
  });

  it("filters by location (substring, case-insensitive)", () => {
    const rows = [
      makeBottle({ Location: "Wine Fridge" }),
      makeBottle({ Location: "Bar Cabinet" }),
    ];
    const result = bottleDetails(rows, { location: "wine fridge" });
    expect(result).toHaveLength(1);
    expect(result[0].Location).toBe("Wine Fridge");
  });

  it("filters by bin", () => {
    const rows = [
      makeBottle({ Bin: "Drawer 2" }),
      makeBottle({ Bin: "Shelf Rack" }),
    ];
    const result = bottleDetails(rows, { bin: "drawer 2" });
    expect(result).toHaveLength(1);
    expect(result[0].Bin).toBe("Drawer 2");
  });

  it("filters by size via the BottleSize column", () => {
    const rows = [
      makeBottle({ BottleSize: "750ml" }),
      makeBottle({ BottleSize: "1500ml" }),
    ];
    const result = bottleDetails(rows, { size: "1500" });
    expect(result).toHaveLength(1);
    expect(result[0].BottleSize).toBe("1500ml");
  });

  it("filters by barcode", () => {
    const rows = [
      makeBottle({ Barcode: "0209619452" }),
      makeBottle({ Barcode: "0213608403" }),
    ];
    const result = bottleDetails(rows, { barcode: "0209619452" });
    expect(result).toHaveLength(1);
    expect(result[0].Barcode).toBe("0209619452");
  });

  it("state='cellar' returns only in-cellar bottles (BottleState '1')", () => {
    const rows = [
      makeBottle({ Wine: "In Cellar", BottleState: "1" }),
      makeBottle({ Wine: "Consumed", BottleState: "0" }),
    ];
    const result = bottleDetails(rows, {}, "cellar");
    expect(result.map((r) => r.Wine)).toEqual(["In Cellar"]);
  });

  it("state='consumed' returns only consumed bottles (BottleState '0')", () => {
    const rows = [
      makeBottle({ Wine: "In Cellar", BottleState: "1" }),
      makeBottle({ Wine: "Consumed", BottleState: "0" }),
    ];
    const result = bottleDetails(rows, {}, "consumed");
    expect(result.map((r) => r.Wine)).toEqual(["Consumed"]);
  });

  it("state='all' (default) includes both cellar and consumed", () => {
    const rows = [
      makeBottle({ Wine: "In Cellar", BottleState: "1" }),
      makeBottle({ Wine: "Consumed", BottleState: "0" }),
    ];
    expect(bottleDetails(rows, {})).toHaveLength(2);
    expect(bottleDetails(rows, {}, "all")).toHaveLength(2);
  });

  it("sorts cellar bottles ahead of consumed, then by location, then bin", () => {
    const rows = [
      makeBottle({ Wine: "Consumed A", BottleState: "0", Location: "Aaa", Bin: "1" }),
      makeBottle({ Wine: "Cellar Fridge B2", BottleState: "1", Location: "Wine Fridge", Bin: "2" }),
      makeBottle({ Wine: "Cellar Fridge B1", BottleState: "1", Location: "Wine Fridge", Bin: "1" }),
      makeBottle({ Wine: "Cellar Cabinet", BottleState: "1", Location: "Bar Cabinet", Bin: "9" }),
    ];
    const result = bottleDetails(rows, {});
    expect(result.map((r) => r.Wine)).toEqual([
      "Cellar Cabinet", // Bar Cabinet sorts before Wine Fridge
      "Cellar Fridge B1", // same location, Bin 1 before Bin 2
      "Cellar Fridge B2",
      "Consumed A", // consumed always last regardless of location
    ]);
  });

  it("sorts row-slot bins numerically, not lexicographically (1-2 before 1-10)", () => {
    const rows = [
      makeBottle({ Wine: "Slot 10", Location: "Wine Fridge", Bin: "1-10" }),
      makeBottle({ Wine: "Slot 2", Location: "Wine Fridge", Bin: "1-2" }),
      makeBottle({ Wine: "Slot 3", Location: "Wine Fridge", Bin: "1-3" }),
    ];
    const result = bottleDetails(rows, {});
    expect(result.map((r) => r.Bin)).toEqual(["1-2", "1-3", "1-10"]);
  });

  it("excludes a garbled BottleState from cellar/consumed views but keeps it under 'all'", () => {
    const rows = [
      makeBottle({ Wine: "Good Cellar", BottleState: "1" }),
      makeBottle({ Wine: "Garbled", BottleState: "" }),
    ];
    expect(bottleDetails(rows, {}, "cellar").map((r) => r.Wine)).toEqual(["Good Cellar"]);
    expect(bottleDetails(rows, {}, "consumed").map((r) => r.Wine)).toEqual([]);
    expect(bottleDetails(rows, {}, "all").map((r) => r.Wine).sort()).toEqual(["Garbled", "Good Cellar"]);
  });

  it("combines a data filter with a state filter", () => {
    const rows = [
      makeBottle({ Wine: "Barolo", BottleState: "1" }),
      makeBottle({ Wine: "Barolo", BottleState: "0" }),
      makeBottle({ Wine: "Chablis", BottleState: "1" }),
    ];
    const result = bottleDetails(rows, { wine: "barolo" }, "cellar");
    expect(result).toHaveLength(1);
    expect(result[0].BottleState).toBe("1");
  });

  it("returns [] for empty input", () => {
    expect(bottleDetails([], {})).toEqual([]);
  });
});
