import { describe, it, expect } from "vitest";
import { VALIDATOR_COLUMNS } from "./validator-columns";
import type { GlobalValidator } from "@/lib/metagraphed/types";

// Minimal row covering every field the column renderers read.
const mockValidator = {
  hotkey: "5FHotkeyExampleAddressAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  featured: false,
  coldkey: "5GColdkeyExampleAddressBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  coldkey_count: 1,
  coldkey_identity: null,
  subnet_count: 12,
  uid_count: 12,
  total_stake_tao: 1234.5,
  root_stake_tao: 0,
  alpha_stake_tao: 0,
  total_emission_tao: 3.2,
  nominator_count: 42,
  apy_estimate: 0.15,
  apy_estimate_eligible_subnet_count: 12,
  take: 0.18,
  avg_validator_trust: 0.5,
  max_validator_trust: 0.9,
  stake_dominance: 0.03,
  latest_captured_at: null,
  latest_block_number: null,
  subnets: [],
} as unknown as GlobalValidator;

describe("VALIDATOR_COLUMNS", () => {
  it("defines a non-empty header and a renderer for every column", () => {
    for (const c of VALIDATOR_COLUMNS) {
      expect(c.header.trim().length).toBeGreaterThan(0);
      expect(c.headerClassName.length).toBeGreaterThan(0);
      expect(c.cellClassName.length).toBeGreaterThan(0);
      expect(typeof c.render).toBe("function");
    }
  });

  it("has no duplicate headers (regression: the old thead shipped two 'Est. APY')", () => {
    const headers = VALIDATOR_COLUMNS.map((c) => c.header);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("renders exactly one cell per header — header count === cell count per row (#5307)", () => {
    // thead and every tbody row both map over VALIDATOR_COLUMNS, so the header
    // count and the per-row cell count are structurally the same list. This
    // locks that invariant: no header without a value, no value without a header.
    const cells = VALIDATOR_COLUMNS.map((c) => c.render(mockValidator));
    expect(cells).toHaveLength(VALIDATOR_COLUMNS.length);
    for (const cell of cells) {
      expect(cell).not.toBeUndefined();
      expect(cell).not.toBeNull();
    }
  });
});
