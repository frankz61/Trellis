import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getJSON, postJSON, USER_ID } from "../api";
import Icon from "../components/Icon";
import { EmptyState, InlineError, PageHeader } from "../components/Page";

interface ReviewItem {
  kind: string;
  item: string;
  exercise?: {
    id?: string;
    prompt?: string;
  };
}

interface PracticeResult {
  correct?: boolean;
  feedback?: string;
  new_mastery?: unknown;
}

export default function PracticePage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, PracticeResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const didRequest = useRef(false);

  useEffect(() => {
    if (didRequest.current) return;
    didRequest.current = true;

    getJSON<ReviewItem[]>(`/api/reviews/today?user_id=${USER_ID}`)
      .then((response) => setItems(Array.isArray(response) ? response : []))
      .catch((requestError) => {
        setItems([]);
        setError(requestError instanceof Error ? requestError.message : "练习加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  async function submit(exerciseId: string) {
    try {
      setError("");
      const response = await postJSON<PracticeResult>("/api/practice/answer", {
        user_id: USER_ID,
        exercise_id: exerciseId,
        answer: answers[exerciseId] || "",
      });
      setResults((current) => ({ ...current, [exerciseId]: response }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "答案提交失败");
    }
  }

  return (
    <div className="page">
      <PageHeader
        description="练习来自你的真实对话和薄弱点。少量、精准，比刷很多题更有效。"
        eyebrow="Daily practice"
        title="每日练习"
        action={
          <div className="header-note">
            <Icon name="clock" size={18} />
            <span>按你的节奏完成</span>
          </div>
        }
      />

      {error && <InlineError>{error}</InlineError>}

      <section className="card content-card">
        <div className="content-card__header">
          <div>
            <span className="section-kicker">Today</span>
            <h2>今天的针对性练习</h2>
          </div>
          <span className="count-badge">{items.length} 项</span>
        </div>

        {loading ? (
          <div className="skeleton-list" aria-label="练习加载中">
            <span />
            <span />
            <span />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            action={
              <Link className="button button--primary" to="/">
                开始一次对话
                <Icon name="arrow" size={16} />
              </Link>
            }
            description="先在对话中表达一些真实想法，Trellis 会根据你的薄弱点生成练习。"
            icon="practice"
            title="还没有待完成的练习"
          />
        ) : (
          <div className="exercise-list">
            {items.map((review, index) => {
              const exercise = review.exercise || {};
              const exerciseId = exercise.id || `exercise-${index}`;
              const result = results[exerciseId];

              return (
                <article className="exercise-card" key={exerciseId}>
                  <div className="exercise-card__number">{String(index + 1).padStart(2, "0")}</div>
                  <div className="exercise-card__content">
                    <div className="exercise-meta">
                      <span>{review.kind === "word" ? "词汇" : "语法"}</span>
                      <strong>{review.item}</strong>
                    </div>
                    <h3>{exercise.prompt || "完成下面的英语练习"}</h3>
                    <div className="answer-row">
                      <input
                        aria-label={`回答 ${review.item}`}
                        onChange={(event) =>
                          setAnswers((current) => ({ ...current, [exerciseId]: event.target.value }))
                        }
                        placeholder="在这里输入你的答案"
                        value={answers[exerciseId] || ""}
                      />
                      <button
                        className="button button--primary"
                        disabled={!answers[exerciseId]?.trim()}
                        onClick={() => void submit(exerciseId)}
                        type="button"
                      >
                        检查答案
                      </button>
                    </div>
                    {result && (
                      <div className={`result-box result-box--${result.correct ? "correct" : "retry"}`}>
                        <Icon name={result.correct ? "check" : "close"} size={18} />
                        <div>
                          <strong>{result.correct ? "回答正确" : "再想一想"}</strong>
                          <p>{result.feedback}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
