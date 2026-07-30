export const USER_ID = "local-user";

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export async function streamChat(
  message: string,
  sessionId: string,
  onToken: (delta: string) => void,
  onMeta: (meta: ChatMeta) => void
) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: USER_ID, session_id: sessionId, message }),
  });
  if (!res.ok) {
    throw new Error(`对话请求失败（${res.status}）`);
  }
  if (!res.body) {
    throw new Error("浏览器未收到对话数据流");
  }

  const reader = res.body.getReader();
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
      else if (ev === "meta") onMeta(parsed as ChatMeta);
    }
  }
}

export interface ChatMeta {
  corrections: Array<{
    orig: string;
    fix: string;
    type?: string;
  }>;
  new_words: string[];
}

export interface ChatSession {
  session_id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

export interface ChatHistoryMessage {
  id: number;
  role: "assistant" | "user";
  content: string;
  created_at: string;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  model: string;
}

export async function transcribeAudio(
  audio: Blob,
  filename: string
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("language", "en");

  const response = await fetch("/api/audio/transcriptions", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    let detail = `语音识别失败（${response.status}）`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(detail);
  }
  return response.json() as Promise<TranscriptionResult>;
}

export async function synthesizeSpeech(
  text: string,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await fetch("/api/audio/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) {
    let detail = `语音合成失败（${response.status}）`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(detail);
  }
  return response.blob();
}

export function getChatSessions(): Promise<ChatSession[]> {
  return getJSON<ChatSession[]>(`/api/chat/sessions?user_id=${encodeURIComponent(USER_ID)}`);
}

export function getChatHistory(sessionId: string): Promise<ChatHistoryMessage[]> {
  const query = new URLSearchParams({
    user_id: USER_ID,
    session_id: sessionId,
  });
  return getJSON<ChatHistoryMessage[]>(`/api/chat/history?${query}`);
}

async function writeJSON<T>(path: string, method: "POST" | "PUT", body: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`保存失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export function postJSON<T>(path: string, body: unknown): Promise<T> {
  return writeJSON<T>(path, "POST", body);
}

export function putJSON<T>(path: string, body: unknown): Promise<T> {
  return writeJSON<T>(path, "PUT", body);
}
