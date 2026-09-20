# AI 人脉地图协作规范

## 正式项目结构

- 小程序源码只使用根目录的 `miniprogram/`。
- Java 后端源码只使用根目录的 `backend/`。
- 微信开发者工具从仓库根目录导入，根目录 `project.config.json` 中的 `miniprogramRoot` 必须为 `miniprogram/`。
- 不要把仓库副本、压缩包解压内容或其他完整项目目录提交到仓库。特别是不得新增第二套 `miniprogram/`、`backend/` 或修改入口指向它们。

## 本机配置

- 不提交 AppID、AppSecret、Token 密钥、数据库密码或本机路径。
- 微信开发者工具个人设置使用 `project.private.config.json` 或 `miniprogram/project.private.config.json`，这两个文件已被 Git 忽略。
- 修改共享 `project.config.json` 前，必须确认不会改变团队的小程序运行入口。

## 提交前检查

提交前依次确认：

1. 拉取远程 `main` 的最新内容。
2. 查看待提交文件列表，确认不存在意外的大目录、构建产物、上传文件或本机配置。
3. 检查 `project.config.json` 的 `miniprogramRoot` 仍是 `miniprogram/`。
4. 运行与改动相关的前端语法检查或后端测试。
5. 更新根目录 `CHANGELOG.md`，记录改动时间、改动人、改动类型、具体内容和提交编号；该文件必须与本次代码一同提交。
6. 说明功能变化、验证结果和可能影响的前后端接口。

## 合并要求

- 日常开发在个人分支完成，通过 Pull Request 合并到 `main`。
- 涉及项目入口、登录、鉴权、数据存储、配置或依赖升级的改动，至少由另一位成员检查后再合并。
- 发现提交中包含重复项目目录或错误运行入口时，暂停合并，先恢复正确目录结构。
