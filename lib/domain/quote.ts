// get_service_quote: server-authoritative starting price for a service family/size.
// Never trust an amount supplied by the caller/LLM (MEL-PROMPT.md).

import { SERVICES, type ServiceId, type SizeCode } from "./seed-data";
import { resolveSizeBand, type RawWeight, normalizeWeightToKg } from "./weight";

export type ServiceFamily = "bath" | "full_groom";

export type QuoteResult =
  | {
      status: "ok";
      serviceId: ServiceId;
      sizeCode: SizeCode;
      startingPriceCents: number;
      currency: "USD";
      durationMinutes: number;
      bufferMinutes: number;
      /** Normalized weight in kg (unrounded), so the booking flow reuses the
       *  exact value the quote was computed from instead of re-normalizing. */
      normalizedWeightKg: number;
      spokenAnswer: string;
    }
  | {
      status: "handoff";
      reason:
        | "weight_over_20kg"
        | "weight_at_or_below_zero"
        | "invalid_unit"
        | "unsupported_service";
      spokenAnswer: string;
      /**
       * This pure function never persists anything, so it always returns
       * `false` here. The get_service_quote tool route MUST invoke the
       * `create_handoff` RPC and set this to `true` before telling the
       * customer a staff follow-up has been arranged — the boolean type (not
       * a literal `false`) is what lets the route flip it once persisted.
       */
      followUpPersisted: boolean;
    };

function findServiceByFamilyAndSize(
  family: ServiceFamily,
  size: SizeCode,
): ServiceId | undefined {
  const entry = Object.values(SERVICES).find(
    (s) => s.family === family && s.size === size,
  );
  return entry?.id;
}

export interface QuoteRequest {
  family: ServiceFamily;
  weight: RawWeight;
}

/** Formats cents as a dollar string without lossy rounding (e.g. 6550 -> "$65.50", 8000 -> "$80"). */
function formatPriceCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** Pure function: given a family + raw weight, returns the server-authoritative quote. */
export function getServiceQuote(req: QuoteRequest): QuoteResult {
  let weightKg: number;
  try {
    weightKg = normalizeWeightToKg(req.weight);
  } catch (err) {
    if (err instanceof Error && err.message === "invalid_unit") {
      return {
        status: "handoff",
        reason: "invalid_unit",
        spokenAnswer:
          "I didn't catch whether that was kilograms or pounds — could you say the unit, or I'll pass this to a groomer.",
        followUpPersisted: false,
      };
    }
    return {
      status: "handoff",
      reason: "weight_at_or_below_zero",
      spokenAnswer:
        "I couldn't work out a size from that weight — let me pass this to a groomer.",
      followUpPersisted: false,
    };
  }
  const band = resolveSizeBand(weightKg);

  if (!band.eligible) {
    return {
      status: "handoff",
      reason: band.reason,
      spokenAnswer:
        band.reason === "weight_over_20kg"
          ? "For a dog over 20 kilograms, I'll have a groomer follow up to confirm timing and price."
          : "I couldn't work out a size from that weight — let me pass this to a groomer.",
      followUpPersisted: false,
    };
  }

  const serviceId = findServiceByFamilyAndSize(req.family, band.size);
  if (!serviceId) {
    return {
      status: "handoff",
      reason: "unsupported_service",
      spokenAnswer:
        "That combination isn't one we support automatically yet — a groomer will follow up.",
      followUpPersisted: false,
    };
  }

  const service = SERVICES[serviceId];

  return {
    status: "ok",
    serviceId,
    sizeCode: band.size,
    startingPriceCents: service.startingPriceCents,
    currency: service.currency,
    durationMinutes: service.durationMinutes,
    bufferMinutes: service.bufferMinutes,
    normalizedWeightKg: weightKg,
    spokenAnswer: `${service.name} starts at ${formatPriceCents(service.startingPriceCents)}. The final price is confirmed after the groomer takes a look.`,
  };
}
