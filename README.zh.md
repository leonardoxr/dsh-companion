# dsh-companion

[English](README.md) | 简体中文

[![CI](https://github.com/leonardoxr/dsh-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/leonardoxr/dsh-companion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

一个小型 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，为原生客户端提供 DSH 工作区和实时会话的只读 JSON 视图、可配置的通知事件流以及 Web 设置卡片。

它专为 [dsh-native](https://github.com/leonardoxr/dsh-native) 之类的客户端外壳而设计，使其无需加载或抓取 Harness Web UI 即可获取项目和会话元数据。

> [!IMPORTANT]
> 此项目**不是** npm 上无作用域的 `dsh-companion` 包。该名称属于一个无关项目。请从此仓库或其 GitHub Release 归档之一安装此插件。

## 提供的功能

- 三个用于工作区和实时会话的小型、无缓存 JSON 端点。
- 当页面在 DSH Native 中运行时，在 Harness 左侧边栏提供统一的工作区浏览器；它会合并本地与已保存服务器的工作区，同时不会替换外壳、新建会话控件或设置页脚。
- 一个可重新连接的服务器发送事件流，用于原生的完成、失败、提问和审批提醒。
- 一张 **Settings → Plugins → DSH Companion notifications** 卡片，可从源头筛选提醒种类和子代理事件。
- 用于 [dsh-better-sidebar](https://github.com/leonardoxr/DSH-better-sidebar) 工作台的可选 **Images** 标签页：以可点击图库的形式展示对话中的每张图片——附件、助手图片以及模型读取的图片。
- 显式字段投影：绝不会整体序列化 Harness 内部对象。
- 对每个请求执行 DSH 可信主机和同源检查。
- 一个可安装的 DSH bundle，包含已编译的 JavaScript 和一个小型设置 schema 依赖项。
- 干净卸载：所有已注册路由都会随插件一起移除。

## 安装

### 从 GitHub Release 安装（推荐）

从[最新 release](https://github.com/leonardoxr/dsh-companion/releases/latest) 下载 `dsh-companion-<version>.tgz`，然后将其添加到 Web profile：

```sh
dsh plugin --profile web add ./dsh-companion-<version>.tgz
dsh web
```

每个 release 还包含 `SHA256SUMS.txt`，以便在安装前验证归档。

### 直接从 GitHub 安装

若要使用 `main` 上的最新修订：

```sh
dsh plugin --profile web add github:leonardoxr/dsh-companion
dsh web
```

开发时可以就地链接本地 checkout：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-companion
dsh web
```

DSH 启动后验证插件：

```sh
curl http://127.0.0.1:3080/api/companion/workspaces
```

## DSH Native 工作区侧边栏

DSH Native 向其托管的本地 DSH 页面和已保存的 DSH 服务器公开一个只读且经过来源校验的工作区桥接。当该桥接存在时，Companion 仅使用 Native 工作区主页所采用的同一跨服务器工作区模型来覆盖核心 `sidebar.workspaces` 区域。普通浏览器中的 Harness 工作区浏览器保持不变；Companion 卸载后，它也会自动恢复。

工作区行会显示所属服务器和会话数量。当前服务器的会话行可直接打开；选择属于另一台已保存服务器的工作区或会话时，DSH Native 会切换到该服务器。页面脚本不会获得主机管理、文件系统、凭据或任意 IPC 能力。

## API

| 路由 | 响应 |
|---|---|
| `GET /api/companion/workspaces` | `{ workspaces: [...] }` — 持久工作区及其成员会话 ID |
| `GET /api/companion/sessions` | `{ sessions: [...] }` — 实时会话及其最新折叠标题 |
| `GET /api/companion/session/<id>` | 一个实时会话摘要，或 JSON `404` |
| `GET /api/companion/notifications` | 已配置原生提醒的 `text/event-stream` 事件流 |

会话列表响应示例：

```json
{
  "sessions": [
    {
      "id": "session-1",
      "title": "Implement native navigation",
      "cwd": "/work/dsh-native",
      "createdAt": 1787356800000
    }
  ]
}
```

JSON 响应使用 `Content-Type: application/json`，所有路由均使用 `Cache-Control: no-store`。通知路由使用 SSE，每 15 秒发出一次心跳，接受 `Last-Event-ID` 或 `?since=` 中的先前游标，并保留一个有界的内存重放窗口。新连接从实时流末尾开始，但会收到仍在等待提问回答或审批的交互。非 `GET` 请求返回 `405`。

## 通知设置

在 Harness Web UI 中打开 **Settings → Plugins → DSH Companion notifications** 进行配置：

| 设置 | 默认值 | 提醒 |
|---|---:|---|
| `completed` | 开启 | 成功的 `turn/end` 事件 |
| `blocked` | 开启 | 被阻塞的轮次 |
| `errors` | 开启 | 失败的轮次和实时代理错误 |
| `maxTokens` | 开启 | 达到输出 token 限制的轮次 |
| `aborted` | 关闭 | 已取消或中止的轮次 |
| `questions` | 开启 | 待处理的 `ask_user_question` 交互 |
| `approvals` | 开启 | 待处理的工具审批 |
| `subagents` | 关闭 | 包含来自标记为子代理的会话的事件 |

更改通过 Harness 设置服务持久化，并立即应用于后续事件，无需重启 companion 事件流。**Reset defaults** 会清除用户覆盖并恢复上述值。

每个通知 payload 均带有版本，并且只包含稳定键、种类、会话 ID/标题、短正文和时间戳。原始消息、工具参数、命令、图标和点击跳转 URL 绝不会被转发。

## Images 标签页（可选）

安装 [dsh-better-sidebar](https://github.com/leonardoxr/DSH-better-sidebar) 后，客户端插件会在其 `+` 菜单中注册一个 **Images** 标签页。它会扫描当前会话的折叠时间线，查找持久图片引用——用户附件、助手图片块以及工具结果中的图片块（例如 `read_image` 工具输出）——通过 Harness 会话附件路由解析它们，并将其呈现为带全尺寸灯箱的缩略图图库。

此集成为软依赖：

- 没有 better-sidebar 时，不会发生任何变化——没有标签页、样式或主机路由。
- 客户端从不导入 better-sidebar 代码；它在本地重述小型注册契约，因此任一插件都可以独立加载、卸载或热重载。
- 图片在标签页可见时延迟获取，并在视图的生命周期内缓存为对象 URL。

## 安全模型

这些端点会公开工作区路径、会话 ID、标题、时间戳、会话谱系，以及在启用时的简短提问、审批和错误文本。它们执行 Harness Web runtime 的 `trustedHosts` 策略并拒绝跨站浏览器请求，但**这是网络信任边界，而不是用户身份验证**。

不要将 DSH 服务器暴露给不应读取这些元数据的客户端所在网络。有关私下报告漏洞的信息，请参阅 [SECURITY.md](SECURITY.md)。

## 工作原理

该包是一个 Cordis 主机模块，导出 `name`、`Config`、`inject` 和 `apply`，并包含一个小型 Web 客户端插件。主机将 `webServer`、`webRuntime`、`apiProxy`、`settings`、`sessions`、`sessionTitle` 和 `workspaceRegistry` 声明为必需服务，注册持久通知设置 namespace，然后在 bundle 加载时使用现有事件流。

主机入口点输出到 `dist/index.js`；设置卡片被 bundle 到 `client/client.js` 并注入标准插件设置 slot。卸载或重新配置主机插件会中止事件订阅、关闭 SSE 客户端并移除每条路由。

## 兼容性

DeepSeek Harness 目前处于开发者预览阶段，因此其插件服务契约可能会发生变化。此版本面向 DSH `0.1.1` release-candidate 系列中的服务契约，并要求 Node.js 22 或更高版本。CI 覆盖 Node.js 22 和 24。

## 开发

```sh
npm ci
npm test
npm pack --dry-run
```

`npm test` 会在针对已编译入口点运行测试之前重新构建 `dist/`。有意提交 `dist/` 目录：GitHub 依赖项安装在 `node_modules` 下，而 Node 在 runtime 不会剥离 TypeScript 语法。

如果源代码更改会改变生成的输出，请在同一个 pull request 中包含更新后的 `dist/` 文件。

## 贡献与 release

欢迎贡献。请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解本地工作流和 pull-request 预期，并遵循[行为准则](CODE_OF_CONDUCT.md)。

成功的 CI 运行会发布一个短期有效、可安装的包 artifact。诸如 `v0.1.1` 的版本标签会将相同的已编译 `.tgz` 及其 checksum 发布为永久 GitHub Release。维护者可以遵循 [docs/RELEASING.md](docs/RELEASING.md)。

## 许可证

[MIT](LICENSE)
