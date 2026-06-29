# Trellis · 英语学习 Agent（MVP v0）

开源、可本地部署的英语学习 Web Agent：**对话陪练 + 每日练习**。用 LLM 做自然交互，用 Neo4j 知识图谱沉淀薄弱点并推送针对性练习。

- 需求文档：[docs/require/mvp-v0.md](docs/require/mvp-v0.md)
- 设计文档：[docs/design/mvp-v0-design.md](docs/design/mvp-v0-design.md)

## 技术栈
Neo4j（图谱+用户状态） · PostgreSQL（会话/设置/checkpointer） · FastAPI + LangGraph · React + Vite · OpenAI 兼容模型

## 目录
```
backend/   FastAPI + LangGraph Agent
frontend/  React + Vite
docs/      需求与设计文档
```

## 本地调试启动
前置：可访问的 Neo4j 与 PostgreSQL；复制 `.env.example` 为 `.env` 并填好连接与模型 Key。

> 端口：调试启动时前后端均使用**随机大端口**（49152–65535），由 `scripts/alloc-ports.ps1`
> 选取并写入 `.env.local`（`BACKEND_PORT` / `FRONTEND_PORT`，已 gitignore）。后端经
> `app.config` 读取，Vite 据此设置端口与 `/api` 代理目标——两端口同源分配，代理始终对齐。
> 未生成 `.env.local` 时回退到固定的 8000 / 5173。

### 后端
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows (mac/linux: source .venv/bin/activate)
pip install -r requirements.txt
python -m scripts.dev_server --reload   # 端口取自 .env.local 的 BACKEND_PORT（缺省 8000）
```

### 前端
```bash
cd frontend
npm install
npm run dev                  # 端口取自 .env.local 的 FRONTEND_PORT（缺省 5173）
```

Windows 一键并行（自动分配随机端口并打印实际地址）：`./dev.ps1`

### VS Code 调试
运行复合配置 **Full stack (random ports)**：先经 `alloc-dev-ports` 任务分配随机端口，
再启动后端（debugpy）与 Vite；前端用 `serverReadyAction` 自动按 Vite 打印的随机端口拉起 Chrome 调试。

### 初始化图谱（可选）
```bash
cd backend
python -m scripts.import_wordnet     # 建约束 + 导入演示词
```

## 容器部署
```bash
cp .env.example .env         # 填好外部 DB 与模型
docker compose up --build
```

## 当前状态
骨架阶段：目录结构、API 端点、LangGraph 节点、Neo4j/LLM 连接均已就绪，节点/工具为最小实现（LLM/DB 不可用时有降级，保证可启动）。按设计文档第 13 节逐步补全。
