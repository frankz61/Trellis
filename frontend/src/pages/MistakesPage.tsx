import { useEffect, useState } from "react";
import { getJSON, USER_ID } from "../api";

export default function MistakesPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    getJSON<any[]>(`/api/mistakes?user_id=${USER_ID}`).then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([]));
  }, []);
  return (
    <div>
      <h2>错因本</h2>
      {rows.length === 0 && <p style={{ color: "#999" }}>暂无错误记录</p>}
      {rows.map((r, i) => (
        <div key={i} style={{ border: "1px solid #eee", padding: 12, marginBottom: 8 }}>
          <div>{r.original} → {r.corrected}</div>
          <small>{r.type} · {r.grammar}</small>
        </div>
      ))}
    </div>
  );
}
