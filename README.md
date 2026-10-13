 # AI人脉地图初版

这是一个可运行的微信小程序和 Java 后端初版，用于验证联系人录入、搜索、地区分布和人物关系管理的主业务闭环。

产品范围不包含站内聊天、私信、消息或会话功能。微信仅用于登录及用户主动分享加密备份文件；文本整理只处理用户粘贴的人物介绍或联系人资料。

## 目录

- `backend`：Java 21、Spring Boot 4.1 REST API。
- `miniprogram`：原生微信小程序 TypeScript 工程。
- `outputs`：需求分析文档。

## 已实现

- 看板统计：联系人、城市、单位数量和最近联系人。
- 联系人：新增、详情、搜索、城市筛选、删除接口。
- 联系人维护：编辑资料、标签筛选、删除联系人及关联关系。
- 人脉地图：按联系人工作城市聚合展示。
- 人物关系：在联系人详情中新增、查看和删除关系列表。
- 本地数据：个人资料、头像、联系人、标签和关系保存在微信小程序的本机存储中，按微信账号隔离。
  大数据按 200KiB 分片，全部新分片写入成功后才提交索引；旧单键数据在下次成功保存时迁移。仍受微信总存储容量约束，原子替换需要暂存新旧两代数据，空间不足时保留旧数据并提示导出备份。
- 八位导入码：每个微信账号有固定的 `3位数字+2位字母+3位数字` 导入码；用户公开昵称后，其他用户可按码获取其主动公开的最小资料并保存为本机联系人。未发布的旧服务器资料不可导入。
- AI 信息预填：通过 DeepSeek 的兼容接口提取联系人结构化信息。
- 后端基础能力：统一参数校验和异常响应、请求追踪日志、缓存、分页及 API 限流。

## 启动后端

在 `backend` 目录运行：

```powershell
.\mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=dev
```

也可以运行 `.\start.ps1 -Profile dev`，或用 `.\start.ps1 -Profile dev -Background` 在后台启动。后台启动日志写入 `backend/logs/`，脚本只表示进程已发起，需检查日志或访问 `http://127.0.0.1:8080/actuator/health` 确认就绪。

服务启动后访问地址为 `http://127.0.0.1:8080`。后端用于微信登录、首次导出旧数据、AI 提取和导入码公开资料交换；既有 H2 数据不会自动删除。

后端配置分为公共、开发和生产三个文件。必须显式选择 `dev` 或 `prod`，遗漏或混用环境会拒绝启动。开发环境读取外部文件 `backend/application-local.properties`，并兼容现有 `backend/src/main/resources/application-local.properties`；两者均不得提交，Maven 明确排除源码资源目录中的本机密钥文件。推荐通过环境变量配置密钥。生产环境不导入本机密钥，要求 PostgreSQL、必要凭证和 HTTPS 公开地址。

生产数据库使用 Flyway 版本化迁移，Hibernate 仅校验结构。空库自动执行 `db/migration/V1__initial_schema.sql`；已有库不会自动标记基线或修改已有表，需备份并核对结构后显式确认基线。H2 到 PostgreSQL 的真实数据迁移需在副本演练后执行，此次代码修复没有操作本机或生产数据。构建后运行 `python scripts/verify-backend-artifact.py`，检查 jar 未包含本机密钥文件或明文密钥属性。

AI 默认每账号每天 20 次、单服务进程每天 200 次，可通过 `AI_ACCOUNT_DAILY_LIMIT` 和 `AI_GLOBAL_DAILY_LIMIT` 调整。当前计数在内存中，重启会重置，多副本部署须先改用共享持久化配额。转发请求头默认不信任；只有代理先移除客户端伪造头、限制后端仅接收可信代理流量后，才配置 `FORWARD_HEADERS_STRATEGY`。旧联系人、关系、个人资料和头像上传写接口默认禁用；旧数据只读迁移、导入码、公开资料同步及本人头像迁移下载保留。

生产环境先准备 PostgreSQL 数据库及独立账号，并设置 `SPRING_DATASOURCE_URL`（`jdbc:postgresql://主机:5432/数据库名`）、`SPRING_DATASOURCE_USERNAME`、`SPRING_DATASOURCE_PASSWORD`、微信登录密钥、`AUTH_TOKEN_SECRET` 和 `APP_PUBLIC_BASE_URL`，再运行 `.\start.ps1 -Profile prod`。生产配置会自动创建/更新当前表结构，但**不会搬迁 H2 中的账号资料、固定导入码或公开资料**；已有用户切换数据库前应备份并安排数据迁移，不能直接指向空库上线。生产日志默认写入 `backend/logs/ai-network.log`，按 10MB 滚动并保留 30 份。`/actuator/health` 和 `/actuator/info` 可用于基础监控；未开放无认证的 metrics HTTP 端点。

## 微信登录与用户隔离

用户点击进入页按钮后才检查本机登录状态。登录时调用 `wx.login`，后端使用临时 `code` 换取 `openid`，再签发七天有效的访问令牌。本机数据以 `openid` 为键分别保存；联系人、统计、地图和人物关系在手机上管理。

首次使用本地版本时，小程序通过受认证的 `/api/local-export` 一次性读取该账号的旧资料、联系人和关系，全部成功写入本机后才切换到本地读写。导出或头像下载失败不会创建空数据，可重试。之后联系人和关系不会写回服务器；只有用户主动公开的资料会通过单独接口发布，用于导入码查询。旧服务器资料不会自动公开。首次迁移需要后端在线。

**本地存储注意事项：** 联系人和关系只在当前手机，不会自动同步到其他手机；卸载小程序、清理微信存储或更换手机可能导致新数据丢失。可在“设置 → 账号安全 → 数据备份与恢复”生成加密文件，通过微信文件分享后另存到安全位置。恢复前可预览联系人和关系数量，恢复会完整覆盖当前账号的本机数据；请先备份当前手机。备份密码至少 10 位，不会上传服务器；忘记密码无法恢复。备份包含本机头像。退出登录只清除登录状态，不清除本机资料。导入码需要网络与后端；仅公开昵称及选定字段会发布，关闭昵称公开会撤销可导入资料。头像仍保存在本机，不通过导入码分享。微信登录、旧数据首次迁移和 DeepSeek AI 提取也需要网络与后端。

新增联系人页支持粘贴文字后预览 AI 提取结果、保存时提醒可能重复的联系人，以及按“姓名 | 单位 | 职务 | 城市 | 电话”逐行批量录入。批量保存会先校验所有选中记录，再一次写入本机。不提供拍照或上传名片进行 OCR 识别。真机验证步骤及尚未完成的验证见 [真机测试清单](docs/真机测试清单.md)。

部署前请在后端运行环境配置下列环境变量，不要将真实值提交到 Git：

```powershell
$env:WECHAT_APP_ID = "你的小程序AppID"
$env:WECHAT_APP_SECRET = "你的小程序AppSecret"
$env:AUTH_TOKEN_SECRET = "至少32位的随机字符串"
```

启用 AI 联系人提取时，在后端运行环境配置 DeepSeek API Key。默认请求地址是 `https://api.deepseek.com/chat/completions`，默认模型是 `deepseek-flash`，因此通常只需设置密钥：

```powershell
$env:DEEPSEEK_API_KEY = "你的DeepSeek API Key"
```

后端沿用现有的 OpenAI 兼容请求和 JSON 解析逻辑，小程序仍调用 `POST /api/ai/extract`，无需改动页面。需要覆盖默认值时，可设置 `DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL` 和 `DEEPSEEK_TIMEOUT_SECONDS`；基础地址可填写服务根地址或以 `/v1` 结尾的地址，后端会补上 `/chat/completions`。旧的 `AI_API_KEY`、`AI_BASE_URL` 和 `AI_MODEL` 不再用于此接口，避免把其他服务商的密钥发送到 DeepSeek。未配置 `DEEPSEEK_API_KEY` 时，其他功能仍可使用，AI 提取接口会返回“AI 提取服务尚未配置”。真实密钥不得写入配置文件或提交到 Git。设置密钥后需重新启动后端；正式调用需要服务器能访问 DeepSeek API。

后端不会提供默认令牌密钥；缺少 `AUTH_TOKEN_SECRET` 时将拒绝启动。生产环境还应设置实际网页来源和公开地址：

```powershell
$env:CORS_ALLOWED_ORIGIN_PATTERNS = "https://你的管理后台域名"
$env:APP_PUBLIC_BASE_URL = "https://你的后端域名"
```

微信小程序原生请求不受浏览器 CORS 限制。演示联系人默认关闭；仅需要本地演示时设置 `$env:DEMO_DATA_ENABLED = "true"` 后启动服务。

同时将根目录 `project.config.json` 的 `appid` 替换为同一个小程序 AppID，在微信公众平台配置生产后端的 HTTPS 请求合法域名。未配置 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` 时，登录接口会返回“微信登录尚未配置 AppID 和 Secret”，不会回退为共享演示用户。

## 打开小程序

1. 打开微信开发者工具。
2. 导入仓库根目录。根目录配置会自动将 `miniprogram` 识别为小程序源码目录。
3. 在开发者工具中勾选“不校验合法域名、web-view 域名、TLS 版本以及 HTTPS 证书”。
4. 确认后端已在本机 `8080` 端口运行，然后点击编译。

小程序模拟器默认访问 `127.0.0.1:8080/api`。复制 `miniprogram/utils/api-config.local.example.js` 为同目录的 `api-config.local.js`，填写 `deviceDevelop`（电脑局域网地址）、`trial` 和 `release`（实际 HTTPS 后端地址）。这个文件不提交 Git，但需要随小程序构建一起上传。无需改动 TS 和生成 JS；真机未配置地址时会明确报错。真机须与电脑同网，并在微信公众平台配置体验版和正式版的请求合法域名。局域网 HTTP 只用于开发。

## 主要接口

| 方法 | 地址 | 用途 |
| --- | --- | --- |
| POST | `/api/auth/wechat-login` | 微信登录 |
| GET | `/api/local-export` | 首次迁移时只读导出旧数据 |
| POST | `/api/ai/extract` | AI 联系人信息提取 |

联系人、关系、看板、地图和标签使用小程序本地数据层，不再向这些旧服务端接口写入。

## 测试

后端测试使用独立的内存 H2，不会读取或修改本机正式数据：

```powershell
Set-Location backend
.\mvnw.cmd test
```

测试完成后，覆盖率报告位于 `backend/target/site/jacoco/index.html`。

项目根目录运行 `npm ci`、`npm run build`、`npm run check`。只编辑 TypeScript 页面和 API 源码，`npm run build` 统一生成对应 JavaScript，并复制 Worker 所需的加密库。微信开发者工具导入前也需完成构建；备份使用后台 Worker 执行密码派生，旧版本不支持时会提示更新，不降低加密强度。GitHub 的 PR 检查会执行严格类型检查、全部前端测试、后端验证、生成文件一致性检查及 jar 密钥检查。
