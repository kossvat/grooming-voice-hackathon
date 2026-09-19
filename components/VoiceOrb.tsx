"use client";

import { CSSProperties } from "react";

interface VoiceOrbProps {
  status: string;
  isSpeaking: boolean;
  isListening: boolean;
}

export default function VoiceOrb({
  status,
  isSpeaking,
  isListening,
}: VoiceOrbProps) {
  const isConnected = status === "connected" || status === "connecting";
  const active = isConnected && (isSpeaking || isListening);

  const orbStyle: CSSProperties = {
    width: "120px",
    height: "120px",
    borderRadius: "50%",
    background: isConnected
      ? "radial-gradient(circle at 35% 35%, var(--mint), #7ec8c8)"
      : "var(--charcoal)",
    margin: "2rem auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: active
      ? "0 0 30px rgba(168, 216, 216, 0.6), inset 0 0 20px rgba(255,255,255,0.2)"
      : "0 4px 12px rgba(0, 0, 0, 0.2)",
    transition: "all 0.3s",
    animation: active ? "pulse 1.5s infinite" : "none",
  };

  const statusText: Record<string, string> = {
    disconnected: "Disconnected",
    connecting: "Connecting...",
    connected: isSpeaking ? "Speaking" : "Listening",
    error: "Connection error",
  };
  const text = statusText[status] ?? (isConnected ? "Ready" : "Disconnected");

  return (
    <div style={{ textAlign: "center" }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 30px rgba(168, 216, 216, 0.6), inset 0 0 20px rgba(255,255,255,0.2); }
          50% { box-shadow: 0 0 50px rgba(168, 216, 216, 0.9), inset 0 0 20px rgba(255,255,255,0.3); }
        }
      `}</style>
      <div style={orbStyle}>
        <svg width="60" height="60" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 1C6.48 1 2 5.48 2 11v8c0 1.1.9 2 2 2h4v-6H4v-4c0-4.41 3.59-8 8-8s8 3.59 8 8v4h-4v6h4c1.1 0 2-.9 2-2v-8c0-5.52-4.48-10-10-10z"
            fill={isConnected ? "var(--charcoal)" : "var(--mint)"}
          />
        </svg>
      </div>
      <p style={{ fontSize: "0.9rem", color: "var(--charcoal)", marginTop: "1rem" }}>
        {text}
      </p>
    </div>
  );
}
