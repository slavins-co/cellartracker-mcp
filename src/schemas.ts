/**
 * Structured-output (outputSchema) shapes for the CellarTracker MCP tools.
 *
 * Pure zod 4 declarations — imports nothing from server.ts to avoid an import
 * cycle (server.ts imports these; the Row→structured mappers live in server.ts).
 * Each tool's `outputSchema` is the corresponding `*Shape` raw shape object.
 */

import { z } from "zod";

/**
 * A wine as surfaced by the cellar-facing tools. Only iWine/wine/vintage are
 * guaranteed; every other field is populated when the underlying CSV has it.
 * Tools narrow or extend this via `.pick()`/`.extend()`.
 */
export const wineRowSchema = z.object({
  iWine: z.string(),
  wine: z.string(),
  vintage: z.string(),
  quantity: z.number().optional(),
  location: z.string().optional(),
  bin: z.string().optional(),
  price: z.number().optional(),
  valuation: z.number().optional(),
  color: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  varietal: z.string().optional(),
  beginConsume: z.string().optional(),
  endConsume: z.string().optional(),
  scores: z.record(z.string(), z.number()).optional(),
  url: z.string().optional(),
});
export type WineRow = z.infer<typeof wineRowSchema>;

/** A purchase or delivery line (shared by purchase-history / recent-deliveries / incoming-orders). */
export const purchaseRowSchema = z.object({
  date: z.string(),
  wine: z.string(),
  vintage: z.string().optional(),
  price: z.number().optional(),
  quantity: z.number().optional(),
  store: z.string().optional(),
});
export type PurchaseRow = z.infer<typeof purchaseRowSchema>;

/** An individual bottle from the Bottles table. */
export const bottleRowSchema = z.object({
  wine: z.string(),
  vintage: z.string(),
  state: z.string(),
  barcode: z.string().optional(),
  location: z.string().optional(),
  bin: z.string().optional(),
  size: z.string().optional(),
  consumedDate: z.string().optional(),
  consumedType: z.string().optional(),
});
export type BottleRow = z.infer<typeof bottleRowSchema>;

/** A wishlist entry from the Tag table. */
export const wishlistRowSchema = z.object({
  wine: z.string(),
  vintage: z.string(),
  notes: z.string().optional(),
  maxPrice: z.string().optional(),
});
export type WishlistRow = z.infer<typeof wishlistRowSchema>;

/** A consumption record from the Consumed table. */
export const consumptionRowSchema = z.object({
  date: z.string(),
  wine: z.string(),
  vintage: z.string(),
  type: z.string().optional(),
  location: z.string().optional(),
  value: z.string().optional(),
  notes: z.string().optional(),
});
export type ConsumptionRow = z.infer<typeof consumptionRowSchema>;

/** A tasting note from the Notes table. */
export const tastingRowSchema = z.object({
  date: z.string(),
  wine: z.string(),
  vintage: z.string(),
  rating: z.string().optional(),
  community: z.string().optional(),
  event: z.string().optional(),
  notes: z.string().optional(),
});
export type TastingRow = z.infer<typeof tastingRowSchema>;

// --- Per-tool output shapes (pass directly as registerTool's outputSchema) ---

export const searchCellarShape = {
  total: z.number(),
  offset: z.number(),
  count: z.number(),
  wines: z.array(wineRowSchema),
};

export const drinkingRecommendationsShape = {
  recommendations: z.array(
    wineRowSchema.extend({ status: z.string(), window: z.string() })
  ),
};

export const cellarStatsShape = {
  totalBottles: z.number(),
  totalValue: z.number(),
  uniqueWines: z.number(),
  avgPerWine: z.number(),
  breakdown: z
    .object({
      dimension: z.string(),
      rows: z.array(z.object({ key: z.string(), bottles: z.number() })),
    })
    .optional(),
};

export const purchaseHistoryShape = {
  totalSpent: z.number(),
  bottleCount: z.number(),
  avgPrice: z.number(),
  byStore: z.array(
    z.object({ store: z.string(), total: z.number(), count: z.number() })
  ),
  recent: z.array(purchaseRowSchema),
};

export const recentDeliveriesShape = {
  total: z.number(),
  rows: z.array(purchaseRowSchema),
  mostRecentDelivery: z.string().optional(),
};

export const incomingOrdersShape = {
  total: z.number(),
  rows: z.array(purchaseRowSchema),
};

export const bottleDetailsShape = {
  total: z.number(),
  offset: z.number(),
  count: z.number(),
  bottles: z.array(bottleRowSchema),
};

export const getWishlistShape = {
  count: z.number(),
  wines: z.array(wishlistRowSchema),
};

export const consumptionHistoryShape = {
  total: z.number(),
  offset: z.number(),
  count: z.number(),
  rows: z.array(consumptionRowSchema),
};

export const tastingNotesShape = {
  total: z.number(),
  offset: z.number(),
  count: z.number(),
  rows: z.array(tastingRowSchema),
};

export const refreshDataShape = {
  refreshedAt: z.string(),
  serverVersion: z.string(),
  tables: z.array(
    z.object({ name: z.string(), rows: z.number(), description: z.string() })
  ),
};

export const setupCredentialsShape = {
  status: z.enum(["saved", "invalid", "unreachable", "rejected_input"]),
  envOverrideActive: z.boolean(),
};

export const clearUserDataShape = {
  credentials: z.enum(["deleted", "not_found"]),
  cacheFilesRemoved: z.number(),
};
