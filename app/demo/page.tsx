"use client";

import { useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import VoiceOrb from "@/components/VoiceOrb";
import SessionSummary from "@/components/SessionSummary";

interface SessionData {
  offers: Array<{
    id: string;
    staffName: string;
    serviceName: string;
    startsAt: string;
    startingPriceCents: number;
  }>;
  booking: {
    id: string;
    staffName: string;
    serviceName: string;
    startsAt: string;
    endsAt: string;
    quotedPriceCents: number;
    petName: string;
  } | null;
  handoff: {
    id: string;
    status: string;
  } | null;
}

const EMPTY_SESSION: SessionData = { offers: [], booking: null, handoff: null };

export default function DemoPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [sessionCapability, setSessionCapability] = useState<string>("");
  const [sessionData, setSessionData] = useState<SessionData>(EMPTY_SESSION);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [demoCode, setDemoCode] = useState("");
  const [pollFailures, setPollFailures] = useState(0);

  // Guards against a stale poll response overwriting a newer session's data.
  const sessionRef = useRef<string>("");

  const {
    startSession,
    endSession,
    status,
    isSpeaking,
    isListening,
    isMuted,
    setMuted,
  } = useConversation({
    onConnect: () => setError(""),
    onMessage: () => {},
    onError: (err: unknown) =>
      setError(
        typeof err === "string" ? err : (err as Error)?.message || "Connection error"
      ),
  });

  const resetSession = () => {
    sessionRef.current = "";
    setSessionId("");
    setSessionCapability("");
    setSessionData(EMPTY_SESSION);
    setPollFailures(0);
    setError("");
  };

  const initSession = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demoCode }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      const {
        conversationToken,
        sessionId: newSessionId,
        sessionCapability: newCapability,
      } = await response.json();

      sessionRef.current = newSessionId;
      setSessionId(newSessionId);
      setSessionCapability(newCapability);
      setPollFailures(0);

      // startSession is fire-and-forget (returns void); success/failure arrive
      // via onConnect/onError. We do not await it as proof of connection.
      startSession({
        conversationToken,
        // Use LiveKit's established /rtc signalling path. The SDK's newer
        // single-peer default sends a v1 JoinRequest during connection setup;
        // that handshake fails before the provider starts this demo's call.
        webRtc: { singlePeerConnection: false },
        dynamicVariables: {
          secret__session_capability: newCapability,
        },
      });
    } catch (err) {
      resetSession();
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    endSession();
    resetSession();
  };

  // Poll only while a session is active and the conversation is connected or
  // connecting. Stop on disconnect/error so we never poll a dead session.
  useEffect(() => {
    if (!sessionId || !sessionCapability) return;
    if (status !== "connected" && status !== "connecting") return;

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/voice/session/${sessionId}`, {
          headers: { "X-Session-Capability": sessionCapability },
        });

        if (cancelled) return;

        if (response.ok) {
          const data = await response.json();
          // Ignore stale responses if the session changed mid-flight.
          if (sessionRef.current === sessionId) {
            setSessionData(data);
          }
          setPollFailures(0);
        } else if (response.status === 401 || response.status === 403) {
          // Unauthorized: stop polling and end the live call. Keep any
          // confirmed booking/handoff summary for the user to read.
          setError("Session expired or unauthorized");
          endSession();
        } else {
          setPollFailures((n) => n + 1);
        }
      } catch {
        if (!cancelled) setPollFailures((n) => n + 1);
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, sessionCapability, status, endSession]);

  // Unmount cleanup: end any live conversation.
  useEffect(() => {
    return () => {
      endSession();
    };
  }, [endSession]);

  const callActive = status === "connected" || status === "connecting";
  const callEnded = status === "disconnected" || status === "error";

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>Pet Grooming Reception</h1>
        <p style={styles.subtitle}>Book your appointment by voice</p>
        <p style={styles.demoLabel}>
          AI voice assistant · fictional demo studio
        </p>
      </div>

      <div style={styles.content}>
        {!sessionId ? (
          <div style={styles.startCard}>
            <h2>Ready to book?</h2>
            <p>Press the button below to start talking with our assistant.</p>
            <div style={styles.codeField}>
              <label htmlFor="demoCode">Demo access code</label>
              <input
                id="demoCode"
                type="text"
                value={demoCode}
                onChange={(e) => setDemoCode(e.target.value)}
                placeholder="Enter code"
                disabled={loading}
              />
            </div>
            <button
              onClick={initSession}
              disabled={loading || !demoCode.trim()}
              style={styles.startButton}
            >
              {loading ? "Connecting..." : "Start Voice Session"}
            </button>
            {error && <div style={styles.error}>{error}</div>}
          </div>
        ) : (
          <>
            <VoiceOrb
              status={status}
              isSpeaking={isSpeaking}
              isListening={isListening}
            />
            {error && <div style={styles.error}>{error}</div>}
            {callActive && pollFailures >= 3 && (
              <div style={styles.error}>
                Having trouble reaching the studio. Please try again in a moment.
              </div>
            )}
            {callEnded && (
              <div style={styles.endedNote}>Call ended.</div>
            )}
            <div style={styles.controls}>
              {callActive && (
                <button onClick={() => setMuted(!isMuted)} style={styles.controlBtn}>
                  {isMuted ? "Unmute" : "Mute"}
                </button>
              )}
              {callActive ? (
                <button
                  onClick={handleRetry}
                  style={{ ...styles.controlBtn, ...styles.endBtn }}
                >
                  End Call
                </button>
              ) : (
                <button
                  onClick={handleRetry}
                  style={{ ...styles.controlBtn, ...styles.endBtn }}
                >
                  New Call
                </button>
              )}
            </div>
            <SessionSummary
              data={sessionData}
              connected={callActive}
            />
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, var(--cream) 0%, var(--mint-light) 100%)",
    padding: "2rem 1rem",
  },
  header: {
    textAlign: "center" as const,
    marginBottom: "3rem",
  },
  subtitle: {
    fontSize: "1.125rem",
    color: "var(--charcoal)",
    marginTop: "0.5rem",
    opacity: 0.8,
  },
  demoLabel: {
    fontSize: "0.75rem",
    color: "var(--charcoal)",
    opacity: 0.5,
    marginTop: "0.5rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  content: {
    maxWidth: "600px",
    margin: "0 auto",
  },
  startCard: {
    background: "white",
    borderRadius: "16px",
    padding: "2rem",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    textAlign: "center" as const,
  },
  codeField: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
    textAlign: "left" as const,
    marginTop: "1.5rem",
    marginBottom: "1rem",
  },
  startButton: {
    background: "var(--mint)",
    color: "var(--charcoal)",
    marginTop: "1.5rem",
    padding: "1rem 2rem",
    fontSize: "1.125rem",
    fontWeight: 500,
  },
  controls: {
    display: "flex",
    justifyContent: "center",
    gap: "1rem",
    marginTop: "1rem",
  },
  controlBtn: {
    background: "var(--charcoal)",
    color: "white",
    padding: "0.5rem 1.5rem",
    fontSize: "0.9rem",
  },
  endBtn: {
    background: "var(--error)",
  },
  endedNote: {
    textAlign: "center" as const,
    color: "var(--charcoal)",
    opacity: 0.7,
    fontSize: "0.9rem",
    marginTop: "1rem",
  },
  error: {
    color: "var(--error)",
    marginTop: "1rem",
    fontSize: "0.9rem",
  },
};
