# Trellis · 英语学习 Agent（MVP v0）

开源、可本地部署的英语学习 Web Agent：**对话陪练 + 每日练习**。用 LLM 做自然交互，用 Neo4j 知识图谱沉淀薄弱点并推送针对性练习。

对话页支持直接录音或上传音频（MP3、M4A、WAV、WebM 等），语音转写结果会先放入输入框，确认或修改后再发送；AI 回复也可以直接朗读或停止播放。服务端只转发本次音频，不保存原始文件。

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

语音识别使用 OpenAI 兼容的 `/audio/transcriptions` 接口。配置 `STT_BASE_URL` 和
`STT_MODEL`；`STT_API_KEY` 留空时会复用 `LLM_API_KEY`。

语音合成使用 OpenAI 兼容的 `/audio/speech` 接口。配置 `TTS_BASE_URL`、
`TTS_MODEL`、`TTS_VOICE`；`TTS_API_KEY` 留空时依次复用 `STT_API_KEY`
和 `LLM_API_KEY`。前端默认以 `0.82x` 播放并保持原音调，让英语陪练的发音更容易听清。

> 本地调试使用固定端口：前端 `57701`、后端 `57702`。Vite 的 `/api` 代理固定指向
> 后端调试端口；`.env.local` 中的 `FRONTEND_PORT` / `BACKEND_PORT` 可用于显式覆盖。

### 后端
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows (mac/linux: source .venv/bin/activate)
pip install -r requirements.txt
python -m scripts.dev_server --reload   # http://localhost:57702
```

### 前端
```bash
cd frontend
npm install
npm run dev                  # http://localhost:57701
```

Windows 一键并行（固定使用 57701 / 57702）：`./dev.ps1`

### VS Code 调试
运行复合配置 **Full stack (fixed ports)**，同时启动后端（debugpy）与 Vite；
前端用 `serverReadyAction` 自动打开 `http://localhost:57701`。

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
