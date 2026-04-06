"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client ────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Types ──────────────────────────────────────────────────────────────────

interface Warranty {
  id: string;
  user_id: string;
  product_name: string;
  brand: string | null;
  order_id: string | null;
  purchase_date: string | null; // ISO date string
  image_url: string | null;
  created_at: string;
}

interface ReturnStatus {
  daysRemaining: number;   // negative = expired
  isExpired: boolean;
  isUrgent: boolean;       // within 5 days of closing
  returnDeadline: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getReturnStatus(purchaseDate: string | null): ReturnStatus | null {
  if (!purchaseDate) return null;
  const purchase = new Date(purchaseDate);
  if (isNaN(purchase.getTime())) return null;

  const returnDeadline = new Date(purchase);
  returnDeadline.setDate(returnDeadline.getDate() + 30);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  returnDeadline.setHours(0, 0, 0, 0);

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.round(
    (returnDeadline.getTime() - today.getTime()) / msPerDay
  );

  return {
    daysRemaining,
    isExpired: daysRemaining < 0,
    isUrgent: daysRemaining >= 0 && daysRemaining <= 5,
    returnDeadline,
  };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ReturnBadge({ status }: { status: ReturnStatus }) {
  if (status.isExpired) {
    return (
      <span style={styles.badge.expired}>
        Return window closed
      </span>
    );
  }
  if (status.isUrgent) {
    return (
      <span style={styles.badge.urgent}>
        ⚠ {status.daysRemaining} day{status.daysRemaining !== 1 ? "s" : ""} left to return!
      </span>
    );
  }
  return (
    <span style={styles.badge.ok}>
      {status.daysRemaining} days to return
    </span>
  );
}

function WarrantyCard({ warranty }: { warranty: Warranty }) {
  const status = getReturnStatus(warranty.purchase_date);
  const showExtended = status?.isExpired ?? false;

  return (
    <div style={{
      ...styles.card,
      ...(status?.isUrgent ? styles.cardUrgent : {}),
    }}>
      {/* Header */}
      <div style={styles.cardHeader}>
        {warranty.image_url ? (
          <img
            src={warranty.image_url}
            alt={warranty.product_name}
            style={styles.thumbnail}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div style={styles.thumbnailPlaceholder}>📦</div>
        )}
        <div style={styles.cardMeta}>
          <h3 style={styles.productName}>{warranty.product_name}</h3>
          {warranty.brand && (
            <span style={styles.brand}>{warranty.brand}</span>
          )}
        </div>
      </div>

      {/* Details */}
      <div style={styles.details}>
        <div style={styles.detailRow}>
          <span style={styles.label}>Order ID</span>
          <span style={styles.value}>{warranty.order_id ?? "—"}</span>
        </div>
        <div style={styles.detailRow}>
          <span style={styles.label}>Purchased</span>
          <span style={styles.value}>{formatDate(warranty.purchase_date)}</span>
        </div>
        {status && (
          <div style={styles.detailRow}>
            <span style={styles.label}>Return by</span>
            <span style={styles.value}>{formatDate(status.returnDeadline.toISOString())}</span>
          </div>
        )}
      </div>

      {/* Status badge */}
      <div style={styles.badgeRow}>
        {status ? (
          <ReturnBadge status={status} />
        ) : (
          <span style={styles.badge.neutral}>No purchase date</span>
        )}
      </div>

      {/* Urgent alert banner */}
      {status?.isUrgent && (
        <div style={styles.urgentAlert}>
          <strong>Act fast!</strong> Your return window closes on{" "}
          {formatDate(status.returnDeadline.toISOString())}. Initiate a return
          on Amazon before it's too late.
        </div>
      )}

      {/* Extended warranty CTA */}
      {showExtended && (
        <a
          href="https://example.com/extended-warranty?ref=warrantywatch"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.extendedBtn}
          onMouseEnter={(e) =>
            ((e.target as HTMLAnchorElement).style.backgroundColor = "#1d4ed8")
          }
          onMouseLeave={(e) =>
            ((e.target as HTMLAnchorElement).style.backgroundColor = "#2563eb")
          }
        >
          🛡 Get Extended Warranty
        </a>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWarranties() {
      setLoading(true);
      const { data, error } = await supabase
        .from("warranties")
        .select("*")
        .order("purchase_date", { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setWarranties(data ?? []);
      }
      setLoading(false);
    }

    fetchWarranties();
  }, []);

  // ── Derived counts ──────────────────────────────────────────────────────
  const urgentCount = warranties.filter(
    (w) => getReturnStatus(w.purchase_date)?.isUrgent
  ).length;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      {/* Page header */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>🛡 WarrantyWatch</h1>
          <p style={styles.pageSubtitle}>
            {warranties.length} product{warranties.length !== 1 ? "s" : ""} tracked
            {urgentCount > 0 && (
              <span style={styles.urgentPill}>
                {urgentCount} return{urgentCount !== 1 ? "s" : ""} expiring soon
              </span>
            )}
          </p>
        </div>
      </div>

      {/* States */}
      {loading && (
        <div style={styles.centeredMessage}>Loading your warranties…</div>
      )}

      {error && (
        <div style={styles.errorBox}>
          <strong>Failed to load warranties:</strong> {error}
        </div>
      )}

      {!loading && !error && warranties.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📦</div>
          <p style={styles.emptyText}>No warranties tracked yet.</p>
          <p style={styles.emptySubtext}>
            Scan an Amazon order screenshot to get started.
          </p>
        </div>
      )}

      {/* Grid */}
      {!loading && warranties.length > 0 && (
        <div style={styles.grid}>
          {warranties.map((w) => (
            <WarrantyCard key={w.id} warranty={w} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  page: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    backgroundColor: "#f8fafc",
    minHeight: "100vh",
    padding: "2rem",
    color: "#0f172a",
  } as React.CSSProperties,

  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "2rem",
  } as React.CSSProperties,

  pageTitle: {
    fontSize: "1.75rem",
    fontWeight: 700,
    margin: 0,
    color: "#0f172a",
  } as React.CSSProperties,

  pageSubtitle: {
    fontSize: "0.9rem",
    color: "#64748b",
    marginTop: "0.25rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  } as React.CSSProperties,

  urgentPill: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: "999px",
    padding: "0.1rem 0.6rem",
    fontSize: "0.75rem",
    fontWeight: 600,
  } as React.CSSProperties,

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "1.25rem",
  } as React.CSSProperties,

  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.875rem",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    transition: "box-shadow 0.2s",
  } as React.CSSProperties,

  cardUrgent: {
    border: "1.5px solid #fca5a5",
    boxShadow: "0 0 0 3px rgba(239,68,68,0.08)",
  } as React.CSSProperties,

  cardHeader: {
    display: "flex",
    gap: "0.875rem",
    alignItems: "flex-start",
  } as React.CSSProperties,

  thumbnail: {
    width: "52px",
    height: "52px",
    objectFit: "cover",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    flexShrink: 0,
  } as React.CSSProperties,

  thumbnailPlaceholder: {
    width: "52px",
    height: "52px",
    borderRadius: "8px",
    backgroundColor: "#f1f5f9",
    border: "1px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.5rem",
    flexShrink: 0,
  } as React.CSSProperties,

  cardMeta: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,

  productName: {
    fontSize: "0.95rem",
    fontWeight: 600,
    margin: 0,
    lineHeight: 1.4,
    color: "#0f172a",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  } as React.CSSProperties,

  brand: {
    fontSize: "0.78rem",
    color: "#64748b",
    marginTop: "0.2rem",
    display: "block",
  } as React.CSSProperties,

  details: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    borderTop: "1px solid #f1f5f9",
    paddingTop: "0.75rem",
  } as React.CSSProperties,

  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } as React.CSSProperties,

  label: {
    fontSize: "0.78rem",
    color: "#94a3b8",
    fontWeight: 500,
  } as React.CSSProperties,

  value: {
    fontSize: "0.82rem",
    color: "#334155",
    fontWeight: 500,
    fontVariantNumeric: "tabular-nums",
  } as React.CSSProperties,

  badgeRow: {
    display: "flex",
  } as React.CSSProperties,

  badge: {
    urgent: {
      backgroundColor: "#fef2f2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
      borderRadius: "6px",
      padding: "0.3rem 0.65rem",
      fontSize: "0.78rem",
      fontWeight: 700,
    } as React.CSSProperties,

    expired: {
      backgroundColor: "#f8fafc",
      color: "#94a3b8",
      border: "1px solid #e2e8f0",
      borderRadius: "6px",
      padding: "0.3rem 0.65rem",
      fontSize: "0.78rem",
      fontWeight: 500,
    } as React.CSSProperties,

    ok: {
      backgroundColor: "#f0fdf4",
      color: "#15803d",
      border: "1px solid #bbf7d0",
      borderRadius: "6px",
      padding: "0.3rem 0.65rem",
      fontSize: "0.78rem",
      fontWeight: 500,
    } as React.CSSProperties,

    neutral: {
      backgroundColor: "#f8fafc",
      color: "#94a3b8",
      border: "1px solid #e2e8f0",
      borderRadius: "6px",
      padding: "0.3rem 0.65rem",
      fontSize: "0.78rem",
    } as React.CSSProperties,
  },

  urgentAlert: {
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "0.65rem 0.875rem",
    fontSize: "0.8rem",
    color: "#7f1d1d",
    lineHeight: 1.5,
  } as React.CSSProperties,

  extendedBtn: {
    display: "block",
    textAlign: "center",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    borderRadius: "8px",
    padding: "0.6rem 1rem",
    fontSize: "0.85rem",
    fontWeight: 600,
    textDecoration: "none",
    transition: "background-color 0.15s",
    cursor: "pointer",
  } as React.CSSProperties,

  centeredMessage: {
    textAlign: "center",
    padding: "4rem 0",
    color: "#94a3b8",
    fontSize: "0.95rem",
  } as React.CSSProperties,

  errorBox: {
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    padding: "1rem 1.25rem",
    color: "#7f1d1d",
    fontSize: "0.875rem",
  } as React.CSSProperties,

  emptyState: {
    textAlign: "center",
    padding: "5rem 0",
  } as React.CSSProperties,

  emptyIcon: {
    fontSize: "3rem",
    marginBottom: "0.75rem",
  } as React.CSSProperties,

  emptyText: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#334155",
    margin: 0,
  } as React.CSSProperties,

  emptySubtext: {
    fontSize: "0.875rem",
    color: "#94a3b8",
    marginTop: "0.35rem",
  } as React.CSSProperties,
};
