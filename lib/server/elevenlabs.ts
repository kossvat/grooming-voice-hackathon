// ElevenLabs Agents REST: mint a WebRTC conversation token and prebind its
// provider conversation_id. LIVE VERIFIED by coordinator: returns token AND
// conversation_id.

export interface ConversationTokenResult {
  token: string;
  conversationId: string;
}

export async function fetchConversationToken(
  agentId: string,
  apiKey: string,
): Promise<ConversationTokenResult> {
  const url = `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`elevenlabs_token_failed:${res.status}`);
  }
  const data = (await res.json()) as { token?: string; conversation_id?: string };
  if (!data.token || !data.conversation_id) {
    throw new Error("elevenlabs_token_missing_fields");
  }
  return { token: data.token, conversationId: data.conversation_id };
}
