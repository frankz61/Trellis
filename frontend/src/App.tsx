import { Link, Route, Routes } from "react-router-dom";
import ChatPage from "./pages/ChatPage";
import PracticePage from "./pages/PracticePage";
import VocabPage from "./pages/VocabPage";
import MistakesPage from "./pages/MistakesPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <div style={{ fontFamily: "system-ui", display: "flex", minHeight: "100vh" }}>
      <nav style={{ width: 180, padding: 16, borderRight: "1px solid #eee" }}>
        <h3>Trellis</h3>
        <ul style={{ listStyle: "none", padding: 0, lineHeight: 2 }}>
          <li><Link to="/">对话陪练</Link></li>
          <li><Link to="/practice">每日练习</Link></li>
          <li><Link to="/vocab">生词本</Link></li>
          <li><Link to="/mistakes">错因本</Link></li>
          <li><Link to="/settings">设置</Link></li>
        </ul>
      </nav>
      <main style={{ flex: 1, padding: 24 }}>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/vocab" element={<VocabPage />} />
          <Route path="/mistakes" element={<MistakesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
