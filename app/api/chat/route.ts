import { NextRequest } from "next/server";

export const runtime = "edge";

// 定义通用的模型配置格式
type ModelConfig = {
  key: string;
  model: string;
  url: string;
  apiKeyEnv: string;
};

// 🌟 终极点将台：8模同台配置字典
const MODELS: ModelConfig[] = [
  // --- 国外模型 (统一走 OpenRouter 代理) ---
  { key: "chatgpt", model: "openai/gpt-5.4", url: "https://openrouter.ai/api/v1/chat/completions", apiKeyEnv: "OPENROUTER_API_KEY" },
  { key: "claude", model: "anthropic/claude-sonnet-4.6", url: "https://openrouter.ai/api/v1/chat/completions", apiKeyEnv: "OPENROUTER_API_KEY" },
  { key: "gemini", model: "google/gemini-3.1-flash-lite-preview", url: "https://openrouter.ai/api/v1/chat/completions", apiKeyEnv: "OPENROUTER_API_KEY" },
  { key: "grok", model: "x-ai/grok-4.1-fast", url: "https://openrouter.ai/api/v1/chat/completions", apiKeyEnv: "OPENROUTER_API_KEY" },
  { key: "deepseek", model: "deepseek/deepseek-v3.2", url: "https://openrouter.ai/api/v1/chat/completions", apiKeyEnv: "OPENROUTER_API_KEY" },

  // --- 国内模型 (直连官方原生接口，速度起飞) ---
  { key: "kimi", model: "kimi-k2.5", url: "https://api.moonshot.cn/v1/chat/completions", apiKeyEnv: "KIMI_API_KEY" },
  { key: "qianwen", model: "qwen3.5-flash-2026-02-23", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", apiKeyEnv: "QWEN_API_KEY" },
  { key: "doubao", model: "doubao-seed-2-0-pro-260215", url: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", apiKeyEnv: "DOUBAO_API_KEY" },
];

type StreamChunk = { model: string; content: string; done: boolean };

// 核心流式请求函数（现在它支持所有平台了！）
function streamAPI(
  question: string,
  config: ModelConfig,
  send: (chunk: StreamChunk) => void
): Promise<void> {
  // 根据不同的模型，自动去拿对应的 Key
  const apiKey = process.env[config.apiKeyEnv];

  if (!apiKey || apiKey === "placeholder") {
    send({
      model: config.key,
      content: `请配置 ${config.apiKeyEnv} 后使用`,
      done: false,
    });
    send({ model: config.key, content: "", done: true });
    return Promise.resolve();
  }

  // OpenRouter 联网：model 追加 :online 后缀
  const isOpenRouter = config.url.includes("openrouter.ai");
  const effectiveModel = isOpenRouter ? `${config.model}:online` : config.model;

  // 统一 System Prompt：全模型联网搜索优先
  const systemContent =
    "当前实时时间是 2026 年 3 月 7 日星期六。请务必优先调用联网搜索工具来获取当下的最新资讯（如洛阳本地新闻、AI 政策等），确保回答的时效性。";

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: systemContent },
    { role: "user", content: question },
  ];

  const body: Record<string, unknown> = {
    model: effectiveModel,
    messages,
    stream: true,
  };

  // Kimi 搜索增强：use_search + web_search 工具
  if (config.key === "kimi") {
    body.use_search = true;
    body.tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web for information",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "What to search for",
              },
            },
            required: ["query"],
          },
        },
      },
    ];
  }
  if (config.key === "qianwen") body.enable_search = true;
  if (config.key === "doubao") {
    body.tools = [{ type: "web_search", max_keyword: 5 }];
  }

  const doFetch = (signal: AbortSignal) =>
    fetch(config.url, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://zjr.ai",
        "X-Title": "AI Roundtable",
      },
      body: JSON.stringify(body),
    });

  const maxRetries = config.key === "kimi" ? 2 : 0;

  const runWithRetry = async (attempt: number): Promise<void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    try {
      const res = await doFetch(controller.signal);
      clearTimeout(timeoutId);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message ?? res.statusText;
        if (res.status >= 500 && attempt < maxRetries) {
          throw new Error(`API 错误: ${msg}`);
        }
        send({ model: config.key, content: `API 错误: ${msg}`, done: false });
        send({ model: config.key, content: "", done: true });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        send({ model: config.key, content: "", done: true });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const lineEnd = buffer.indexOf("\n");
            if (lineEnd === -1) break;

            const line = buffer.slice(0, lineEnd).trim();
            buffer = buffer.slice(lineEnd + 1);

            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;

              try {
                const parsed = JSON.parse(data);
                if (parsed?.error) break;

                const content =
                  parsed?.choices?.[0]?.delta?.content ??
                  parsed?.delta?.content;
                if (typeof content === "string") {
                  send({ model: config.key, content, done: false });
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      send({ model: config.key, content: "", done: true });
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        return runWithRetry(attempt + 1);
      }
      const msg =
        err && typeof err === "object" && "name" in err && (err as Error).name === "AbortError"
          ? "请求超时（45秒），请检查网络或 API 配置"
          : err instanceof Error
            ? err.message
            : String(err ?? "未知错误");
      send({ model: config.key, content: `请求失败: ${msg}`, done: false });
      send({ model: config.key, content: "", done: true });
    }
  };

  return runWithRetry(0);
}

export async function POST(request: NextRequest) {
  let question: string;
  let modelKeys: string[] | undefined;
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question : "";
    modelKeys = Array.isArray(body?.models) ? body.models : undefined;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!question.trim()) {
    return new Response(
      JSON.stringify({ error: "question is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 可选：只请求指定的模型 key 列表（1-8 个）
  const keysToUse =
    modelKeys &&
    modelKeys.length >= 1 &&
    modelKeys.length <= 8
      ? modelKeys
      : MODELS.map((m) => m.key);
  const modelsToUse = MODELS.filter((m) => keysToUse.includes(m.key));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: StreamChunk) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
        );
      };

      // 并行执行，8 个模型同时请求，每个 chunk 带 model 标识前端会正确分发
      await Promise.all(modelsToUse.map((config) => streamAPI(question, config, send)));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}