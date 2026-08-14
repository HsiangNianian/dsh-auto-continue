<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/banner-zh-dark.svg">
    <img src="docs/banner-zh.svg" alt="dsh-auto-continue" width="720">
  </picture>
</p>

<h1 align="center">dsh-auto-continue</h1>

<p align="center">
  <em>DSH Web UI 插件 —— 当请求因为网络错误等非人为因素中断时, 自动替你输入「继续」并发送。</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-client-auto-continue"><img src="https://img.shields.io/npm/v/dsh-client-auto-continue?logo=npm&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/dsh-client-auto-continue"><img src="https://img.shields.io/npm/dm/dsh-client-auto-continue?label=downloads" alt="npm downloads"></a>
  <a href="https://github.com/HsiangNianian/dsh-auto-continue/stargazers"><img src="https://img.shields.io/github/stars/HsiangNianian/dsh-auto-continue?logo=github&label=Stars" alt="GitHub stars"></a>
  <a href="https://github.com/HsiangNianian/dsh-auto-continue/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-65a30d?style=flat" alt="MIT license"></a>
  <a href="https://awesome-dsh-plugin.com"><img src="https://awesome-dsh-plugin.com/badge.svg" alt="awesome · DSH plugin"></a>
  <br>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=fff" alt="TypeScript">
  <img src="https://img.shields.io/badge/esbuild-FFCF00?style=flat&logo=esbuild&logoColor=000" alt="esbuild">
  <img src="https://img.shields.io/badge/zero__runtime__deps-16a34a?style=flat" alt="GUI 可配置">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>中文</b>
</p>

---

## 它做什么

适用于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh web`): 当 webui 里的请求因为**非人为因素**中断时, 插件模拟用户输入 **「继续」** 并自动发送, 让 Agent 继续干活, 无需手动干预。消息与手动输入完全等价——进入会话日志、对模型可见, 中断的任务随即恢复。

![demo](docs/demo-zh.svg)

**智能恢复**(全部可配置):

- **错误分类** — 临时性错误(网络 / 超时 / 5xx / 429 等)自动续跑; 永久性错误跳过并通知, 因为重试也没用。判定为永久性的条件: HTTP 状态码 401/403, 或 code/message 命中认证、凭据/API Key、余额/配额、模型不存在、上下文长度/超限等关键词。关闭分类后则全部自动继续
- **自适应退避** — 连续失败时等待时间递增(冷却 × 系数: 20s → 40s → 80s…), 有上限, 不再对故障上游狂轰滥炸
- **模板化继续文本** — `continueText` 支持 `{code}` `{message}` `{status}` `{tool}` `{turn}` 占位符, 续跑消息可携带失败上下文(如「继续 (git push 失败: UPSTREAM)」)
- **浏览器通知** — 可选: 自动继续成功 / 放弃 / 遇到永久性错误时弹出提醒; 首次使用时请求权限, 被拒绝后不再打扰

插件监听实时事件流, 对以下情况作出反应:

| 事件 | 含义 |
| --- | --- |
| `turn/end` → `error` | 回合失败(模型 / 网络 / 超时等) |
| `turn/end` → `interrupted` | 宿主崩溃重启后遗留的中断回合 |
| `turn/end` → `max-tokens` | 达到输出 token 上限 |
| `host/agent-error` | 无回合位置的 Agent 失败 |

**绝不自动继续:** 用户主动停止(`aborted`)或策略拒绝(`blocked`); 宿主已自行恢复的会话; 正在运行或已有排队消息的会话; 子代理会话; 处于冷却期 / 连续次数上限内的会话(可在设置卡片中调整, 见下)。

---

## 工作原理

插件在浏览器里额外打开两条 SSE 流——`events.mux`(会话事件)与 `events.host`(宿主事件)。宿主支持多消费者, 与内置运行时互不干扰。检测到中断后先等待一个**宽限期**(默认 3 秒)——若宿主自行开启了新回合(`turn/start`), 自动继续即取消——然后以 `queue` 模式调用 `sessions.prompt` 发送配置的文本。

页面启动 / 重连时, 插件还会扫描最近更新的会话: 若某个会话的最后一个回合在**扫描时间窗**(默认 15 分钟)内以非人为原因结束, 且之后没有新的 `turn/start` 或用户消息, 也会被自动续跑(例如浏览器关闭期间宿主崩溃的情况)。

多个标签页同时打开时, 通过 localStorage 互斥锁 + 共享的每会话冷却记录保证**只有一个标签页发送**——不会重复出现两条「继续」。

所有参数都在插件的设置卡片中调整——见 [配置](#配置)。

---

## 快速开始

DSH 插件安装进 **profile**(`dsh web` 对应 `web` profile)。安装后重启 `dsh web` 即可。

### 从 npm 安装(推荐)

已发布为 [`dsh-client-auto-continue`](https://www.npmjs.com/package/dsh-client-auto-continue):

```bash
dsh plugin --profile web add dsh-client-auto-continue
dsh web
```

### 直接从 GitHub 安装(无需克隆)

直接从仓库默认分支安装——构建产物已提交入库, 无需本地克隆或构建:

```bash
dsh plugin --profile web add github:HsiangNianian/dsh-auto-continue
dsh web
```

> 该方式跟踪 `main` 分支而不是发布 tag——适合尝鲜最新改动, 稳定性首选上面的 npm 方式。切换安装来源只需重新执行 `dsh plugin --profile web add <其他来源>`, profile 依赖会被就地替换。

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

> **已知 DSH 限制(0.1.0-rc.6):** webui 的插件配置区只暴露已安装
> `@deepseek-ai/dsh-host-apiproxy` 包中硬编码白名单里的设置命名空间。在官方把暴露
> 逻辑移入 `settings.register()` 之前, 要让设置卡片显示出来, 需要执行一次幂等的
> 供应商补丁(重新安装 dsh 后重跑一次即可):
>
> ```sh
> node node_modules/dsh-client-auto-continue/scripts/patch-expose.mjs
> dsh web
> ```
>
> 补丁脚本随 npm 包一起发布(无需克隆仓库), 并覆盖所有可达的 dsh 安装: profile
> 链接副本、全局 `npm i -g @deepseek-ai/dsh` 安装、以及当前目录的安装。自动续跑
> 引擎本身不依赖这个补丁——它只影响 GUI 设置卡片是否可见。

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

所有参数都可以在 GUI 里配置——无需改文件或控制台。打开 **设置 → 插件配置**, 找到 **自动继续** 卡片。

**卡片操作说明:**

- 修改是**暂存式**的——点「保存」之前不会写入磁盘; 有待保存草稿时卡片显示「未保存」徽章, 「放弃」可丢弃草稿
- 改动过的字段会带「已覆盖」徽章, 并有逐字段的「恢复默认」按钮(回到内置默认值)
- 布尔字段是三态:**继承**(用默认)/ 开 / 关
- 非法输入(非数字、小于最小值)会阻止保存并给出提示
- 只读部署中卡片只显示已存值, 所有控件禁用
- 保存后立即生效, 持久化在 `~/.dsh/settings.yaml`(卸载插件会留下该段落, 无害, 想清理可手动删除)

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| 继续文本 | `继续` | 中断后自动发送的消息内容 |
| 宽限期 (ms) | `3000` | 中断后等待的时长; 期间宿主自行恢复则取消 |
| 冷却时间 (ms) | `20000` | 同一会话两次自动「继续」的最小间隔(失败尝试也计入) |
| 最大连续次数 | `3` | 同一会话连续自动「继续」上限; 超过后停止, 直到用户介入或成功回合 |
| 启动/重连扫描 | 开 | 页面启动 / 重连时扫描最近中断的会话 |
| 扫描会话数 | `8` | 扫描最多检查的会话数(不含运行中 / 子代理会话) |
| 扫描时间窗 (ms) | `900000` | 扫描只处理该时间窗内的中断 |
| 重连扫描延迟 (ms) | `5000` | 重连后等待宿主恢复再扫描 |
| 重连退避 (ms) | `3000` | SSE 流断开后的重连间隔 |
| 详细日志 | 开 | 控制台输出 `[auto-continue]` 日志 |
| 错误分类 | 开 | 仅自动恢复临时性错误; 认证 / 余额 / 模型等永久性错误跳过并通知 |
| 退避系数 | `2` | 连续失败时冷却间隔的倍率(2 = 20s → 40s → 80s…) |
| 最大退避间隔 (ms) | `300000` | 自适应退避的上限 |
| 浏览器通知 | 关 | 自动继续成功 / 放弃 / 遇到永久性错误时弹通知 |

`continueText` 支持占位符 `{code}`、`{message}`、`{status}`、`{tool}`(失败前最后一次工具调用)和 `{turn}`——例如 `继续 ({tool}: {code})` 会变成 `继续 (git push: UPSTREAM)`。

---

## 隐私与权限

插件是纯浏览器端, **不触碰任何文件、凭据, 也不访问 dsh 宿主以外的网络**:

- 只复用 webui 本身就在用的两条只读事件流(无额外服务、无第三方端点)
- 唯一会执行的写入是 `sessions.prompt`——与点「发送」按钮完全相同的调用, 内容为你配置的文本
- 浏览器存储仅限于少量 `localStorage` 键(跨标签页协调用)
- 浏览器通知是可选开启的(`notify` 设置), 仅在首次使用时请求一次权限

---

## 开发

```bash
npm run typecheck   # tsc --noEmit
npm run build       # lib/client.js + lib/index.js + lib/types
npm run watch       # 监听变更自动重建; 宿主 HMR 免刷新热重载
npm run test        # node tests/simulate.mjs — 12 个行为场景
```

`npm run watch` 运行时, profile 的 client-hmr 行每 500ms 轮询 `lib/client.js` 并在浏览器中热重载插件——改代码无需重启服务。

---

## 活跃度

[![HsiangNianian/dsh-auto-continue GitStock K-Line Chart](https://gitstock.org/HsiangNianian/dsh-auto-continue/stock.svg)](https://gitstock.org/HsiangNianian/dsh-auto-continue)

---

## 链接

- **仓库**: [github.com/HsiangNianian/dsh-auto-continue](https://github.com/HsiangNianian/dsh-auto-continue)
- **DeepSeek Harness**: [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

---

## License

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT © Hsiang Nianian
