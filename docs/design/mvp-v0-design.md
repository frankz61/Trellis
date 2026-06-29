# 英语学习 Agent — 系统设计文档（MVP v0）

> 上游需求：[../require/mvp-v0.md](../require/mvp-v0.md)
> 本文把"对话陪练 + 每日练习"主线落成可开工的技术方案。
> 既定技术决策：**Neo4j + LangGraph + FastAPI + React + OpenAI 兼容模型**；不上 Graphiti；复习用规则；单用户、本地 docker 部署。

---

## 1. 设计目标与范围

| 项 | 内容 |
|---|---|
| 必须跑通 | 对话陪练 → 实时纠错 → 知识点抽取 → 写 Neo4j 用户状态 → 每日练习 → 回写掌握度 |
| 设计原则 | ① 图谱可信（领域关系靠导入，不靠 LLM 编）② LLM 只处理用户输入与生成 ③ 单一确定方案，能直接编码 |
| 不在本期 | 多用户/鉴权、语音、阅读全文解析、图谱可视化、FSRS、复杂人设、自适应路径 |

---

## 2. 系统架构

### 2.1 分层

```
┌──────────────────────────────────────────────┐
│  前端 React（Vite）                              │
│  对话陪练页 · 每日练习页 · 生词本 · 错因本 · 设置  │
└───────────────────────┬──────────────────────┘
                        │ REST + SSE（流式）
┌───────────────────────┴──────────────────────┐
│  后端 FastAPI                                   │
│  ┌────────────────────────────────────────┐  │
│  │ LangGraph 编排（StateGraph）              │  │
│  │ detect_intent → retrieve → reply →       │  │
│  │ extract → update_graph                   │  │
│  └─────┬───────────────────┬───────────────┘  │
│   ┌────┴─────┐       ┌──────┴──────┐           │
│   │ 模型抽象层 │       │ 工具集 Tools  │           │
│   │ LLMClient │       │ (KG / 练习)  │           │
│   └────┬─────┘       └──────┬──────┘           │
└────────┼────────────────────┼──────────────────┘
         │                    │
   ┌─────┴──────┐      ┌───────┴──────┐   ┌──────────────────────────┐
   │ LLM         │      │ Neo4j         │   │ PostgreSQL                │
   │ API/兼容端点 │      │ 图谱+用户状态   │   │ checkpointer/会话/日志/配置 │
   └────────────┘      └───────────────┘   └──────────────────────────┘
        （Neo4j 与 PostgreSQL 均为已部署的外部服务，应用经 env 连接）
```

> 会话记忆/恢复用 LangGraph 的 `PostgresSaver`（落到已部署的 PostgreSQL）；业务**图谱与用户学习状态在 Neo4j**；**会话流水、用户设置等纯表数据在 PostgreSQL**。两库职责清晰：图关系走 Neo4j，行式/高频/配置走 PG。

### 2.2 目录结构

```
trellis/
  backend/
    app/
      main.py              # FastAPI 入口、路由挂载
      api/                 # 路由层：chat / reviews / vocab / mistakes / settings
      agent/
        graph.py           # LangGraph StateGraph 定义
        state.py           # LearningState
        nodes.py           # 各节点实现
        tools.py           # KG/练习工具（被节点调用）
      kg/
        neo4j_client.py    # 驱动封装、约束初始化
        queries.py         # Cypher 集中管理
      llm/
        client.py          # 模型抽象层（OpenAI 兼容）
      prompts/             # 所有 prompt 模板（独立文件）
      config.py            # 环境变量加载
    scripts/
      import_wordnet.py    # 领域图谱导入（WordNet+词频+CEFR）
    requirements.txt
  frontend/                # React + Vite
  docker/
  docker-compose.yml
  .env.example
  README.md
```

---

## 3. 数据设计（Neo4j）

### 3.1 节点与关系（沿用需求第六节，补全属性）

```
(:Learner   {id, level, created_at, auto_save})
(:Word      {lemma, meaning_cn, meaning_en, pos, cefr, freq, source})
(:GrammarPoint {name, cefr, desc})
(:Mistake   {id, original_text, corrected_text, mistake_type, explanation, created_at})
(:Exercise  {id, kind, prompt, answer, target_ref, created_at})   # kind: cloze|sentence_make|mini_dialogue

(:Learner)-[:KNOWS    {mastery_level:int(0-5), review_count, last_reviewed_at}]->(:Word)
(:Learner)-[:WEAK_AT  {count, updated_at}]                                     ->(:GrammarPoint)
(:Learner)-[:MADE]                                                            ->(:Mistake)
(:Mistake)-[:OF_TYPE]                                                         ->(:GrammarPoint)
(:Mistake)-[:RELATES_TO]                                                      ->(:Word)
(:Word)-[:SYNONYM_OF | :ANTONYM_OF | :COLLOCATES_WITH]                       ->(:Word)
(:Exercise)-[:TARGETS]                                                        ->(:Word|:GrammarPoint)
```

`mistake_type` 枚举：`tense / article / subject_verb_agreement / preposition / word_choice / collocation / sentence_structure / spelling`。

### 3.2 约束与索引（初始化时建）

```cypher
CREATE CONSTRAINT learner_id  IF NOT EXISTS FOR (l:Learner)      REQUIRE l.id    IS UNIQUE;
CREATE CONSTRAINT word_lemma  IF NOT EXISTS FOR (w:Word)         REQUIRE w.lemma IS UNIQUE;
CREATE CONSTRAINT grammar_nm  IF NOT EXISTS FOR (g:GrammarPoint) REQUIRE g.name  IS UNIQUE;
CREATE CONSTRAINT mistake_id  IF NOT EXISTS FOR (m:Mistake)      REQUIRE m.id    IS UNIQUE;
CREATE INDEX word_cefr        IF NOT EXISTS FOR (w:Word)         ON (w.cefr);
```

### 3.3 关键 Cypher（集中在 `kg/queries.py`）

```cypher
-- 写入一次错误并标记薄弱点（upsert）
MERGE (l:Learner {id:$uid})
CREATE (m:Mistake {id:$mid, original_text:$orig, corrected_text:$corr,
                   mistake_type:$type, explanation:$exp, created_at:datetime()})
MERGE (g:GrammarPoint {name:$grammar})
MERGE (l)-[:MADE]->(m)
MERGE (m)-[:OF_TYPE]->(g)
MERGE (l)-[w:WEAK_AT]->(g)
  ON CREATE SET w.count=1, w.updated_at=datetime()
  ON MATCH  SET w.count=w.count+1, w.updated_at=datetime();

-- 每日练习选材：薄弱语法 + 未掌握生词
MATCH (l:Learner {id:$uid})-[w:WEAK_AT]->(g:GrammarPoint)
RETURN g.name AS item, 'grammar' AS kind, w.count AS weight
ORDER BY w.count DESC LIMIT 3
UNION
MATCH (l:Learner {id:$uid})-[k:KNOWS]->(wd:Word)
WHERE k.mastery_level < 3
RETURN wd.lemma AS item, 'word' AS kind, (3-k.mastery_level) AS weight
ORDER BY weight DESC LIMIT 2;
```

### 3.4 PostgreSQL 表（关系数据）

```sql
-- 会话流水（高频、纯表，不进图谱）
CREATE TABLE session_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL,            -- user | assistant
  content     TEXT NOT NULL,
  intent      TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON session_log (user_id, session_id, created_at);

-- 用户设置（模型配置 / 自动保存开关）
CREATE TABLE user_settings (
  user_id     TEXT PRIMARY KEY,
  base_url    TEXT,
  model_name  TEXT,
  temperature REAL,
  auto_save   BOOLEAN DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- LangGraph checkpointer 表（checkpoints / checkpoint_writes 等）由 PostgresSaver.setup() 自动建，无需手写
```

> 划分原则：**词汇/语法关系 + 用户掌握状态（KNOWS/WEAK_AT/MADE）→ Neo4j**；**会话历史/流水、设置、checkpointer → PostgreSQL**。"今日复习"选材是图查询，留在 Neo4j。

---

## 4. Agent 设计（LangGraph）

### 4.1 State

```python
class LearningState(TypedDict):
    user_id: str
    session_id: str
    messages: Annotated[list, add_messages]   # 对话历史（checkpointer 持久化）
    user_input: str
    scenario: str | None                      # 可选情景/人设，v0 默认 None=通用陪练
    intent: str                               # detect_intent 输出
    kg_context: dict                          # 检索到的用户状态+相关词/语法
    agent_reply: str                          # 自然回应（流式）
    extracted: dict                           # {words:[], mistakes:[], grammar:[]}
```

### 4.2 节点与路由

```
        START
          │
          ▼
   detect_intent          # LLM 分类: free_chat / scenario_chat / ask_word /
          │               #          ask_grammar / practice_answer
          ▼
   retrieve_context       # 工具: get_user_mastery + query_knowledge_graph
          │
   ┌──────┴───────────────────────────┐
   │ intent == practice_answer?        │
   ▼ 是                              ▼ 否
 score_practice                  generate_reply        # 流式：自然回应 + 轻量纠错
   │                                  │
   │                                  ▼
   │                            extract_knowledge       # LLM → JSON: 错误/语法/生词
   └──────────────┬───────────────────┘
                  ▼
            update_graph                                # 写 Neo4j: MADE/WEAK_AT/KNOWS
                  │
                  ▼
                 END
```

- **generate_reply** 是唯一流式节点（token 经 SSE 推到前端）；其余节点产出结构化数据。
- **extract_knowledge** 与回应解耦：先把流畅对话给用户，再后台抽取沉淀，对应需求"不打断对话流畅度"。
- `update_graph` 失败不阻断对话（catch 后记日志），满足非功能"图谱写入失败不影响基础回答"。

### 4.3 工具集（`agent/tools.py`，被节点调用）

| 工具 | 签名 | 实现 |
|---|---|---|
| `query_knowledge_graph` | `(entity) -> dict` | Cypher 查词/语法关系 |
| `get_user_mastery` | `(user_id, scope) -> dict` | 查 KNOWS/WEAK_AT |
| `update_user_state` | `(user_id, extracted) -> None` | 3.3 的 upsert |
| `generate_exercise` | `(item, kind, level) -> Exercise` | LLM 生成 + 落 Exercise 节点 |
| `get_due_reviews` | `(user_id) -> list` | 3.3 选材查询 |
| `score_practice` | `(item, user_answer) -> dict` | LLM 评分 + 算掌握度增量 |

### 4.4 记忆

- **短期**：`messages`，由 `PostgresSaver` checkpointer 按 `session_id`(thread) 持久化到 PostgreSQL，支持刷新/重启后恢复会话。
- **长期**：用户掌握状态/错因/生词全部在 Neo4j，按需经工具检索注入 `kg_context`，**不塞进 prompt 历史**。

### 4.5 掌握度规则（v0，替代 FSRS）

| 事件 | mastery_level 变化 |
|---|---|
| 生词首次沉淀 | 置 1 |
| 练习答对 | +1（上限 5） |
| 同词再次答错 / 复用出错 | −1（下限 0） |
| 用户手动标记已掌握 | 置 5 |

薄弱语法 `WEAK_AT.count` 每次出错 +1；练习连续答对 N 次可 −1（v0 可先只增不减，简化）。

---

## 5. 后端 API 设计

| 方法 | 路径 | 说明 | 主要 IO |
|---|---|---|---|
| POST | `/api/chat` | 对话陪练（**SSE 流式**） | in: `{user_id, session_id, message, scenario?}`；out: `event: token` 流 + 末尾 `event: meta`（含 extracted 摘要供右侧面板） |
| GET | `/api/reviews/today` | 取每日练习项 | in: `?user_id=`；out: `[{item, kind, exercise}]` |
| POST | `/api/practice/answer` | 提交练习答案 | in: `{user_id, exercise_id, answer}`；out: `{correct, feedback, new_mastery}` |
| GET | `/api/vocab` | 生词本 | out: `[{lemma, meaning_cn, mastery_level, ...}]` |
| GET | `/api/mistakes` | 错因本 | out: `[{original, corrected, type, count}]` |
| DELETE | `/api/data` | 删除用户数据（隐私） | in: `{user_id, scope}` |
| GET/PUT | `/api/settings` | 模型配置 / 自动保存开关 | `{base_url, model_name, temperature, auto_save}` |

**SSE 示例（/api/chat 响应流）**：

```
event: token
data: {"delta": "Sounds"}
event: token
data: {"delta": " good!"}
event: meta
data: {"corrections":[{"orig":"I have went","fix":"I went","type":"tense"}],
       "new_words":["meticulous"]}
event: done
data: {}
```

---

## 6. 核心流程时序

### 6.1 对话陪练

```
前端 ──POST /api/chat(SSE)──▶ FastAPI
                              └─▶ LangGraph.invoke(state, thread=session_id)
   detect_intent → retrieve_context(get_user_mastery)
   → generate_reply(LLM 流式) ──token──▶ 前端实时渲染
   → extract_knowledge(LLM→JSON)
   → update_graph(Cypher upsert 写 Neo4j)
   末尾 ──event: meta──▶ 前端右侧"本轮知识点"面板（纠错+生词，可点"加入复习"）
```

### 6.2 每日练习

```
前端进入练习页 ──GET /api/reviews/today──▶ get_due_reviews(Cypher 选材)
   对每个 item ──generate_exercise(LLM)──▶ Exercise 节点 + 返回题目
用户作答 ──POST /api/practice/answer──▶ score_practice(LLM 评分)
   → update_graph(掌握度 ±1 / 薄弱点调整) → 返回 {correct, feedback, new_mastery}
```

---

## 7. 前端设计（React + Vite）

| 页面 | 关键组件 | 与后端 |
|---|---|---|
| 对话陪练页 | 中间对话流（流式渲染）+ 右侧"本轮知识点"面板（纠错卡/生词卡，含"加入复习"） | `/api/chat` SSE |
| 每日练习页 | 练习卡片（完形/造句/微型对话），作答与即时反馈 | `/api/reviews/today`、`/api/practice/answer` |
| 生词本页 | 列表 + 掌握度标记 + 删除 | `/api/vocab`、`/api/data` |
| 错因本页 | 错误列表 + 出现次数 + 关联语法 | `/api/mistakes` |
| 设置页 | 模型配置表单、自动保存开关、清空数据 | `/api/settings`、`/api/data` |

- 全局状态用轻量方案（Zustand 或 Context），无需 Redux。
- SSE 用原生 `EventSource` 或 `fetch` + ReadableStream 解析。

---

## 8. 模型抽象层（`llm/client.py`）

- 统一接口 `complete(messages, stream=False)` / `complete_json(messages, schema)`，底层走 **OpenAI 兼容** `/v1/chat/completions`，兼容 DeepSeek/Qwen/Claude 兼容端点。
- 配置项（环境变量）：`LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / LLM_TEMPERATURE / LLM_MAX_TOKENS`。
- 内置：超时控制、失败重试（指数退避）、token 用量统计（日志），调用失败时节点返回友好降级文案。
- 抽取/评分类调用强制 JSON（`response_format` 或 prompt 约束 + 解析校验，失败重试一次）。

---

## 9. Prompt 设计（`prompts/`，逐文件管理）

| 文件 | 用途 | 输出约定 |
|---|---|---|
| `intent_detection.txt` | 分类用户输入意图 | 单标签字符串（枚举内） |
| `chat_companion.txt` | 陪练 system 提示（人设、纠错风格、不打断原则） | 自然语言（流式） |
| `knowledge_extraction.txt` | 从用户输入抽错误/语法/生词 | 固定 JSON：`{mistakes:[{orig,fix,type,explanation}], words:[{lemma,meaning_cn}], grammar:[name]}` |
| `exercise_generation.txt` | 按薄弱点生成练习 | JSON：`{kind, prompt, answer}` |
| `practice_scoring.txt` | 评估练习作答 | JSON：`{correct:bool, feedback, mastery_delta:int}` |

> 红线：以上 prompt 均作用于**用户数据或生成内容**，不用于编写词汇/语法的权威关系（那些走 `import_wordnet.py`）。

---

## 10. 非功能设计

| 维度 | 设计 |
|---|---|
| 性能 | 对话首字 <2s（依赖模型）；Neo4j 查询 <200ms（已建约束/索引）；回应流式 |
| 隐私 | 默认本地部署，数据不出本机；API Key 仅环境变量；日志不打印 Key；用户可删数据、可关自动保存（`auto_save`） |
| 容错 | LLM 失败 → 友好降级；`update_graph` 失败 → 不阻断对话、记日志重试；JSON 解析失败 → 重试一次再降级 |
| 可观测 | 记录工具调用链与 token 用量；预留接入 LangSmith |
| 成本 | 抽取/评分用小上下文；对话历史窗口裁剪；可换更便宜的兼容模型 |

---

## 11. 部署设计

### 11.1 docker-compose 服务

Neo4j 与 PostgreSQL 已部署在独立服务器，**不在此编排**，应用仅通过 env 连接；compose 只起应用本身：

```yaml
services:
  backend:
    build: ./backend
    env_file: .env
    ports: ["8000:8000"]
  frontend:
    build: ./frontend
    ports: ["5173:80"]
# 如需本地起 DB 做开发，可另起一份 compose.override 引入 neo4j/postgres，
# 并把 Neo4j 内存限制（heap/pagecache=512m）配上。
```

### 11.2 `.env.example`

```
# 既有外部服务（填实际地址，勿提交真实密钥）
NEO4J_URI=bolt://<neo4j-host>:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=***
DATABASE_URL=postgresql://<user>:<pwd>@<pg-host>:5432/trellis
# 模型
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=deepseek-chat
LLM_TEMPERATURE=0.3
```

### 11.3 初始化与数据导入

1. 初始化存储：`neo4j_client.init_constraints()` 建图约束/索引；PostgreSQL 跑建表迁移（`session_log` / `user_settings`），并调用 `PostgresSaver.setup()` 自动建 checkpointer 表。
2. 跑 `scripts/import_wordnet.py`：WordNet 词义/同反义 + 词频表 + CEFR 分级 → 清洗去重 → 写 `Word` 节点与 `SYNONYM_OF/ANTONYM_OF/COLLOCATES_WITH` 关系。**LLM 补全的搭配/例句必须抽检后入库**。
3. README 标注各数据源 License（`DATA_LICENSES`）。

### 11.4 本地调试启动（不走 docker）

应用须支持**脱离容器、本地直接拉起调试**。两种模式共用同一份 `.env`（连接你已部署的远程 Neo4j/PG），DB 来源不随运行模式变化。

**后端（FastAPI，热重载 + 可断点）**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000           # 改代码即热重载；prompts/ 改文件即生效
```
- `config.py` 用 pydantic-settings/`python-dotenv` 加载根目录 `.env`，本地可用 `.env.local` 覆盖。
- IDE 断点：以 `app.main:app` 为入口配置 VS Code `launch.json`（module=uvicorn）或 PyCharm 的 uvicorn 运行项。

**前端（Vite dev server，HMR）**
```bash
cd frontend
npm install
npm run dev                                         # http://localhost:5173
```
- `vite.config.ts` 配代理，把 `/api` 转发到本地后端，免跨域：
```ts
server: { proxy: { '/api': 'http://localhost:8000' } }
```

**CORS**：后端按环境放行本地前端源 `http://localhost:5173`（容器内同源时无需）。

**一键脚本（可选）**：根目录 `Makefile` 或 `dev.ps1` / `dev.sh` 并行起前后端，`make dev` 一条命令拉起。

> 三种运行姿势统一：① docker-compose（应用容器）② 本地 uvicorn + vite（调试主力）③ 混合（本地应用 + 远程 DB）。Neo4j/PG 始终来自 env。

---

## 12. 开放问题（设计阶段待定，不阻塞动工）

1. **情景/人设（P1）数据形态**：用 prompt 模板枚举即可，还是建 `Scenario` 节点？建议 v0 先 prompt 模板，简单。
2. **生词义项消歧**：一词多义是否拆 `Sense` 节点？v0 先在 `Word` 上存主要释义，需要时再拆。
3. **WordNet 导入粒度**：全量导入还是按 CEFR/词频裁剪到考纲范围？建议先裁剪到中高频，控规模与内存。
4. ~~checkpointer 存储~~（已定）：用 `PostgresSaver` 落到已部署的 PostgreSQL。

---

## 13. 落地顺序建议（编码 Sprint）

1. 骨架 + docker-compose + Neo4j 连接 + 约束初始化。
2. 模型抽象层 + prompts + 最小 WordNet 导入（小词表验证）。
3. LangGraph 五节点串通（先非流式）+ `/api/chat`。
4. SSE 流式 + 前端对话页 + 右侧知识点面板。
5. Neo4j 写入（update_graph）+ 生词本/错因本页。
6. 每日练习选材 + 生成 + 评分 + 掌握度回写。
7. 设置页 / 数据删除 / README / .env.example。
