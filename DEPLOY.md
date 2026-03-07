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

### 方式 B：Workers Builds（Git 自动部署，推荐）

通过 Cloudflare Workers Builds 连接 Git，在云端 Linux 环境构建，避免 Windows 本地问题：

1. 将代码推送到 GitHub
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages
3. Create Worker → Connect to Git → 选择仓库
4. 在 **Settings → Build** 中配置：

   | 设置项 | 值 |
   |--------|-----|
   | **Build command** | `npx opennextjs-cloudflare build` |
   | **Deploy command** | `npx wrangler deploy` |
   | **Root directory** | 留空（项目在根目录时） |

5. 在 **Build variables and secrets** 中添加 `OPENROUTER_API_KEY`（构建时可能需要）
6. 在 Worker 的 **Settings → Variables** 中添加 `OPENROUTER_API_KEY`（运行时使用）
7. 保存后推送代码触发构建

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

### 构建失败（build command exited with code: 1）

1. **查看完整日志**：在 Cloudflare 构建日志中向上滚动，找到红色错误信息（如 npm 报错、OpenNext 报错）
2. **检查 Build command**：必须是 `npx opennextjs-cloudflare build`，不能是 `npm run build`
3. **检查环境变量**：在 Build variables 中添加 `OPENROUTER_API_KEY`（若构建时需要）
4. **检查 Node 版本**：Workers Builds 默认 Node 18+，应兼容

### 其他

- **API 报错**：确认 `OPENROUTER_API_KEY` 已在 Worker 的 Variables 中配置
- **构建失败**：确保 `wrangler` 版本 ≥ 3.99.0
- **区域限制**：部署到 Cloudflare 后，请求从边缘节点发出，通常可避免「not available in your region」问题
