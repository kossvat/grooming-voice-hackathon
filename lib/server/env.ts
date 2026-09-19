// Server-only env access. Read lazily so `next build` never fails on a blank
// variable — endpoints surface 503 when a required value is missing at runtime.

export function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

/** Throws if the variable is unset/blank. Call inside a route, not at module top-level. */
export function requireEnv(name: string): string {
  const v = optionalEnv(name);
  if (!v) {
    throw new Error(`missing_env:${name}`);
  }
  return v;
}

/** Single demo tenant. Overridable; defaults to the seeded studio id. */
export function studioId(): string {
  return optionalEnv("STUDIO_ID") ?? "studio_demo";
}
