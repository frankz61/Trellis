import { lazy, Suspense } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Icon, { type IconName } from "./components/Icon";
import { PageLoader } from "./components/Page";

const ChatPage = lazy(() => import("./pages/ChatPage"));
const PracticePage = lazy(() => import("./pages/PracticePage"));
const VocabPage = lazy(() => import("./pages/VocabPage"));
const MistakesPage = lazy(() => import("./pages/MistakesPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

const navigation: Array<{ to: string; label: string; caption: string; icon: IconName; end?: boolean }> = [
  { to: "/", label: "对话陪练", caption: "自然交流", icon: "chat", end: true },
  { to: "/practice", label: "每日练习", caption: "巩固薄弱点", icon: "practice" },
  { to: "/vocab", label: "生词本", caption: "积累表达", icon: "book" },
  { to: "/mistakes", label: "错因本", caption: "复盘纠错", icon: "mistakes" },
  { to: "/settings", label: "设置", caption: "个性化 Agent", icon: "settings" },
];

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark">
            <Icon name="leaf" size={25} />
          </div>
          <div>
            <strong>Trellis</strong>
            <span>Grow your English</span>
          </div>
        </div>

        <div className="sidebar__section-label">学习空间</div>
        <nav className="navigation" aria-label="主要导航">
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) => `nav-item${isActive ? " nav-item--active" : ""}`}
              end={item.end}
              key={item.to}
              to={item.to}
            >
              <span className="nav-item__icon">
                <Icon name={item.icon} size={19} />
              </span>
              <span className="nav-item__copy">
                <strong>{item.label}</strong>
                <small>{item.caption}</small>
              </span>
              <Icon className="nav-item__chevron" name="chevron" size={16} />
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar-tip__icon">
            <Icon name="sparkles" size={18} />
          </div>
          <div>
            <strong>一点点，也是在生长</strong>
            <p>每天用英语表达一个真实想法。</p>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="mobile-header">
          <div className="brand brand--mobile">
            <div className="brand__mark">
              <Icon name="leaf" size={22} />
            </div>
            <strong>Trellis</strong>
          </div>
          <span className="status-badge">
            <span className="status-dot" />
            Local
          </span>
        </header>

        <main className="workspace__content">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<ChatPage />} />
              <Route path="/practice" element={<PracticePage />} />
              <Route path="/vocab" element={<VocabPage />} />
              <Route path="/mistakes" element={<MistakesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </main>
      </section>
    </div>
  );
}
