import { useEffect, useState } from "react";
import { getJSON, USER_ID } from "../api";

export default function SettingsPage() {
  const [s, setS] = useState<any>({ model_name: "", auto_save: true });
  useEffect(() => {
    getJSON<any>(`/api/settings?user_id=${USER_ID}`).then(setS).catch(() => {});
  }, []);
  async function save() {
    await fetch(`/api/settings?user_id=${USER_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    alert("已保存");
  }
  return (
    <div>
      <h2>设置</h2>
      <p>模型：<input value={s.model_name || ""} onChange={(e) => setS({ ...s, model_name: e.target.value })} /></p>
      <p>自动保存：<input type="checkbox" checked={!!s.auto_save} onChange={(e) => setS({ ...s, auto_save: e.target.checked })} /></p>
      <button onClick={save}>保存</button>
    </div>
  );
}
