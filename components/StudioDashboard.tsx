"use client";

import { useEffect, useState } from "react";
import { formatDate } from "date-fns";

interface Appointment {
  id: string;
  staffId: string;
  customerId: string;
  petId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  quotedPriceCents: number | null;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface Pet {
  id: string;
  customerId: string;
  name: string;
  species: string;
  breed: string;
}

interface Staff {
  id: string;
  name: string;
}

interface Handoff {
  id: string;
  conversationId: string | null;
  reason: string;
  status: string;
}

interface DashboardData {
  studio: { name: string; timezone: string };
  staff: Staff[];
  appointments: Appointment[];
  customers: Customer[];
  pets: Pet[];
  handoffs: Handoff[];
}

interface StudioDashboardProps {
  accessToken: string;
}

export default function StudioDashboard({ accessToken }: StudioDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(
    formatDate(new Date(), "yyyy-MM-dd")
  );
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    fetchDashboard();
    const interval = setInterval(fetchDashboard, 3000);
    return () => clearInterval(interval);
  }, [selectedDate, accessToken]);

  const fetchDashboard = async () => {
    if (!accessToken) return;

    try {
      const response = await fetch(
        `/api/studio/dashboard?date=${selectedDate}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.status === 401) {
        setError("Unauthorized. Please sign in again.");
        setLoading(false);
        return;
      }

      if (response.status === 403) {
        setError("Access denied. You do not have permission to view this.");
        setLoading(false);
        return;
      }

      if (response.status === 503) {
        setError("Service unavailable. Please try again later.");
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setError(`Error: ${response.status}`);
        setLoading(false);
        return;
      }

      const result = await response.json();
      setData(result);
      setError("");
      setLoading(false);
    } catch (err) {
      setError("Failed to load dashboard");
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading appointments...</div>;
  }

  if (error) {
    return <div style={styles.error}>{error}</div>;
  }

  if (!data) {
    return <div>No data available</div>;
  }

  const getAppointmentsForStaff = (staffId: string) =>
    data.appointments.filter((a) => a.staffId === staffId);

  const getCustomer = (customerId: string) =>
    data.customers.find((c) => c.id === customerId);

  const getPet = (petId: string) => data.pets.find((p) => p.id === petId);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: data.studio.timezone || "America/New_York",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.dateSelector}>
        <label htmlFor="date">Date</label>
        <input
          id="date"
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            setSelectedAppointment(null);
          }}
        />
      </div>

      <div style={styles.grid}>
        {data.staff.map((staff) => (
          <div key={staff.id} style={styles.staffColumn}>
            <h3 style={styles.staffName}>{staff.name}</h3>
            <div style={styles.appointments}>
              {getAppointmentsForStaff(staff.id).length === 0 ? (
                <p style={styles.empty}>No appointments</p>
              ) : (
                getAppointmentsForStaff(staff.id).map((apt) => {
                  const customer = getCustomer(apt.customerId);
                  const pet = getPet(apt.petId);
                  return (
                    <div
                      key={apt.id}
                      style={styles.appointmentBlock}
                      onClick={() => setSelectedAppointment(apt)}
                    >
                      <p style={styles.petName}>{pet?.name || "Unknown"}</p>
                      <p style={styles.time}>
                        {formatTime(apt.startsAt)}—{formatTime(apt.endsAt)}
                      </p>
                      <p style={styles.customerName}>{customer?.name}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {data.handoffs.length > 0 && (
        <div style={styles.handoffSection}>
          <h3>Callback Queue</h3>
          <div style={styles.handoffList}>
            {data.handoffs.map((handoff) => (
              <div key={handoff.id} style={styles.handoffItem}>
                <p>{handoff.reason}</p>
                <p style={styles.handoffStatus}>{handoff.status}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedAppointment && (
        <div style={styles.detailsPanel}>
          <button
            onClick={() => setSelectedAppointment(null)}
            style={styles.closeBtn}
          >
            ✕
          </button>
          <h3>Appointment Details</h3>
          {(() => {
            const customer = getCustomer(selectedAppointment.customerId);
            const pet = getPet(selectedAppointment.petId);
            return (
              <div style={styles.details}>
                <p>
                  <strong>Pet:</strong> {pet?.name} ({pet?.breed})
                </p>
                <p>
                  <strong>Client:</strong> {customer?.name}
                </p>
                <p>
                  <strong>Phone:</strong> {customer?.phone}
                </p>
                <p>
                  <strong>Time:</strong> {formatTime(selectedAppointment.startsAt)}
                </p>
                <p>
                  <strong>Price:</strong> $
                  {(selectedAppointment.quotedPriceCents || 0) / 100}
                </p>
                <p>
                  <strong>Status:</strong> {selectedAppointment.status}
                </p>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  dateSelector: {
    display: "flex",
    gap: "1rem",
    alignItems: "center",
    marginBottom: "2rem",
    background: "white",
    padding: "1rem",
    borderRadius: "8px",
  } as React.CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "2rem",
    marginBottom: "2rem",
  } as React.CSSProperties,
  staffColumn: {
    background: "white",
    borderRadius: "12px",
    padding: "1.5rem",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  },
  staffName: {
    color: "var(--mint)",
    marginBottom: "1rem",
    paddingBottom: "0.5rem",
    borderBottom: "2px solid var(--mint)",
  },
  appointments: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  appointmentBlock: {
    background: "var(--cream)",
    borderRadius: "8px",
    padding: "1rem",
    cursor: "pointer",
    transition: "all 0.2s",
    border: "1px solid var(--mint-light)",
  },
  petName: {
    fontWeight: 500,
    color: "var(--charcoal)",
    margin: "0 0 0.25rem 0",
  },
  time: {
    fontSize: "0.875rem",
    color: "var(--mint)",
    margin: "0 0 0.25rem 0",
  },
  customerName: {
    fontSize: "0.875rem",
    color: "var(--charcoal)",
    opacity: 0.7,
    margin: 0,
  },
  empty: {
    color: "var(--charcoal)",
    opacity: 0.5,
    fontSize: "0.9rem",
  },
  handoffSection: {
    background: "white",
    borderRadius: "12px",
    padding: "1.5rem",
    marginBottom: "2rem",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  },
  handoffList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  handoffItem: {
    background: "var(--mint-light)",
    padding: "1rem",
    borderRadius: "8px",
    borderLeft: "4px solid var(--warning)",
  },
  handoffStatus: {
    fontSize: "0.875rem",
    color: "var(--charcoal)",
    opacity: 0.7,
    margin: "0.5rem 0 0 0",
  },
  detailsPanel: {
    background: "white",
    borderRadius: "12px",
    padding: "2rem",
    position: "fixed" as const,
    bottom: "2rem",
    right: "2rem",
    maxWidth: "300px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
  },
  closeBtn: {
    position: "absolute" as const,
    top: "1rem",
    right: "1rem",
    background: "transparent",
    border: "none",
    fontSize: "1.5rem",
    cursor: "pointer",
    padding: "0",
  },
  details: {
    marginTop: "1rem",
  },
  error: {
    color: "var(--error)",
    padding: "1rem",
    background: "rgba(211, 47, 47, 0.1)",
    borderRadius: "8px",
  },
  loading: {
    padding: "2rem",
    textAlign: "center" as const,
    color: "var(--charcoal)",
  },
};
