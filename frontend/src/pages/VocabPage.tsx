import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getJSON, USER_ID } from "../api";
import Icon from "../components/Icon";
import { EmptyState, InlineError, PageHeader } from "../components/Page";

interface VocabRow {
  lemma?: string;
  meaning_cn?: string;
  mastery_level?: number;
  review_count?: number;
}

export default function VocabPage() {
  const [rows, setRows] = useState<VocabRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON<VocabRow[]>(`/api/vocab?user_id=${USER_ID}`)
      .then((response) => setRows(Array.isArray(response) ? response : []))
      .catch((requestError) => {
        setRows([]);
        setError(requestError instanceof Error ? requestError.message : "生词加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      `${row.lemma || ""} ${row.meaning_cn || ""}`.toLowerCase().includes(normalized)
    );
  }, [query, rows]);

  return (
    <div className="page">
      <PageHeader
        description="从真实表达中积累词汇，不背孤立单词。每一次使用都在加深掌握。"
        eyebrow="Vocabulary garden"
        title="生词本"
        action={
          <div className="header-stat">
            <strong>{rows.length}</strong>
            <span>累计词汇</span>
          </div>
        }
      />

      {error && <InlineError>{error}</InlineError>}

      <section className="card content-card">
        <div className="toolbar">
          <div className="search-box">
            <Icon name="search" size={18} />
            <input
              aria-label="搜索生词"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索单词或中文释义"
              value={query}
            />
          </div>
          <span className="toolbar__hint">按最近学习排序</span>
        </div>

        {loading ? (
          <div className="skeleton-table" aria-label="生词加载中">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            action={
              <Link className="button button--primary" to="/">
                去对话中积累
                <Icon name="arrow" size={16} />
              </Link>
            }
            description="在对话中遇到值得学习的表达时，Agent 会自动帮你整理到这里。"
            icon="book"
            title="你的词汇花园还是空的"
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState description="换一个关键词试试看。" icon="search" title="没有匹配的词汇" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>单词</th>
                  <th>中文释义</th>
                  <th>掌握度</th>
                  <th>复习次数</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => {
                  const mastery = Math.max(0, Math.min(5, row.mastery_level || 0));
                  return (
                    <tr key={`${row.lemma}-${index}`}>
                      <td><strong className="word-cell">{row.lemma || "—"}</strong></td>
                      <td>{row.meaning_cn || "待补充"}</td>
                      <td>
                        <div className="mastery">
                          <div className="mastery__bars">
                            {[1, 2, 3, 4, 5].map((level) => (
                              <span className={level <= mastery ? "is-active" : ""} key={level} />
                            ))}
                          </div>
                          <small>{mastery}/5</small>
                        </div>
                      </td>
                      <td>{row.review_count || 0} 次</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
