"use client";

import { CSSProperties } from "react";

interface Offer {
  id: string;
  staffName: string;
  serviceName: string;
  startsAt: string;
  startingPriceCents: number;
}

interface Booking {
  id: string;
  staffName: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  quotedPriceCents: number;
  petName: string;
}

interface Handoff {
  id: string;
  status: string;
}

interface SessionSummaryProps {
  data: {
    offers: Offer[];
    booking: Booking | null;
    handoff: Handoff | null;
  };
  connected: boolean;
}

export default function SessionSummary({ data, connected }: SessionSummaryProps) {
  const formatPrice = (cents: number) => {
    return "$" + (cents / 100).toFixed(2);
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/New_York",
      });
    } catch {
      return iso;
    }
  };

  const formatDuration = (start: string, end: string) => {
    try {
      const startTime = new Date(start);
      const endTime = new Date(end);
      const mins = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      return `${mins} min`;
    } catch {
      return "—";
    }
  };

  return (
    <div style={styles.container}>
      {data.booking && (
        <div style={styles.bookingCard}>
          <h3 style={styles.bookingTitle}>✓ Booking Confirmed</h3>
          <div style={styles.bookingGrid}>
            <div>
              <label>Pet</label>
              <p>{data.booking.petName}</p>
            </div>
            <div>
              <label>Service</label>
              <p>{data.booking.serviceName}</p>
            </div>
            <div>
              <label>Groomer</label>
              <p>{data.booking.staffName}</p>
            </div>
            <div>
              <label>Date & Time</label>
              <p>{formatTime(data.booking.startsAt)}</p>
            </div>
            <div>
              <label>Duration</label>
              <p>{formatDuration(data.booking.startsAt, data.booking.endsAt)}</p>
            </div>
            <div>
              <label>Quoted Price</label>
              <p style={{ fontWeight: "bold" }}>
                {formatPrice(data.booking.quotedPriceCents)}
              </p>
            </div>
          </div>
          <p style={styles.bookingNote}>
            Your appointment has been saved and confirmed with our studio.
          </p>
        </div>
      )}

      {data.handoff && (
        <div style={styles.handoffCard}>
          <h3 style={styles.handoffTitle}>→ Callback Request</h3>
          <p>We'll follow up with you shortly about scheduling options.</p>
          <p style={styles.handoffStatus}>Status: {data.handoff.status}</p>
        </div>
      )}

      {data.offers.length > 0 && !data.booking && (
        <div style={styles.offersCard}>
          <h3>Available Options</h3>
          {data.offers.map((offer) => (
            <div key={offer.id} style={styles.offerItem}>
              <div style={styles.offerHeader}>
                <span>{offer.serviceName}</span>
                <span style={styles.offerPrice}>
                  {formatPrice(offer.startingPriceCents)}+
                </span>
              </div>
              <p style={styles.offerDetails}>
                {offer.staffName} • {formatTime(offer.startsAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      {!data.booking &&
        data.offers.length === 0 &&
        connected && (
          <div style={styles.pendingCard}>
            <p>Tell us about your pet and when you'd like to visit.</p>
          </div>
        )}
    </div>
  );
}

const styles = {
  container: {
    marginTop: "2rem",
  },
  bookingCard: {
    background: "white",
    borderRadius: "12px",
    padding: "1.5rem",
    border: "2px solid var(--success)",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  },
  bookingTitle: {
    color: "var(--success)",
    marginBottom: "1rem",
    fontSize: "1.125rem",
  },
  bookingGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "1rem",
    marginBottom: "1rem",
  } as CSSProperties,
  bookingNote: {
    fontSize: "0.875rem",
    color: "var(--charcoal)",
    opacity: 0.7,
    marginTop: "1rem",
  },
  handoffCard: {
    background: "white",
    borderRadius: "12px",
    padding: "1.5rem",
    border: "2px solid var(--warning)",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  },
  handoffTitle: {
    color: "var(--warning)",
    marginBottom: "0.5rem",
  },
  handoffStatus: {
    fontSize: "0.875rem",
    marginTop: "0.5rem",
    color: "var(--charcoal)",
    opacity: 0.7,
  },
  offersCard: {
    background: "white",
    borderRadius: "12px",
    padding: "1.5rem",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  },
  offerItem: {
    paddingBottom: "1rem",
    borderBottom: "1px solid var(--mint-light)",
    marginBottom: "1rem",
  },
  offerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontWeight: 500,
  } as CSSProperties,
  offerPrice: {
    color: "var(--mint)",
    fontWeight: "bold",
  },
  offerDetails: {
    fontSize: "0.875rem",
    color: "var(--charcoal)",
    opacity: 0.7,
    marginTop: "0.25rem",
  },
  pendingCard: {
    background: "rgba(255, 255, 255, 0.5)",
    borderRadius: "12px",
    padding: "1.5rem",
    textAlign: "center" as const,
    color: "var(--charcoal)",
    opacity: 0.6,
  },
} as Record<string, CSSProperties>;
