# 数据挖掘与机器学习 · 腾讯云迁移版

此分支为 Node.js 容器应用，包含学生网页、评分接口与教师后台。前后端同域访问，不依赖原评分托管平台。`main` 分支仍为原 GitHub Pages 网页，不能用于部署本应用。

## 控制台填写

| 项目 | 值 |
|---|---|
| 仓库 | taostat1/flight-risk-lab |
| 分支 | cloudbase |
| 服务名称 | flight-risk-api |
| 自动部署 | 初期关闭 |
| 服务端口 | 8080（访问端口保留平台默认） |
| 构建目录 | 仓库根目录 `.` |
| Dockerfile | `Dockerfile` |
| 启动命令 | 留空，使用镜像自带命令 |
| 健康检查 | HTTP `/healthz` |

代码已具备部署结构，但仍须配置数据库、私有 COS 存储和教师账号，并导入真实数据。代码测试通过不等于腾讯云环境已上线。

## 必需资源与环境变量

1. 环境现有 PostgreSQL：在数据库的连接设置中获取服务端直连信息，优先同地域内网。创建专用数据库账号，不使用浏览器公开访问密钥。账号需能创建 `flight_portal` schema 及表。数据库密码仅在云托管环境变量中设置。
2. 腾讯云 COS 私有存储桶：地域上海 `ap-shanghai`，访问权限“私有读写”。不得设为公有读。专用子账号仅授予该桶的对象读取/写入权限，不授予全账号管理权限。云开发自带存储未必能直接当作独立 COS 桶使用，必须核对桶名称及权限。
3. 教师账号：运行 `node scripts/staff-config.mjs`，在隐藏输入中提供初始密码，把输出的哈希账号 JSON 仅填到服务器配置。不要提交到 GitHub。

| 环境变量 | 内容 |
|---|---|
| DATABASE_URL | 控制台提供的 PostgreSQL 连接串；密码中的特殊字符需要 URL 编码 |
| PG_SSL_MODE | 默认 `verify-full`；按控制台证书要求配置，不要盲目关闭校验。若平台明确仅支持加密而不校验证书，可设 `require` |
| PG_CA_PEM | 可选：数据库 CA 证书文本 |
| COS_BUCKET | 完整存储桶名称，含平台分配的后缀 |
| COS_REGION | ap-shanghai |
| COS_SECRET_ID / COS_SECRET_KEY | 仅有该桶对象读写权限的子账号凭证 |
| STAFF_ACCOUNTS_JSON | 三个授权教师/助教账号的盐和密码哈希 |
| PUBLIC_ORIGIN | 服务实际 HTTPS 网址，不带末尾 `/`；首次获取默认域名后设置。未设置时按请求 Host 判断同源 |
| PORT | 8080 |

数据库表位于独立 `flight_portal` schema，启动时撤销 PUBLIC、anon、authenticated 的访问权限，不通过前端数据库 SDK 读取。提交 CSV 与答案仅通过后端访问私有桶。容器本地磁盘仅作上传临时缓存，真实数据持久化在 PostgreSQL 和 COS。

## 上线顺序

1. 确认现有 PostgreSQL 可直连，配置私有存储与账号。不要因本说明重复购买数据库或虚拟机。
2. 完成上述环境变量配置，再部署此分支；数据库初始化失败会阻止应用启动。
3. 获取默认测试域名，设置 PUBLIC_ORIGIN；验证主页与 `/healthz`。教师入口 `/?view=staff`。
4. 使用教师账号导入隐藏标签和测试特征，导入脚本见 `scripts/import-data.mjs`。标签不可放进 Git 仓库或公开目录。
5. 迁移旧站记录：先用旧站教师登录导出历史记录及原始 CSV，再执行受控导入；校验条数、哈希、排行榜和每日额度。不迁移登录会话。正式切换期间停止旧站新提交，避免遗漏切换时产生的数据。
6. 验证两个任务与教师权限，进行腾讯云实机并发及校园网、移动网络测试。未经实机测试，不承诺 80 人并发性能。
7. 正式面向学生前，按 CloudBase 要求绑定备案域名和 HTTPS。默认域名仅用于开发验证，不能以它替代正式域名方案。

## 本地验证

`npm ci` → `npm test` → `npm run build`。测试在 PGlite PostgreSQL 引擎和模拟对象存储中运行，验证 SQL、接口、身份校验、配额、排行榜及 697,754 行两个任务。实际腾讯云 PostgreSQL 网络、COS 权限、Linux Docker 镜像构建与外网链路仍需云端验证。

官方参考：
- https://docs.cloudbase.net/database/postgresql/connecting-to-postgresql
- https://cloud.tencent.com/document/product/1243/77191
- https://cloud.tencent.com/document/product/876/130728

费用由云平台套餐、运行资源、数据库、COS 容量和流量共同决定；体验版是否支持所需资源以控制台为准。未预设所有功能免费。
