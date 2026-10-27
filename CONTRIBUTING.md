# AI 人脉地图协作规范

## 正式项目结构

- 小程序源码只使用根目录的 `miniprogram/`。
- Java 后端源码只使用根目录的 `backend/`。
- 有 `.ts` 的模块以 TypeScript 为源，构建生成同名 `.js`；只有 `.js` 的模块（包括图谱页面、绘图和分类工具）直接维护 JavaScript。不要根据旧压缩包说明删除 TypeScript 或手工覆盖生成文件。
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
   小程序修改 TypeScript 后运行 `npm run build` 生成 JavaScript，再执行 `npm run check`；不要手工维护两份逻辑。后端运行 `backend/mvnw.cmd -f backend/pom.xml verify`，发布前运行 `python scripts/verify-backend-artifact.py`。
5. 更新 CHANGELOG 时遍历全部历史条目，核对真实提交哈希、作者与遗漏记录；不再使用未解析的提交占位。新版本先用唯一版本标签标识，代码提交完成后用独立文档提交回填真实短哈希，版本标签指向最终提交；文档回填不为自身递归增加记录。推送前保证日志已回填且无占位，不修改或重写既有提交编号。
6. 说明功能变化、验证结果和可能影响的前后端接口。

提交前检查 `CHANGELOG.md` 的表格行没有缺列，并搜索“待提交”“姓名”等占位内容。示例只放在代码块中，不能放进“最近改动”表。已下线功能的旧记录仍保留，通过新记录说明下线，不改写历史。

## 接入图谱测试和说明

- 图谱测试入口见 README 的“测试”，分类场景统一维护在 `tests/graph-categories.test.js`，用内存存储及 `local.migrate()` 准备虚构数据，不依赖演示或清空模块。
- 旧版本中已存在的算法与布局测试无须重复复制。新增场景按当前接口和数据格式适配；保留公开资料同步、并发写入、原子分片、备份等已有回归测试。
- README 的图谱操作说明与 `docs/真机测试清单.md` 随行为同步更新。真机步骤未执行时继续标记“待真机测试”，不能用单元测试结果替代。
- 当前 API 地址配置在未提交的 `miniprogram/utils/api-config.local.js`，存储使用原子分片，生产结构由 Flyway 管理。外部文档提到其他配置入口、旧分片方式、手动建表或不存在的演示入口时，先核对代码后改写，不整份覆盖。

## 合并要求

- 日常开发在个人分支完成，通过 Pull Request 合并到 `main`。
- 涉及项目入口、登录、鉴权、数据存储、配置或依赖升级的改动，至少由另一位成员检查后再合并。
- 发现提交中包含重复项目目录或错误运行入口时，暂停合并，先恢复正确目录结构。
