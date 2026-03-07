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
  { key: "qianwen", model: "qwen-max-2026-0", url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", apiKeyEnv: "QWEN_API_KEY" },
  { key: "doubao", model: "doubao-2.0-pro-32k", url: "https://ark.cn-beijing.volces.com/api/v3/chat/completions", apiKeyEnv: "DOUBAO_API_KEY" },
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

  return fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://zjr.ai",
      "X-Title": "AI Roundtable",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user" as const, content: question }],
      stream: true,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        send({
          model: config.key,
          content: `API 错误: ${err?.error?.message ?? res.statusText}`,
          done: false,
        });
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

                const content = parsed?.choices?.[0]?.delta?.content;
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
    })
    .catch((err) => {
      send({
        model: config.key,
        content: `请求失败: ${err instanceof Error ? err.message : String(err)}`,
        done: false,
      });
      send({ model: config.key, content: "", done: true });
    });
}

export async function POST(request: NextRequest) {
  let question: string;
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question : "";
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: StreamChunk) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
        );
      };

      // 同时唤醒 8 个模型并开始赛跑！
      const tasks = MODELS.map((config) => streamAPI(question, config, send));

      await Promise.all(tasks);
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