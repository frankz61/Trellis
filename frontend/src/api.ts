export const USER_ID = "local-user";

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  return res.json();
}

// Chat companion: consume the SSE stream
export async function streamChat(
  message: string,
  sessionId: string,
  onToken: (delta: string) => void,
  onMeta: (meta: any) => void
) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, session_id: sessionId, message }),
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const ev = block.match(/event: (.*)/)?.[1];
      const data = block.match(/data: (.*)/)?.[1];
      if (!data) continue;
      const parsed = JSON.parse(data);
      if (ev === "token") onToken(parsed.delta);
      else if (ev === "meta") onMeta(parsed);
    }
  }
}

export async function postJSON<T>(path: string, body: any): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
