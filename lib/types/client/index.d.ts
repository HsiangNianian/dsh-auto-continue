/**
 * dsh-client-auto-continue — 请求中断自动「继续」插件
 *
 * 监听 webui 的实时事件流(mux + host 两条 SSE):
 *   - 回合以非人为原因结束(`turn/end` reason ∈ error / interrupted / max-tokens)
 *   - 宿主报告无回合位置的 Agent 失败(`host/agent-error`)
 * 宽限期后自动向该会话发送一条用户消息(默认「继续」), 模拟用户手动续跑。
 *
 * 安全护栏(全部可调, 见 Config):
 *   - 用户主动停止(aborted)/策略拒绝(blocked)绝不自动继续
 *   - 宽限期(GRACE_MS, 默认 3s)内宿主自行开启新回合(turn/start)则取消
 *   - 每会话冷却(COOLDOWN_MS, 默认 20s)与最大连续次数(MAX_CONSECUTIVE, 默认 3)
 *   - 会话正在运行、有排队消息、是子代理会话时不发送
 *   - 跨标签页互斥(localStorage), 避免多个标签页重复发送
 *   - 启动/重连扫描只处理最近 FRESH_MS(默认 15 分钟)内的中断,
 *     且该中断之后没有新回合或用户消息
 *
 * 配置: 默认值见 Config; 可通过 localStorage["dsh-auto-continue.config"]
 * 存一份 JSON 覆盖任意字段(改完刷新页面生效)。
 */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
/** 客户端根上下文的 connection 服务(由 dsh-client-connection 挂载)。 */
declare module "@deepseek-ai/cordis" {
    interface Context {
        connection: ConnectionHandle;
    }
}
/** 所需服务: 连接句柄(ctx.connection.api)。 */
export declare const inject: string[];
/**
 * 插件主体: 挂载事件监听, 开始自动续跑。
 * @param ctx - 客户端根上下文。
 */
export declare function apply(ctx: ClientContext): void;
