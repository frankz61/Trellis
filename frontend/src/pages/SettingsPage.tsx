import { useEffect, useState } from "react";
import { getJSON, putJSON, USER_ID } from "../api";
import Icon from "../components/Icon";
import { InlineError, PageHeader } from "../components/Page";

interface UserSettings {
  base_url: string | null;
  model_name: string | null;
  temperature: number | null;
  auto_save: boolean;
}

const defaults: UserSettings = {
  base_url: null,
  model_name: null,
  temperature: 0.3,
  auto_save: true,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON<UserSettings>(`/api/settings?user_id=${USER_ID}`)
      .then((response) => setSettings({ ...defaults, ...response }))
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "设置加载失败")
      )
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    try {
      setSaving(true);
      setSaved(false);
      setError("");
      const response = await putJSON<UserSettings>(`/api/settings?user_id=${USER_ID}`, settings);
      setSettings({ ...defaults, ...response });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2400);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "设置保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page page--settings">
      <PageHeader
        description="调整与你对话的模型和学习偏好。留空时自动使用服务端环境配置。"
        eyebrow="Personalize"
        title="设置"
      />

      {error && <InlineError>{error}</InlineError>}

      <div className="settings-layout">
        <section className="card settings-card">
          <div className="settings-card__header">
            <span className="section-heading__icon">
              <Icon name="settings" size={19} />
            </span>
            <div>
              <h2>模型偏好</h2>
              <p>仅覆盖当前用户，不影响服务端默认配置。</p>
            </div>
          </div>

          {loading ? (
            <div className="settings-skeleton">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <div className="form-stack">
              <label className="field">
                <span>
                  <strong>模型名称</strong>
                  <small>例如 gpt-4.1-mini 或 deepseek-chat</small>
                </span>
                <input
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, model_name: event.target.value }))
                  }
                  placeholder="使用服务端默认模型"
                  value={settings.model_name || ""}
                />
              </label>

              <label className="field">
                <span>
                  <strong>API Base URL</strong>
                  <small>OpenAI 兼容接口地址</small>
                </span>
                <input
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, base_url: event.target.value }))
                  }
                  placeholder="使用服务端默认地址"
                  type="url"
                  value={settings.base_url || ""}
                />
              </label>

              <label className="field">
                <span>
                  <strong>回复灵活度</strong>
                  <small>数值越高，表达越有变化</small>
                </span>
                <div className="range-field">
                  <input
                    max="1"
                    min="0"
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        temperature: Number(event.target.value),
                      }))
                    }
                    step="0.1"
                    type="range"
                    value={settings.temperature ?? 0.3}
                  />
                  <output>{(settings.temperature ?? 0.3).toFixed(1)}</output>
                </div>
              </label>

              <label className="toggle-row">
                <span>
                  <strong>自动保存学习记录</strong>
                  <small>保留会话、错因和词汇进度</small>
                </span>
                <input
                  checked={settings.auto_save}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, auto_save: event.target.checked }))
                  }
                  type="checkbox"
                />
              </label>
            </div>
          )}

          <div className="settings-card__footer">
            <span className={`save-status${saved ? " save-status--visible" : ""}`}>
              <Icon name="check" size={15} />
              设置已保存
            </span>
            <button
              className="button button--primary"
              disabled={loading || saving}
              onClick={() => void save()}
              type="button"
            >
              {saving ? "保存中…" : "保存设置"}
            </button>
          </div>
        </section>

        <aside className="settings-aside">
          <section className="settings-note">
            <div className="settings-note__icon">
              <Icon name="sparkles" size={19} />
            </div>
            <div>
              <strong>关于 API Key</strong>
              <p>密钥只从后端环境变量读取，不会进入浏览器或保存在这里。</p>
            </div>
          </section>
          <section className="settings-note settings-note--green">
            <div className="settings-note__icon">
              <Icon name="leaf" size={19} />
            </div>
            <div>
              <strong>本地优先</strong>
              <p>学习数据由你部署的 PostgreSQL 与 Neo4j 保存。</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
