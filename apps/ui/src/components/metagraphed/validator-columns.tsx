import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { shortHash } from "@/lib/metagraphed/blocks";
import { formatNumber } from "@/lib/metagraphed/format";
import { taoCompact, FeaturedBadge } from "@/components/metagraphed/neuron-table";
import { ValidatorIdentityChip } from "@/components/metagraphed/validator-identity-chip";
import {
  annualizedDelegatorApyPct,
  formatApyPct,
  formatTakePct,
} from "@/lib/metagraphed/validator-apy";
import type { GlobalValidator } from "@/lib/metagraphed/types";

export interface ValidatorColumn {
  key: string;
  header: string;
  headerClassName: string;
  cellClassName: string;
  render: (v: GlobalValidator) => ReactNode;
}

const TH = "px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-muted";
const NUM_HEAD = `${TH} text-right`;
const NUM_CELL = "px-3 py-2 text-right font-mono text-[11px] tabular-nums";

/**
 * Single source of truth for the /validators directory table: the header row
 * and every body cell are both derived from this list, so a column's label can
 * never drift out of sync with the value rendered under it (#5307 — the
 * previous hand-written thead had 12 headers, including a duplicate "Est. APY",
 * over a 9-cell body, shifting every value under the wrong header).
 * validators-table-columns.test.ts locks the header↔cell alignment invariant.
 */
export const VALIDATOR_COLUMNS: ValidatorColumn[] = [
  {
    key: "operator",
    header: "Operator",
    headerClassName: TH,
    cellClassName: "px-3 py-2",
    render: (v) => (
      <span className="flex items-center gap-1.5">
        {v.featured ? <FeaturedBadge /> : null}
        <ValidatorIdentityChip hotkey={v.hotkey} identity={v.coldkey_identity} size={20} />
      </span>
    ),
  },
  {
    key: "hotkey",
    header: "Hotkey",
    headerClassName: TH,
    cellClassName: "px-3 py-2 font-mono text-[11px]",
    render: (v) => (
      <Link
        to="/validators/$hotkey"
        params={{ hotkey: v.hotkey }}
        className="text-ink-strong hover:text-accent hover:underline"
        title={v.hotkey}
      >
        {shortHash(v.hotkey) ?? v.hotkey}
      </Link>
    ),
  },
  {
    key: "coldkey",
    header: "Coldkey",
    headerClassName: TH,
    cellClassName: "px-3 py-2 font-mono text-[11px] text-ink-muted",
    render: (v) =>
      v.coldkey ? (
        <Link
          to="/accounts/$ss58"
          params={{ ss58: v.coldkey }}
          className="hover:text-accent hover:underline"
          title={v.coldkey}
        >
          {shortHash(v.coldkey) ?? v.coldkey}
        </Link>
      ) : (
        "—"
      ),
  },
  {
    key: "take",
    header: "Take",
    headerClassName: NUM_HEAD,
    cellClassName: `${NUM_CELL} text-ink-muted`,
    render: (v) => formatTakePct(v.take),
  },
  {
    key: "apy",
    header: "Est. APY",
    headerClassName: NUM_HEAD,
    cellClassName: `${NUM_CELL} text-ink`,
    render: (v) =>
      formatApyPct(annualizedDelegatorApyPct(v.total_emission_tao, v.total_stake_tao, v.take)),
  },
  {
    key: "subnets",
    header: "Active subnets",
    headerClassName: NUM_HEAD,
    cellClassName: `${NUM_CELL} text-ink`,
    render: (v) => formatNumber(v.subnet_count),
  },
  {
    key: "uids",
    header: "UIDs",
    headerClassName: NUM_HEAD,
    cellClassName: `${NUM_CELL} text-ink-muted`,
    render: (v) => formatNumber(v.uid_count),
  },
  {
    key: "nominators",
    header: "Nominators",
    headerClassName: NUM_HEAD,
    cellClassName: `${NUM_CELL} text-ink-muted`,
    render: (v) => (v.nominator_count != null ? formatNumber(v.nominator_count) : "—"),
  },
  {
    key: "dominance",
    header: "Dominance",
    headerClassName: NUM_HEAD,
    cellClassName: `${NUM_CELL} text-ink`,
    render: (v) => (v.stake_dominance != null ? `${(v.stake_dominance * 100).toFixed(2)}%` : "—"),
  },
  {
    key: "stake",
    header: "Total stake",
    headerClassName: NUM_HEAD,
    cellClassName: `${NUM_CELL} text-ink`,
    render: (v) => taoCompact(v.total_stake_tao),
  },
  {
    key: "emission",
    header: "Total emission",
    headerClassName: NUM_HEAD,
    cellClassName: `${NUM_CELL} text-ink-muted`,
    render: (v) => taoCompact(v.total_emission_tao),
  },
];
