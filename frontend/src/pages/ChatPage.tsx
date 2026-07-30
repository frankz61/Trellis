import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type ChatHistoryMessage,
  type ChatMeta,
  type ChatSession,
  getChatHistory,
  getChatSessions,
  streamChat,
  synthesizeSpeech,
  transcribeAudio,
} from "../api";
import Icon from "../components/Icon";
import { InlineError, PageHeader } from "../components/Page";

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  pending?: boolean;
}

type AudioState = "idle" | "requesting" | "recording" | "transcribing";
type SpeechPlaybackState = {
  messageId: string;
  status: "loading" | "playing";
} | null;

const ACTIVE_SESSION_KEY = "trellis.active-chat-session";
const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
const AUDIO_MIN_DURATION_MS = 700;
const AUDIO_MAX_RECORDING_SECONDS = 120;
const TTS_CHUNK_CHAR_LIMIT = 1800;
const TTS_PLAYBACK_RATE = 0.82;

const starters = [
  "Tell me about your day",
  "Let's practice a job interview",
  "Help me sound more natural",
];

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I’m your English practice partner. Tell me what’s on your mind, and I’ll help you express it naturally.",
};

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getInitialSessionId() {
  return localStorage.getItem(ACTIVE_SESSION_KEY) || createSessionId();
}

function createDraftSession(sessionId: string): ChatSession {
  return {
    session_id: sessionId,
    title: "新对话",
    updated_at: new Date().toISOString(),
    message_count: 0,
  };
}

function shortenTitle(title: string) {
  const cleanTitle = title.replace(/\s+/g, " ").trim() || "新对话";
  return cleanTitle.length > 34 ? `${cleanTitle.slice(0, 34)}…` : cleanTitle;
}

function toChatMessage(message: ChatHistoryMessage): ChatMessage {
  return {
    id: `history-${message.id}`,
    role: message.role,
    content: message.content,
  };
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="message-markdown">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  );
}

function recordingMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function recordingFilename(mimeType: string) {
  return mimeType.includes("mp4") ? "recording.m4a" : "recording.webm";
}

function formatRecordingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function speechTextFromMarkdown(markdown: string) {
  return markdown
    .replace(/```[a-z0-9_-]*\n?([\s\S]*?)```/gi, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[>*_~]/g, "")
    .replace(/\|/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSpeechText(markdown: string) {
  let remaining = speechTextFromMarkdown(markdown);
  const chunks: string[] = [];

  while (remaining.length > TTS_CHUNK_CHAR_LIMIT) {
    const candidate = remaining.slice(0, TTS_CHUNK_CHAR_LIMIT + 1);
    const sentenceBoundary = Math.max(
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf("! "),
      candidate.lastIndexOf("? "),
      candidate.lastIndexOf("; ")
    );
    const wordBoundary = candidate.lastIndexOf(" ");
    const boundary =
      sentenceBoundary >= TTS_CHUNK_CHAR_LIMIT * 0.55
        ? sentenceBoundary + 1
        : wordBoundary >= TTS_CHUNK_CHAR_LIMIT * 0.55
          ? wordBoundary
          : TTS_CHUNK_CHAR_LIMIT;

    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState(getInitialSessionId);
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioNotice, setAudioNotice] = useState("");
  const [speechPlayback, setSpeechPlayback] =
    useState<SpeechPlaybackState>(null);
  const [error, setError] = useState("");
  const conversationRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRequestRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechRequestRef = useRef<AbortController | null>(null);
  const speechAudioRef = useRef<{
    audio: HTMLAudioElement;
    url: string;
  } | null>(null);
  const isMountedRef = useRef(true);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    const requestId = ++historyRequestRef.current;

    async function restoreConversation() {
      try {
        const availableSessions = await getChatSessions();
        if (cancelled || historyRequestRef.current !== requestId) return;

        const selectedSession =
          availableSessions.find((session) => session.session_id === activeSessionId) ??
          availableSessions[0] ??
          createDraftSession(activeSessionId);

        setSessions(
          availableSessions.length > 0 ? availableSessions : [selectedSession]
        );
        setActiveSessionId(selectedSession.session_id);
        localStorage.setItem(ACTIVE_SESSION_KEY, selectedSession.session_id);

        if (selectedSession.message_count > 0) {
          const history = await getChatHistory(selectedSession.session_id);
          if (cancelled || historyRequestRef.current !== requestId) return;
          setMessages([welcomeMessage, ...history.map(toChatMessage)]);
        }
      } catch (requestError) {
        if (cancelled) return;
        const messageText =
          requestError instanceof Error
            ? requestError.message
            : "历史会话暂时无法读取";
        setError(`${messageText}，当前仍可开始新对话。`);
        setSessions([createDraftSession(activeSessionId)]);
      } finally {
        if (!cancelled && historyRequestRef.current === requestId) {
          setIsHistoryLoading(false);
        }
      }
    }

    void restoreConversation();
    return () => {
      cancelled = true;
      historyRequestRef.current += 1;
    };
    // Restore once when the route mounts; the selected id comes from localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopSpeech(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) {
      conversation.scrollTo({
        behavior: isHistoryLoading ? "auto" : "smooth",
        top: conversation.scrollHeight,
      });
    }
  }, [isHistoryLoading, messages]);

  const visibleSessions = sessions.some(
    (session) => session.session_id === activeSessionId
  )
    ? sessions
    : [createDraftSession(activeSessionId), ...sessions];

  function stopSpeech(updateState = true) {
    speechRequestRef.current?.abort();
    speechRequestRef.current = null;

    const playback = speechAudioRef.current;
    if (playback) {
      playback.audio.onended = null;
      playback.audio.onerror = null;
      playback.audio.pause();
      playback.audio.removeAttribute("src");
      playback.audio.load();
      URL.revokeObjectURL(playback.url);
      speechAudioRef.current = null;
    }

    if (updateState && isMountedRef.current) {
      setSpeechPlayback(null);
    }
  }

  async function toggleSpeech(message: ChatMessage) {
    if (speechPlayback?.messageId === message.id) {
      stopSpeech();
      return;
    }

    const chunks = splitSpeechText(message.content);
    if (!chunks.length) {
      setError("这条回复没有可以朗读的内容。");
      return;
    }

    stopSpeech();
    const controller = new AbortController();
    speechRequestRef.current = controller;
    setSpeechPlayback({ messageId: message.id, status: "loading" });
    setError("");

    try {
      const audioParts: Blob[] = [];
      for (const chunk of chunks) {
        audioParts.push(await synthesizeSpeech(chunk, controller.signal));
      }
      if (
        controller.signal.aborted ||
        !isMountedRef.current ||
        speechRequestRef.current !== controller
      ) {
        return;
      }

      speechRequestRef.current = null;
      const audioBlob = new Blob(audioParts, {
        type: audioParts[0]?.type || "audio/mpeg",
      });
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.playbackRate = TTS_PLAYBACK_RATE;
      audio.defaultPlaybackRate = TTS_PLAYBACK_RATE;
      audio.preservesPitch = true;
      speechAudioRef.current = { audio, url };

      audio.onended = () => {
        if (speechAudioRef.current?.audio !== audio) return;
        URL.revokeObjectURL(url);
        speechAudioRef.current = null;
        if (isMountedRef.current) setSpeechPlayback(null);
      };
      audio.onerror = () => {
        if (speechAudioRef.current?.audio !== audio) return;
        URL.revokeObjectURL(url);
        speechAudioRef.current = null;
        if (isMountedRef.current) {
          setSpeechPlayback(null);
          setError("音频播放失败，请检查浏览器的声音设置。");
        }
      };

      await audio.play();
      if (
        speechAudioRef.current?.audio === audio &&
        isMountedRef.current
      ) {
        setSpeechPlayback({ messageId: message.id, status: "playing" });
      }
    } catch (requestError) {
      const aborted =
        controller.signal.aborted ||
        (requestError instanceof DOMException &&
          requestError.name === "AbortError");
      if (aborted || !isMountedRef.current) return;

      if (speechRequestRef.current === controller) {
        speechRequestRef.current = null;
      }
      const playback = speechAudioRef.current;
      if (playback) {
        playback.audio.pause();
        URL.revokeObjectURL(playback.url);
        speechAudioRef.current = null;
      }
      setSpeechPlayback(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "语音合成暂时不可用"
      );
    }
  }

  function clearRecordingTimer() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function stopMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  async function recognizeAudio(audio: Blob, filename: string) {
    if (!audio.size) {
      setError("音频文件为空，请重新录制或选择文件。");
      setAudioNotice("");
      setAudioState("idle");
      return;
    }
    if (audio.size > AUDIO_MAX_BYTES) {
      setError("音频不能超过 10 MB，请缩短录音或压缩后再试。");
      setAudioNotice("");
      setAudioState("idle");
      return;
    }

    setAudioState("transcribing");
    setAudioNotice("正在识别英语语音…");
    setError("");
    try {
      const result = await transcribeAudio(audio, filename);
      if (!isMountedRef.current) return;
      const transcript = result.text.trim();
      if (!transcript) {
        throw new Error("没有识别到清晰语音，请靠近麦克风后重试。");
      }
      setInput((current) =>
        current.trim() ? `${current.trimEnd()}\n${transcript}` : transcript
      );
      setAudioNotice("已转写到输入框，请确认后发送");
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (requestError) {
      if (!isMountedRef.current) return;
      const messageText =
        requestError instanceof Error
          ? requestError.message
          : "语音识别暂时不可用";
      setError(messageText);
      setAudioNotice("");
    } finally {
      if (isMountedRef.current) {
        setAudioState("idle");
      }
    }
  }

  async function startRecording() {
    if (isStreaming || isHistoryLoading || audioState !== "idle") {
      return;
    }
    stopSpeech();
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "当前浏览器无法录音，请使用最新版浏览器并通过 HTTPS 或 localhost 访问。"
      );
      return;
    }

    setError("");
    setAudioState("requesting");
    setAudioNotice("正在请求麦克风权限…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      const mimeType = recordingMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setError("录音过程中出现问题，请重新录制。");
      };
      recorder.onstop = () => {
        clearRecordingTimer();
        stopMediaStream();
        const duration = Date.now() - recordingStartedAtRef.current;
        const audio = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        setRecordingSeconds(0);

        if (duration < AUDIO_MIN_DURATION_MS) {
          setAudioState("idle");
          setAudioNotice("");
          setError("录音时间太短，请至少说一句完整的话。");
          return;
        }
        void recognizeAudio(audio, recordingFilename(audio.type));
      };

      recorder.start(250);
      setAudioState("recording");
      setAudioNotice("正在录音，再点一次即可停止");
      recordingTimerRef.current = setInterval(() => {
        const elapsedSeconds = Math.floor(
          (Date.now() - recordingStartedAtRef.current) / 1000
        );
        setRecordingSeconds(elapsedSeconds);
        if (
          elapsedSeconds >= AUDIO_MAX_RECORDING_SECONDS &&
          recorder.state === "recording"
        ) {
          recorder.stop();
        }
      }, 500);
    } catch (requestError) {
      clearRecordingTimer();
      stopMediaStream();
      mediaRecorderRef.current = null;
      if (!isMountedRef.current) return;
      setAudioState("idle");
      setAudioNotice("");
      const permissionDenied =
        requestError instanceof DOMException &&
        (requestError.name === "NotAllowedError" ||
          requestError.name === "PermissionDeniedError");
      setError(
        permissionDenied
          ? "没有获得麦克风权限，请在浏览器地址栏中允许后重试。"
          : "无法启动麦克风，请检查设备是否被其他应用占用。"
      );
    }
  }

  function toggleRecording() {
    if (audioState === "recording") {
      const recorder = mediaRecorderRef.current;
      if (recorder?.state === "recording") {
        recorder.stop();
      }
      return;
    }
    void startRecording();
  }

  function handleAudioFile(event: ChangeEvent<HTMLInputElement>) {
    const audio = event.target.files?.[0];
    event.target.value = "";
    if (!audio || audioState !== "idle") return;
    void recognizeAudio(audio, audio.name);
  }

  async function refreshSessions() {
    try {
      const refreshed = await getChatSessions();
      setSessions((current) => {
        const activeDraft = current.find(
          (session) =>
            session.session_id === activeSessionId &&
            session.message_count === 0
        );
        if (
          activeDraft &&
          !refreshed.some(
            (session) => session.session_id === activeDraft.session_id
          )
        ) {
          return [activeDraft, ...refreshed];
        }
        return refreshed;
      });
    } catch {
      // Sending a message should stay successful even if the history refresh fails.
    }
  }

  async function selectSession(sessionId: string) {
    if (
      sessionId === activeSessionId ||
      isStreaming ||
      isHistoryLoading ||
      audioState !== "idle"
    ) {
      return;
    }

    stopSpeech();
    const requestId = ++historyRequestRef.current;
    setActiveSessionId(sessionId);
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    setMessages([welcomeMessage]);
    setMeta(null);
    setError("");
    setAudioNotice("");
    setIsHistoryLoading(true);

    const selectedSession = sessions.find(
      (session) => session.session_id === sessionId
    );
    if (!selectedSession || selectedSession.message_count === 0) {
      setIsHistoryLoading(false);
      return;
    }

    try {
      const history = await getChatHistory(sessionId);
      if (historyRequestRef.current !== requestId) return;
      setMessages([welcomeMessage, ...history.map(toChatMessage)]);
    } catch (requestError) {
      if (historyRequestRef.current !== requestId) return;
      const messageText =
        requestError instanceof Error
          ? requestError.message
          : "历史会话暂时无法读取";
      setError(messageText);
    } finally {
      if (historyRequestRef.current === requestId) {
        setIsHistoryLoading(false);
      }
    }
  }

  function startNewConversation() {
    if (isStreaming || isHistoryLoading || audioState !== "idle") return;
    stopSpeech();
    historyRequestRef.current += 1;
    const sessionId = createSessionId();
    const draft = createDraftSession(sessionId);
    setActiveSessionId(sessionId);
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    setSessions((current) => [
      draft,
      ...current.filter((session) => session.message_count > 0),
    ]);
    setMessages([welcomeMessage]);
    setInput("");
    setMeta(null);
    setError("");
    setAudioNotice("");
    setIsHistoryLoading(false);
  }

  async function sendMessage(message: string) {
    const cleanMessage = message.trim();
    if (
      !cleanMessage ||
      isStreaming ||
      isHistoryLoading ||
      audioState !== "idle"
    ) {
      return;
    }

    stopSpeech();
    const sessionId = activeSessionId;
    const turnId = `${Date.now()}`;
    const assistantId = `${turnId}-assistant`;
    setMessages((current) => [
      ...current,
      { id: turnId, role: "user", content: cleanMessage },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        pending: true,
      },
    ]);
    setSessions((current) => {
      const existing = current.find(
        (session) => session.session_id === sessionId
      );
      const updated: ChatSession = {
        session_id: sessionId,
        title:
          existing && existing.message_count > 0
            ? existing.title
            : shortenTitle(cleanMessage),
        updated_at: new Date().toISOString(),
        message_count: (existing?.message_count ?? 0) + 1,
      };
      return [
        updated,
        ...current.filter((session) => session.session_id !== sessionId),
      ];
    });
    setInput("");
    setMeta(null);
    setError("");
    setAudioNotice("");
    setIsStreaming(true);

    try {
      await streamChat(
        cleanMessage,
        sessionId,
        (delta) => {
          setMessages((current) =>
            current.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    content: item.content + delta,
                    pending: false,
                  }
                : item
            )
          );
        },
        setMeta
      );
    } catch (requestError) {
      const messageText =
        requestError instanceof Error
          ? requestError.message
          : "对话暂时不可用";
      setError(messageText);
      setMessages((current) =>
        current.filter((item) => item.id !== assistantId)
      );
    } finally {
      setIsStreaming(false);
      void refreshSessions();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="page page--chat">
      <PageHeader
        description="不必担心犯错。像日常聊天一样表达，Agent 会在合适的时候帮你纠正。"
        eyebrow="Conversation studio"
        title="今天想聊些什么？"
        action={
          <span className="status-badge status-badge--light">
            <span className="status-dot" />
            对话自动保存
          </span>
        }
      />

      <div className="chat-layout">
        <section className="card conversation-card">
          <div className="conversation-card__topbar">
            <div className="conversation-partner">
              <div className="agent-avatar">
                <Icon name="leaf" size={19} />
              </div>
              <div>
                <strong>Trellis Agent</strong>
                <span>English companion</span>
              </div>
            </div>

            <div className="conversation-actions">
              <label className="session-picker">
                <span>当前会话</span>
                <select
                  aria-label="选择历史会话"
                  disabled={
                    isStreaming ||
                    isHistoryLoading ||
                    audioState !== "idle"
                  }
                  onChange={(event) => void selectSession(event.target.value)}
                  value={activeSessionId}
                >
                  {visibleSessions.map((session) => (
                    <option
                      key={session.session_id}
                      value={session.session_id}
                    >
                      {session.message_count === 0
                        ? "新对话"
                        : shortenTitle(session.title)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="new-conversation-button"
                disabled={
                  isStreaming ||
                  isHistoryLoading ||
                  audioState !== "idle"
                }
                onClick={startNewConversation}
                type="button"
              >
                <Icon name="plus" size={16} />
                <span>新建对话</span>
              </button>
            </div>
          </div>

          <div className="conversation" ref={conversationRef}>
            {isHistoryLoading ? (
              <div className="history-loading">
                <span className="typing" aria-label="正在读取历史会话">
                  <i />
                  <i />
                  <i />
                </span>
                <small>正在恢复上次对话…</small>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  className={`message-row message-row--${message.role}`}
                  key={message.id}
                >
                  {message.role === "assistant" && (
                    <div className="message-avatar">
                      <Icon name="leaf" size={15} />
                    </div>
                  )}
                  <div className={`message message--${message.role}`}>
                    {message.pending ? (
                      <span
                        className="typing"
                        aria-label="Agent 正在思考"
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : message.role === "assistant" ? (
                      <div className="assistant-message-content">
                        <AssistantMessage content={message.content} />
                        {message.content && (
                          <button
                            aria-busy={
                              speechPlayback?.messageId === message.id &&
                              speechPlayback.status === "loading"
                            }
                            aria-label={
                              speechPlayback?.messageId === message.id
                                ? speechPlayback.status === "loading"
                                  ? "取消生成这条回复的语音"
                                  : "停止朗读这条回复"
                                : "朗读这条回复"
                            }
                            className={`speech-button${
                              speechPlayback?.messageId === message.id
                                ? ` speech-button--${speechPlayback.status}`
                                : ""
                            }`}
                            disabled={
                              isStreaming ||
                              isHistoryLoading ||
                              audioState !== "idle"
                            }
                            onClick={() => void toggleSpeech(message)}
                            type="button"
                          >
                            <Icon
                              name={
                                speechPlayback?.messageId === message.id &&
                                speechPlayback.status === "playing"
                                  ? "stop"
                                  : "volume"
                              }
                              size={15}
                            />
                            <span>
                              {speechPlayback?.messageId === message.id
                                ? speechPlayback.status === "loading"
                                  ? "生成中"
                                  : "停止"
                                : "朗读"}
                            </span>
                          </button>
                        )}
                      </div>
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="starter-row">
            {starters.map((starter) => (
              <button
                disabled={
                  isStreaming ||
                  isHistoryLoading ||
                  audioState !== "idle"
                }
                key={starter}
                onClick={() => void sendMessage(starter)}
                type="button"
              >
                {starter}
              </button>
            ))}
          </div>

          {error && <InlineError>{error}</InlineError>}

          <form className="composer" onSubmit={submit}>
            <textarea
              aria-label="输入英语消息"
              disabled={
                isStreaming ||
                isHistoryLoading ||
                audioState === "transcribing"
              }
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Write your message in English…"
              ref={composerRef}
              rows={2}
              value={input}
            />
            <div className="composer__bottom">
              <div className="composer__tools">
                <button
                  aria-label={
                    audioState === "recording"
                      ? "停止录音"
                      : audioState === "requesting"
                        ? "正在请求麦克风权限"
                        : "开始录音"
                  }
                  aria-pressed={audioState === "recording"}
                  className={`audio-button${
                    audioState === "recording"
                      ? " audio-button--recording"
                      : ""
                  }`}
                  disabled={
                    isStreaming ||
                    isHistoryLoading ||
                    audioState === "requesting" ||
                    audioState === "transcribing"
                  }
                  onClick={toggleRecording}
                  type="button"
                >
                  <Icon
                    name={audioState === "recording" ? "stop" : "microphone"}
                    size={16}
                  />
                  <span>
                    {audioState === "recording"
                      ? `停止 ${formatRecordingTime(recordingSeconds)}`
                      : audioState === "requesting"
                        ? "准备中"
                        : "录音"}
                  </span>
                </button>
                <button
                  aria-label="上传音频文件"
                  className="audio-button audio-button--upload"
                  disabled={
                    isStreaming ||
                    isHistoryLoading ||
                    audioState !== "idle"
                  }
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Icon name="upload" size={16} />
                  <span>上传音频</span>
                </button>
                <input
                  accept=".m4a,.mp3,.mp4,.mpeg,.mpga,.wav,.webm"
                  className="audio-file-input"
                  onChange={handleAudioFile}
                  ref={fileInputRef}
                  type="file"
                />
                <span
                  className={`audio-notice${
                    audioState === "recording"
                      ? " audio-notice--recording"
                      : ""
                  }`}
                  role="status"
                >
                  {audioNotice || "Enter 发送 · Shift + Enter 换行"}
                </span>
              </div>
              <button
                className="send-button"
                disabled={
                  !input.trim() ||
                  isStreaming ||
                  isHistoryLoading ||
                  audioState !== "idle"
                }
                type="submit"
              >
                <span>{isStreaming ? "回复中" : "发送"}</span>
                <Icon name="send" size={17} />
              </button>
            </div>
          </form>
        </section>

        <aside className="insights-column">
          <section className="card insight-card">
            <div className="section-heading">
              <div>
                <span className="section-heading__icon section-heading__icon--amber">
                  <Icon name="sparkles" size={18} />
                </span>
                <div>
                  <h2>本轮知识点</h2>
                  <p>对话结束后自动提取</p>
                </div>
              </div>
            </div>

            {!meta ? (
              <div className="insight-placeholder">
                <div className="insight-placeholder__graphic">
                  <span />
                  <span />
                  <span />
                </div>
                <p>完成一次对话后，这里会整理你的纠错与生词。</p>
              </div>
            ) : (
              <div className="insight-groups">
                <div className="insight-group">
                  <div className="insight-group__title">
                    <span className="mini-icon mini-icon--correction">
                      <Icon name="check" size={14} />
                    </span>
                    <strong>纠错</strong>
                    <small>{meta.corrections.length}</small>
                  </div>
                  {meta.corrections.length ? (
                    <ul className="correction-list">
                      {meta.corrections.map((correction, index) => (
                        <li key={`${correction.orig}-${index}`}>
                          <span>{correction.orig}</span>
                          <Icon name="arrow" size={14} />
                          <strong>{correction.fix}</strong>
                          {correction.type && (
                            <small>{correction.type}</small>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="all-clear">
                      表达很自然，本轮没有需要纠正的内容。
                    </p>
                  )}
                </div>

                <div className="insight-group">
                  <div className="insight-group__title">
                    <span className="mini-icon mini-icon--word">
                      <Icon name="book" size={14} />
                    </span>
                    <strong>生词</strong>
                    <small>{meta.new_words.length}</small>
                  </div>
                  {meta.new_words.length ? (
                    <div className="word-chips">
                      {meta.new_words.map((word) => (
                        <span key={word}>{word}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="all-clear">本轮暂时没有新增词汇。</p>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="practice-nudge">
            <div className="practice-nudge__icon">
              <Icon name="practice" size={21} />
            </div>
            <div>
              <strong>让练习跟着你走</strong>
              <p>对话中积累的薄弱点会进入每日练习。</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
