// Mint a single-use WebSocket URL with a provider-selected conversation ID.
// include_conversation_id adds the ID to the signed URL query, not the JSON
// response. This keeps authoritative prebinding without relying on LiveKit.

export interface SignedConversationResult {
  signedUrl: string;
  conversationId: string;
}

export async function fetchSignedConversation(
  agentId: string,
  apiKey: string,
): Promise<SignedConversationResult> {
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}&include_conversation_id=true`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`elevenlabs_signed_url_failed:${res.status}`);
  }
  const data = (await res.json()) as { signed_url?: string };
  if (!data.signed_url) {
    throw new Error("elevenlabs_signed_url_missing");
  }
  const signed = new URL(data.signed_url);
  const conversationId = signed.searchParams.get("conversation_id");
  if (signed.protocol !== "wss:" || signed.hostname !== "api.elevenlabs.io" ||
      signed.pathname !== "/v1/convai/conversation" || !conversationId?.startsWith("conv_")) {
    throw new Error("elevenlabs_signed_url_invalid");
  }
  return { signedUrl: data.signed_url, conversationId };
}
