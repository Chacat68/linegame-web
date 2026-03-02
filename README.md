# linegame-web

星际贸易帝国 — 纯前端网页游戏，基于 HTML + CSS + JavaScript（ES Modules）构建，无需构建步骤，可直接部署静态文件。

## Cloudflare Pages 部署

### 首次部署前准备

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Pages**，创建一个名为 `linegame-web` 的 Pages 项目（选择「直接上传」方式）。

### 配置 GitHub 仓库 Secrets

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加以下两个 Secret：

| Secret 名称 | 说明 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 令牌（需要 Cloudflare Pages 编辑权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |

### 自动部署

配置完成后，GitHub Actions 会自动触发部署：

- **推送到 `main` 分支** → 部署到生产环境
- **提交 Pull Request** → 部署到预览环境