window.__ModuleLoader__.load({
	id: "dsh-client-auto-continue",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var DEFAULT_CONFIG = {
  continueText: "继续",
  graceMs: 3e3,
  cooldownMs: 2e4,
  maxConsecutive: 3,
  scanOnBoot: true,
  scanLimit: 8,
  freshMs: 15 * 60 * 1e3,
  reconnectScanDelayMs: 5e3,
  reconnectBackoffMs: 3e3,
  verbose: true
};
function loadConfig() {
  const config = { ...DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem("dsh-auto-continue.config");
    if (raw) Object.assign(config, JSON.parse(raw));
  } catch {
  }
  return config;
}
function clientTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || void 0;
  } catch {
    return void 0;
  }
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var lockPrefix = "dsh-auto-continue:";
var lockKey = (sessionId) => `${lockPrefix}lock:${sessionId}`;
var stampKey = (sessionId) => `${lockPrefix}last:${sessionId}`;
function claimSend(sessionId) {
  try {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(lockKey(sessionId), token);
    return localStorage.getItem(lockKey(sessionId)) === token;
  } catch {
    return true;
  }
}
function releaseSend(sessionId) {
  try {
    localStorage.removeItem(lockKey(sessionId));
  } catch {
  }
}
function readLastSend(sessionId) {
  try {
    return Number(localStorage.getItem(stampKey(sessionId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function writeLastSend(sessionId, at) {
  try {
    localStorage.setItem(stampKey(sessionId), String(at));
  } catch {
  }
}
var freshState = () => ({
  consecutive: 0,
  lastAutoAt: 0,
  lastAttemptAt: 0,
  lastSentText: "",
  pendingTimer: void 0,
  running: void 0,
  queued: 0,
  subagent: false
});
function isOurEcho(state, event) {
  if (event.type !== "user/message") return false;
  const message = event.data;
  if (message.source.kind !== "user") return false;
  if (state.lastSentText === "") return false;
  if (Date.now() - state.lastAutoAt > 3e4) return false;
  const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
  return text === state.lastSentText;
}
function isNonHumanReason(kind) {
  return kind === "error" || kind === "interrupted" || kind === "max-tokens";
}
async function pumpStream(open, onFrame, onReconnect, config, log, signal) {
  let backoff = config.reconnectBackoffMs;
  while (!signal.aborted) {
    let connected = false;
    try {
      for await (const envelope of open(signal)) {
        connected = true;
        onFrame(envelope.payload);
      }
      if (signal.aborted) return;
    } catch (error) {
      if (signal.aborted) return;
      log(`stream error: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!connected) {
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 15e3);
      continue;
    }
    backoff = config.reconnectBackoffMs;
    onReconnect();
    await sleep(config.reconnectBackoffMs);
  }
}
var AutoContinueRunner = class {
  constructor(ctx) {
    this.states = /* @__PURE__ */ new Map();
    this.muxAbort = new AbortController();
    this.hostAbort = new AbortController();
    this.disposed = false;
    this.reconnectScans = 0;
    this.api = ctx.connection.api;
    this.config = loadConfig();
    if (!this.config.continueText.trim()) {
      console.warn("[auto-continue] continueText 为空, 插件停用。");
      this.disposed = true;
      return;
    }
    void this.runMux();
    void this.runHost();
    if (this.config.scanOnBoot) {
      void this.bootScanLoop();
    }
    this.log(
      `已启动(文本="${this.config.continueText}", 宽限 ${this.config.graceMs}ms, 冷却 ${this.config.cooldownMs}ms, 最多连续 ${this.config.maxConsecutive} 次)`
    );
  }
  log(message) {
    if (this.config.verbose) console.info(`[auto-continue] ${message}`);
  }
  dispose() {
    this.disposed = true;
    this.muxAbort.abort();
    this.hostAbort.abort();
    for (const state of this.states.values()) {
      if (state.pendingTimer !== void 0) clearTimeout(state.pendingTimer);
    }
    this.states.clear();
  }
  state(sessionId) {
    let state = this.states.get(sessionId);
    if (state === void 0) {
      state = freshState();
      this.states.set(sessionId, state);
    }
    return state;
  }
  runMux() {
    return pumpStream(
      (signal) => this.api.events.mux({}, signal),
      (payload) => this.onMuxFrame(payload),
      () => this.scheduleReconnectScan(),
      this.config,
      (m) => this.log(m),
      this.muxAbort.signal
    );
  }
  runHost() {
    return pumpStream(
      (signal) => this.api.events.host({}, signal),
      (payload) => this.onHostFrame(payload),
      () => this.scheduleReconnectScan(),
      this.config,
      (m) => this.log(m),
      this.hostAbort.signal
    );
  }
  // ---------- mux 帧 ----------
  onMuxFrame(frame) {
    switch (frame.type) {
      case "session/event":
        this.onSessionEvent(frame.sessionId, frame.event);
        break;
      case "session/queue":
        this.state(frame.sessionId).queued = frame.items.length;
        if (frame.items.length > 0) this.cancelPending(frame.sessionId, "出现排队消息");
        break;
      case "stream/error":
        this.log(`mux stream/error: ${frame.error.code} ${frame.error.message}`);
        break;
      default:
        break;
    }
  }
  onSessionEvent(sessionId, event) {
    const state = this.state(sessionId);
    switch (event.type) {
      case "turn/start":
        state.running = true;
        this.cancelPending(sessionId, "宿主自行开启新回合");
        break;
      case "turn/end": {
        state.running = false;
        this.cancelPending(sessionId, "收到新的 turn/end");
        const reason = event.data.reason;
        if (reason.kind === "completed") {
          state.consecutive = 0;
        } else if (reason.kind === "aborted") {
          state.consecutive = 0;
        } else if (reason.kind === "blocked") {
        } else if (isNonHumanReason(reason.kind)) {
          this.schedule(sessionId, `turn/end:${reason.kind}`);
        }
        break;
      }
      case "user/message":
        if (isOurEcho(state, event)) break;
        if (event.data.source.kind === "user") {
          state.consecutive = 0;
          this.cancelPending(sessionId, "用户手动发送消息");
        }
        break;
      default:
        break;
    }
  }
  // ---------- host 帧 ----------
  onHostFrame(frame) {
    switch (frame.type) {
      case "host/session-status":
        this.state(frame.sessionId).running = frame.running;
        if (frame.running) this.cancelPending(frame.sessionId, "宿主报告会话开始运行");
        break;
      case "host/session-added":
        this.state(frame.sessionId).subagent = frame.parentSessionId !== void 0;
        break;
      case "host/agent-error":
        if (this.state(frame.sessionId).subagent) break;
        this.log(`host/agent-error(${frame.sessionId}): ${frame.message}`);
        this.schedule(frame.sessionId, "host/agent-error");
        break;
      case "host/session-removed":
        this.cancelPending(frame.sessionId, "会话已移除");
        this.states.delete(frame.sessionId);
        break;
      default:
        break;
    }
  }
  // ---------- 调度 ----------
  schedule(sessionId, reason) {
    const state = this.state(sessionId);
    if (state.subagent) return;
    if (state.pendingTimer !== void 0) return;
    if (Date.now() - state.lastAttemptAt < this.config.cooldownMs) return;
    if (state.consecutive >= this.config.maxConsecutive) {
      this.log(
        `跳过 ${sessionId}(${reason}): 已连续自动继续 ${state.consecutive} 次, 等待用户介入或成功回合`
      );
      return;
    }
    if (state.queued > 0) return;
    const timer = setTimeout(() => {
      if (state.pendingTimer !== timer) return;
      state.pendingTimer = void 0;
      void this.fire(sessionId, reason);
    }, this.config.graceMs);
    state.pendingTimer = timer;
    this.log(
      `检测到非人为中断 ${sessionId}(${reason}), ${this.config.graceMs}ms 后自动发送「${this.config.continueText}」`
    );
  }
  cancelPending(sessionId, why) {
    const state = this.state(sessionId);
    if (state.pendingTimer === void 0) return;
    clearTimeout(state.pendingTimer);
    state.pendingTimer = void 0;
    this.log(`取消 ${sessionId} 的自动继续(${why})`);
  }
  async fire(sessionId, reason) {
    if (this.disposed) return;
    const state = this.state(sessionId);
    if (state.running === void 0) {
      const running = await this.runningViaList(sessionId);
      if (running === void 0 || running) {
        this.log(`跳过 ${sessionId}: 无法确认空闲(${running === void 0 ? "未知" : "运行中"})`);
        return;
      }
    } else if (state.running) {
      this.log(`跳过 ${sessionId}: 会话仍在运行`);
      return;
    }
    if (state.queued > 0) {
      this.log(`跳过 ${sessionId}: 已有排队消息`);
      return;
    }
    if (Date.now() - readLastSend(sessionId) < this.config.cooldownMs) {
      this.log(`跳过 ${sessionId}: 其他标签页刚发送过`);
      return;
    }
    if (!claimSend(sessionId)) {
      this.log(`跳过 ${sessionId}: 其他标签页正在发送`);
      return;
    }
    const text = this.config.continueText;
    const zone = clientTimeZone();
    state.lastAttemptAt = Date.now();
    try {
      const response = await this.api.sessions.prompt({
        sessionId,
        mode: "queue",
        content: [{ type: "text", text }],
        ...zone === void 0 ? {} : { clientTimeZone: zone }
      });
      if (response.result.ok) {
        const now = Date.now();
        state.consecutive += 1;
        state.lastAutoAt = now;
        state.lastSentText = text;
        writeLastSend(sessionId, now);
        this.log(`已自动发送「${text}」到 ${sessionId}(${reason}), 第 ${state.consecutive} 次连续`);
      } else {
        this.log(
          `发送失败 ${sessionId}: ${response.result.error.code} ${response.result.error.message}`
        );
      }
    } catch (error) {
      this.log(`发送异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      releaseSend(sessionId);
    }
  }
  async runningViaList(sessionId) {
    try {
      const response = await this.api.sessions.list({});
      if (!response.result.ok) return void 0;
      const item = response.result.value.items.find(
        (summary) => summary.sessionId === sessionId
      );
      return item === void 0 ? void 0 : item.running;
    } catch {
      return void 0;
    }
  }
  // ---------- 启动/重连扫描 ----------
  scheduleReconnectScan() {
    this.reconnectScans += 1;
    const scan = this.reconnectScans;
    setTimeout(() => {
      if (scan !== this.reconnectScans || this.disposed) return;
      void this.scanLoop(6, this.config.reconnectScanDelayMs);
    }, this.config.reconnectScanDelayMs);
  }
  async bootScanLoop() {
    await this.scanLoop(Infinity, 3e3);
  }
  /** 反复尝试扫描, 直到成功(宿主就绪)或达到次数上限。 */
  async scanLoop(attempts, delayMs) {
    for (let attempt = 0; attempt < attempts && !this.disposed; attempt += 1) {
      try {
        if (await this.scanInterrupted()) return;
      } catch (error) {
        if (this.disposed) return;
        if (attempt % 10 === 0) {
          this.log(
            `扫描失败(${attempt + 1}/${attempts === Infinity ? "∞" : attempts}): ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      if (attempt + 1 < attempts) await sleep(delayMs);
    }
  }
  /**
   * 扫描最近中断过的会话: 最后回合以非人为原因结束, 且其后没有新回合或用户消息。
   * @returns 是否成功完成一次扫描(宿主就绪)。
   */
  async scanInterrupted() {
    const response = await this.api.sessions.list({});
    if (!response.result.ok) return false;
    const items = response.result.value.items;
    const candidates = items.filter((summary) => !summary.running && summary.parentSessionId === void 0).slice(0, this.config.scanLimit);
    const now = Date.now();
    for (const summary of candidates) {
      if (this.disposed) return true;
      const state = this.state(summary.sessionId);
      if (state.pendingTimer !== void 0) continue;
      if (state.consecutive >= this.config.maxConsecutive) continue;
      if (now - state.lastAttemptAt < this.config.cooldownMs) continue;
      let events;
      try {
        const page = await this.api.sessions.history({
          sessionId: summary.sessionId,
          maxMessages: 30
        });
        if (!page.result.ok) continue;
        events = page.result.value.events;
      } catch {
        continue;
      }
      let lastEnd;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i]?.event;
        if (event !== void 0 && event.type === "turn/end") {
          lastEnd = event;
          break;
        }
      }
      if (lastEnd === void 0) continue;
      const reason = lastEnd.data.reason;
      if (!isNonHumanReason(reason.kind)) continue;
      if (lastEnd.time < now - this.config.freshMs) continue;
      let superseded = false;
      for (const entry of events) {
        const event = entry.event;
        if (event.seq <= lastEnd.seq) continue;
        if (event.type === "turn/start") superseded = true;
        if (event.type === "user/message" && event.data.source.kind === "user") superseded = true;
        if (superseded) break;
      }
      if (superseded) continue;
      this.log(`扫描发现中断 ${summary.sessionId}(turn/end:${reason.kind}), 安排自动继续`);
      this.schedule(summary.sessionId, `scan:turn/end:${reason.kind}`);
    }
    return true;
  }
};
var current = null;
var inject = ["connection"];
function apply(ctx) {
  current?.dispose();
  current = new AutoContinueRunner(ctx);
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2NsaWVudC9pbmRleC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyoqXG4gKiBkc2gtY2xpZW50LWF1dG8tY29udGludWUg4oCUIOivt+axguS4reaWreiHquWKqOOAjOe7p+e7reOAjeaPkuS7tlxuICpcbiAqIOebkeWQrCB3ZWJ1aSDnmoTlrp7ml7bkuovku7bmtYEobXV4ICsgaG9zdCDkuKTmnaEgU1NFKTpcbiAqICAgLSDlm57lkIjku6XpnZ7kurrkuLrljp/lm6Dnu5PmnZ8oYHR1cm4vZW5kYCByZWFzb24g4oiIIGVycm9yIC8gaW50ZXJydXB0ZWQgLyBtYXgtdG9rZW5zKVxuICogICAtIOWuv+S4u+aKpeWRiuaXoOWbnuWQiOS9jee9rueahCBBZ2VudCDlpLHotKUoYGhvc3QvYWdlbnQtZXJyb3JgKVxuICog5a696ZmQ5pyf5ZCO6Ieq5Yqo5ZCR6K+l5Lya6K+d5Y+R6YCB5LiA5p2h55So5oi35raI5oGvKOm7mOiupOOAjOe7p+e7reOAjSksIOaooeaLn+eUqOaIt+aJi+WKqOe7rei3keOAglxuICpcbiAqIOWuieWFqOaKpOagjyjlhajpg6jlj6/osIMsIOingSBDb25maWcpOlxuICogICAtIOeUqOaIt+S4u+WKqOWBnOatoihhYm9ydGVkKS/nrZbnlaXmi5Lnu50oYmxvY2tlZCnnu53kuI3oh6rliqjnu6fnu61cbiAqICAgLSDlrr3pmZDmnJ8oR1JBQ0VfTVMsIOm7mOiupCAzcynlhoXlrr/kuLvoh6rooYzlvIDlkK/mlrDlm57lkIgodHVybi9zdGFydCnliJnlj5bmtohcbiAqICAgLSDmr4/kvJror53lhrfljbQoQ09PTERPV05fTVMsIOm7mOiupCAyMHMp5LiO5pyA5aSn6L+e57ut5qyh5pWwKE1BWF9DT05TRUNVVElWRSwg6buY6K6kIDMpXG4gKiAgIC0g5Lya6K+d5q2j5Zyo6L+Q6KGM44CB5pyJ5o6S6Zif5raI5oGv44CB5piv5a2Q5Luj55CG5Lya6K+d5pe25LiN5Y+R6YCBXG4gKiAgIC0g6Leo5qCH562+6aG15LqS5palKGxvY2FsU3RvcmFnZSksIOmBv+WFjeWkmuS4quagh+etvumhtemHjeWkjeWPkemAgVxuICogICAtIOWQr+WKqC/ph43ov57miavmj4/lj6rlpITnkIbmnIDov5EgRlJFU0hfTVMo6buY6K6kIDE1IOWIhumSnynlhoXnmoTkuK3mlq0sXG4gKiAgICAg5LiU6K+l5Lit5pat5LmL5ZCO5rKh5pyJ5paw5Zue5ZCI5oiW55So5oi35raI5oGvXG4gKlxuICog6YWN572uOiDpu5jorqTlgLzop4EgQ29uZmlnOyDlj6/pgJrov4cgbG9jYWxTdG9yYWdlW1wiZHNoLWF1dG8tY29udGludWUuY29uZmlnXCJdXG4gKiDlrZjkuIDku70gSlNPTiDopobnm5bku7vmhI/lrZfmrrUo5pS55a6M5Yi35paw6aG16Z2i55Sf5pWIKeOAglxuICovXG5cbmltcG9ydCB0eXBlIHsgQ2xpZW50Q29udGV4dCB9IGZyb20gXCJAZGVlcHNlZWstYWkvZHNoLWNsaWVudC1ydW50aW1lL2NsaWVudFwiO1xuaW1wb3J0IHR5cGUge1xuICBDb25uZWN0aW9uSGFuZGxlLFxuICBIb3N0RnJhbWUsXG4gIElBcGlDbGllbnQsXG4gIE11eEZyYW1lLFxuICBTZXNzaW9uSWQsXG4gIFNlc3Npb25TdW1tYXJ5LFxufSBmcm9tIFwiQGRlZXBzZWVrLWFpL2RzaC1jbGllbnQtY29ubmVjdGlvbi9jbGllbnRcIjtcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbkV2ZW50IH0gZnJvbSBcIkBkZWVwc2Vlay1haS9kc2gtc2Vzc2lvbi90eXBlc1wiO1xuXG4vKiog5a6i5oi356uv5qC55LiK5LiL5paH55qEIGNvbm5lY3Rpb24g5pyN5YqhKOeUsSBkc2gtY2xpZW50LWNvbm5lY3Rpb24g5oyC6L29KeOAgiAqL1xuZGVjbGFyZSBtb2R1bGUgXCJAZGVlcHNlZWstYWkvY29yZGlzXCIge1xuICBpbnRlcmZhY2UgQ29udGV4dCB7XG4gICAgY29ubmVjdGlvbjogQ29ubmVjdGlvbkhhbmRsZTtcbiAgfVxufVxuXG4vKiog6KeG5Li644CM6Z2e5Lq65Li65Lit5pat44CN55qE5Zue5ZCI57uT5p2f5Y6f5Zug44CCYWJvcnRlZCjnlKjmiLflgZzmraIp5LiOIGJsb2NrZWQo562W55Wl5ouS57udKeS4jeWcqOWFtuS4reOAgiAqL1xudHlwZSBOb25IdW1hblJlYXNvbiA9IFwiZXJyb3JcIiB8IFwiaW50ZXJydXB0ZWRcIiB8IFwibWF4LXRva2Vuc1wiO1xuXG5pbnRlcmZhY2UgQ29uZmlnIHtcbiAgLyoqIOiHquWKqOWPkemAgeeahOa2iOaBr+aWh+acrOOAgiAqL1xuICBjb250aW51ZVRleHQ6IHN0cmluZztcbiAgLyoqIOajgOa1i+WIsOS4reaWreWQjuetieW+heeahOWuvemZkOacnyhtcyk6IOWuv+S4u+WPr+iDveiHquihjOW8gOWQr+aWsOWbnuWQiChnb2FsIOetiSksIOacn+mXtOWIsOi+viB0dXJuL3N0YXJ0IOWImeWPlua2iOOAgiAqL1xuICBncmFjZU1zOiBudW1iZXI7XG4gIC8qKiDlkIzkuIDkvJror53kuKTmrKHoh6rliqjjgIznu6fnu63jgI3nmoTmnIDlsI/pl7TpmpQobXMp44CCICovXG4gIGNvb2xkb3duTXM6IG51bWJlcjtcbiAgLyoqIOWQjOS4gOS8muivnei/nue7reiHquWKqOOAjOe7p+e7reOAjeeahOacgOWkp+asoeaVsCwg6LaF6L+H5ZCO5YGc5q2iLCDnm7TliLDnlKjmiLfmiYvliqjku4vlhaXmiJblh7rnjrDmiJDlip/lm57lkIjjgIIgKi9cbiAgbWF4Q29uc2VjdXRpdmU6IG51bWJlcjtcbiAgLyoqIOWQr+WKqOaXtuaYr+WQpuaJq+aPj+acgOi/keS4reaWrei/h+eahOS8muivnSjop4Egc2NhbkludGVycnVwdGVkKeOAgiAqL1xuICBzY2FuT25Cb290OiBib29sZWFuO1xuICAvKiog5ZCv5YqoL+mHjei/nuaJq+aPj+acgOWkmuajgOafpeeahOS8muivneaVsCjmjInmnIDov5Hmm7TmlrDmjpLluo8sIOS4jeWQq+i/kOihjOS4reS4juWtkOS7o+eQhuS8muivnSnjgIIgKi9cbiAgc2NhbkxpbWl0OiBudW1iZXI7XG4gIC8qKiDmiavmj4/ml7blj6rlpITnkIYgRlJFU0hfTVMg5Lul5YaF55qE5Lit5pat44CCICovXG4gIGZyZXNoTXM6IG51bWJlcjtcbiAgLyoqIOmHjei/nuWQjuetieW+heWuv+S4u+WujOaIkOaBouWkjeWGjeaJq+aPj+eahOW7tui/nyhtcynjgIIgKi9cbiAgcmVjb25uZWN0U2NhbkRlbGF5TXM6IG51bWJlcjtcbiAgLyoqIOa1geaWreW8gOWQjueahOmHjei/numAgOmBvyhtcynjgIIgKi9cbiAgcmVjb25uZWN0QmFja29mZk1zOiBudW1iZXI7XG4gIC8qKiDmmK/lkKbkuLrmr4/mnaHoh6rliqjmtojmga/lnKjmjqfliLblj7DovpPlh7rml6Xlv5fjgIIgKi9cbiAgdmVyYm9zZTogYm9vbGVhbjtcbn1cblxuY29uc3QgREVGQVVMVF9DT05GSUc6IENvbmZpZyA9IHtcbiAgY29udGludWVUZXh0OiBcIue7p+e7rVwiLFxuICBncmFjZU1zOiAzMDAwLFxuICBjb29sZG93bk1zOiAyMDAwMCxcbiAgbWF4Q29uc2VjdXRpdmU6IDMsXG4gIHNjYW5PbkJvb3Q6IHRydWUsXG4gIHNjYW5MaW1pdDogOCxcbiAgZnJlc2hNczogMTUgKiA2MCAqIDEwMDAsXG4gIHJlY29ubmVjdFNjYW5EZWxheU1zOiA1MDAwLFxuICByZWNvbm5lY3RCYWNrb2ZmTXM6IDMwMDAsXG4gIHZlcmJvc2U6IHRydWUsXG59O1xuXG5mdW5jdGlvbiBsb2FkQ29uZmlnKCk6IENvbmZpZyB7XG4gIGNvbnN0IGNvbmZpZzogQ29uZmlnID0geyAuLi5ERUZBVUxUX0NPTkZJRyB9O1xuICB0cnkge1xuICAgIGNvbnN0IHJhdyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwiZHNoLWF1dG8tY29udGludWUuY29uZmlnXCIpO1xuICAgIGlmIChyYXcpIE9iamVjdC5hc3NpZ24oY29uZmlnLCBKU09OLnBhcnNlKHJhdykpO1xuICB9IGNhdGNoIHtcbiAgICAvKiDphY3nva7mjZ/lnY/ml7bpnZnpu5jkvb/nlKjpu5jorqTlgLwgKi9cbiAgfVxuICByZXR1cm4gY29uZmlnO1xufVxuXG4vKiog5rWP6KeI5Zmo5b2T5YmNIElBTkEg5pe25Yy6OyDkuI3lj6/nlKjml7bnnIHnlaUo5a6/5Li75YWB6K6455yB55WlKeOAgiAqL1xuZnVuY3Rpb24gY2xpZW50VGltZVpvbmUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gSW50bC5EYXRlVGltZUZvcm1hdCgpLnJlc29sdmVkT3B0aW9ucygpLnRpbWVab25lIHx8IHVuZGVmaW5lZDtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufVxuXG5mdW5jdGlvbiBzbGVlcChtczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCBtcykpO1xufVxuXG4vKiog6Leo5qCH562+6aG15LqS5pal5LiO5Ya35Y206K6w5b2VKOS7hea1j+iniOWZqOacrOWcsCwg5LiN6JC955uY5Yiw5a6/5Li7KeOAgiAqL1xuY29uc3QgbG9ja1ByZWZpeCA9IFwiZHNoLWF1dG8tY29udGludWU6XCI7XG5jb25zdCBsb2NrS2V5ID0gKHNlc3Npb25JZDogU2Vzc2lvbklkKSA9PiBgJHtsb2NrUHJlZml4fWxvY2s6JHtzZXNzaW9uSWR9YDtcbmNvbnN0IHN0YW1wS2V5ID0gKHNlc3Npb25JZDogU2Vzc2lvbklkKSA9PiBgJHtsb2NrUHJlZml4fWxhc3Q6JHtzZXNzaW9uSWR9YDtcblxuLyoqIOWwneivleeLrOWNoOacrOasoeWPkemAgTog5Lik5Liq5qCH562+6aG15ZCM5pe26Kem5Y+R5pe25Y+q5pyJ5LiA5Liq5oiQ5Yqf44CCICovXG5mdW5jdGlvbiBjbGFpbVNlbmQoc2Vzc2lvbklkOiBTZXNzaW9uSWQpOiBib29sZWFuIHtcbiAgdHJ5IHtcbiAgICBjb25zdCB0b2tlbiA9IGAke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMil9YDtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShsb2NrS2V5KHNlc3Npb25JZCksIHRva2VuKTtcbiAgICByZXR1cm4gbG9jYWxTdG9yYWdlLmdldEl0ZW0obG9ja0tleShzZXNzaW9uSWQpKSA9PT0gdG9rZW47XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiB0cnVlOyAvLyDlrZjlgqjkuI3lj6/nlKgo6ZqQ56eB5qih5byP562JKeaXtuaUvuihjFxuICB9XG59XG5cbmZ1bmN0aW9uIHJlbGVhc2VTZW5kKHNlc3Npb25JZDogU2Vzc2lvbklkKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0obG9ja0tleShzZXNzaW9uSWQpKTtcbiAgfSBjYXRjaCB7XG4gICAgLyogaWdub3JlICovXG4gIH1cbn1cblxuLyoqIOivuy/lhpnjgIzkuIrmrKHoh6rliqjlj5HpgIHjgI3ml7bpl7TmiLMo6Leo5qCH562+6aG15Ya35Y20KeOAgiAqL1xuZnVuY3Rpb24gcmVhZExhc3RTZW5kKHNlc3Npb25JZDogU2Vzc2lvbklkKTogbnVtYmVyIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gTnVtYmVyKGxvY2FsU3RvcmFnZS5nZXRJdGVtKHN0YW1wS2V5KHNlc3Npb25JZCkpID8/IDApIHx8IDA7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiAwO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyaXRlTGFzdFNlbmQoc2Vzc2lvbklkOiBTZXNzaW9uSWQsIGF0OiBudW1iZXIpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShzdGFtcEtleShzZXNzaW9uSWQpLCBTdHJpbmcoYXQpKTtcbiAgfSBjYXRjaCB7XG4gICAgLyogaWdub3JlICovXG4gIH1cbn1cblxuLyoqIOavj+S8muivnei/kOihjOaXtueKtuaAgeOAgiAqL1xuaW50ZXJmYWNlIFNlc3Npb25TdGF0ZSB7XG4gIC8qKiDov57nu63oh6rliqjjgIznu6fnu63jgI3mrKHmlbA7IOaIkOWKn+WbnuWQiOaIlueUqOaIt+aJi+WKqOS7i+WFpeWQjuW9kumbtuOAgiAqL1xuICBjb25zZWN1dGl2ZTogbnVtYmVyO1xuICAvKiog5LiK5qyh6Ieq5Yqo44CM57un57ut44CN5pe26Ze05oiz44CCICovXG4gIGxhc3RBdXRvQXQ6IG51bWJlcjtcbiAgLyoqIOS4iuasoeiHquWKqOOAjOe7p+e7reOAjeWwneivlSjmiJDlip/miJblpLHotKUp5pe26Ze05oizOyDpmLLmraLlpLHotKXlnLrmma/kuIvnmoTlv6vpgJ/ph43or5Xlvqrnjq/jgIIgKi9cbiAgbGFzdEF0dGVtcHRBdDogbnVtYmVyO1xuICAvKiog5oiR5Lus5LiK5qyh6Ieq5Yqo5Y+R6YCB55qE5paH5pysKOeUqOS6juivhuWIq+iHquW3seeahOWbnuaYvinjgIIgKi9cbiAgbGFzdFNlbnRUZXh0OiBzdHJpbmc7XG4gIC8qKiDlrr3pmZDmnJ/lrprml7blmago6L+b6KGM5Lit55qE5b6F5Y+R6YCBKeOAgiAqL1xuICBwZW5kaW5nVGltZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgLyoqIOWuv+S4u+adg+WogSBydW5uaW5nIOS9jSjmnaXoh6ogaG9zdC9zZXNzaW9uLXN0YXR1cyDkuI7lm57lkIjkuovku7Yp44CCICovXG4gIHJ1bm5pbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG4gIC8qKiDlvZPliY3mjpLpmJ/mtojmga/mlbAo5p2l6IeqIHNlc3Npb24vcXVldWUg5binKeOAgiAqL1xuICBxdWV1ZWQ6IG51bWJlcjtcbiAgLyoqIOWtkOS7o+eQhuS8muivnShob3N0L3Nlc3Npb24tYWRkZWQg5bimIHBhcmVudFNlc3Npb25JZCnjgIIgKi9cbiAgc3ViYWdlbnQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IGZyZXNoU3RhdGUgPSAoKTogU2Vzc2lvblN0YXRlID0+ICh7XG4gIGNvbnNlY3V0aXZlOiAwLFxuICBsYXN0QXV0b0F0OiAwLFxuICBsYXN0QXR0ZW1wdEF0OiAwLFxuICBsYXN0U2VudFRleHQ6IFwiXCIsXG4gIHBlbmRpbmdUaW1lcjogdW5kZWZpbmVkLFxuICBydW5uaW5nOiB1bmRlZmluZWQsXG4gIHF1ZXVlZDogMCxcbiAgc3ViYWdlbnQ6IGZhbHNlLFxufSk7XG5cbi8qKiDliKTlrprkuIDmnaEgdXNlci9tZXNzYWdlIOaYr+WQpuaYr+aIkeS7rOiHquW3seiHquWKqOWPkemAgeeahOWbnuaYvuOAgiAqL1xuZnVuY3Rpb24gaXNPdXJFY2hvKHN0YXRlOiBTZXNzaW9uU3RhdGUsIGV2ZW50OiBTZXNzaW9uRXZlbnQpOiBib29sZWFuIHtcbiAgaWYgKGV2ZW50LnR5cGUgIT09IFwidXNlci9tZXNzYWdlXCIpIHJldHVybiBmYWxzZTtcbiAgY29uc3QgbWVzc2FnZSA9IGV2ZW50LmRhdGE7XG4gIGlmIChtZXNzYWdlLnNvdXJjZS5raW5kICE9PSBcInVzZXJcIikgcmV0dXJuIGZhbHNlO1xuICBpZiAoc3RhdGUubGFzdFNlbnRUZXh0ID09PSBcIlwiKSByZXR1cm4gZmFsc2U7XG4gIGlmIChEYXRlLm5vdygpIC0gc3RhdGUubGFzdEF1dG9BdCA+IDMwMDAwKSByZXR1cm4gZmFsc2U7XG4gIGNvbnN0IHRleHQgPSBtZXNzYWdlLmNvbnRlbnRcbiAgICAuZmlsdGVyKChwYXJ0KTogcGFydCBpcyB7IHR5cGU6IFwidGV4dFwiOyB0ZXh0OiBzdHJpbmcgfSA9PiBwYXJ0LnR5cGUgPT09IFwidGV4dFwiKVxuICAgIC5tYXAoKHBhcnQpID0+IHBhcnQudGV4dClcbiAgICAuam9pbihcIlwiKTtcbiAgcmV0dXJuIHRleHQgPT09IHN0YXRlLmxhc3RTZW50VGV4dDtcbn1cblxuZnVuY3Rpb24gaXNOb25IdW1hblJlYXNvbihraW5kOiBzdHJpbmcpOiBraW5kIGlzIE5vbkh1bWFuUmVhc29uIHtcbiAgcmV0dXJuIGtpbmQgPT09IFwiZXJyb3JcIiB8fCBraW5kID09PSBcImludGVycnVwdGVkXCIgfHwga2luZCA9PT0gXCJtYXgtdG9rZW5zXCI7XG59XG5cbi8qKiBTU0Ug5bin5aSW5aOzOiBgeyBycGNJZCwgcGF5bG9hZCB9YOOAgiAqL1xudHlwZSBGcmFtZUVudmVsb3BlPFQ+ID0geyBwYXlsb2FkOiBUIH07XG5cbi8qKlxuICog5LqL5Lu25rWB5rO1OiDluKbmjIfmlbDpgIDpgb/nmoQgU1NFIOmHjei/nuW+queOr+OAglxuICogLSDku47mnKrmlLbliLDku7vkvZXluKco5a6/5Li75pyq5bCx57uqKTog6YCA6YG/6YeN6K+VLCDkuI3op6blj5Hmiavmj49cbiAqIC0g5pu+6L+e5LiK5ZCO5pat5byAOiDph43ov54sIOW5tumAmui/hyBvblJlY29ubmVjdCDpgJrnn6XlpJblsYIo5a6/5Li75Y+v6IO95bSp5rqD6YeN5ZCv6L+HKVxuICovXG5hc3luYyBmdW5jdGlvbiBwdW1wU3RyZWFtPFQ+KFxuICBvcGVuOiAoc2lnbmFsOiBBYm9ydFNpZ25hbCkgPT4gQXN5bmNJdGVyYWJsZTxGcmFtZUVudmVsb3BlPFQ+PixcbiAgb25GcmFtZTogKHBheWxvYWQ6IFQpID0+IHZvaWQsXG4gIG9uUmVjb25uZWN0OiAoKSA9PiB2b2lkLFxuICBjb25maWc6IENvbmZpZyxcbiAgbG9nOiAobWVzc2FnZTogc3RyaW5nKSA9PiB2b2lkLFxuICBzaWduYWw6IEFib3J0U2lnbmFsLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGxldCBiYWNrb2ZmID0gY29uZmlnLnJlY29ubmVjdEJhY2tvZmZNcztcbiAgd2hpbGUgKCFzaWduYWwuYWJvcnRlZCkge1xuICAgIGxldCBjb25uZWN0ZWQgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgZm9yIGF3YWl0IChjb25zdCBlbnZlbG9wZSBvZiBvcGVuKHNpZ25hbCkpIHtcbiAgICAgICAgY29ubmVjdGVkID0gdHJ1ZTtcbiAgICAgICAgb25GcmFtZShlbnZlbG9wZS5wYXlsb2FkKTtcbiAgICAgIH1cbiAgICAgIGlmIChzaWduYWwuYWJvcnRlZCkgcmV0dXJuO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoc2lnbmFsLmFib3J0ZWQpIHJldHVybjtcbiAgICAgIGxvZyhgc3RyZWFtIGVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcbiAgICB9XG4gICAgaWYgKCFjb25uZWN0ZWQpIHtcbiAgICAgIC8vIOS7juacqui/nuS4iijlrr/kuLvmnKrlsLHnu6opOiDmjIfmlbDpgIDpgb/ph43or5VcbiAgICAgIGF3YWl0IHNsZWVwKGJhY2tvZmYpO1xuICAgICAgYmFja29mZiA9IE1hdGgubWluKGJhY2tvZmYgKiAyLCAxNTAwMCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgLy8g5pu+6L+e5LiK5ZCO5pat5byAIOKGkiDph43ov57lubbop6blj5HlpJblsYLmiavmj49cbiAgICBiYWNrb2ZmID0gY29uZmlnLnJlY29ubmVjdEJhY2tvZmZNcztcbiAgICBvblJlY29ubmVjdCgpO1xuICAgIGF3YWl0IHNsZWVwKGNvbmZpZy5yZWNvbm5lY3RCYWNrb2ZmTXMpO1xuICB9XG59XG5cbi8qKiDmj5Lku7bkuLvkvZM6IOS4gOadoSBtdXgg5rWBICsg5LiA5p2hIGhvc3Qg5rWBICsg5ZCv5YqoL+mHjei/nuaJq+aPj+OAgiAqL1xuY2xhc3MgQXV0b0NvbnRpbnVlUnVubmVyIHtcbiAgcHJpdmF0ZSByZWFkb25seSBhcGk6IElBcGlDbGllbnQ7XG4gIHByaXZhdGUgcmVhZG9ubHkgY29uZmlnOiBDb25maWc7XG4gIHByaXZhdGUgcmVhZG9ubHkgc3RhdGVzID0gbmV3IE1hcDxTZXNzaW9uSWQsIFNlc3Npb25TdGF0ZT4oKTtcbiAgcHJpdmF0ZSByZWFkb25seSBtdXhBYm9ydCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgcHJpdmF0ZSByZWFkb25seSBob3N0QWJvcnQgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gIHByaXZhdGUgZGlzcG9zZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSByZWNvbm5lY3RTY2FucyA9IDA7XG5cbiAgY29uc3RydWN0b3IoY3R4OiBDbGllbnRDb250ZXh0KSB7XG4gICAgdGhpcy5hcGkgPSBjdHguY29ubmVjdGlvbi5hcGk7XG4gICAgdGhpcy5jb25maWcgPSBsb2FkQ29uZmlnKCk7XG4gICAgaWYgKCF0aGlzLmNvbmZpZy5jb250aW51ZVRleHQudHJpbSgpKSB7XG4gICAgICBjb25zb2xlLndhcm4oXCJbYXV0by1jb250aW51ZV0gY29udGludWVUZXh0IOS4uuepuiwg5o+S5Lu25YGc55So44CCXCIpO1xuICAgICAgdGhpcy5kaXNwb3NlZCA9IHRydWU7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZvaWQgdGhpcy5ydW5NdXgoKTtcbiAgICB2b2lkIHRoaXMucnVuSG9zdCgpO1xuICAgIGlmICh0aGlzLmNvbmZpZy5zY2FuT25Cb290KSB7XG4gICAgICAvLyDlkK/liqjml7bov57mjqXlj6/og73lsJrmnKrlu7rnq4ssIOW+queOr+mHjeivleebtOWIsOaIkOWKn+OAglxuICAgICAgdm9pZCB0aGlzLmJvb3RTY2FuTG9vcCgpO1xuICAgIH1cbiAgICB0aGlzLmxvZyhcbiAgICAgIGDlt7LlkK/liqgo5paH5pysPVwiJHt0aGlzLmNvbmZpZy5jb250aW51ZVRleHR9XCIsIOWuvemZkCAke3RoaXMuY29uZmlnLmdyYWNlTXN9bXMsIGAgK1xuICAgICAgICBg5Ya35Y20ICR7dGhpcy5jb25maWcuY29vbGRvd25Nc31tcywg5pyA5aSa6L+e57utICR7dGhpcy5jb25maWcubWF4Q29uc2VjdXRpdmV9IOasoSlgLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGxvZyhtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5jb25maWcudmVyYm9zZSkgY29uc29sZS5pbmZvKGBbYXV0by1jb250aW51ZV0gJHttZXNzYWdlfWApO1xuICB9XG5cbiAgZGlzcG9zZSgpOiB2b2lkIHtcbiAgICB0aGlzLmRpc3Bvc2VkID0gdHJ1ZTtcbiAgICB0aGlzLm11eEFib3J0LmFib3J0KCk7XG4gICAgdGhpcy5ob3N0QWJvcnQuYWJvcnQoKTtcbiAgICBmb3IgKGNvbnN0IHN0YXRlIG9mIHRoaXMuc3RhdGVzLnZhbHVlcygpKSB7XG4gICAgICBpZiAoc3RhdGUucGVuZGluZ1RpbWVyICE9PSB1bmRlZmluZWQpIGNsZWFyVGltZW91dChzdGF0ZS5wZW5kaW5nVGltZXIpO1xuICAgIH1cbiAgICB0aGlzLnN0YXRlcy5jbGVhcigpO1xuICB9XG5cbiAgcHJpdmF0ZSBzdGF0ZShzZXNzaW9uSWQ6IFNlc3Npb25JZCk6IFNlc3Npb25TdGF0ZSB7XG4gICAgbGV0IHN0YXRlID0gdGhpcy5zdGF0ZXMuZ2V0KHNlc3Npb25JZCk7XG4gICAgaWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHN0YXRlID0gZnJlc2hTdGF0ZSgpO1xuICAgICAgdGhpcy5zdGF0ZXMuc2V0KHNlc3Npb25JZCwgc3RhdGUpO1xuICAgIH1cbiAgICByZXR1cm4gc3RhdGU7XG4gIH1cblxuICBwcml2YXRlIHJ1bk11eCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gcHVtcFN0cmVhbTxNdXhGcmFtZT4oXG4gICAgICAoc2lnbmFsKSA9PiB0aGlzLmFwaS5ldmVudHMubXV4KHt9LCBzaWduYWwpLFxuICAgICAgKHBheWxvYWQpID0+IHRoaXMub25NdXhGcmFtZShwYXlsb2FkKSxcbiAgICAgICgpID0+IHRoaXMuc2NoZWR1bGVSZWNvbm5lY3RTY2FuKCksXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIChtKSA9PiB0aGlzLmxvZyhtKSxcbiAgICAgIHRoaXMubXV4QWJvcnQuc2lnbmFsLFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIHJ1bkhvc3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHB1bXBTdHJlYW08SG9zdEZyYW1lPihcbiAgICAgIChzaWduYWwpID0+IHRoaXMuYXBpLmV2ZW50cy5ob3N0KHt9LCBzaWduYWwpLFxuICAgICAgKHBheWxvYWQpID0+IHRoaXMub25Ib3N0RnJhbWUocGF5bG9hZCksXG4gICAgICAoKSA9PiB0aGlzLnNjaGVkdWxlUmVjb25uZWN0U2NhbigpLFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICAobSkgPT4gdGhpcy5sb2cobSksXG4gICAgICB0aGlzLmhvc3RBYm9ydC5zaWduYWwsXG4gICAgKTtcbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0gbXV4IOW4pyAtLS0tLS0tLS0tXG5cbiAgcHJpdmF0ZSBvbk11eEZyYW1lKGZyYW1lOiBNdXhGcmFtZSk6IHZvaWQge1xuICAgIHN3aXRjaCAoZnJhbWUudHlwZSkge1xuICAgICAgY2FzZSBcInNlc3Npb24vZXZlbnRcIjpcbiAgICAgICAgdGhpcy5vblNlc3Npb25FdmVudChmcmFtZS5zZXNzaW9uSWQsIGZyYW1lLmV2ZW50KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwic2Vzc2lvbi9xdWV1ZVwiOlxuICAgICAgICB0aGlzLnN0YXRlKGZyYW1lLnNlc3Npb25JZCkucXVldWVkID0gZnJhbWUuaXRlbXMubGVuZ3RoO1xuICAgICAgICBpZiAoZnJhbWUuaXRlbXMubGVuZ3RoID4gMCkgdGhpcy5jYW5jZWxQZW5kaW5nKGZyYW1lLnNlc3Npb25JZCwgXCLlh7rnjrDmjpLpmJ/mtojmga9cIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcInN0cmVhbS9lcnJvclwiOlxuICAgICAgICB0aGlzLmxvZyhgbXV4IHN0cmVhbS9lcnJvcjogJHtmcmFtZS5lcnJvci5jb2RlfSAke2ZyYW1lLmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgYnJlYWs7IC8vIHNlc3Npb24vc3Vic2NyaWJlZOOAgWFwcHJvdmFsLyrjgIFxdWVzdGlvbi8q44CBc2Vzc2lvbi9qb2Jz44CBc2Vzc2lvbi9wcm9qZWN0aW9uIOS4juacrOaPkuS7tuaXoOWFs1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgb25TZXNzaW9uRXZlbnQoc2Vzc2lvbklkOiBTZXNzaW9uSWQsIGV2ZW50OiBTZXNzaW9uRXZlbnQpOiB2b2lkIHtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuc3RhdGUoc2Vzc2lvbklkKTtcbiAgICBzd2l0Y2ggKGV2ZW50LnR5cGUpIHtcbiAgICAgIGNhc2UgXCJ0dXJuL3N0YXJ0XCI6XG4gICAgICAgIHN0YXRlLnJ1bm5pbmcgPSB0cnVlO1xuICAgICAgICB0aGlzLmNhbmNlbFBlbmRpbmcoc2Vzc2lvbklkLCBcIuWuv+S4u+iHquihjOW8gOWQr+aWsOWbnuWQiFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwidHVybi9lbmRcIjoge1xuICAgICAgICBzdGF0ZS5ydW5uaW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMuY2FuY2VsUGVuZGluZyhzZXNzaW9uSWQsIFwi5pS25Yiw5paw55qEIHR1cm4vZW5kXCIpO1xuICAgICAgICBjb25zdCByZWFzb24gPSBldmVudC5kYXRhLnJlYXNvbjtcbiAgICAgICAgaWYgKHJlYXNvbi5raW5kID09PSBcImNvbXBsZXRlZFwiKSB7XG4gICAgICAgICAgLy8g5oiQ5Yqf5Zue5ZCIOiDmgaLlpI3lgaXlurfnirbmgIFcbiAgICAgICAgICBzdGF0ZS5jb25zZWN1dGl2ZSA9IDA7XG4gICAgICAgIH0gZWxzZSBpZiAocmVhc29uLmtpbmQgPT09IFwiYWJvcnRlZFwiKSB7XG4gICAgICAgICAgLy8g55So5oi35Li75Yqo5YGc5q2iOiDkuI3oh6rliqjnu6fnu60sIOinhuS4uueUqOaIt+S7i+WFpVxuICAgICAgICAgIHN0YXRlLmNvbnNlY3V0aXZlID0gMDtcbiAgICAgICAgfSBlbHNlIGlmIChyZWFzb24ua2luZCA9PT0gXCJibG9ja2VkXCIpIHtcbiAgICAgICAgICAvLyDnrZbnlaXmi5Lnu506IOS4jeiHquWKqOe7p+e7rVxuICAgICAgICB9IGVsc2UgaWYgKGlzTm9uSHVtYW5SZWFzb24ocmVhc29uLmtpbmQpKSB7XG4gICAgICAgICAgdGhpcy5zY2hlZHVsZShzZXNzaW9uSWQsIGB0dXJuL2VuZDoke3JlYXNvbi5raW5kfWApO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSBcInVzZXIvbWVzc2FnZVwiOlxuICAgICAgICBpZiAoaXNPdXJFY2hvKHN0YXRlLCBldmVudCkpIGJyZWFrOyAvLyDmiJHku6zoh6rlt7HnmoTlm57mmL5cbiAgICAgICAgaWYgKGV2ZW50LmRhdGEuc291cmNlLmtpbmQgPT09IFwidXNlclwiKSB7XG4gICAgICAgICAgLy8g55So5oi35omL5Yqo5LuL5YWlXG4gICAgICAgICAgc3RhdGUuY29uc2VjdXRpdmUgPSAwO1xuICAgICAgICAgIHRoaXMuY2FuY2VsUGVuZGluZyhzZXNzaW9uSWQsIFwi55So5oi35omL5Yqo5Y+R6YCB5raI5oGvXCIpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gLS0tLS0tLS0tLSBob3N0IOW4pyAtLS0tLS0tLS0tXG5cbiAgcHJpdmF0ZSBvbkhvc3RGcmFtZShmcmFtZTogSG9zdEZyYW1lKTogdm9pZCB7XG4gICAgc3dpdGNoIChmcmFtZS50eXBlKSB7XG4gICAgICBjYXNlIFwiaG9zdC9zZXNzaW9uLXN0YXR1c1wiOlxuICAgICAgICB0aGlzLnN0YXRlKGZyYW1lLnNlc3Npb25JZCkucnVubmluZyA9IGZyYW1lLnJ1bm5pbmc7XG4gICAgICAgIGlmIChmcmFtZS5ydW5uaW5nKSB0aGlzLmNhbmNlbFBlbmRpbmcoZnJhbWUuc2Vzc2lvbklkLCBcIuWuv+S4u+aKpeWRiuS8muivneW8gOWni+i/kOihjFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFwiaG9zdC9zZXNzaW9uLWFkZGVkXCI6XG4gICAgICAgIHRoaXMuc3RhdGUoZnJhbWUuc2Vzc2lvbklkKS5zdWJhZ2VudCA9IGZyYW1lLnBhcmVudFNlc3Npb25JZCAhPT0gdW5kZWZpbmVkO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCJob3N0L2FnZW50LWVycm9yXCI6XG4gICAgICAgIGlmICh0aGlzLnN0YXRlKGZyYW1lLnNlc3Npb25JZCkuc3ViYWdlbnQpIGJyZWFrO1xuICAgICAgICB0aGlzLmxvZyhgaG9zdC9hZ2VudC1lcnJvcigke2ZyYW1lLnNlc3Npb25JZH0pOiAke2ZyYW1lLm1lc3NhZ2V9YCk7XG4gICAgICAgIHRoaXMuc2NoZWR1bGUoZnJhbWUuc2Vzc2lvbklkLCBcImhvc3QvYWdlbnQtZXJyb3JcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcImhvc3Qvc2Vzc2lvbi1yZW1vdmVkXCI6XG4gICAgICAgIHRoaXMuY2FuY2VsUGVuZGluZyhmcmFtZS5zZXNzaW9uSWQsIFwi5Lya6K+d5bey56e76ZmkXCIpO1xuICAgICAgICB0aGlzLnN0YXRlcy5kZWxldGUoZnJhbWUuc2Vzc2lvbklkKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyAtLS0tLS0tLS0tIOiwg+W6piAtLS0tLS0tLS0tXG5cbiAgcHJpdmF0ZSBzY2hlZHVsZShzZXNzaW9uSWQ6IFNlc3Npb25JZCwgcmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuc3RhdGUoc2Vzc2lvbklkKTtcbiAgICBpZiAoc3RhdGUuc3ViYWdlbnQpIHJldHVybjsgLy8g5a2Q5Luj55CG5Lya6K+d55Sx54i25Luj55CG5aSE55CGLCDkuI3miqLot5FcbiAgICBpZiAoc3RhdGUucGVuZGluZ1RpbWVyICE9PSB1bmRlZmluZWQpIHJldHVybjsgLy8g5bey5pyJ5b6F5Y+R6YCBXG4gICAgaWYgKERhdGUubm93KCkgLSBzdGF0ZS5sYXN0QXR0ZW1wdEF0IDwgdGhpcy5jb25maWcuY29vbGRvd25NcykgcmV0dXJuOyAvLyDlhrfljbTmnJ8o5ZCr5aSx6LSl5bCd6K+VKVxuICAgIGlmIChzdGF0ZS5jb25zZWN1dGl2ZSA+PSB0aGlzLmNvbmZpZy5tYXhDb25zZWN1dGl2ZSkge1xuICAgICAgdGhpcy5sb2coXG4gICAgICAgIGDot7Pov4cgJHtzZXNzaW9uSWR9KCR7cmVhc29ufSk6IOW3sui/nue7reiHquWKqOe7p+e7rSAke3N0YXRlLmNvbnNlY3V0aXZlfSDmrKEsIOetieW+heeUqOaIt+S7i+WFpeaIluaIkOWKn+WbnuWQiGAsXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoc3RhdGUucXVldWVkID4gMCkgcmV0dXJuOyAvLyDlt7LmnInmjpLpmJ/mtojmga8sIOWuv+S4u+S8muiHquihjOWUpOmGklxuICAgIGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoc3RhdGUucGVuZGluZ1RpbWVyICE9PSB0aW1lcikgcmV0dXJuO1xuICAgICAgc3RhdGUucGVuZGluZ1RpbWVyID0gdW5kZWZpbmVkO1xuICAgICAgdm9pZCB0aGlzLmZpcmUoc2Vzc2lvbklkLCByZWFzb24pO1xuICAgIH0sIHRoaXMuY29uZmlnLmdyYWNlTXMpO1xuICAgIHN0YXRlLnBlbmRpbmdUaW1lciA9IHRpbWVyO1xuICAgIHRoaXMubG9nKFxuICAgICAgYOajgOa1i+WIsOmdnuS6uuS4uuS4reaWrSAke3Nlc3Npb25JZH0oJHtyZWFzb259KSwgJHt0aGlzLmNvbmZpZy5ncmFjZU1zfW1zIOWQjuiHquWKqOWPkemAgeOAjCR7dGhpcy5jb25maWcuY29udGludWVUZXh0feOAjWAsXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgY2FuY2VsUGVuZGluZyhzZXNzaW9uSWQ6IFNlc3Npb25JZCwgd2h5OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuc3RhdGUoc2Vzc2lvbklkKTtcbiAgICBpZiAoc3RhdGUucGVuZGluZ1RpbWVyID09PSB1bmRlZmluZWQpIHJldHVybjtcbiAgICBjbGVhclRpbWVvdXQoc3RhdGUucGVuZGluZ1RpbWVyKTtcbiAgICBzdGF0ZS5wZW5kaW5nVGltZXIgPSB1bmRlZmluZWQ7XG4gICAgdGhpcy5sb2coYOWPlua2iCAke3Nlc3Npb25JZH0g55qE6Ieq5Yqo57un57utKCR7d2h5fSlgKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZmlyZShzZXNzaW9uSWQ6IFNlc3Npb25JZCwgcmVhc29uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5kaXNwb3NlZCkgcmV0dXJuO1xuICAgIGNvbnN0IHN0YXRlID0gdGhpcy5zdGF0ZShzZXNzaW9uSWQpO1xuICAgIC8vIOadg+WogSBydW5uaW5nIOajgOafpTog5LyY5YWI55SoIGhvc3Qg5binLCDmnKrnn6Xml7blm57pgIDliLAgc2Vzc2lvbi5saXN0XG4gICAgaWYgKHN0YXRlLnJ1bm5pbmcgPT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc3QgcnVubmluZyA9IGF3YWl0IHRoaXMucnVubmluZ1ZpYUxpc3Qoc2Vzc2lvbklkKTtcbiAgICAgIGlmIChydW5uaW5nID09PSB1bmRlZmluZWQgfHwgcnVubmluZykge1xuICAgICAgICB0aGlzLmxvZyhg6Lez6L+HICR7c2Vzc2lvbklkfTog5peg5rOV56Gu6K6k56m66ZeyKCR7cnVubmluZyA9PT0gdW5kZWZpbmVkID8gXCLmnKrnn6VcIiA6IFwi6L+Q6KGM5LitXCJ9KWApO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChzdGF0ZS5ydW5uaW5nKSB7XG4gICAgICB0aGlzLmxvZyhg6Lez6L+HICR7c2Vzc2lvbklkfTog5Lya6K+d5LuN5Zyo6L+Q6KGMYCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChzdGF0ZS5xdWV1ZWQgPiAwKSB7XG4gICAgICB0aGlzLmxvZyhg6Lez6L+HICR7c2Vzc2lvbklkfTog5bey5pyJ5o6S6Zif5raI5oGvYCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIOi3qOagh+etvumhteWGt+WNtFxuICAgIGlmIChEYXRlLm5vdygpIC0gcmVhZExhc3RTZW5kKHNlc3Npb25JZCkgPCB0aGlzLmNvbmZpZy5jb29sZG93bk1zKSB7XG4gICAgICB0aGlzLmxvZyhg6Lez6L+HICR7c2Vzc2lvbklkfTog5YW25LuW5qCH562+6aG15Yia5Y+R6YCB6L+HYCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghY2xhaW1TZW5kKHNlc3Npb25JZCkpIHtcbiAgICAgIHRoaXMubG9nKGDot7Pov4cgJHtzZXNzaW9uSWR9OiDlhbbku5bmoIfnrb7pobXmraPlnKjlj5HpgIFgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgdGV4dCA9IHRoaXMuY29uZmlnLmNvbnRpbnVlVGV4dDtcbiAgICBjb25zdCB6b25lID0gY2xpZW50VGltZVpvbmUoKTtcbiAgICBzdGF0ZS5sYXN0QXR0ZW1wdEF0ID0gRGF0ZS5ub3coKTsgLy8g5YWI6K6w6LSmOiDml6DorrrmiJDotKUsIOacrOasoeWwneivlemDvei/m+WFpeWGt+WNtFxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuYXBpLnNlc3Npb25zLnByb21wdCh7XG4gICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgbW9kZTogXCJxdWV1ZVwiLFxuICAgICAgICBjb250ZW50OiBbeyB0eXBlOiBcInRleHRcIiwgdGV4dCB9XSxcbiAgICAgICAgLi4uKHpvbmUgPT09IHVuZGVmaW5lZCA/IHt9IDogeyBjbGllbnRUaW1lWm9uZTogem9uZSB9KSxcbiAgICAgIH0pO1xuICAgICAgaWYgKHJlc3BvbnNlLnJlc3VsdC5vaykge1xuICAgICAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuICAgICAgICBzdGF0ZS5jb25zZWN1dGl2ZSArPSAxO1xuICAgICAgICBzdGF0ZS5sYXN0QXV0b0F0ID0gbm93O1xuICAgICAgICBzdGF0ZS5sYXN0U2VudFRleHQgPSB0ZXh0O1xuICAgICAgICB3cml0ZUxhc3RTZW5kKHNlc3Npb25JZCwgbm93KTtcbiAgICAgICAgdGhpcy5sb2coYOW3suiHquWKqOWPkemAgeOAjCR7dGV4dH3jgI3liLAgJHtzZXNzaW9uSWR9KCR7cmVhc29ufSksIOesrCAke3N0YXRlLmNvbnNlY3V0aXZlfSDmrKHov57nu61gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9nKFxuICAgICAgICAgIGDlj5HpgIHlpLHotKUgJHtzZXNzaW9uSWR9OiAke3Jlc3BvbnNlLnJlc3VsdC5lcnJvci5jb2RlfSAke3Jlc3BvbnNlLnJlc3VsdC5lcnJvci5tZXNzYWdlfWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRoaXMubG9nKGDlj5HpgIHlvILluLggJHtzZXNzaW9uSWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgcmVsZWFzZVNlbmQoc2Vzc2lvbklkKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1bm5pbmdWaWFMaXN0KHNlc3Npb25JZDogU2Vzc2lvbklkKTogUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5hcGkuc2Vzc2lvbnMubGlzdCh7fSk7XG4gICAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdC5vaykgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGl0ZW0gPSByZXNwb25zZS5yZXN1bHQudmFsdWUuaXRlbXMuZmluZChcbiAgICAgICAgKHN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5KSA9PiBzdW1tYXJ5LnNlc3Npb25JZCA9PT0gc2Vzc2lvbklkLFxuICAgICAgKTtcbiAgICAgIHJldHVybiBpdGVtID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBpdGVtLnJ1bm5pbmc7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuXG4gIC8vIC0tLS0tLS0tLS0g5ZCv5YqoL+mHjei/nuaJq+aPjyAtLS0tLS0tLS0tXG5cbiAgcHJpdmF0ZSBzY2hlZHVsZVJlY29ubmVjdFNjYW4oKTogdm9pZCB7XG4gICAgdGhpcy5yZWNvbm5lY3RTY2FucyArPSAxO1xuICAgIGNvbnN0IHNjYW4gPSB0aGlzLnJlY29ubmVjdFNjYW5zO1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaWYgKHNjYW4gIT09IHRoaXMucmVjb25uZWN0U2NhbnMgfHwgdGhpcy5kaXNwb3NlZCkgcmV0dXJuO1xuICAgICAgdm9pZCB0aGlzLnNjYW5Mb29wKDYsIHRoaXMuY29uZmlnLnJlY29ubmVjdFNjYW5EZWxheU1zKTtcbiAgICB9LCB0aGlzLmNvbmZpZy5yZWNvbm5lY3RTY2FuRGVsYXlNcyk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGJvb3RTY2FuTG9vcCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLnNjYW5Mb29wKEluZmluaXR5LCAzMDAwKTtcbiAgfVxuXG4gIC8qKiDlj43lpI3lsJ3or5Xmiavmj48sIOebtOWIsOaIkOWKnyjlrr/kuLvlsLHnu6op5oiW6L6+5Yiw5qyh5pWw5LiK6ZmQ44CCICovXG4gIHByaXZhdGUgYXN5bmMgc2Nhbkxvb3AoYXR0ZW1wdHM6IG51bWJlciwgZGVsYXlNczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZm9yIChsZXQgYXR0ZW1wdCA9IDA7IGF0dGVtcHQgPCBhdHRlbXB0cyAmJiAhdGhpcy5kaXNwb3NlZDsgYXR0ZW1wdCArPSAxKSB7XG4gICAgICB0cnkge1xuICAgICAgICBpZiAoYXdhaXQgdGhpcy5zY2FuSW50ZXJydXB0ZWQoKSkgcmV0dXJuO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKHRoaXMuZGlzcG9zZWQpIHJldHVybjtcbiAgICAgICAgLy8g5a6/5Li75pyq5bCx57uq5pe25q+PIDNzIOmHjeivlTsg5Y+q6IqC5rWB6K6w5b2V5pel5b+XLCDpgb/lhY3liLflsY/jgIJcbiAgICAgICAgaWYgKGF0dGVtcHQgJSAxMCA9PT0gMCkge1xuICAgICAgICAgIHRoaXMubG9nKFxuICAgICAgICAgICAgYOaJq+aPj+Wksei0pSgke2F0dGVtcHQgKyAxfS8ke2F0dGVtcHRzID09PSBJbmZpbml0eSA/IFwi4oieXCIgOiBhdHRlbXB0c30pOiAke1xuICAgICAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcilcbiAgICAgICAgICAgIH1gLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChhdHRlbXB0ICsgMSA8IGF0dGVtcHRzKSBhd2FpdCBzbGVlcChkZWxheU1zKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICog5omr5o+P5pyA6L+R5Lit5pat6L+H55qE5Lya6K+dOiDmnIDlkI7lm57lkIjku6XpnZ7kurrkuLrljp/lm6Dnu5PmnZ8sIOS4lOWFtuWQjuayoeacieaWsOWbnuWQiOaIlueUqOaIt+a2iOaBr+OAglxuICAgKiBAcmV0dXJucyDmmK/lkKbmiJDlip/lrozmiJDkuIDmrKHmiavmj48o5a6/5Li75bCx57uqKeOAglxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBzY2FuSW50ZXJydXB0ZWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLmFwaS5zZXNzaW9ucy5saXN0KHt9KTtcbiAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdC5vaykgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGl0ZW1zID0gcmVzcG9uc2UucmVzdWx0LnZhbHVlLml0ZW1zO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBpdGVtc1xuICAgICAgLmZpbHRlcigoc3VtbWFyeSkgPT4gIXN1bW1hcnkucnVubmluZyAmJiBzdW1tYXJ5LnBhcmVudFNlc3Npb25JZCA9PT0gdW5kZWZpbmVkKVxuICAgICAgLnNsaWNlKDAsIHRoaXMuY29uZmlnLnNjYW5MaW1pdCk7XG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBmb3IgKGNvbnN0IHN1bW1hcnkgb2YgY2FuZGlkYXRlcykge1xuICAgICAgaWYgKHRoaXMuZGlzcG9zZWQpIHJldHVybiB0cnVlO1xuICAgICAgY29uc3Qgc3RhdGUgPSB0aGlzLnN0YXRlKHN1bW1hcnkuc2Vzc2lvbklkKTtcbiAgICAgIGlmIChzdGF0ZS5wZW5kaW5nVGltZXIgIT09IHVuZGVmaW5lZCkgY29udGludWU7XG4gICAgICBpZiAoc3RhdGUuY29uc2VjdXRpdmUgPj0gdGhpcy5jb25maWcubWF4Q29uc2VjdXRpdmUpIGNvbnRpbnVlO1xuICAgICAgaWYgKG5vdyAtIHN0YXRlLmxhc3RBdHRlbXB0QXQgPCB0aGlzLmNvbmZpZy5jb29sZG93bk1zKSBjb250aW51ZTtcbiAgICAgIGxldCBldmVudHM7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBwYWdlID0gYXdhaXQgdGhpcy5hcGkuc2Vzc2lvbnMuaGlzdG9yeSh7XG4gICAgICAgICAgc2Vzc2lvbklkOiBzdW1tYXJ5LnNlc3Npb25JZCxcbiAgICAgICAgICBtYXhNZXNzYWdlczogMzAsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoIXBhZ2UucmVzdWx0Lm9rKSBjb250aW51ZTtcbiAgICAgICAgZXZlbnRzID0gcGFnZS5yZXN1bHQudmFsdWUuZXZlbnRzO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIGNvbnRpbnVlOyAvLyDkvJror53lj6/og73liJrooqvnp7vpmaRcbiAgICAgIH1cbiAgICAgIC8vIOS7juWwvumDqOaJvuacgOWQjuS4gOS4qiB0dXJuL2VuZCjlnKjliIbmlK/lhoXlrozmiJDmlLbnqoQpXG4gICAgICBsZXQgbGFzdEVuZDogU2Vzc2lvbkV2ZW50PFwidHVybi9lbmRcIj4gfCB1bmRlZmluZWQ7XG4gICAgICBmb3IgKGxldCBpID0gZXZlbnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaSAtPSAxKSB7XG4gICAgICAgIGNvbnN0IGV2ZW50ID0gZXZlbnRzW2ldPy5ldmVudDtcbiAgICAgICAgaWYgKGV2ZW50ICE9PSB1bmRlZmluZWQgJiYgZXZlbnQudHlwZSA9PT0gXCJ0dXJuL2VuZFwiKSB7XG4gICAgICAgICAgbGFzdEVuZCA9IGV2ZW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAobGFzdEVuZCA9PT0gdW5kZWZpbmVkKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHJlYXNvbiA9IGxhc3RFbmQuZGF0YS5yZWFzb247XG4gICAgICBpZiAoIWlzTm9uSHVtYW5SZWFzb24ocmVhc29uLmtpbmQpKSBjb250aW51ZTtcbiAgICAgIGlmIChsYXN0RW5kLnRpbWUgPCBub3cgLSB0aGlzLmNvbmZpZy5mcmVzaE1zKSBjb250aW51ZTsgLy8g5aSq5LmF6L+cLCDkuI3nv7vml6fotKZcbiAgICAgIC8vIOivpSB0dXJuL2VuZCDkuYvlkI7kuI3og73mnInmlrDlm57lkIjmiJbnlKjmiLfmtojmga8o6K+05piO5bey6KKr5aSE55CGKVxuICAgICAgbGV0IHN1cGVyc2VkZWQgPSBmYWxzZTtcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZXZlbnRzKSB7XG4gICAgICAgIGNvbnN0IGV2ZW50ID0gZW50cnkuZXZlbnQ7XG4gICAgICAgIGlmIChldmVudC5zZXEgPD0gbGFzdEVuZC5zZXEpIGNvbnRpbnVlO1xuICAgICAgICBpZiAoZXZlbnQudHlwZSA9PT0gXCJ0dXJuL3N0YXJ0XCIpIHN1cGVyc2VkZWQgPSB0cnVlO1xuICAgICAgICBpZiAoZXZlbnQudHlwZSA9PT0gXCJ1c2VyL21lc3NhZ2VcIiAmJiBldmVudC5kYXRhLnNvdXJjZS5raW5kID09PSBcInVzZXJcIikgc3VwZXJzZWRlZCA9IHRydWU7XG4gICAgICAgIGlmIChzdXBlcnNlZGVkKSBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmIChzdXBlcnNlZGVkKSBjb250aW51ZTtcbiAgICAgIHRoaXMubG9nKGDmiavmj4/lj5HnjrDkuK3mlq0gJHtzdW1tYXJ5LnNlc3Npb25JZH0odHVybi9lbmQ6JHtyZWFzb24ua2luZH0pLCDlronmjpLoh6rliqjnu6fnu61gKTtcbiAgICAgIHRoaXMuc2NoZWR1bGUoc3VtbWFyeS5zZXNzaW9uSWQsIGBzY2FuOnR1cm4vZW5kOiR7cmVhc29uLmtpbmR9YCk7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG59XG5cbi8vIC0tLS0tLS0tLS0g5o+S5Lu25YWl5Y+jIC0tLS0tLS0tLS1cblxuLyoqIOW9k+WJjSBydW5uZXIoSE1SIOmHjei9veaXtuWFiOmUgOavgeaXp+eahOWGjeW7uuaWsOeahCnjgIIgKi9cbmxldCBjdXJyZW50OiBBdXRvQ29udGludWVSdW5uZXIgfCBudWxsID0gbnVsbDtcblxuLyoqIOaJgOmcgOacjeWKoTog6L+e5o6l5Y+l5p+EKGN0eC5jb25uZWN0aW9uLmFwaSnjgIIgKi9cbmV4cG9ydCBjb25zdCBpbmplY3QgPSBbXCJjb25uZWN0aW9uXCJdO1xuXG4vKipcbiAqIOaPkuS7tuS4u+S9kzog5oyC6L295LqL5Lu255uR5ZCsLCDlvIDlp4voh6rliqjnu63ot5HjgIJcbiAqIEBwYXJhbSBjdHggLSDlrqLmiLfnq6/moLnkuIrkuIvmlofjgIJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5KGN0eDogQ2xpZW50Q29udGV4dCk6IHZvaWQge1xuICBjdXJyZW50Py5kaXNwb3NlKCk7XG4gIGN1cnJlbnQgPSBuZXcgQXV0b0NvbnRpbnVlUnVubmVyKGN0eCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQWlFQSxJQUFNLGlCQUF5QjtBQUFBLEVBQzdCLGNBQWM7QUFBQSxFQUNkLFNBQVM7QUFBQSxFQUNULFlBQVk7QUFBQSxFQUNaLGdCQUFnQjtBQUFBLEVBQ2hCLFlBQVk7QUFBQSxFQUNaLFdBQVc7QUFBQSxFQUNYLFNBQVMsS0FBSyxLQUFLO0FBQUEsRUFDbkIsc0JBQXNCO0FBQUEsRUFDdEIsb0JBQW9CO0FBQUEsRUFDcEIsU0FBUztBQUNYO0FBRUEsU0FBUyxhQUFxQjtBQUM1QixRQUFNLFNBQWlCLEVBQUUsR0FBRyxlQUFlO0FBQzNDLE1BQUk7QUFDRixVQUFNLE1BQU0sYUFBYSxR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

		return module.exports;
	}
});
