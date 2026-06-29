import { useState } from "react";
import { streamChat } from "../api";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");
  const [meta, setMeta] = useState<any>(null);
  const sessionId = "default";

  async function send() {
    if (!input.trim()) return;
    setReply("");
    setMeta(null);
    const msg = input;
    setInput("");
    await streamChat(msg, sessionId, (d) => setReply((r) => r + d), (m) => setMeta(m));
  }

  return (
    <div style={{ display: "flex", gap: 24 }}>
      <div style={{ flex: 2 }}>
        <h2>对话陪练</h2>
        <div style={{ minHeight: 120, whiteSpace: "pre-wrap", border: "1px solid #eee", padding: 12 }}>
          {reply || "开始用英语和 Agent 对话吧…"}
        </div>
        <div style={{ marginTop: 12 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            style={{ width: "70%" }}
            placeholder="Type in English..."
          />
          <button onClick={send}>发送</button>
        </div>
      </div>
      <aside style={{ flex: 1 }}>
        <h3>本轮知识点</h3>
        {meta ? (
          <>
            <h4>纠错</h4>
            <ul>
              {(meta.corrections || []).map((c: any, i: number) => (
                <li key={i}>{c.orig} → {c.fix} <small>({c.type})</small></li>
              ))}
            </ul>
            <h4>生词</h4>
            <ul>
              {(meta.new_words || []).map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </>
        ) : (
          <p style={{ color: "#999" }}>对话后这里显示纠错与生词</p>
        )}
      </aside>
    </div>
  );
}
