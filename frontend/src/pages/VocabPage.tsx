import { useEffect, useState } from "react";
import { getJSON, USER_ID } from "../api";

export default function VocabPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    getJSON<any[]>(`/api/vocab?user_id=${USER_ID}`).then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([]));
  }, []);
  return (
    <div>
      <h2>生词本</h2>
      <table cellPadding={6}>
        <thead><tr><th>单词</th><th>释义</th><th>掌握度</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}><td>{r.lemma}</td><td>{r.meaning_cn}</td><td>{r.mastery_level}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
