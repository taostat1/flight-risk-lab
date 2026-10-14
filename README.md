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

1. 环境现有 PostgreSQL：默认通过 CloudBase HTTPS `exec-pgsql` 接口访问，使用环境 ID 和服务端管理员 API Key。无需数据库连接串、内外网地址或开放 PostgreSQL 端口。API Key 必须有管理员执行 SQL 权限，Publishable Key 不能替代。密钥只填云托管后端环境变量，不能放入网页或截图。
2. 腾讯云 COS 私有存储桶：地域上海 `ap-shanghai`，访问权限“私有读写”。不得设为公有读。专用子账号仅授予该桶的对象读取/写入权限，不授予全账号管理权限。云开发自带存储未必能直接当作独立 COS 桶使用，必须核对桶名称及权限。
3. 教师账号：运行 `node scripts/staff-config.mjs`，在隐藏输入中提供初始密码，把输出的哈希账号 JSON 仅填到服务器配置。不要提交到 GitHub。

| 环境变量 | 内容 |
|---|---|
| DB_TRANSPORT | `http`（默认） |
| CLOUDBASE_ENV_ID | 当前环境的完整环境 ID |
| CLOUDBASE_API_KEY | 当前环境的服务端管理员 API Key，仅后端保存 |
| COS_BUCKET | 完整存储桶名称，含平台分配的后缀 |
| COS_REGION | ap-shanghai |
| COS_SECRET_ID / COS_SECRET_KEY | 仅有该桶对象读写权限的子账号凭证 |
| STAFF_ACCOUNTS_JSON | 三个授权教师/助教账号的盐和密码哈希 |
| PUBLIC_ORIGIN | 服务实际 HTTPS 网址，不带末尾 `/`；首次获取默认域名后设置。未设置时按请求 Host 判断同源 |
| PORT | 8080 |

数据库表位于独立 `flight_portal` schema，启动时撤销 PUBLIC、anon、authenticated 的访问权限，不通过前端数据库 SDK 读取。提交 CSV 与答案仅通过后端访问私有桶。容器本地磁盘仅作上传临时缓存，真实数据持久化在 PostgreSQL 和 COS。

## 上线顺序

1. 在当前环境的身份认证/API Key 管理中创建服务端 API Key，配置私有存储与教师账号。不要因本说明开启数据库外网或购买独享数据库。
2. 完成上述环境变量配置，再部署此分支；数据库初始化失败会阻止应用启动。
3. 获取默认测试域名，设置 PUBLIC_ORIGIN；验证主页与 `/healthz`。教师入口 `/?view=staff`。
4. 使用教师账号导入隐藏标签和测试特征，导入脚本见 `scripts/import-data.mjs`。标签不可放进 Git 仓库或公开目录。
5. 迁移旧站记录：先用旧站教师登录导出历史记录及原始 CSV，再执行受控导入；校验条数、哈希、排行榜和每日额度。不迁移登录会话。正式切换期间停止旧站新提交，避免遗漏切换时产生的数据。
6. 验证两个任务与教师权限，进行腾讯云实机并发及校园网、移动网络测试。未经实机测试，不承诺 80 人并发性能。
7. 正式面向学生前，按 CloudBase 要求绑定备案域名和 HTTPS。默认域名仅用于开发验证，不能以它替代正式域名方案。

## 本地验证

`npm ci` → `npm test` → `npm run build`。测试以模拟 CloudBase HTTP 响应封装真实 PGlite PostgreSQL 引擎，并使用模拟对象存储。覆盖事务整体回滚、已提交但响应丢失的重试去重、参数转义、匿名角色拒绝、80 个预约争用、配额、排行榜及两个 697,754 行任务。它不是腾讯云实测；实际 API Key 权限、网关 SQL 能力、COS、Linux Docker 构建与外网链路仍需云端验证。

## HTTP 事务设计与限制

- 所有请求使用参数化 HTTP SQL 调用私有 schema 的 `http_run_v1` 函数。函数采用调用者权限，撤销 PUBLIC/anon/authenticated 的执行权限，不对学生暴露通用 SQL 接口。
- 每日额度递增与 processing 记录创建在同一条 CTE 内完成；达到10次后不再插入记录。锁获取使用带条件的原子 UPSERT。
- 修改密码与注销旧会话、版本切换、错误记录与额度退回均在单个函数调用内执行，中途出错则全部回滚。没有跨 HTTP 请求的 BEGIN/COMMIT。
- 写请求使用 UUID 和私有 `http_receipts` 表。网络不确定时最多重试3次，重试沿用同一 UUID，通过数据库事务锁返回已提交结果，避免再次扣次。401/403及明确数据库错误不盲目重试。
- 若重试后仍无法确认结果，不承诺“已退还额度”，保留提交编号供教师核查。已保存的成绩不因后续排行榜请求失败而撤回。
- PostgreSQL 与 COS 之间没有跨服务事务。文件保存失败会按规则记录并退额；进程异常退出或网络长期中断的 processing 记录需教师核查，不能把整个上传评分过程称为一个数据库事务。
- `http_receipts` 是私有运维数据，当前不会自动清理，应根据课程周期设置保留策略；不得在仍有请求重试期间删除对应记录。
- 兼容直连模式仍可使用 `DB_TRANSPORT=postgres` 和 `DATABASE_URL`，但当前共享环境部署不使用它。

官方参考：
- https://docs.cloudbase.net/database/postgresql/connecting-to-postgresql
- https://docs.cloudbase.net/en/http-api/pgdb/exec-pgsql
- https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/prompts/database-http-api
- https://cloud.tencent.com/document/product/1243/77191
- https://cloud.tencent.com/document/product/876/130728

费用由云平台套餐、运行资源、数据库、COS 容量和流量共同决定；体验版是否支持所需资源以控制台为准。未预设所有功能免费。
