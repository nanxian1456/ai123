# AI人脉地图初版

这是一个可运行的微信小程序和 Java 后端初版，用于验证联系人录入、搜索、地区分布和人物关系图谱的主业务闭环。

产品范围不包含站内聊天、私信、消息或会话功能。微信仅用于登录及用户主动分享加密备份文件；文本整理只处理用户粘贴的人物介绍或名片文字。

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
- 本地数据：个人资料、头像、联系人、标签和关系保存在微信小程序的本机存储中，按微信账号隔离。
- 八位导入码：每个微信账号有固定的 `3位数字+2位字母+3位数字` 导入码；用户公开昵称后，其他用户可按码获取其主动公开的最小资料并保存为本机联系人。未发布的旧服务器资料不可导入。
- AI 信息预填：通过 DeepSeek 的兼容接口提取联系人结构化信息。
- 后端基础能力：统一参数校验和异常响应、请求追踪日志、缓存、分页及 API 限流。

## 启动后端

在 `backend` 目录运行：

```powershell
.\mvnw.cmd spring-boot:run
```

服务启动后访问地址为 `http://127.0.0.1:8080`。后端用于微信登录、首次导出旧数据、AI 提取和导入码公开资料交换；既有 H2 数据保留供迁移，不会自动删除。

后端配置分为 `application.properties`（公共参数）、`application-dev.properties`（本机开发）和 `application-prod.properties`（生产环境）。默认使用 `dev`，上述命令不变；开发环境会读取 Git 忽略的 `backend/src/main/resources/application-local.properties`，保留现有本机密钥配置。不要把真实密钥写入已跟踪的配置文件。部署时显式设置 `$env:SPRING_PROFILES_ACTIVE = "prod"` 后启动，生产环境不会导入 `application-local.properties`，必须通过环境变量提供 `AUTH_TOKEN_SECRET` 等密钥。当前数据库仍默认为文件型 H2，正式部署前需另行配置生产数据库。

## 微信登录与用户隔离

用户点击进入页按钮后才检查本机登录状态。登录时调用 `wx.login`，后端使用临时 `code` 换取 `openid`，再签发七天有效的访问令牌。本机数据以 `openid` 为键分别保存；联系人、统计、地图和关系图谱在手机上计算。

首次使用本地版本时，小程序通过受认证的 `/api/local-export` 一次性读取该账号的旧资料、联系人和关系，全部成功写入本机后才切换到本地读写。导出或头像下载失败不会创建空数据，可重试。之后联系人和关系不会写回服务器；只有用户主动公开的资料会通过单独接口发布，用于导入码查询。旧服务器资料不会自动公开。首次迁移需要后端在线。

**本地存储注意事项：** 联系人和关系只在当前手机，不会自动同步到其他手机；卸载小程序、清理微信存储或更换手机可能导致新数据丢失。可在“设置 → 账号安全 → 数据备份与恢复”生成加密文件，通过微信文件分享后另存到安全位置。恢复前可预览联系人和关系数量，恢复会完整覆盖当前账号的本机数据；请先备份当前手机。备份密码至少 10 位，不会上传服务器；忘记密码无法恢复。备份包含本机头像。退出登录只清除登录状态，不清除本机资料。导入码需要网络与后端；仅公开昵称及选定字段会发布，关闭昵称公开会撤销可导入资料。头像仍保存在本机，不通过导入码分享。微信登录、旧数据首次迁移和 DeepSeek AI 提取也需要网络与后端。

新增联系人页支持粘贴文字后预览 AI 提取结果、拍摄/选择名片图片后预览识别字段、保存时提醒可能重复的联系人，以及按“姓名 | 单位 | 职务 | 城市 | 电话”逐行批量录入。批量保存会先校验所有选中记录，再一次写入本机。名片图片识别需要单独配置支持图片输入的 OpenAI 兼容视觉模型；现有 DeepSeek 文本模型不支持该入口。图片只用于本次识别请求，不作为联系人附件存储。配置示例：

```powershell
$env:VISION_API_KEY = "视觉模型的密钥"
$env:VISION_BASE_URL = "https://视觉模型服务的兼容接口地址"
$env:VISION_MODEL = "支持图片输入的模型名称"
```

配置后重启 Java 后端；缺少配置时名片识别会明确提示不可用，其他功能不受影响。不要把密钥提交到 Git。上传图片限 JPG/PNG、3MB。真机验证步骤及尚未完成的验证见 [真机测试清单](docs/真机测试清单.md)。

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
2. 测试本地存储分支时，导入项目根目录 `C:\Users\l\Desktop\AI人脉地图-本地化`。根目录配置会自动将 `miniprogram` 识别为小程序源码目录。
3. 在开发者工具中勾选“不校验合法域名、web-view 域名、TLS 版本以及 HTTPS 证书”。
4. 确认后端已在本机 `8080` 端口运行，然后点击编译。

真机调试不能直接访问电脑上的 `127.0.0.1`。需要将 `miniprogram/utils/api.ts` 中的 `BASE_URL` 改为局域网可访问地址或已部署的 HTTPS 域名，并在微信公众平台配置请求合法域名。

## 主要接口

| 方法 | 地址 | 用途 |
| --- | --- | --- |
| POST | `/api/auth/wechat-login` | 微信登录 |
| GET | `/api/local-export` | 首次迁移时只读导出旧数据 |
| POST | `/api/ai/extract` | AI 联系人信息提取 |
| POST | `/api/ai/recognize-card` | 使用配置的视觉模型识别名片图片 |

联系人、关系、看板、地图、标签和图谱使用小程序本地数据层，不再向这些旧服务端接口写入。

## 测试

后端测试使用独立的内存 H2，不会读取或修改本机正式数据：

```powershell
Set-Location backend
.\mvnw.cmd test
```

测试完成后，覆盖率报告位于 `backend/target/site/jacoco/index.html`。

新增联系人页面的 AI 识别与保存流程可在项目根目录运行 `node --test tests/contact-form.test.js` 检查。
