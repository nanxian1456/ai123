# AI人脉地图初版

这是一个可运行的微信小程序和 Java 后端初版，用于验证联系人录入、搜索、地区分布和人物关系图谱的主业务闭环。

## 目录

- `backend`：Java 21、Spring Boot 4.1 REST API。
- `miniprogram`：原生微信小程序 TypeScript 工程。
- `outputs`：需求分析文档。

## 已实现

- 看板统计：联系人、城市、单位数量和最近联系人。
- 联系人：新增、详情、搜索、城市筛选、删除接口。
- 联系人维护：编辑资料、标签筛选、删除联系人及关联关系。
- 人脉地图：按联系人工作城市聚合展示。
- 人物关系：新增、删除关系，围绕联系人展示一层关系节点和关系类型。
- 数据持久化：用户资料、联系人、标签和关系均通过 JPA 保存到数据库。
- AI 信息预填：通过 DeepSeek 的兼容接口提取联系人结构化信息。
- 后端基础能力：统一参数校验和异常响应、请求追踪日志、缓存、分页及 API 限流。

## 启动后端

在 `backend` 目录运行：

```powershell
.\mvnw.cmd spring-boot:run
```

服务启动后访问地址为 `http://127.0.0.1:8080`。默认使用用户目录下的 H2 文件数据库，后端重启后用户资料、联系人和关系数据仍会保留。

## 微信登录与用户隔离

小程序启动时会调用 `wx.login`，后端使用微信返回的临时 `code` 换取 `openid`，再签发七天有效的访问令牌。联系人、标签、统计、地区和关系接口均从该令牌中读取用户身份，不能再通过客户端传入用户 ID。

首次登录会进入个人资料完善页，填写昵称、单位、职务、城市和个人简介；“我的”页面可查看与修改这部分资料。个人资料、公开设置、联系人、标签和关系均按 `openid` 隔离并持久保存。

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
2. 导入项目根目录 `C:\Users\l\Desktop\AI人脉地图初版`。根目录配置会自动将 `miniprogram` 识别为小程序源码目录。
3. 在开发者工具中勾选“不校验合法域名、web-view 域名、TLS 版本以及 HTTPS 证书”。
4. 确认后端已在本机 `8080` 端口运行，然后点击编译。

真机调试不能直接访问电脑上的 `127.0.0.1`。需要将 `miniprogram/utils/api.ts` 中的 `BASE_URL` 改为局域网可访问地址或已部署的 HTTPS 域名，并在微信公众平台配置请求合法域名。

## 主要接口

| 方法 | 地址 | 用途 |
| --- | --- | --- |
| GET | `/api/dashboard` | 首页统计 |
| GET、POST | `/api/contacts` | 联系人列表、新增 |
| GET | `/api/contacts/page?page=0&size=20` | 联系人分页查询 |
| GET、PATCH、DELETE | `/api/contacts/{id}` | 联系人详情、修改、删除 |
| GET | `/api/maps/cities` | 城市分布 |
| GET | `/api/graphs/contacts/{id}` | 一层关系图谱 |
| POST | `/api/relationships` | 新增关系 |
| POST | `/api/ai/extract` | AI 联系人信息提取 |

## 测试

后端测试使用独立的内存 H2，不会读取或修改本机正式数据：

```powershell
Set-Location backend
.\mvnw.cmd test
```

测试完成后，覆盖率报告位于 `backend/target/site/jacoco/index.html`。
