# dsh-auto-continue

[English](README.md)

**DSH Web UI 插件** —— 当 webui 里的请求因为**非人为因素**(网络故障、模型/供应商报错、宿主崩溃、token 上限)中断时, 插件自动模拟用户输入 **「继续」** 并发送, 让 Agent 自动续跑, 无需手动干预。

适用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh web`)。

## 工作原理

插件在浏览器里额外打开两条实时事件流(宿主支持多消费者, 与内置运行时互不干扰):

- `events.mux` — 会话事件流, 监听 `turn/end`
- `events.host` — 宿主事件流, 监听 `host/session-status`、`host/agent-error`

检测到以下**非人为中断**后, 等待一个宽限期(默认 3 秒), 然后以 `queue` 模式调用宿主的 `sessions.prompt` 发送「继续」——与用户手动输入完全等价(消息会进入会话日志, 模型可见):

| 事件 | 含义 |
|---|---|
| `turn/end` reason = `error` | 回合失败(模型 / 网络 / 超时等) |
| `turn/end` reason = `interrupted` | 宿主崩溃重启后遗留的中断回合 |
| `turn/end` reason = `max-tokens` | 达到输出 token 上限 |
| `host/agent-error` | 无回合位置的 Agent 失败 |

**绝不自动继续的情况:**

- `turn/end` reason = `aborted`(用户点了停止)或 `blocked`(策略拒绝)
- 宽限期内宿主自行开启了新回合(`turn/start`)
- 会话正在运行, 或已有排队消息(宿主会自行唤醒)
- 子代理会话(由父代理处理)
- 超过连续次数上限 / 处于冷却期(见下)

## 安全护栏(默认值)

| 参数 | 默认 | 说明 |
|---|---|---|
| `continueText` | `"继续"` | 自动发送的文本 |
| `graceMs` | `3000` | 中断后等待的宽限期; 期间宿主自行恢复则取消 |
| `cooldownMs` | `20000` | 同一会话两次自动「继续」的最小间隔(成功与失败尝试都计入) |
| `maxConsecutive` | `3` | 同一会话连续自动「继续」上限; 之后停止, 直到用户手动介入或出现成功回合 |
| `scanOnBoot` | `true` | 页面启动/重连时扫描最近中断的会话(如浏览器关闭期间宿主崩溃) |
| `scanLimit` | `8` | 扫描最多检查的会话数(按最近更新, 不含运行中/子代理会话) |
| `freshMs` | `900000`(15 分钟) | 扫描只处理该时间窗内的中断 |
| `reconnectScanDelayMs` | `5000` | 重连后等待宿主恢复再扫描 |
| `reconnectBackoffMs` | `3000` | SSE 流断开后的重连退避 |
| `verbose` | `true` | 控制台输出 `[auto-continue]` 日志 |

### 调整配置

通过 `localStorage` 覆盖任意字段(刷新页面生效):

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

## 安装

DSH 插件通过 `dsh plugin` 命令安装进 **profile**(`dsh web` 对应 `web` profile)。安装后需重启 `dsh web`。

### 方式一: 从 npm 安装(发布后)

```sh
dsh plugin --profile web add dsh-client-auto-continue
dsh web
```

### 方式二: 从本仓库安装

需要 Node.js >= 18。

```sh
# 1. 克隆仓库
git clone https://github.com/HsiangNianian/dsh-auto-continue.git
cd dsh-auto-continue

# 2. 安装依赖并构建
npm install
npm run build

# 3. 链接进 web profile(包自带 cordis.patch.yml, 通过 dsh.bundle.patch 声明,
#    插件行会自动注册)
dsh plugin --profile web add link:$(pwd)

# 4. 重启 dsh web
dsh web
```

### 方式三: 手动安装(无需 pnpm / dsh plugin)

```sh
# 1. 把包软链进 profile 的 node_modules
ln -sfn "$(pwd)" ~/.dsh/profiles/node_modules/dsh-client-auto-continue

# 2. 在 ~/.dsh/profiles/web/cordis.patch.yml 追加:
#    - insert:
#        - id: auto-continue
#          name: 'dsh-client-auto-continue'

# 3. 重启 dsh web
dsh web
```

> 如果之前手动安装过、之后改用 `dsh plugin add`, 请先删掉手动加的 `insert` 条目——
> 包自带的 bundle patch 会注册插件行, 重复注册会冲突。

### 验证与卸载

重启后插件即生效, 可用以下方式确认:

```sh
dsh --profile web --dump-config | grep auto-continue
```

浏览器中: 打开 GUI 后按 Ctrl/Cmd+Shift+I 查看控制台, 应看到
`[auto-continue] 已启动(文本="继续", …)`; 每次检测到中断和自动发送都会打日志。

卸载:

```sh
dsh plugin --profile web remove dsh-client-auto-continue   # 方式一/二
# 或删除软链 + insert 条目                                    # 方式三
dsh web
```

## 目录结构

```
dsh-auto-continue/
├── package.json            # 插件清单(dsh.client / dsh.bundle)
├── cordis.patch.yml        # profile 补丁层: 注册插件行
├── build.mjs               # esbuild 构建(浏览器包 + 宿主半区)
├── tsconfig.json           # 类型检查配置
├── tsconfig.build.json     # 声明文件生成 → lib/types
├── src/
│   ├── index.ts            # host 半区入口(无宿主侧行为)
│   └── client/
│       └── index.ts        # browser 半区: 自动续跑引擎
├── tests/
│   └── simulate.mjs        # 无头行为测试(模拟 API)
├── lib/                    # 构建产物(已提交, 可直接链接)
│   ├── index.js
│   ├── client.js
│   └── types/
├── README.md               # English
├── README.zh.md            # 本文件
└── LICENSE                 # MIT
```

## 开发

```sh
npm run typecheck   # tsc --noEmit
npm run build       # lib/client.js + lib/index.js + lib/types
npm run watch       # 监听变更自动重建; 宿主 HMR 免刷新热重载
npm run test        # node tests/simulate.mjs — 7 个行为场景
```

说明:

- 浏览器包用 esbuild 构建, 并包裹为 dsh 客户端模块系统要求的
  `window.__ModuleLoader__.load({ id, factory })` 外壳; 所有 `@deepseek-ai/*`
  导入均为纯类型导入, 构建时被擦除, 产物**零运行时依赖**。
- 类型依赖解析自 `node_modules/@deepseek-ai`(软链到 DSH 安装包以获得完全同版本);
  如果你有 DSH checkout 或 npm 安装的包, 把软链指过去即可。
- `npm run watch` 运行时, profile 的 client-hmr 行每 500ms 轮询
  `lib/client.js` 并在浏览器中热重载插件——改代码无需重启服务。

## License

[MIT](LICENSE)
