<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/banner-dark.svg">
    <img src="docs/banner.svg" alt="dsh-auto-continue" width="720">
  </picture>
</p>

<h1 align="center">dsh-auto-continue</h1>

<p align="center">
  <em>DSH Web UI 插件 —— 当请求因为网络错误等非人为因素中断时, 自动替你输入「继续」并发送。</em>
</p>

<p align="center">
  <a href="https://github.com/HsiangNianian/dsh-auto-continue/stargazers"><img src="https://img.shields.io/github/stars/HsiangNianian/dsh-auto-continue?logo=github&label=Stars" alt="GitHub stars"></a>
  <a href="https://github.com/HsiangNianian/dsh-auto-continue/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-65a30d?style=flat" alt="MIT license"></a>
  <a href="https://github.com/HsiangNianian/dsh-auto-continue"><img src="https://img.shields.io/badge/install-dsh__plugin__add-0a0a0a?style=flat" alt="Install with dsh plugin add"></a>
  <br>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=fff" alt="TypeScript">
  <img src="https://img.shields.io/badge/esbuild-FFCF00?style=flat&logo=esbuild&logoColor=000" alt="esbuild">
  <img src="https://img.shields.io/badge/zero__runtime__deps-16a34a?style=flat" alt="零运行时依赖">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>中文</b>
</p>

---

## 它做什么

适用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh web`): 当 webui 里的请求因为**非人为因素**中断时, 插件模拟用户输入 **「继续」** 并自动发送, 让 Agent 继续干活, 无需手动干预。消息与手动输入完全等价——进入会话日志、对模型可见, 中断的任务随即恢复。

插件监听实时事件流, 对以下情况作出反应:

| 事件 | 含义 |
| --- | --- |
| `turn/end` → `error` | 回合失败(模型 / 网络 / 超时等) |
| `turn/end` → `interrupted` | 宿主崩溃重启后遗留的中断回合 |
| `turn/end` → `max-tokens` | 达到输出 token 上限 |
| `host/agent-error` | 无回合位置的 Agent 失败 |

**绝不自动继续:** 用户主动停止(`aborted`)或策略拒绝(`blocked`); 宿主已自行恢复的会话; 正在运行或已有排队消息的会话; 子代理会话; 处于冷却期 / 连续次数上限内的会话(见下)。

---

## 工作原理

插件在浏览器里额外打开两条 SSE 流——`events.mux`(会话事件)与 `events.host`(宿主事件)。宿主支持多消费者, 与内置运行时互不干扰。检测到中断后先等待一个**宽限期**(默认 3 秒)——若宿主自行开启了新回合(`turn/start`), 自动继续即取消——然后以 `queue` 模式调用 `sessions.prompt` 发送「继续」。

页面启动 / 重连时, 插件还会扫描最近更新的会话: 若某个会话的最后一个回合在**最近 15 分钟内**以非人为原因结束, 且之后没有新的 `turn/start` 或用户消息, 也会被自动续跑(例如浏览器关闭期间宿主崩溃的情况)。

**安全护栏(默认值):**

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `continueText` | `"继续"` | 自动发送的文本 |
| `graceMs` | `3000` | 中断后等待的宽限期; 期间宿主自行恢复则取消 |
| `cooldownMs` | `20000` | 同一会话两次自动「继续」的最小间隔(失败尝试也计入) |
| `maxConsecutive` | `3` | 同一会话连续自动「继续」上限; 之后停止, 直到用户手动介入或出现成功回合 |
| `scanOnBoot` | `true` | 页面启动 / 重连时扫描最近中断的会话 |
| `scanLimit` | `8` | 扫描最多检查的会话数(不含运行中 / 子代理会话) |
| `freshMs` | `900000`(15 分钟) | 扫描只处理该时间窗内的中断 |
| `reconnectScanDelayMs` | `5000` | 重连后等待宿主恢复再扫描 |
| `reconnectBackoffMs` | `3000` | SSE 流断开后的重连退避 |
| `verbose` | `true` | 控制台输出 `[auto-continue]` 日志 |

---

## 快速开始

DSH 插件安装进 **profile**(`dsh web` 对应 `web` profile)。安装后重启 `dsh web` 即可。

### 从 npm 安装(发布后)

```bash
dsh plugin --profile web add dsh-client-auto-continue
dsh web
```

### 从本仓库安装

需要 Node.js ≥ 18。

```bash
git clone https://github.com/HsiangNianian/dsh-auto-continue.git
cd dsh-auto-continue
npm install
npm run build

# 包自带 cordis.patch.yml(通过 dsh.bundle.patch 声明),
# 插件行会自动注册
dsh plugin --profile web add link:$(pwd)

dsh web
```

### 手动安装(无需 pnpm / dsh plugin)

```bash
ln -sfn "$(pwd)" ~/.dsh/profiles/node_modules/dsh-client-auto-continue
# 然后在 ~/.dsh/profiles/web/cordis.patch.yml 追加:
#   - insert:
#       - id: auto-continue
#         name: 'dsh-client-auto-continue'
dsh web
```

> 从手动安装切换到 `dsh plugin add` 时, 请先删掉手动加的 `insert` 条目——包自带的 bundle patch 会注册插件行, 重复注册会冲突。

### 验证与卸载

```bash
dsh --profile web --dump-config | grep auto-continue   # 确认配置层已挂载
```

浏览器控制台(Ctrl/Cmd+Shift+I)中应看到 `[auto-continue] 已启动(文本="继续", …)`; 每次检测到中断和自动发送都会打日志。

```bash
dsh plugin --profile web remove dsh-client-auto-continue   # npm / 仓库安装
# 或删除软链 + insert 条目                                  # 手动安装
dsh web
```

---

## 配置

通过 `localStorage` 覆盖任意设置(刷新页面生效):

```js
localStorage["dsh-auto-continue.config"] = JSON.stringify({
  continueText: "请继续",
  graceMs: 5000,
  cooldownMs: 30000,
  maxConsecutive: 5,
  verbose: true
});
```

删除该键即恢复默认:

```js
localStorage.removeItem("dsh-auto-continue.config");
```

---

## 技术栈与结构

| 分层 | 选型 |
| --- | --- |
| 平台 | DSH Web GUI 客户端插件(浏览器半区 + 空宿主半区) |
| 语言 | TypeScript |
| 构建 | esbuild(浏览器包 + 宿主半区)+ tsc 声明文件 |
| 运行时依赖 | **零**——所有 `@deepseek-ai/*` 导入均为纯类型导入, 构建时被擦除 |

```
dsh-auto-continue/
├── package.json            # 插件清单(dsh.client / dsh.bundle)
├── cordis.patch.yml        # profile 补丁层: 注册插件行
├── build.mjs               # esbuild 构建(浏览器包 + 宿主半区)
├── tsconfig.json / tsconfig.build.json
├── src/
│   ├── index.ts            # host 半区入口(无宿主侧行为)
│   └── client/index.ts     # browser 半区: 自动续跑引擎
├── tests/simulate.mjs      # 无头行为测试(模拟 API)
├── lib/                    # 构建产物(已提交, 可直接链接)
├── docs/                   # banner 图
└── README.md / README.zh.md / LICENSE
```

---

## 开发

```bash
npm run typecheck   # tsc --noEmit
npm run build       # lib/client.js + lib/index.js + lib/types
npm run watch       # 监听变更自动重建; 宿主 HMR 免刷新热重载
npm run test        # node tests/simulate.mjs — 7 个行为场景
```

`npm run watch` 运行时, profile 的 client-hmr 行每 500ms 轮询 `lib/client.js` 并在浏览器中热重载插件——改代码无需重启服务。

---

## 链接

- **仓库**: [github.com/HsiangNianian/dsh-auto-continue](https://github.com/HsiangNianian/dsh-auto-continue)
- **DeepSeek Harness**: [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

---

## License

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT © Hsiang Nianian
