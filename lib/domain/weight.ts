// Weight normalization and service/size eligibility.
// Server-authoritative: never infer weight from breed (system-design.md §13).

import { SIZE_POLICY, type SizeCode } from "./seed-data";

const KG_PER_LB = 0.45359237;

export type WeightUnit = "kg" | "lb";

export interface RawWeight {
  value: number;
  /** Runtime-untrusted: may be any string from a tool-call payload. Validated below. */
  unit: string;
}

/**
 * Converts to kg WITHOUT rounding, so size-band comparisons at the 10kg/20kg
 * boundaries are exact (rounding before comparison misclassified e.g.
 * 44.1 lb ≈ 20.0034 kg as Medium instead of handoff). Rejects unknown units
 * explicitly rather than silently treating them as kg.
 */
export function normalizeWeightToKg(raw: RawWeight): number {
  if (raw.unit !== "kg" && raw.unit !== "lb") {
    throw new Error("invalid_unit");
  }
  if (!Number.isFinite(raw.value) || raw.value <= 0) {
    throw new Error("invalid_weight");
  }
  const kg = raw.unit === "lb" ? raw.value * KG_PER_LB : raw.value;
  return kg;
}

export type SizeEligibility =
  | { eligible: true; size: SizeCode }
  | { eligible: false; reason: "weight_over_20kg" | "weight_at_or_below_zero" };

/** Maps a normalized kg weight to a size band, or flags handoff. */
export function resolveSizeBand(weightKg: number): SizeEligibility {
  if (weightKg <= 0) {
    return { eligible: false, reason: "weight_at_or_below_zero" };
  }
  for (const band of SIZE_POLICY) {
    if (weightKg > band.minExclusiveKg && weightKg <= band.maxInclusiveKg) {
      return { eligible: true, size: band.code };
    }
  }
  // Above the highest maxInclusiveKg (20kg) -> handoff per demo-data.json handoff_reasons.
  return { eligible: false, reason: "weight_over_20kg" };
}
