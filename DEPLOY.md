# Cloudflare 部署指南

本项目使用 **OpenNext + Cloudflare Workers** 部署，支持 Next.js 完整功能（含 API 路由、SSE 流式响应）。

## 前置要求

- Node.js 18+
- [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（通过 npm 安装）

> **Windows 用户**：OpenNext 在 Windows 上可能存在兼容性问题，建议使用 WSL 或直接在 Cloudflare 的 Git 集成中构建。

## 一、安装依赖

```bash
npm install @opennextjs/cloudflare@latest
npm install --save-dev wrangler@latest
```

## 二、配置环境变量

在 Cloudflare 中配置 `OPENROUTER_API_KEY`：

### 方式 A：本地部署时

创建 `.dev.vars` 文件（已存在，可添加）：

```
OPENROUTER_API_KEY=你的真实API密钥
NEXTJS_ENV=development
```

### 方式 B：Cloudflare 云端

部署后，在 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → 你的项目 → Settings → Variables 中添加：

- 变量名：`OPENROUTER_API_KEY`
- 值：你的 OpenRouter API Key
- 加密：建议勾选（生产环境）

或使用命令行：

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

## 三、本地预览（模拟 Cloudflare 环境）

```bash
npm run preview
```

会先构建，再在本地以 Cloudflare Workers 运行时启动，用于验证部署效果。

## 四、部署到 Cloudflare

### 方式 A：命令行部署

1. 登录 Cloudflare：
   ```bash
   npx wrangler login
   ```

2. 执行部署：
   ```bash
   npm run deploy
   ```

3. 部署完成后会输出访问 URL，形如：`https://zjr-arena.xxx.workers.dev`

### 方式 B：Git 自动部署（推荐，适合 Windows）

通过 Cloudflare 连接 Git 仓库，在云端构建，可避免 Windows 本地构建问题：

1. 将代码推送到 GitHub/GitLab
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
3. Workers & Pages → Create → Connect to Git
4. 选择仓库 `zjr-arena`
5. 配置构建设置：
   - **Framework preset**: Next.js (OpenNext)
   - **Build command**: `npm run build && npx opennextjs-cloudflare build`
   - **Build output directory**: `.open-next`
   - **Root directory**: `/`（若项目在仓库根目录）
6. 在 Environment variables 中添加 `OPENROUTER_API_KEY`
7. 保存并部署

## 五、自定义域名

1. Cloudflare Dashboard → 你的 Worker → Settings → Domains & Routes
2. 添加 Custom Domain，例如 `zjr.ai`
3. 若域名在 Cloudflare，会自动配置 SSL

## 六、常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发（Node.js） |
| `npm run preview` | 本地预览（Cloudflare 运行时） |
| `npm run deploy` | 构建并部署到 Cloudflare |
| `npx wrangler tail` | 查看 Worker 实时日志 |

## 七、故障排查

### resvg.wasm 找不到（Windows）

错误：`A file or directory could not be found ... resvg.wasm?module`

**原因**：Windows 不支持路径中的 `?` 字符，而 Cloudflare 图片优化使用的 wasm 模块路径包含 `?module`。

**解决**：
1. 已在 `next.config.ts` 中设置 `images: { unoptimized: true }` 禁用图片优化
2. 清理后重新构建：
   ```bash
   rmdir /s /q .open-next .wrangler .next 2>nul
   npm run deploy
   ```
3. 若仍失败，使用 **Git 部署**（在 Cloudflare 的 Linux 环境构建）

### 其他

- **API 报错**：确认 `OPENROUTER_API_KEY` 已在 Cloudflare 中正确配置
- **构建失败**：确保 `wrangler` 版本 ≥ 3.99.0
- **区域限制**：部署到 Cloudflare 后，请求从边缘节点发出，通常可避免「not available in your region」问题
