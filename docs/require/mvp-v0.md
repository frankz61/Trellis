# 英语学习 Agent — 初版最简化需求（MVP v0）

> 本文综合 `chatgpt.md` / `claude.md` / `gemini.md` 三份 PRD，提炼出三者**共识的最小闭环**，作为第一版开工依据。
> 原始诉求（`require.md`）：开源、Python + 大模型 + 知识图谱、Web 形态的英语学习 Agent。

---

## 一、三份文档的对齐情况

### 1.1 三者一致认同的核心（直接采纳）

| 共识点 | 说明 |
|---|---|
| **LLM + 知识图谱 双引擎** | LLM 负责自然交互/讲解/纠错/生成；图谱负责沉淀用户状态、关系、薄弱点。缺一即退化为"会幻觉的聊天框"或"不会说话的题库"。 |
| **核心是一个学习"飞轮"** | 用户输入 → Agent 讲解/纠错 → 抽取知识点 → 写入图谱 → 推荐复习。三份文档措辞不同但闭环一致。 |
| **Agent = 工具调用编排** | Agent 通过工具读写图谱/用户状态，而非把记忆塞进 prompt。 |
| **技术基座** | 后端 Python + FastAPI；前端 Web（React）；模型走 OpenAI 兼容接口、可配置。 |
| **可解释 / 可沉淀** | 每次纠错说明原因；生词、错因统一沉淀，可复盘。 |
| **开源自托管** | docker-compose 一键起，模型可换，单用户起步。 |

### 1.2 三者的分歧（需要拍板）

| 议题 | chatgpt | claude | gemini | 本文取舍 |
|---|---|---|---|---|
| **MVP 切入点** | 阅读 + 写作纠错 | 智能背单词闭环（最克制） | 对话陪练 / 情景角色扮演 | **对话陪练 + 每日练习**（gemini 方向，已定，见第十一节 D6） |
| **是否首版上图数据库** | 可 lite 模式，先 SQLite/PG，Neo4j 放 v0.2 | Neo4j 作为 P0 地基 | 倾向向量库 Weaviate | **v0 直接用 Neo4j**（已定，见第十一节） |
| **SRS 复习算法** | 简单规则 | FSRS（P0） | 每日推荐卡片 | **简单规则起步**，FSRS 放 v0.2 |
| **口语 / 语音** | P2 不做 | P2 不做 | P2 不做 | **一致后置，不做** |

---

## 二、初版定位（一句话）

> 一个开源、可本地部署的英语学习 Web Agent：用户用英语和它**对话陪练**，Agent 在对话中实时纠错并给地道表达，**自动把错因和生词沉淀成可复盘的个人知识库**，再按薄弱点每天推送**针对性练习与对话任务**。

**目标用户**：有一定基础（词汇量 2000+）、想突破"哑巴英语"、提升口语与实际应用能力的职场人/学生。

与普通 AI 英语助手的唯一区别：**记得住、可复盘、能针对薄弱点每天给练习**。

---

## 三、MVP 最小闭环（必须跑通的唯一主线）

```
对话陪练：用户用英语和 Agent 多轮对话（自由聊 / 可选情景）
        │
        ▼
Agent 自然回应，不打断流畅度；同时识别本轮语法错误 + 生词
        │
        ▼
自动抽取知识点：错误类型、语法点、生词
        │
        ▼
写入 Neo4j 用户状态：WEAK_AT(语法点) / MADE(错误) / KNOWS(生词)
        │
        ▼
每日练习：按薄弱点生成复习卡 + 微型对话任务，专攻高频错误 / 未掌握词
        │
        ▼
用户完成练习 → 回写掌握度 → 薄弱点动态更新
```

验证目标：证明"对话中自动沉淀薄弱点 + 针对性每日练习"的体验明显优于裸用 ChatGPT 聊天。

---

## 四、功能清单（只保留 P0，砍到最小）

| # | 功能 | 说明 | 必须 |
|---|---|---|---|
| 1 | **对话陪练** | 多轮英语对话，流式输出；自由对话起步，基础情景/人设可选（P1） | ✅ |
| 2 | **实时纠错与建议** | 对话中或单轮结束后，旁侧提示语法错误 + Native 地道表达；不打断对话流畅度 | ✅ |
| 3 | **知识点自动抽取** | 从对话中抽出错误、语法点、生词（LLM 以 JSON 输出） | ✅ |
| 4 | **每日练习** | 按薄弱点生成复习卡 + 微型对话任务，专攻高频错误/未掌握词；完成后回写掌握度 | ✅ |
| 5 | **生词本** | 保存单词 + 释义 + 例句 + 来源 + 掌握度（未掌握/学习中/已掌握） | ✅ |
| 6 | **错因本** | 保存原句 + 修改句 + 错误类型 + 错因 + 出现次数 | ✅ |
| 7 | **模型配置层** | base_url / api_key / model_name / temperature 走配置，可换模型 | ✅ |
| 8 | **本地单用户 + 数据可删** | 无需注册；数据只存本地；用户可删记录、可关自动保存 | ✅ |

> 多用户、登录、口语/语音、阅读全文解析、图谱可视化、FSRS、学习路径规划——**全部不在 v0**；复杂情景/人设切换列 P1，不阻塞 MVP。

---

## 五、技术栈（最简版本）

| 层 | 选型 | 备注 |
|---|---|---|
| 前端 | React（单页：聊天 + 右侧知识点卡片 + 今日复习入口） | 急于验证可先用 Streamlit/Gradio |
| 后端 | Python + FastAPI，SSE 流式 | |
| Agent 编排 | **LangGraph**（StateGraph 编排） | 工具：纠错、抽取、查生词、写库、取复习；用其 checkpointer 做会话记忆/恢复 |
| 模型 | OpenAI 兼容 API（DeepSeek/Qwen/Claude 等），配置切换 | 本地 Ollama 放 v0.2 |
| 存储 | **Neo4j**（图谱+用户学习状态） + **PostgreSQL**（会话流水/设置 + LangGraph checkpointer） | 两库均为已部署的外部服务，应用经 env 连接（见第十一节 D7） |
| 部署 | docker-compose + README + .env.example | 30 分钟内本地可跑 |

**Prompt 集中管理**：意图识别 / 纠错 / 知识点抽取 三个模板独立成文件，不散落代码。

---

## 六、数据模型（Neo4j 图谱，最简 P0 schema）

**节点（Nodes）**
```
(:Learner   {id, level, created_at})
(:Word      {lemma, meaning_cn, meaning_en, pos, cefr, freq, source})
(:GrammarPoint {name, cefr})
(:Mistake   {id, original_text, corrected_text, mistake_type, explanation, created_at})
```

**关系（Relationships）**
```
(:Learner)-[:KNOWS    {mastery_level, review_count, last_reviewed_at}]->(:Word)
(:Learner)-[:WEAK_AT  {count, updated_at}]                          ->(:GrammarPoint)
(:Learner)-[:MADE]                                                  ->(:Mistake)
(:Mistake)-[:OF_TYPE]                                               ->(:GrammarPoint)
(:Mistake)-[:RELATES_TO]                                            ->(:Word)
(:Word)-[:SYNONYM_OF | :ANTONYM_OF | :COLLOCATES_WITH]             ->(:Word)
```

错误类型枚举（`mistake_type` 取值，够用即可）：`tense / article / subject_verb_agreement / preposition / word_choice / collocation / sentence_structure / spelling`。

> - **领域关系**（`SYNONYM_OF` / `COLLOCATES_WITH` 等）从 WordNet 等开放数据导入，不靠 LLM 编写。
> - **用户状态**（`KNOWS` / `WEAK_AT` / `MADE`）由 Agent 流程产出的结构化事实，用确定性 Cypher upsert 写入。
> - "今日复习"= 一条 Cypher：取 `KNOWS.mastery_level` 低 + `WEAK_AT.count` 高的节点排序。
> - 日志/会话流水、设置等纯表数据放 **PostgreSQL**（已部署）；图谱与用户掌握状态在 Neo4j。

---

## 七、明确不做（防止范围蔓延）

口语/语音评测、阅读全文分层解析、图谱可视化、FSRS、自适应学习路径、多用户/班级、移动 App、考试题库、支付。

> 基础情景/人设切换（如"面试官""海关人员"）列 **P1**，v0 先用单一默认陪练人设，不阻塞主线。

---

## 八、验收标准（v0 完成的定义）

1. 用户能与 Agent 进行**多轮英语对话**，回应自然且流式。
2. 对话中出现语法错误时，Agent 给出**纠正 + 地道表达建议**（旁侧或单轮后），且不打断对话。
3. 该错误与生词**自动沉淀到错因本/生词本**；同一错误再现时**计数 +1**，对应语法点在 Neo4j 累加为薄弱。
4. **每日练习**能基于薄弱点**列出 3–5 项**（复习卡/微型对话任务），完成后掌握度更新、薄弱点动态调整。
5. 开发者按 README，**30 分钟内本地 docker-compose 跑通**，可在 .env 换模型。

---

## 九、决策已收敛

切入点（对话陪练 + 每日练习）、图数据库（Neo4j）、编排框架（LangGraph）均已确定，决策记录见第十一节。本文已是可直接开工的单一方案；后续按第十节路线扩展。

---

## 十、后续路线（v0 之后，供参考，非本期承诺）

| 版本 | 增量 |
|---|---|
| v0.2 | 图谱可视化（Neo4j Browser/Bloom 或前端图）；FSRS 复习调度；接入本地 Ollama |
| v0.3 | 阅读全文解析 + 生词沉淀；语法图谱与先修依赖路径 |
| v0.4 | 对话陪练/情景角色 + 写作评分；多用户与进度看板 |
| v1.0 | 自适应学习路径打通；自托管体验与文档完善 |

---

## 十一、技术决策记录（本轮确定）

| # | 决策 | 理由 |
|---|---|---|
| D1 | **图数据库用 Neo4j Community，v0 即上** | 生态最成熟、Cypher 友好、自带可视化，直接坐实"知识图谱"卖点。docker 一行起。 |
| D2 | **不引入 Graphiti（及其它 GraphRAG 框架）** | Graphiti 是盖在 Neo4j 上的一层，自动化的正是"LLM 抽取+去重+写图"。但 v0 的用户状态已是结构化事实，确定性 Cypher upsert 更简单、可控、便宜；领域图谱是结构化导入，更不需要它。留到做"对话长期记忆"版再评估，且仅用于用户记忆子图。 |
| D3 | **LLM 的职责边界** | LLM 只做：从用户输入抽生词/错误、生成讲解与例句。**不**用 LLM 编写词汇/语法的权威关系（同反义、搭配、先修依赖）——这些走 WordNet 等开放数据导入，避免把幻觉写进图谱。 |
| D4 | **复习调度 v0 用简单规则**，FSRS 推到 v0.2 | 早期数据少，按"未掌握生词 + 高频错误"排序即够；FSRS 等有数据后再换。 |
| D5 | **Agent 编排用 LangGraph，v0 即上** | 流程有意图分支 + 工具循环 + 需会话记忆/恢复，正是 LangGraph 主场；内置 checkpointer（会话记忆/断点续跑）、条件路由、流式输出、LangSmith 可观测，省去自研样板。代价是 LangChain 生态依赖较重——若后续想极简化依赖可退回自研循环，迁移成本低。 |
| D6 | **MVP 切入点 = 对话陪练 + 每日练习**（gemini 方向） | 主打口语与实际应用：闭环为"对话 → 实时纠错 → 知识点抽取 → 图谱沉淀 → 针对性每日练习"。写作纠错、阅读解析作为 v0.3+ 扩展，不进 v0。 |
| D7 | **关系库用 PostgreSQL（已部署），Neo4j + PG 双库** | PG 与 Neo4j 均已在服务器部署。职责：图谱与用户掌握状态（KNOWS/WEAK_AT/MADE）走 Neo4j；会话流水、用户设置、LangGraph checkpointer（PostgresSaver）走 PG。应用经 env 连接外部服务，docker-compose 只编排应用本身。 |

**Neo4j 内存提示**：默认占用偏高（JVM），部署时在 docker-compose 显式限制，小实例可压到 ~1GB：
```yaml
environment:
  - NEO4J_server_memory_heap_initial__size=512m
  - NEO4J_server_memory_heap_max__size=512m
  - NEO4J_server_memory_pagecache_size=512m
```
并避免安装用不到的 APOC / GDS 插件。
