# 香港市场洞察站

完整团队网站的 GitHub 迁移版。包含 App 指标、小红书搜索指数、笔记与口碑统计、灵犀赛道报告、小红书洞察周报、已整理市场动态。保留历史数据、日历筛选、周新增与周均 DAU、趋势图、笔记好中差评筛选及 PDF 阅读。

## 数据与访问

- `site/data/` 仅保存 AES-256-GCM 加密的业务数据及 PDF。团队访问密钥不在仓库或网页源码里。
- 同事使用完整团队链接解锁，无需登录 GitHub 或 ChatGPT。持有链接的人可读取数据，应仅在公司内分享。
- 此机制是团队链接访问，不是逐人公司身份验证。取消某个人的访问需更换团队密钥并重新加密全部资料；公开仓库的历史密文会一直存在。
- 月狐密钥仅保存在 GitHub Actions Secrets，前端不请求月狐，也不接触月狐密钥。
- 未审阅草稿、桌面工作文件和飞书机器人凭据不在团队网站中。

## GitHub 设置

1. 仓库 Settings → Secrets and variables → Actions 设置 `TEAM_ACCESS_KEY`、`MOONFOX_DEV_KEY`、`MOONFOX_DEV_SECRET`。团队密钥须与导出时相同。
2. Settings → Pages → Source 选择 GitHub Actions。GitHub Free 的私有仓库不能启用 Pages；需确认采用公开的加密仓库，或升级支持私有仓库的方案。即使私有仓库发布，普通 Pages 网站仍不是公司身份登录站。
3. Actions → Update MoonFox and publish website → Run workflow。
4. 成功后使用 Pages 返回的地址，加原团队链接中 `#moonfox?team=...` 部分给同事。

## 自动更新

每小时第 17 分钟计划运行，直接连接月狐官方 API。GitHub 排队可能延迟；不承诺准点或秒级实时。App 指标按月狐已发布的日度/月度记录显示，回查 35 天以覆盖后续修订，并保留完整历史。6 个 App 全部成功后才替换数据，失败保留旧数据、公开错误状态但不记录密钥或响应正文。页面显示数据日期和最近成功检查时间，每 5 分钟检查站点版本，发现更新提示刷新。

小红书及已核实市场资料沿用导入快照，不会假装由月狐更新。周报周一 15:00 自动任务已于 2026-11-23 取消。用户放好材料后明确要求出刊、更新，Agent 才开始；先待审，明确批准后归档，群发另需指令。本工作流仅自动检查月狐和部署已提交的网站文件，不生成或批准周报。

## 本地维护

要求 Node.js 22，无第三方运行依赖。

```text
node scripts/export-local.mjs <本地观察站文件夹> <公司团队链接.url文件>
npm test
npm run build
```

以上 export-local 仅用于首次迁移；日常周更新从最新 main 开始，用 merge-week 合并，不能用旧全量快照覆盖最新月狐和已归档资料。不要提交原始 Excel、PDF、`.env`、含团队密钥的链接或截图。网页目录为 `dist`。所有相对路径兼容 GitHub 项目子路径。

每周更新已核对的小红书笔记与搜索指数时，先取得现行版本的加密 catalog，再运行：

```text
node scripts/merge-week.mjs <现行catalog.enc> <本地本期资料.json> <公司团队链接.url> site/data/catalog.enc
```

本期资料须包含完整分类和原帖快照。此操作合并历史，保留现行月狐文件和团队周报归档；待审 PDF/HTML 不进入团队网站。仅提交生成的密文及不含资料的代码。私人待审站已关闭匿名访问，旧 hkbeat.abrdns.com 域名已解绑。

GitHub 内地可达性需要实际网络验收，部署成功不代表所有内地网络可访问。

## 用户确认后的归档

Agent 的 `weekly_delivery.py snapshot` 调用 merge-week.mjs，合并已复核笔记、搜索及可选的灵犀原刊摘要；archive-reports.mjs 为原刊和已批准周报生成密文。`weekly_delivery.py archive` 仅在收到具体版本的批准后调用，归档 PDF、HTML 和证据，并生成私有发布清单。

```text
node scripts/archive-reports.mjs <私有发布清单.json> <团队链接.url>
```

清单的 reports 项含 kind/start/end/pdf/sha256；weekly 要求 userConfirmed=true，lingxi 原刊要求 sourceReviewed=true。清单和原件保持在仓库外，只提交生成的 catalog.enc 和指定 PDF 密文。脚本不会发送消息或 push。提交前保留最新 main 的 app.enc/status.json，部署后核对线上 manifest 与密文哈希。公司完整流程见 Agent 根目录「交接给公司内部AI.md」。

