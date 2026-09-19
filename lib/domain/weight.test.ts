import { describe, expect, it } from "vitest";
import { normalizeWeightToKg, resolveSizeBand } from "./weight";

describe("normalizeWeightToKg", () => {
  it("passes kg through unrounded (exact for size-band comparisons)", () => {
    expect(normalizeWeightToKg({ value: 7, unit: "kg" })).toBe(7);
    expect(normalizeWeightToKg({ value: 7.123456, unit: "kg" })).toBe(7.123456);
  });

  it("converts lb to kg", () => {
    // 15 lb ≈ 6.80 kg
    expect(normalizeWeightToKg({ value: 15, unit: "lb" })).toBeCloseTo(6.8, 2);
  });

  it("rejects non-positive or non-finite weight", () => {
    expect(() => normalizeWeightToKg({ value: 0, unit: "kg" })).toThrow();
    expect(() => normalizeWeightToKg({ value: -1, unit: "kg" })).toThrow();
    expect(() => normalizeWeightToKg({ value: NaN, unit: "kg" })).toThrow();
  });

  it("rejects unknown/unsupported unit strings instead of silently treating them as kg", () => {
    expect(() => normalizeWeightToKg({ value: 22, unit: "lbs" })).toThrow("invalid_unit");
    expect(() => normalizeWeightToKg({ value: 22, unit: "pounds" })).toThrow("invalid_unit");
    expect(() => normalizeWeightToKg({ value: 22, unit: "KG" })).toThrow("invalid_unit");
    // @ts-expect-error deliberately invalid for the test
    expect(() => normalizeWeightToKg({ value: 22, unit: undefined })).toThrow("invalid_unit");
  });
});

describe("regression: exact boundary classification (Fable review)", () => {
  it("22.05 lb -> ~10.0017 kg -> Medium, not Small", () => {
    const kg = normalizeWeightToKg({ value: 22.05, unit: "lb" });
    expect(kg).toBeGreaterThan(10);
    expect(resolveSizeBand(kg)).toEqual({ eligible: true, size: "M" });
  });

  it("44.1 lb -> ~20.0034 kg -> handoff, not Medium", () => {
    const kg = normalizeWeightToKg({ value: 44.1, unit: "lb" });
    expect(kg).toBeGreaterThan(20);
    expect(resolveSizeBand(kg)).toEqual({
      eligible: false,
      reason: "weight_over_20kg",
    });
  });

  it("20.004 kg (just over 20) -> handoff, not Medium", () => {
    expect(resolveSizeBand(20.004)).toEqual({
      eligible: false,
      reason: "weight_over_20kg",
    });
  });
});

describe("resolveSizeBand", () => {
  it("classifies small (0 < kg <= 10)", () => {
    expect(resolveSizeBand(6)).toEqual({ eligible: true, size: "S" });
    expect(resolveSizeBand(10)).toEqual({ eligible: true, size: "S" });
  });

  it("classifies medium (10 < kg <= 20)", () => {
    expect(resolveSizeBand(10.01)).toEqual({ eligible: true, size: "M" });
    expect(resolveSizeBand(20)).toEqual({ eligible: true, size: "M" });
  });

  it("flags handoff above 20kg", () => {
    expect(resolveSizeBand(20.01)).toEqual({
      eligible: false,
      reason: "weight_over_20kg",
    });
    expect(resolveSizeBand(35)).toEqual({
      eligible: false,
      reason: "weight_over_20kg",
    });
  });

  it("flags handoff at or below zero", () => {
    expect(resolveSizeBand(0)).toEqual({
      eligible: false,
      reason: "weight_at_or_below_zero",
    });
  });
});
