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
- AI 信息预填：本地演示解析器，生产环境可替换为 OCR 和大模型供应商。

## 启动后端

在 `backend` 目录运行：

```powershell
.\mvnw.cmd spring-boot:run
```

服务启动后访问地址为 `http://127.0.0.1:8080`。初版使用内存数据，重启服务会恢复 4 条演示联系人。

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
| GET、PATCH、DELETE | `/api/contacts/{id}` | 联系人详情、修改、删除 |
| GET | `/api/maps/cities` | 城市分布 |
| GET | `/api/graphs/contacts/{id}` | 一层关系图谱 |
| POST | `/api/relationships` | 新增关系 |
| POST | `/api/ai/extract` | 演示版文本提取 |

## 下一步

将 `ContactStore` 替换为 MySQL 持久化实体和 Repository；接入微信登录、对象存储、名片 OCR 及大模型；再根据团队使用需求增加角色权限与审计。
