import { NextRequest } from "next/server";

export const runtime = "edge";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const OPENROUTER_MODELS: { key: string; model: string }[] = [
  { key: "chatgpt", model: "openai/gpt-5-mini" },
  { key: "claude", model: "anthropic/claude-haiku-4.5" },
  { key: "gemini", model: "google/gemini-3-flash-preview" },
  { key: "grok", model: "x-ai/grok-4.1-fast" },
  { key: "deepseek", model: "deepseek/deepseek-chat" },
];

const MOCK_MODELS: { key: string; displayName: string }[] = [
  { key: "doubao", displayName: "豆包" },
  { key: "kimi", displayName: "Kimi" },
  { key: "qianwen", displayName: "千问" },
];

type StreamChunk = { model: string; content: string; done: boolean };

function streamOpenRouter(
  question: string,
  modelKey: string,
  openRouterModel: string,
  send: (chunk: StreamChunk) => void
): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "placeholder") {
    send({
      model: modelKey,
      content: "请配置 OPENROUTER_API_KEY 后使用",
      done: false,
    });
    send({ model: modelKey, content: "", done: true });
    return Promise.resolve();
  }

  return fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://zjr.ai",
      "X-Title": "AI Roundtable",
    },
    body: JSON.stringify({
      model: openRouterModel,
      messages: [{ role: "user" as const, content: question }],
      stream: true,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        send({
          model: modelKey,
          content: `API 错误: ${err?.error?.message ?? res.statusText}`,
          done: false,
        });
        send({ model: modelKey, content: "", done: true });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        send({ model: modelKey, content: "", done: true });
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
                  send({ model: modelKey, content, done: false });
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      send({ model: modelKey, content: "", done: true });
    })
    .catch((err) => {
      send({
        model: modelKey,
        content: `请求失败: ${err instanceof Error ? err.message : String(err)}`,
        done: false,
      });
      send({ model: modelKey, content: "", done: true });
    });
}

function streamMock(
  modelKey: string,
  displayName: string,
  send: (chunk: StreamChunk) => void
): Promise<void> {
  const msg = `${displayName}的API尚未接入，敬请期待`;

  return new Promise((resolve) => {
    setTimeout(() => {
      send({ model: modelKey, content: msg, done: false });
      send({ model: modelKey, content: "", done: true });
      resolve();
    }, 1000);
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

      const tasks: Promise<void>[] = [
        ...OPENROUTER_MODELS.map(({ key, model }) =>
          streamOpenRouter(question, key, model, send)
        ),
        ...MOCK_MODELS.map(({ key, displayName }) =>
          streamMock(key, displayName, send)
        ),
      ];

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
