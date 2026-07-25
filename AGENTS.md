# Git 规则
- 提交必须保持单一意图，不混入无关改动；跨主题改动应拆分提交。
- 提交前确认改动范围、提交主题、入口文档或规则文件同步情况。
- 提交前完成最小必要验证；无法验证时说明原因和剩余风险。
- 提交信息默认使用中文；无仓库规范时优先使用 Conventional Commits，例如 `docs:`、`feat:`、`fix:`、`refactor:`、`chore:`。
- 提交信息优先写“改了什么”和对象，不写空泛标题。
- 只在用户明确要求时提交；非明确要求下不做 `amend`，不改写历史。

# 本地服务启停规则
- `scripts/dev.sh` 只管理宿主机本地 FastAPI API 进程。
  - 启动 API：`./scripts/dev.sh start api`
  - 停止 API：`./scripts/dev.sh stop api`
  - 重启 API：`./scripts/dev.sh restart api`
  - 查看 API：`./scripts/dev.sh status`
- `scripts/deploy.sh` 只管理 Docker/Compose 服务。
  - 仅 Docker 依赖：`./scripts/deploy.sh up|status|down compose-deps`
  - 全 Docker API / 依赖：`./scripts/deploy.sh up|status|down compose-full`
- `scripts/run.sh` 只管理日常快捷 recipe，不直接实现进程或 Compose 细节。
  - 常用本地开发环境：`./scripts/run.sh up dev`
  - 查看常用本地开发环境：`./scripts/run.sh status dev`
  - 停止常用本地开发环境：`./scripts/run.sh down dev`
- 不要使用裸 `./scripts/deploy.sh down`；该命令应报错，避免误停服务。
- 不要使用 `./scripts/deploy.sh up|status|down dev`、`local` 或 `down all`；这些不是当前脚本合同。
- 排查状态优先使用 `status`，不要直接用 `docker stop`、`kill` 或手工清理 PID，除非用户明确要求。
- 验证文档或脚本帮助时，不要执行会改变服务状态的 `up` / `down`，除非任务目标就是验证启停行为。

# 浏览器截图验证规则
- 需要验证静态 HTML、POC 页面或前端原型截图时，优先使用 Python 版 Playwright。
- 不要直接调用系统 Google Chrome headless；当前本机环境曾出现 Chrome 进程崩溃和 macOS “Google Chrome 意外退出”弹窗。
- 不要把 `qlmanage` 缩略图当作真实页面验证；它可能不完整执行 JavaScript，只能作为粗略静态预览。
- Playwright 已作为 dev 依赖安装，常用命令：
  - 查看版本：`uv run playwright --version`
  - 安装 Chromium：`uv run playwright install chromium`
  - 运行截图脚本：`uv run python <临时截图脚本>`
- 临时截图脚本和输出建议放在 `/private/tmp`，不要为了临时验证污染仓库。
- 截图验证应至少确认页面 `title`、当前 active scene、是否存在 `pageerror`、截图输出路径；如涉及 canvas/图片，应实际查看截图。
