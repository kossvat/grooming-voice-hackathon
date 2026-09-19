"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import StudioAuth from "@/components/StudioAuth";
import StudioDashboard from "@/components/StudioDashboard";

export default function StudioPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const initAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          setIsAuthenticated(true);
          setAccessToken(session.access_token);
        } else {
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setIsAuthenticated(false);
      }
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session) {
          setIsAuthenticated(true);
          setAccessToken(session.access_token);
          setError("");
        } else {
          setIsAuthenticated(false);
          setAccessToken("");
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [mounted]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setAccessToken("");
  };

  if (!mounted || isAuthenticated === null) {
    return (
      <div style={styles.container}>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {!isAuthenticated ? (
        <StudioAuth />
      ) : (
        <>
          <div style={styles.header}>
            <h1>Studio Dashboard</h1>
            <button onClick={handleLogout} style={styles.logoutBtn}>
              Sign Out
            </button>
          </div>
          <p style={styles.demoLabel}>
            AI voice assistant · fictional demo studio
          </p>
          {error && <div style={styles.error}>{error}</div>}
          <StudioDashboard accessToken={accessToken} />
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, var(--cream) 0%, var(--mint-light) 100%)",
    padding: "2rem 1rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.5rem",
  } as React.CSSProperties,
  logoutBtn: {
    background: "var(--charcoal)",
    color: "white",
    padding: "0.5rem 1rem",
    fontSize: "0.9rem",
  },
  demoLabel: {
    fontSize: "0.75rem",
    color: "var(--charcoal)",
    opacity: 0.5,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: "1.5rem",
  },
  error: {
    color: "var(--error)",
    marginBottom: "1rem",
    padding: "1rem",
    background: "rgba(211, 47, 47, 0.1)",
    borderRadius: "8px",
  },
};
