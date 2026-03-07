"use client";

import { useState } from "react";

const AI_MODELS = [
  ["ChatGPT", "Claude", "Gemini", "Grok"],
  ["DeepSeek", "豆包", "Kimi", "千问"],
];

const MODEL_KEY_TO_NAME: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  deepseek: "DeepSeek",
  doubao: "豆包",
  kimi: "Kimi",
  qianwen: "千问",
};

const MODEL_LOGOS: Record<string, string> = {
  ChatGPT: "/logos/chatgpt.png",
  Claude: "/logos/claude.png",
  Gemini: "/logos/Gemini.png",
  Grok: "/logos/grok.png",
  DeepSeek: "/logos/deepseek.png",
  豆包: "/logos/doubao.png",
  Kimi: "/logos/kimi.png",
  千问: "/logos/qianwen.png",
};

const FALLBACK_COLORS = [
  "bg-emerald-500",
  "bg-amber-500",
  "bg-blue-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-teal-500",
];

function getFallbackColor(model: string): string {
  let hash = 0;
  for (let i = 0; i < model.length; i++) hash += model.charCodeAt(i);
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

function getFirstChar(model: string): string {
  return model.charAt(0);
}

type StreamChunk = { model: string; content: string; done: boolean };

export default function Home() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [streamingModels, setStreamingModels] = useState<Set<string>>(new Set());
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    setIsLoading(true);
    setResponses({});
    setStreamingModels(
      new Set(AI_MODELS.flat().map((m) => m))
    );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error ?? "请求失败";
        AI_MODELS.flat().forEach((model) => {
          setResponses((prev) => ({ ...prev, [model]: msg }));
        });
        setStreamingModels(new Set());
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setStreamingModels(new Set());
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buffer.indexOf("\n\n");
          if (idx === -1) break;

          const block = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);

          if (block.startsWith("data: ")) {
            try {
              const chunk: StreamChunk = JSON.parse(block.slice(6));
              const modelName = MODEL_KEY_TO_NAME[chunk.model];
              if (!modelName) continue;

              if (chunk.done) {
                setStreamingModels((prev) => {
                  const next = new Set(prev);
                  next.delete(modelName);
                  return next;
                });
              } else if (chunk.content) {
                setResponses((prev) => ({
                  ...prev,
                  [modelName]: (prev[modelName] ?? "") + chunk.content,
                }));
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "请求失败";
      AI_MODELS.flat().forEach((model) => {
        setResponses((prev) => ({ ...prev, [model]: msg }));
      });
    } finally {
      setStreamingModels(new Set());
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#0d0d0d] text-zinc-100">
      {/* Header */}
      <header className="shrink-0 flex flex-col items-center pt-6 pb-4 text-center">
        <h1 className="text-[36px] font-bold leading-tight text-white md:text-[40px]">
          AI圆桌会
        </h1>
        <p className="mt-2 text-base text-zinc-500">
          AI Roundtable
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          思八答 — 一次思考，八次回答 / Think Once, Answer Eight
        </p>
      </header>

      {/* AI Grid - 填满可用空间 */}
      <main className="min-h-0 flex-1 px-4 pb-4">
        <div className="mx-auto grid h-full min-h-[500px] grid-cols-1 grid-rows-8 gap-5 sm:grid-cols-2 sm:grid-rows-4 lg:grid-cols-4 lg:grid-rows-2">
          {AI_MODELS.flat().map((model) => (
            <div
              key={model}
              className="flex min-h-[220px] flex-col rounded-xl border border-zinc-700/60 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-600/80"
            >
              <div className="mb-2 flex shrink-0 items-center gap-2 text-sm font-medium text-zinc-400">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                  {failedLogos.has(model) ? (
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium text-white ${getFallbackColor(model)}`}
                      aria-hidden
                    >
                      {getFirstChar(model)}
                    </div>
                  ) : (
                    <img
                      src={MODEL_LOGOS[model]}
                      alt={`${model} logo`}
                      width={24}
                      height={24}
                      className="h-6 w-6 object-contain"
                      onError={() => {
                        setFailedLogos((prev) => new Set(prev).add(model));
                      }}
                    />
                  )}
                </div>
                {model}
              </div>
              <div className="min-h-[180px] flex-1 break-words text-sm leading-relaxed text-zinc-300">
                {streamingModels.has(model) && !responses[model] ? (
                  <span className="inline-flex items-center gap-2 text-zinc-500">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-zinc-500" />
                    思考中...
                  </span>
                ) : responses[model] ? (
                  <span className="break-words">
                    {responses[model]}
                    {streamingModels.has(model) && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-zinc-400" />
                    )}
                  </span>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Fixed Input - Claude 风格：宽大、圆角、按钮在内部 */}
      <div className="shrink-0 border-t border-zinc-800 bg-[#0d0d0d]/95 py-8 backdrop-blur-sm">
        <div className="mx-auto flex w-[70%] min-w-[280px] max-w-3xl justify-center px-4">
          <div className="relative w-full">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的问题..."
              rows={3}
              className="min-h-[90px] w-full resize-none break-words whitespace-pre-wrap rounded-2xl border border-zinc-700 bg-zinc-900/80 px-4 py-4 pr-14 pb-14 text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="发送"
            >
              {isLoading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
