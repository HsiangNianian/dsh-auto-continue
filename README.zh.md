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
> `@deepseek-ai/dsh-host-apiproxy` 包中硬编码白名单里的设置命名空间。要让设置卡片
> 显示出来, 需要执行一次幂等的供应商补丁(重新安装 dsh 后重跑一次即可):
>
> ```sh
> node scripts/patch-expose.mjs
> dsh web
> ```
>
> 自动续跑引擎本身不依赖这个补丁——它只影响 GUI 设置卡片是否可见。

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

所有参数都可以在 GUI 里配置——无需改文件或控制台。打开 **设置 → 插件配置**, 找到 **自动继续** 卡片。修改后点 **保存** 生效, 立即应用, 并持久化到 `~/.dsh/settings.yaml`。

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

---

## 技术栈与结构

| 分层 | 选型 |
| --- | --- |
| 平台 | DSH Web GUI 客户端插件(浏览器半区 + 注册设置命名空间的宿主半区) |
| 语言 | TypeScript |
| 构建 | esbuild(浏览器包 + 宿主半区)+ tsc 声明文件 |
| 运行时依赖 | 浏览器包: `react`(平台种子)+ `createSnapshotStore`(模块表); 宿主半区: `schemastery` + `dsh-settings`(由 dsh 安装解析) |

```
dsh-auto-continue/
├── package.json            # 插件清单(dsh.client / dsh.bundle)
├── cordis.patch.yml        # profile 补丁层: 注册插件行
├── build.mjs               # esbuild 构建(浏览器包 + 宿主半区)
├── tsconfig.json / tsconfig.build.json
├── src/
│   ├── index.ts            # host 半区: 注册 auto-continue 设置命名空间
│   └── client/
│       ├── index.ts        # browser 半区入口: 引擎 + 设置卡片接线
│       ├── engine.ts       # 自动续跑引擎(读取设置作用域)
│       ├── settings-card.tsx / settings-form.ts / locales.ts / styles.ts
│       └──                 # 设置卡片 UI(暂存表单、中英文案、主题样式)
├── tests/simulate.mjs      # 无头行为测试(模拟 API + 设置作用域)
├── lib/                    # 构建产物(已提交, 可直接链接)
├── docs/                   # banner 图(英文 + 中文)
└── README.md / README.zh.md / LICENSE
```

---

## 开发

```bash
npm run typecheck   # tsc --noEmit
npm run build       # lib/client.js + lib/index.js + lib/types
npm run watch       # 监听变更自动重建; 宿主 HMR 免刷新热重载
npm run test        # node tests/simulate.mjs — 8 个行为场景
```

`npm run watch` 运行时, profile 的 client-hmr 行每 500ms 轮询 `lib/client.js` 并在浏览器中热重载插件——改代码无需重启服务。

---


## 发布

打一个与 `package.json` 版本一致的 `v<version>` tag, 即可触发发布流水线:

```bash
git tag v0.2.1
git push origin v0.2.1
```

CI(`.github/workflows/publish.yml`)会依次:

1. 校验 tag 与 `package.json` 版本一致
2. 安装依赖、构建(`npm run build`)并跑测试套件
3. 发布到 npm(`dsh-client-auto-continue`)
4. 创建 GitHub Release, 附带打包好的 tarball 与构建产物
   (`lib/client.js`、`lib/client.js.map`、`lib/index.js`)

流水线依赖仓库的 `NPM_TOKEN` secret(带 publish 权限的 npm automation token):

```bash
gh secret set NPM_TOKEN --repo HsiangNianian/dsh-auto-continue
```

---

## 链接


- **仓库**: [github.com/HsiangNianian/dsh-auto-continue](https://github.com/HsiangNianian/dsh-auto-continue)
- **DeepSeek Harness**: [github.com/deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)

---

## License

[![MIT](https://img.shields.io/badge/license-MIT-65a30d)](LICENSE)

MIT © Hsiang Nianian
