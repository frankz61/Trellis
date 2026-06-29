import { useEffect, useState } from "react";
import { getJSON, postJSON, USER_ID } from "../api";

export default function PracticePage() {
  const [items, setItems] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, any>>({});

  useEffect(() => {
    getJSON<any[]>(`/api/reviews/today?user_id=${USER_ID}`)
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch(() => setItems([]));
  }, []);

  async function submit(exId: string) {
    const res = await postJSON<any>(`/api/practice/answer`, {
      user_id: USER_ID,
      exercise_id: exId,
      answer: answers[exId] || "",
    });
    setResults((m) => ({ ...m, [exId]: res }));
  }

  return (
    <div>
      <h2>每日练习</h2>
      {items.length === 0 && (
        <p style={{ color: "#999" }}>暂无练习项（先去对话陪练沉淀一些薄弱点）</p>
      )}
      {items.map((it, i) => {
        const ex = it.exercise || {};
        const exId = ex.id;
        const res = results[exId];
        return (
          <div key={i} style={{ border: "1px solid #eee", padding: 12, marginBottom: 8 }}>
            <small>{it.kind} · {it.item}</small>
            <p>{ex.prompt}</p>
            <input
              value={answers[exId] || ""}
              onChange={(e) => setAnswers((m) => ({ ...m, [exId]: e.target.value }))}
              placeholder="你的答案"
              style={{ width: "60%" }}
            />
            <button onClick={() => submit(exId)} style={{ marginLeft: 8 }}>提交</button>
            {res && (
              <div style={{ marginTop: 8, color: res.correct ? "green" : "crimson" }}>
                {res.correct ? "✅ 正确" : "❌ 待改进"} — {res.feedback}
                {res.new_mastery != null && (
                  <span> · 掌握度: {JSON.stringify(res.new_mastery)}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
