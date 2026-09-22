# 新文件提交与本地同步规范

本文用于统一三人项目组在 GitHub 提交新文件、同步远程更新和处理本地改动时的操作。项目正式分支为 `main`，日常开发应在个人功能分支完成，并通过 Pull Request 合并。

## 一、基本原则

1. 开始开发前先同步远程 `main`，提交前再检查一次远程更新。
2. 不直接用另一份项目文件夹覆盖当前仓库，也不在仓库内放置完整项目副本。
3. 每次只暂存本次明确修改的文件，不使用 `git add .`。
4. 新增、修改或删除功能文件时，同一次提交必须更新 `CHANGELOG.md`。
5. AppSecret、Token 密钥、数据库密码、本机绝对路径和个人开发工具配置不得提交。
6. `miniprogram/project.config.json` 出现本地修改时默认不提交；个人设置优先写入已忽略的 `project.private.config.json`。

## 二、开始开发前同步 `main`

先进入项目目录：

```powershell
Set-Location "<项目目录>"
git status --short
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/main
```

`git status --short` 没有输出，并且当前位于 `main` 时，执行：

```powershell
git pull --ff-only origin main
```

`--ff-only` 会在本地历史与远程历史发生分叉时停止，避免自动生成难以检查的合并提交。

如果存在未提交的源码改动，先提交到当前个人分支，再同步远程。不要直接拉取，也不要用远程文件覆盖本地文件。

如果只有 `miniprogram/project.config.json` 的个人设置改动，可以保留未提交状态；当远程也修改了该文件时，应先停止同步并逐项比较配置。

## 三、新增文件的提交流程

新增文件后先确认 Git 能识别它：

```powershell
git status --short --untracked-files=all
```

检查以下事项：

- 文件位于正确目录，没有新增第二套 `miniprogram/` 或 `backend/`。
- 没有构建产物、日志、上传文件、压缩包或临时文件。
- 没有密钥、令牌、数据库密码和本机路径。
- 新增小程序页面时，已经在 `miniprogram/app.json` 注册。
- `CHANGELOG.md` 已记录时间、改动人、改动类型和具体内容。

只暂存本次文件，例如：

```powershell
git add -- "miniprogram/pages/example/index.js"
git add -- "miniprogram/pages/example/index.json"
git add -- "miniprogram/pages/example/index.ts"
git add -- "miniprogram/pages/example/index.wxml"
git add -- "miniprogram/pages/example/index.wxss"
git add -- "miniprogram/app.json"
git add -- "CHANGELOG.md"
```

提交前检查暂存内容：

```powershell
git diff --cached --check
git diff --cached --name-status
git diff --cached
```

确认无误后提交并推送个人分支：

```powershell
git commit -m "feat: add example page"
git push -u origin 当前分支名
```

在 GitHub 创建 Pull Request。涉及登录、鉴权、数据存储、项目入口、共享配置或依赖升级时，至少由另一位成员检查后再合并。

## 四、同步其他成员已经合并的更新

先确认当前工作已提交到个人分支，然后执行：

```powershell
git switch main
git status --short
git fetch origin --prune
git pull --ff-only origin main
git log -1 --oneline --decorate
```

同步完成后，确认本地和远程一致：

```powershell
git rev-list --left-right --count HEAD...origin/main
```

输出 `0 0` 表示本地 `main` 与 GitHub `main` 完全一致。

如果还要继续已有功能分支：

```powershell
git switch 当前分支名
git merge origin/main
```

合并后应重新编译小程序或运行后端测试，确认远程更新没有破坏当前功能。

## 五、出现冲突时的处理规则

1. 立即停止继续提交，先查看 `git status` 列出的冲突文件。
2. 逐个理解双方改动，保留当前需要的完整逻辑，不能整文件盲目选择一方。
3. 登录流程、接口地址、数据模型和 `app.json` 冲突必须进行人工复核。
4. 冲突解决后重新运行语法检查、编译或测试。
5. 更新 `CHANGELOG.md`，说明合并后实际保留的功能。
6. 无法判断时保留现场，由相关改动成员共同确认，不强行推送。

## 六、禁止操作

- 不在有未提交源码改动时直接执行拉取。
- 不使用 `git push --force` 覆盖 `main`。
- 不使用 `git add .` 或 `git add -A` 批量暂存未知文件。
- 不提交 `target/`、日志、上传头像、临时文件和本地数据库。
- 不提交小程序密钥、Token Secret 或任何真实用户数据。
- 不通过复制旧项目目录的方式“恢复”代码。

## 七、同步完成检查清单

- [ ] `git rev-list --left-right --count HEAD...origin/main` 在 `main` 上输出 `0 0`。
- [ ] `git status --short` 中没有意外的新增或修改文件。
- [ ] 本机配置没有进入暂存区。
- [ ] 新页面已经注册，新接口调用地址正确。
- [ ] 改动对应的编译、语法检查或后端测试通过。
- [ ] `CHANGELOG.md` 已随功能提交更新。
