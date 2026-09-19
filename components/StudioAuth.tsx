"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function StudioAuth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.status === 401) {
          setError("Invalid email or password");
        } else if (error.status === 403) {
          setError("Access denied. This account is not a studio member.");
        } else {
          setError(error.message || "Sign in failed");
        }
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Studio Access</h1>
        <p style={styles.subtitle}>Sign in to view appointments and schedules</p>

        <form onSubmit={handleSignIn} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@studio.demo"
              disabled={loading}
              required
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={styles.submitBtn}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "400px",
    margin: "4rem auto 0",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    padding: "2rem",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
  },
  title: {
    textAlign: "center" as const,
    marginBottom: "0.5rem",
  },
  subtitle: {
    textAlign: "center" as const,
    color: "var(--charcoal)",
    opacity: 0.7,
    marginBottom: "2rem",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  },
  submitBtn: {
    background: "var(--mint)",
    color: "var(--charcoal)",
    padding: "0.875rem",
    fontWeight: 500,
    marginTop: "0.5rem",
  },
  error: {
    color: "var(--error)",
    fontSize: "0.875rem",
  },
};
