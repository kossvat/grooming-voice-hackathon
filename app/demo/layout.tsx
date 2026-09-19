"use client";

import { ConversationProvider } from "@elevenlabs/react";

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConversationProvider>
      {children}
    </ConversationProvider>
  );
}
