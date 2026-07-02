# Personal OS 本地 daemon

`personal-os` 是唯一常驻中枢。日常不需要启动 `ai-os`、`energy-os` 或 OfferFlow，它们默认只是被动文件写入目标。

## 手动启动

```powershell
pnpm os:watch
```

或：

```powershell
pnpm daemon:start
```

## 执行一次

```powershell
pnpm os:run
```

这会扫描未消费事件、`inbox/diary/raw/` 和 `inbox/job-screenshots/pending/`，执行一次后退出。

## 开机自动启动

```powershell
pnpm daemon:install
```

安装后会创建 Windows 任务计划程序任务：

- 任务名：`PersonalOSDaemon`
- 触发器：当前用户登录时
- 动作：运行 `scripts/start-personal-os-daemon.ps1`

## 停止与卸载

手动启动的 daemon 可以在终端中按 `Ctrl+C` 停止。

卸载开机任务：

```powershell
pnpm daemon:uninstall
```

如果需要临时关闭开机 daemon，先卸载任务，再结束已运行的 `tsx` / `node` daemon 进程。

## 日志

日志位置：

```txt
logs/daemon.log
```

重复启动排查：

- daemon 使用 `state/daemon/lock.json` 记录当前进程。
- 如果 lock 中的进程仍然存活，新 daemon 不会重复启动。
- 如果 lock 陈旧，daemon 会清理后启动。

## 文件入口

- 命令日记：`pnpm add:diary "..."`
- 文本日记：把 `.txt` 或 `.md` 放入 `inbox/diary/raw/`
- JD 导入：把 Boss JD 截图或 `.txt` 放入 `inbox/job-screenshots/pending/`

JD 图片没有 OCR 能力时，会读取同名 `.txt` sidecar 作为 fallback。所有导入只生成 draft，不会自动投递，不会联系 HR。
