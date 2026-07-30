import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getJSON, USER_ID } from "../api";
import Icon from "../components/Icon";
import { EmptyState, InlineError, PageHeader } from "../components/Page";

interface MistakeRow {
  original?: string;
  corrected?: string;
  type?: string;
  grammar?: string;
  explanation?: string;
  created_at?: string;
}

export default function MistakesPage() {
  const [rows, setRows] = useState<MistakeRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON<MistakeRow[]>(`/api/mistakes?user_id=${USER_ID}`)
      .then((response) => setRows(Array.isArray(response) ? response : []))
      .catch((requestError) => {
        setRows([]);
        setError(requestError instanceof Error ? requestError.message : "错因加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      `${row.original || ""} ${row.corrected || ""} ${row.grammar || ""}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [query, rows]);

  return (
    <div className="page">
      <PageHeader
        description="错误不是扣分项，而是最清晰的学习线索。看见模式，下一次就会更自然。"
        eyebrow="Learning patterns"
        title="错因本"
        action={
          <div className="header-stat header-stat--coral">
            <strong>{rows.length}</strong>
            <span>待掌握模式</span>
          </div>
        }
      />

      {error && <InlineError>{error}</InlineError>}

      <section className="card content-card">
        <div className="toolbar">
          <div className="search-box">
            <Icon name="search" size={18} />
            <input
              aria-label="搜索错因"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索原句、纠正或语法点"
              value={query}
            />
          </div>
          <span className="toolbar__hint">最近记录优先</span>
        </div>

        {loading ? (
          <div className="skeleton-list" aria-label="错因加载中">
            <span />
            <span />
            <span />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            action={
              <Link className="button button--primary" to="/">
                开始自然对话
                <Icon name="arrow" size={16} />
              </Link>
            }
            description="这里会记录有价值的错误模式，并保留原句、纠正与解释，方便以后复盘。"
            icon="mistakes"
            title="暂时没有错误记录"
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState description="换一个关键词试试看。" icon="search" title="没有匹配的记录" />
        ) : (
          <div className="mistake-list">
            {filteredRows.map((row, index) => (
              <article className="mistake-card" key={`${row.original}-${index}`}>
                <div className="mistake-card__top">
                  <span className="mistake-tag">{row.type || "表达优化"}</span>
                  {row.grammar && <span className="grammar-tag">{row.grammar}</span>}
                </div>
                <div className="sentence-comparison">
                  <div>
                    <small>原句</small>
                    <p>{row.original || "—"}</p>
                  </div>
                  <div className="comparison-arrow">
                    <Icon name="arrow" size={18} />
                  </div>
                  <div>
                    <small>更自然的表达</small>
                    <p>{row.corrected || "—"}</p>
                  </div>
                </div>
                {row.explanation && <p className="mistake-explanation">{row.explanation}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
