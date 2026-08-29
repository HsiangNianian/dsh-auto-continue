var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/index.ts
import z2 from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";

// ../../dsh-desktop-me/node_modules/@deepseek-ai/dsh-llm/lib/index.js
import { createRequire } from "node:module";

// ../../dsh-desktop-me/node_modules/@deepseek-ai/dsh-typert-protocol/lib/index.js
import { Service } from "@deepseek-ai/cordis";
var TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
function isTypertRemoteSegment(value) {
  return value !== "." && value !== ".." && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
var TypertRemoteFailure = class extends Error {
  /**
  * Wrap one business rejection for transport without changing its code or details.
  * @param failure - business failure returned unchanged to the caller.
  */
  constructor(failure) {
    super(failure.message);
    /** Stable caller-facing failure payload. */
    __publicField(this, "failure");
    this.name = "TypertRemoteFailure";
    this.failure = failure;
  }
};
var markers = /* @__PURE__ */ new WeakMap();
function bindTypertRemote(service, serviceKey, options = {}) {
  validateName("service key", serviceKey);
  const namespace = options.namespace ?? serviceKey;
  validateName("namespace", namespace);
  return Object.freeze({
    service,
    serviceKey,
    namespace
  });
}
var TypertRemoteService = class extends Service {
  /**
  * Register the Service and bind the same key to Typert Gateway.
  * @param ctx - owning Cordis Context.
  * @param serviceKey - exact Cordis service key and default wire namespace.
  * @param options - optional distinct wire namespace.
  */
  constructor(ctx, serviceKey, options = {}) {
    super(ctx, serviceKey);
    /** Visible binding consumed by the Gateway's source-mode discovery. */
    __publicField(this, "typertRemote");
    this.typertRemote = bindTypertRemote(this, this.name, options);
  }
};
function Remote(methodExportOrOptions, context) {
  if (typeof methodExportOrOptions === "string") {
    validateName("Remote export name", methodExportOrOptions);
    return remoteDecorator({ kind: "direct" }, void 0, methodExportOrOptions);
  }
  if (typeof methodExportOrOptions === "object") {
    if (remoteOptionMode(methodExportOrOptions) !== "stream" || Reflect.ownKeys(methodExportOrOptions).length !== 1) throw new TypeError('typert-protocol: Remote options must contain exactly mode: "stream"');
    return remoteDecorator({ kind: "direct" }, "stream");
  }
  if (context === void 0) throw new TypeError("typert-protocol: Remote decorator context is missing");
  addMarkerInitializer(context, { kind: "direct" });
}
function remoteOptionMode(options) {
  return Reflect.get(options, "mode");
}
function remoteDecorator(invocation, mode, exportName) {
  return function(_method, context) {
    addMarkerInitializer(context, invocation, mode, exportName);
  };
}
function addMarkerInitializer(context, invocation, mode, exportName) {
  if (context.private || context.static || typeof context.name !== "string") throw new TypeError("typert-protocol: Remote decorators require a public instance method with a string name");
  const method = context.name;
  context.addInitializer(function() {
    const prototype = Object.getPrototypeOf(this);
    if (prototype === null) throw new TypeError(`typert-protocol: cannot mark Remote method "${method}" on an object without a prototype`);
    mark(prototype, method, invocation, mode, exportName);
  });
}
function mark(prototype, method, invocation, mode, exportName) {
  let table = markers.get(prototype);
  if (table === void 0) {
    table = /* @__PURE__ */ new Map();
    markers.set(prototype, table);
  }
  const marker = {
    ...exportName === void 0 || exportName === method ? {} : { exportName },
    ...mode === void 0 ? {} : { mode },
    invocation: Object.freeze(invocation)
  };
  const current = table.get(method);
  if (current !== void 0) {
    if (current.exportName === marker.exportName && current.mode === marker.mode && sameInvocation(current.invocation, invocation)) return;
    throw new Error(`typert-protocol: Remote method "${method}" has conflicting invocation markers`);
  }
  table.set(method, Object.freeze(marker));
}
function sameInvocation(left, right) {
  return left.kind === right.kind && (left.kind === "direct" || right.kind === "context" && left.context === right.context);
}
function validateName(subject, value) {
  if (!isTypertRemoteSegment(value)) throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`);
}

// ../../dsh-desktop-me/node_modules/@deepseek-ai/dsh-util-crypto/lib/index.js
function randomUUID() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (byte, index) => {
    return (index === 6 ? byte & 15 | 64 : index === 8 ? byte & 63 | 128 : byte).toString(16).padStart(2, "0");
  }).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ../../dsh-desktop-me/node_modules/@deepseek-ai/dsh-llm/lib/index.js
import z from "@deepseek-ai/schemastery";

// ../../dsh-desktop-me/node_modules/@deepseek-ai/dsh-timeout/lib/index.js
var MAX_TIMER_DELAY_MS = 2147483647;

// ../../dsh-desktop-me/node_modules/@deepseek-ai/dsh-llm/lib/index.js
function MessageId(id) {
  return id;
}
function callConfigEquals(a, b) {
  if (a.provider !== b.provider || a.model !== b.model || a.reasoningEffort !== b.reasoningEffort || a.temperature !== b.temperature || a.maxTokens !== b.maxTokens) return false;
  if (a.stop === void 0 || b.stop === void 0) return a.stop === b.stop;
  return a.stop.length === b.stop.length && a.stop.every((s, i) => s === b.stop?.[i]);
}
function deepFreeze(value) {
  const seen = /* @__PURE__ */ new WeakSet();
  const pending = [{
    kind: "visit",
    node: value
  }];
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === void 0) continue;
    if (task.kind === "property") {
      pending.push({
        kind: "visit",
        node: task.source[task.key]
      });
      continue;
    }
    const node = task.node;
    if (node === null || typeof node !== "object") continue;
    if (node instanceof AbortSignal) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    Object.freeze(node);
    const keys = Object.keys(node);
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) continue;
      pending.push({
        kind: "property",
        source: node,
        key
      });
    }
  }
  return value;
}
function freezeMessage(message) {
  return deepFreeze(structuredClone(message));
}
function createMessage(input) {
  return freezeMessage({
    ...input,
    id: MessageId(randomUUID())
  });
}
function createUserMessage(input) {
  return createMessage({
    ...input,
    role: "user"
  });
}
var HarnessError = class extends Error {
  constructor(message, code, options) {
    super(message, options);
    /** Stable machine-routable failure class (e.g. `RATE_LIMIT`); route on this, never by parsing `message`. */
    __publicField(this, "code");
    this.code = code;
    this.name = new.target.name;
  }
};
var EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";
var STRUCTURED_CONTEXT_OVERFLOW = new RegExp(String.raw`(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-]` + String.raw`(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])`, "i");
var TOO_LARGE_FOR_CONTEXT = new RegExp(String.raw`\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?` + String.raw`too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?` + String.raw`(?:model(?:'s)?\s+)?context(?:\s+window)?\b`, "i");
var EXCEEDS_MODEL_CONTEXT = new RegExp(String.raw`\b(?:input|prompt|request|messages?)\b.{0,40}` + String.raw`\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}` + String.raw`\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b`, "i");
var DEFAULT_MAX_RETRIES = 5;
var DEFAULT_INITIAL_DELAY_MS = 500;
var DEFAULT_MAX_DELAY_MS = 1e4;
var DEFAULT_JITTER_RATIO = 0.1;
var DEFAULT_RETRYABLE_CODES = Object.freeze([
  EMPTY_RESPONSE_CODE,
  "RATE_LIMIT",
  "SERVER",
  "TIMEOUT",
  "TRANSPORT"
]);
var backoffSchema = z.object({
  initialDelayMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_INITIAL_DELAY_MS),
  maxDelayMs: z.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_MAX_DELAY_MS),
  jitterRatio: z.number().min(0).max(1).default(DEFAULT_JITTER_RATIO)
});
var normalPolicySchema = z.object({
  mode: z.const("normal").required(),
  maxRetries: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_RETRIES),
  retryableCodes: z.array(z.string()).default([...DEFAULT_RETRYABLE_CODES]),
  backoff: backoffSchema
});
var alwaysPolicySchema = z.object({
  mode: z.const("always").required(),
  backoff: backoffSchema
});
var RetryPolicySchema = z.union([normalPolicySchema, alwaysPolicySchema]);
var NORMAL_POLICY_KEYS = /* @__PURE__ */ new Set([
  "mode",
  "maxRetries",
  "retryableCodes",
  "backoff"
]);
var ALWAYS_POLICY_KEYS = /* @__PURE__ */ new Set([
  "mode",
  "maxRetries",
  "retryableCodes",
  "backoff"
]);
var BACKOFF_KEYS = /* @__PURE__ */ new Set([
  "initialDelayMs",
  "maxDelayMs",
  "jitterRatio"
]);
function validateKeys(value, allowed, path) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}: unknown key "${key}"`);
}
function resolveBackoff(config, path) {
  if (config !== void 0) validateKeys(config, BACKOFF_KEYS, path);
  const initialDelayMs = config?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const jitterRatio = config?.jitterRatio ?? DEFAULT_JITTER_RATIO;
  if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0 || initialDelayMs > MAX_TIMER_DELAY_MS) throw new Error(`${path}.initialDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
  if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0 || maxDelayMs > MAX_TIMER_DELAY_MS) throw new Error(`${path}.maxDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
  if (initialDelayMs > maxDelayMs) throw new Error(`${path}.initialDelayMs must be less than or equal to maxDelayMs`);
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) throw new Error(`${path}.jitterRatio must be between 0 and 1`);
  return Object.freeze({
    initialDelayMs,
    maxDelayMs,
    jitterRatio
  });
}
function resolveRetryPolicy(config, path) {
  if (config === void 0) return Object.freeze({
    mode: "normal",
    maxRetries: DEFAULT_MAX_RETRIES,
    retryableCodes: DEFAULT_RETRYABLE_CODES,
    ...resolveBackoff(void 0, `${path}.backoff`)
  });
  switch (config.mode) {
    case "normal": {
      validateKeys(config, NORMAL_POLICY_KEYS, path);
      const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
      const retryableCodes = config.retryableCodes ?? [...DEFAULT_RETRYABLE_CODES];
      if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) throw new Error(`${path}.maxRetries must be a non-negative safe integer`);
      if (retryableCodes.length === 0) throw new Error(`${path}.retryableCodes must not be empty`);
      if (retryableCodes.some((code) => typeof code !== "string" || code.length === 0)) throw new Error(`${path}.retryableCodes must contain only non-empty strings`);
      if (new Set(retryableCodes).size !== retryableCodes.length) throw new Error(`${path}.retryableCodes must not contain duplicates`);
      return Object.freeze({
        mode: "normal",
        maxRetries,
        retryableCodes: Object.freeze([...retryableCodes]),
        ...resolveBackoff(config.backoff, `${path}.backoff`)
      });
    }
    case "always":
      validateKeys(config, ALWAYS_POLICY_KEYS, path);
      return Object.freeze({
        mode: "always",
        ...resolveBackoff(config.backoff, `${path}.backoff`)
      });
    default:
      throw new Error(`${path}.mode must be "normal" or "always"`);
  }
}
function normalizeLlmFailure(value) {
  const error = value instanceof Error ? value : new HarnessError(thrownMessage(value), "UNKNOWN", { cause: value });
  const carried = ownFailureSnapshot(error);
  if (carried !== void 0 && carried.code === ownErrorCode(error)) return carried;
  return Object.freeze({
    message: errorMessage(error),
    code: harnessErrorCode(error)
  });
}
function thrownMessage(value) {
  try {
    const message = String(value);
    return message.length > 0 ? message : "LLM adapter failed";
  } catch (_hostileThrownValue) {
    return "LLM adapter failed";
  }
}
function ownErrorCode(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor !== void 0 && "value" in descriptor ? descriptor.value : void 0;
  } catch (_sdkPropertyTrap) {
    return;
  }
}
function ownFailureSnapshot(error) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "failure");
    return descriptor !== void 0 && "value" in descriptor ? failureSnapshot(descriptor.value) : void 0;
  } catch (_sdkPropertyTrap) {
    return;
  }
}
function failureSnapshot(value) {
  if (typeof value !== "object" || value === null) return void 0;
  try {
    const candidate = value;
    const message = candidate.message;
    const code = candidate.code;
    const status = candidate.status;
    const providerRetryAfterMs = candidate.providerRetryAfterMs;
    const requestId = candidate.requestId;
    if (typeof message !== "string" || message.length === 0 || typeof code !== "string" || code.length === 0 || status !== void 0 && (!Number.isInteger(status) || status < 100 || status > 599) || providerRetryAfterMs !== void 0 && (!Number.isFinite(providerRetryAfterMs) || providerRetryAfterMs <= 0) || requestId !== void 0 && (typeof requestId !== "string" || requestId.length === 0)) return void 0;
    return Object.freeze({
      message,
      code,
      ...status === void 0 ? {} : { status },
      ...providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs },
      ...requestId === void 0 ? {} : { requestId }
    });
  } catch (_sdkFailureGetter) {
    return;
  }
}
function errorMessage(error) {
  try {
    const message = error.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch (_sdkMessageGetter) {
  }
  return "LLM adapter failed";
}
function harnessErrorCode(error) {
  return error instanceof HarnessError ? error.code : "UNKNOWN";
}
function textOnlyImageText(ref) {
  return `[image omitted because this model accepts text only; attachment sha256:${String(ref.attachmentId).slice(7, 15)}]`;
}
function contentHasImage(content) {
  return content.some((block) => block.type === "image" || block.type === "tool-result" && contentHasImage(block.content));
}
function replaceImagesForTextModel(blocks) {
  let next;
  for (const [index, block] of blocks.entries()) {
    if (block.type === "image") {
      next ?? (next = blocks.slice(0, index));
      next.push({
        type: "text",
        text: textOnlyImageText(block.attachment)
      });
      continue;
    }
    if (block.type === "tool-result") {
      const content = replaceImagesForTextModel(block.content);
      if (content !== block.content) {
        next ?? (next = blocks.slice(0, index));
        next.push({
          ...block,
          content
        });
        continue;
      }
    }
    next?.push(block);
  }
  return next ?? blocks;
}
function projectImagesForTextModel(messages) {
  if (!messages.some((message) => contentHasImage(message.content))) return messages;
  return messages.map((message) => {
    const content = replaceImagesForTextModel(message.content);
    return content === message.content ? message : {
      ...message,
      content
    };
  });
}
var { version } = createRequire(import.meta.url)("../package.json");
var __runInitializers = function(thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) {
    if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
    return f;
  }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
    var context = {};
    for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
    for (var p in contextIn.access) context.access[p] = contextIn.access[p];
    context.addInitializer = function(f) {
      if (done) throw new TypeError("Cannot add initializers after decoration has completed");
      extraInitializers.push(accept(f || null));
    };
    var result = (0, decorators[i])(kind === "accessor" ? {
      get: descriptor.get,
      set: descriptor.set
    } : descriptor[key], context);
    if (kind === "accessor") {
      if (result === void 0) continue;
      if (result === null || typeof result !== "object") throw new TypeError("Object expected");
      if (_ = accept(result.get)) descriptor.get = _;
      if (_ = accept(result.set)) descriptor.set = _;
      if (_ = accept(result.init)) initializers.unshift(_);
    } else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
    else descriptor[key] = _;
  }
  if (target) Object.defineProperty(target, contextIn.name, descriptor);
  done = true;
};
var LlmError = class extends HarnessError {
  /**
  * @param message - non-empty human-readable failure summary.
  * @param code - non-empty stable provider-neutral machine code.
  * @param options - optional cause and validated serializable provider facts.
  */
  constructor(message, code, options) {
    if (typeof message !== "string" || message.length === 0) throw new Error("LlmError message must be a non-empty string");
    if (typeof code !== "string" || code.length === 0) throw new Error("LlmError code must be a non-empty string");
    if (options?.status !== void 0 && (!Number.isInteger(options.status) || options.status < 100 || options.status > 599)) throw new Error("LlmError status must be an integer from 100 through 599");
    if (options?.providerRetryAfterMs !== void 0 && (!Number.isFinite(options.providerRetryAfterMs) || options.providerRetryAfterMs <= 0)) throw new Error("LlmError providerRetryAfterMs must be a positive finite number");
    if (options?.requestId !== void 0 && (typeof options.requestId !== "string" || options.requestId.length === 0)) throw new Error("LlmError requestId must be a non-empty string");
    super(message, code, options);
    /** Serializable facts retained beside this live Error. */
    __publicField(this, "failure");
    this.name = "LlmError";
    this.failure = Object.freeze({
      message,
      code,
      ...options?.status === void 0 ? {} : { status: options.status },
      ...options?.providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs: options.providerRetryAfterMs },
      ...options?.requestId === void 0 ? {} : { requestId: options.requestId }
    });
  }
};
var LlmRuntime = (() => {
  var _a;
  let _classSuper = TypertRemoteService;
  let _instanceExtraInitializers = [];
  let _listProviders_decorators;
  let _listConfigurableProviders_decorators;
  let _remoteDiscoverModels_decorators;
  return _a = class extends _classSuper {
    constructor(ctx) {
      super(ctx, "llm");
      __publicField(this, "adapters", (__runInitializers(this, _instanceExtraInitializers), /* @__PURE__ */ new Map()));
      __publicField(this, "directory", /* @__PURE__ */ new Map());
      __publicField(this, "discoveries", /* @__PURE__ */ new Map());
    }
    /** Notify topology observers without letting one broken listener veto the commit. */
    emitAdaptersUpdated() {
      let invariantFailure;
      for (const listener of this.ctx.events.dispatch("emit", ["llm/adapters-updated"])) try {
        const returned = listener();
        if (returned != null && typeof returned.then === "function") Promise.resolve(returned).then(void 0, (error) => {
          this.warnAdaptersListenerFailure(error);
        });
      } catch (error) {
        if (error?.code === "INVARIANT") {
          invariantFailure ?? (invariantFailure = error);
          continue;
        }
        this.warnAdaptersListenerFailure(error);
      }
      if (invariantFailure !== void 0) throw invariantFailure;
    }
    /** Contained-listener diagnostic shared by the sync and async failure paths. */
    warnAdaptersListenerFailure(error) {
      this.ctx.logger.warn("llm: an llm/adapters-updated listener failed");
      this.ctx.logger.warn(error);
    }
    /**
    * Register an adapter for the given provider routes. Throws `LlmError` with code
    * `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
    * Disposed with the fiber.
    * @param providers - every provider route this adapter should serve.
    * @param adapter - the adapter that streams calls for those providers.
    * @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
    */
    registerAdapter(providers, adapter) {
      const owned = /* @__PURE__ */ new Set();
      let released = false;
      const dispose = this.ctx.effect(function* () {
        if (providers.length === 0) throw new LlmError("an adapter must register at least one provider", "INVALID_ADAPTER");
        this.commitRoutes(owned, this.prepareRoutes(providers, adapter, owned));
        yield () => {
          released = true;
          for (const provider of owned) this.adapters.delete(provider);
          owned.clear();
          this.emitAdaptersUpdated();
        };
      }.bind(this), "llm.registerAdapter()");
      const handle = (() => void dispose());
      handle.replace = (next) => {
        if (released) throw new LlmError("a disposed adapter registration cannot replace its routes", "REGISTRATION_DISPOSED");
        this.commitRoutes(owned, this.prepareRoutes(next, adapter, owned));
      };
      return handle;
    }
    /**
    * Validate one candidate route set for `adapter`, treating routes this
    * registration already holds as available. Nothing is mutated: a rejected
    * candidate leaves the registry exactly as it was.
    */
    prepareRoutes(providers, adapter, owned) {
      const unique = /* @__PURE__ */ new Set();
      const registrations = [];
      for (const provider of providers) {
        if (provider.length === 0) throw new LlmError("adapter provider names must be non-empty", "INVALID_ADAPTER");
        if (unique.has(provider) || this.adapters.has(provider) && !owned.has(provider)) throw new LlmError(`an adapter for provider "${provider}" is already registered`, "DUPLICATE_ADAPTER");
        const info = adapter.providerInfo(provider);
        if (typeof info.id !== "string" || info.id !== provider || typeof info.name !== "string" || info.name.length === 0) throw new LlmError(`adapter metadata for provider "${provider}" must preserve its id and have a non-empty name`, "INVALID_ADAPTER");
        unique.add(provider);
        const retryPolicy = adapter.providerRetryPolicy(provider) ?? resolveRetryPolicy(void 0, `llm: provider "${provider}" retryPolicy`);
        registrations.push({
          adapter,
          provider: {
            id: info.id,
            name: info.name
          },
          retryPolicy
        });
      }
      return registrations;
    }
    /**
    * Swap this registration's routes for the prepared ones in one synchronous
    * section, so no observer can see the registry between the release and the
    * re-registration. The route set's one mutation point is also where
    * `llm/adapters-updated` is published, so a `replace` announces itself
    * exactly like a first registration.
    */
    commitRoutes(owned, registrations) {
      for (const provider of owned) this.adapters.delete(provider);
      owned.clear();
      for (const registration of registrations) {
        this.adapters.set(registration.provider.id, registration);
        owned.add(registration.provider.id);
      }
      this.emitAdaptersUpdated();
    }
    /**
    * Describe provider routes with a registered adapter.
    * @returns detached provider metadata in registration order.
    */
    listProviders() {
      return [...this.adapters.values()].map(({ provider }) => ({ ...provider }));
    }
    /**
    * Declare provider routes an adapter plugin can activate through
    * configuration. Registration is all-or-nothing: an empty list, invalid
    * entry, or a provider already declared by any registration throws
    * `LlmError` without registering the rest. Disposed with the fiber.
    * @param entries - every configurable provider this plugin owns.
    * @returns a handle that withdraws all of them, and can atomically replace them.
    */
    registerConfigurableProviders(entries) {
      let held = [];
      let disposed = false;
      const commit = (candidates) => {
        const detached = [];
        const own = new Set(held.map((entry) => entry.provider));
        for (const entry of candidates) {
          if (entry.provider.length === 0 || entry.displayName.length === 0 || entry.settingsNs.length === 0) throw new LlmError("configurable providers need a non-empty provider, displayName, and settingsNs", "INVALID_DIRECTORY");
          if (entry.settingsPath.some((segment) => segment.length === 0)) throw new LlmError(`configurable provider "${entry.provider}" has an empty settingsPath segment`, "INVALID_DIRECTORY");
          if (this.directory.has(entry.provider) && !own.has(entry.provider) || detached.some((seen) => seen.provider === entry.provider)) throw new LlmError(`configurable provider "${entry.provider}" is already declared`, "DUPLICATE_DIRECTORY");
          detached.push({
            ...entry,
            settingsPath: [...entry.settingsPath]
          });
        }
        for (const entry of held) this.directory.delete(entry.provider);
        for (const entry of detached) this.directory.set(entry.provider, entry);
        held = detached;
        this.emitAdaptersUpdated();
      };
      const dispose = this.ctx.effect(function* () {
        if (entries.length === 0) throw new LlmError("a configurable-provider registration must declare at least one provider", "INVALID_DIRECTORY");
        commit(entries);
        yield () => {
          disposed = true;
          for (const entry of held) this.directory.delete(entry.provider);
          held = [];
          this.emitAdaptersUpdated();
        };
      }.bind(this), "llm.registerConfigurableProviders()");
      const handle = (() => void dispose());
      handle.replace = (next) => {
        if (disposed) throw new LlmError("this configurable-provider registration was disposed", "REGISTRATION_DISPOSED");
        commit(next);
      };
      return handle;
    }
    /**
    * List every declared configurable provider, registered or dormant.
    * @returns detached directory entries in declaration order.
    */
    listConfigurableProviders() {
      return [...this.directory.values()].map((entry) => ({
        ...entry,
        settingsPath: [...entry.settingsPath]
      }));
    }
    /**
    * Offer to interrogate provider endpoints on behalf of the settings
    * namespace this plugin owns. The namespace is the key because that is what
    * a configuration surface already holds from the configurable-provider
    * directory, and because a provider being *added* has no route to name yet.
    * Disposed with the fiber.
    * @param settingsNs - the namespace whose profiles this discovery serves.
    * @param discover - interrogates one endpoint and must honor the supplied signal.
    * @returns the disposer that withdraws the offer.
    */
    registerModelDiscovery(settingsNs, discover) {
      const dispose = this.ctx.effect(function* () {
        if (settingsNs.length === 0) throw new LlmError("model discovery needs a non-empty settings namespace", "INVALID_DISCOVERY");
        if (this.discoveries.has(settingsNs)) throw new LlmError(`model discovery for "${settingsNs}" is already registered`, "DUPLICATE_DISCOVERY");
        this.discoveries.set(settingsNs, discover);
        yield () => {
          this.discoveries.delete(settingsNs);
        };
      }.bind(this), "llm.registerModelDiscovery()");
      return () => void dispose();
    }
    /**
    * Interrogate one provider endpoint for the models it advertises. The
    * request describes a draft, not a stored route, so nothing here reads or
    * writes settings or credentials — the caller owns both, and the reply is
    * candidate metadata a surface may offer for adoption.
    * @param settingsNs - namespace whose registered discovery serves this draft.
    * @param request - the endpoint, protocol, and one-shot credential to use.
    * @param signal - caller cancellation.
    * @returns the advertised models, deduplicated in endpoint order.
    */
    async discoverModels(settingsNs, request, signal) {
      const discover = this.discoveries.get(settingsNs);
      if (discover === void 0) throw new LlmError(`no model discovery is registered for "${settingsNs}"`, "NO_DISCOVERY");
      if ((request.provider ?? "").length === 0 && (request.baseURL ?? "").length === 0) throw new LlmError("model discovery needs a provider route or a baseURL", "INVALID_DISCOVERY");
      const discovered = signal === void 0 ? await discover(request) : await discover(request, signal);
      const seen = /* @__PURE__ */ new Set();
      const models = [];
      for (const model of discovered) {
        if (typeof model.id !== "string" || model.id.length === 0 || seen.has(model.id)) continue;
        seen.add(model.id);
        models.push({
          id: model.id,
          ...model.name === void 0 ? {} : { name: model.name },
          ...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
          ...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens }
        });
      }
      return models;
    }
    /**
    * Remote adapter for one draft provider interrogation.
    * @param settingsNs - namespace whose registered discovery serves this draft.
    * @param request - endpoint, protocol, and one-shot credential to use.
    * @param signal - caller cancellation supplied by the Remote carrier.
    * @returns advertised models in endpoint order.
    * @throws TypertRemoteFailure with `model-discovery-failed` when discovery refuses or fails.
    */
    async remoteDiscoverModels(settingsNs, request, signal) {
      try {
        return await this.discoverModels(settingsNs, request, signal);
      } catch (error) {
        throw new TypertRemoteFailure({
          code: "model-discovery-failed",
          message: error instanceof Error ? error.message : String(error),
          details: {
            settingsNs,
            ...request.baseURL === void 0 ? {} : { baseURL: request.baseURL }
          }
        });
      }
    }
    /**
    * Resolve the retry policy captured when one provider route was registered.
    * @param provider - registered provider route to inspect.
    * @returns the provider-owned policy, with normal defaults already resolved.
    */
    providerRetryPolicy(provider) {
      return this.registration(provider).retryPolicy;
    }
    /**
    * Resolve provider-side request-image pricing for one exact route, or
    * `undefined` when the provider is unregistered or declares none. Unknown
    * providers degrade to `undefined` rather than throwing because callers
    * price durable history whose route may no longer be mounted.
    * @param provider - provider route named by a request header.
    * @param model - exact model id named by the same header.
    * @returns the owning adapter's image pricing for the route, when declared.
    */
    imageRequestPricing(provider, model) {
      return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model);
    }
    /** Detach typed adapter-owned modality metadata. */
    detachedModalities(modalities) {
      return modalities === void 0 ? void 0 : [...modalities];
    }
    /**
    * Discover models advertised by one registered provider. Catalog membership
    * is advisory and never changes routing or request validation.
    * @param provider - registered provider route to inspect.
    * @returns detached model metadata in adapter-preferred order.
    */
    async listModels(provider) {
      const models = await this.registration(provider).adapter.listModels(provider);
      const seen = /* @__PURE__ */ new Set();
      return models.map((model) => {
        if (typeof model.provider !== "string" || model.provider !== provider || typeof model.id !== "string" || model.id.length === 0 || typeof model.name !== "string" || model.name.length === 0 || model.description !== void 0 && typeof model.description !== "string" || seen.has(model.id)) throw new LlmError(`adapter returned invalid or duplicate model metadata for provider "${provider}"`, "INVALID_CATALOG");
        seen.add(model.id);
        const inputModalities = this.detachedModalities(model.inputModalities);
        return {
          provider: model.provider,
          id: model.id,
          name: model.name,
          ...model.description === void 0 ? {} : { description: model.description },
          ...inputModalities === void 0 ? {} : { inputModalities }
        };
      });
    }
    /**
    * Resolve and validate all metadata from the adapter that owns one exact
    * route. The result is detached from adapter-owned objects; catalog
    * membership remains advisory and does not control request routing.
    * @param provider - registered provider route to inspect.
    * @param model - exact model id passed to the adapter.
    * @param signal - optional cancellation for adapter-owned asynchronous lookup.
    * @returns exact model identity plus available context and reasoning metadata.
    */
    async resolveModelInfo(provider, model, signal) {
      return this.resolveModelInfoFor(this.registration(provider), model, signal);
    }
    async resolveModelInfoFor(registration, model, signal) {
      const resolved = await registration.adapter.resolveModel(registration.provider.id, model, signal);
      return this.normalizeModelInfo(registration, model, resolved);
    }
    /** Validate and detach one adapter-returned exact model result. */
    normalizeModelInfo(registration, model, resolved) {
      const provider = registration.provider.id;
      if (typeof resolved.provider !== "string" || resolved.provider !== provider || typeof resolved.id !== "string" || resolved.id !== model || typeof resolved.name !== "string" || resolved.name.length === 0 || resolved.description !== void 0 && typeof resolved.description !== "string") throw new LlmError(`adapter returned invalid exact model metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_INFO");
      const context = resolved.context;
      if (context !== void 0 && (!Number.isInteger(context.contextWindow) || context.contextWindow <= 0)) throw new LlmError(`adapter returned invalid context metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_CONTEXT");
      const inputModalities = this.detachedModalities(resolved.inputModalities);
      const defaultMaxTokens = resolved.defaultMaxTokens;
      if (defaultMaxTokens !== void 0 && (!Number.isSafeInteger(defaultMaxTokens) || defaultMaxTokens <= 0)) throw new LlmError(`adapter returned invalid default maxTokens for provider "${provider}" model "${model}"`, "INVALID_MODEL_MAX_TOKENS");
      const info = {
        provider,
        id: model,
        name: resolved.name,
        ...resolved.description === void 0 ? {} : { description: resolved.description },
        ...inputModalities === void 0 ? {} : { inputModalities },
        ...context === void 0 ? {} : { context: { contextWindow: context.contextWindow } },
        ...defaultMaxTokens === void 0 ? {} : { defaultMaxTokens }
      };
      const reasoning = resolved.reasoning;
      if (reasoning === void 0) return info;
      if (reasoning.efforts.length === 0) throw new LlmError(`adapter returned invalid reasoning metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
      const seen = /* @__PURE__ */ new Set();
      const efforts = reasoning.efforts.map((effort) => {
        if (typeof effort.id !== "string" || effort.id.length === 0 || typeof effort.name !== "string" || effort.name.length === 0 || effort.description !== void 0 && typeof effort.description !== "string" || seen.has(effort.id)) throw new LlmError(`adapter returned invalid or duplicate reasoning effort metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
        seen.add(effort.id);
        return {
          id: effort.id,
          name: effort.name,
          ...effort.description === void 0 ? {} : { description: effort.description }
        };
      });
      if (reasoning.defaultEffort !== void 0 && !seen.has(reasoning.defaultEffort)) throw new LlmError(`adapter returned an unknown default reasoning effort for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
      return {
        ...info,
        reasoning: {
          efforts,
          ...reasoning.defaultEffort === void 0 ? {} : { defaultEffort: reasoning.defaultEffort }
        }
      };
    }
    /**
    * Validate a conversation call config against its exact model capability and
    * materialize adapter-configured defaults. Unsupported explicit efforts
    * reject before provider I/O; no clamping or aliasing is performed. This
    * standalone query does not bind a later dispatch; use {@link prepareCall}
    * when logging and streaming must share one adapter registration.
    * @param config - provider/model route and optional request controls.
    * @param signal - optional cancellation for adapter-owned capability lookup.
    * @returns a detached config only when a default must be materialized.
    */
    async resolveCallConfig(config, signal) {
      return (await this.resolveCallFor(this.registration(config.provider), config, signal)).config;
    }
    async resolveCallFor(registration, config, signal) {
      const info = await this.resolveModelInfoFor(registration, config.model, signal);
      return this.resolveCallWithInfo(config, info);
    }
    /** Validate request controls against one already-bound exact model result. */
    resolveCallWithInfo(config, info) {
      const defaulted = config.maxTokens === void 0 && info.defaultMaxTokens !== void 0 ? {
        ...config,
        maxTokens: info.defaultMaxTokens
      } : config;
      const reasoning = info.reasoning;
      const requested = defaulted.reasoningEffort;
      let resolvedConfig = defaulted;
      if (reasoning === void 0) {
        if (requested !== void 0) throw new LlmError(`provider "${config.provider}" model "${config.model}" does not support reasoning effort "${requested}"`, "UNSUPPORTED_REASONING_EFFORT");
      } else {
        const effective = requested ?? reasoning.defaultEffort;
        if (effective !== void 0) {
          if (!reasoning.efforts.some((effort) => effort.id === effective)) throw new LlmError(`provider "${config.provider}" model "${config.model}" does not support reasoning effort "${effective}"`, "UNSUPPORTED_REASONING_EFFORT");
          if (requested !== effective) resolvedConfig = {
            ...defaulted,
            reasoningEffort: effective
          };
        }
      }
      return {
        config: resolvedConfig,
        ...info.context === void 0 ? {} : { context: info.context },
        modelInfo: info
      };
    }
    /**
    * Resolve one call under its current adapter registration. The returned
    * one-shot handle keeps that registration across header logging and dispatch,
    * so HMR cannot combine one adapter's capability result with another adapter.
    * @param config - provider/model route and optional request controls.
    * @param signal - optional cancellation for adapter-owned capability lookup.
    * @returns a prepared config and its registration-bound stream entry point.
    */
    async prepareCall(config, signal) {
      const registration = this.registration(config.provider);
      const adapterCall = await registration.adapter.prepareCall(config.provider, config.model, signal);
      const modelInfo = this.normalizeModelInfo(registration, config.model, adapterCall.model);
      const resolved = this.resolveCallWithInfo(config, modelInfo);
      const resolvedConfig = deepFreeze(structuredClone(resolved.config));
      const context = resolved.context === void 0 ? void 0 : deepFreeze(structuredClone(resolved.context));
      const adapterDefaults = deepFreeze({
        ...config.reasoningEffort === void 0 && resolvedConfig.reasoningEffort !== void 0 ? { reasoningEffort: true } : {},
        ...config.maxTokens === void 0 && resolvedConfig.maxTokens !== void 0 ? { maxTokens: true } : {}
      });
      let dispatched = false;
      return Object.freeze({
        config: resolvedConfig,
        retryPolicy: registration.retryPolicy,
        adapterDefaults,
        ...context === void 0 ? {} : { context },
        ...modelInfo.inputModalities === void 0 ? {} : { inputModalities: Object.freeze([...modelInfo.inputModalities]) },
        stream: (options) => {
          if (dispatched) throw new LlmError("a prepared LLM call can only be dispatched once", "INVALID_PREPARED_CALL");
          if (!callConfigEquals(options, resolvedConfig)) throw new LlmError("prepared LLM call config changed before adapter dispatch", "INVALID_PREPARED_CALL");
          dispatched = true;
          return this.streamWithRegistration(options, {
            registration,
            config: resolvedConfig,
            modelInfo,
            dispatch: (options2) => adapterCall.stream(options2)
          });
        }
      });
    }
    registration(provider) {
      const registration = this.adapters.get(provider);
      if (!registration) throw new LlmError(`no adapter registered for provider "${provider}"`, "NO_ADAPTER");
      return registration;
    }
    /** Remove replay state whose historical route is owned by another adapter. */
    forAdapter(options, adapter) {
      const messages = options.messages.map((message) => {
        const source = message.source;
        if (message.role !== "assistant" || source.kind !== "model" || source.replayState === void 0) return message;
        if (this.adapters.get(source.provider)?.adapter === adapter) return message;
        return freezeMessage({
          ...message,
          source: {
            kind: "model",
            provider: source.provider,
            model: source.model
          }
        });
      });
      if (messages.every((message, index) => message === options.messages[index])) return options;
      const filtered = {
        ...options,
        messages
      };
      return Object.isFrozen(options) ? deepFreeze(filtered) : filtered;
    }
    /**
    * Final adapter boundary. Adapter selection, dispatch, iterator construction,
    * and iteration failures become one terminal failure chunk. Middleware and
    * downstream consumer failures remain thrown plugin or consumer errors.
    */
    async *adapterStream(options, prepared) {
      let iterator;
      try {
        const registration = prepared?.registration ?? this.registration(options.provider);
        const adapter = registration.adapter;
        let modelInfo;
        let resolvedConfig;
        let dispatch;
        if (prepared === void 0) {
          const adapterCall = await adapter.prepareCall(options.provider, options.model, options.signal);
          modelInfo = this.normalizeModelInfo(registration, options.model, adapterCall.model);
          resolvedConfig = this.resolveCallWithInfo(options, modelInfo).config;
          dispatch = (options2) => adapterCall.stream(options2);
        } else {
          modelInfo = prepared.modelInfo;
          resolvedConfig = prepared.config;
          dispatch = prepared.dispatch;
        }
        if (prepared !== void 0 && !callConfigEquals(options, resolvedConfig)) throw new LlmError("prepared LLM call config changed before adapter dispatch", "INVALID_PREPARED_CALL");
        const resolvedOptions = callConfigEquals(options, resolvedConfig) ? options : Object.isFrozen(options) ? deepFreeze({
          ...options,
          ...resolvedConfig
        }) : {
          ...options,
          ...resolvedConfig
        };
        const projectedOptions = modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image") && resolvedOptions.messages.some((message) => contentHasImage(message.content)) ? Object.isFrozen(resolvedOptions) ? deepFreeze({
          ...resolvedOptions,
          messages: projectImagesForTextModel(resolvedOptions.messages)
        }) : {
          ...resolvedOptions,
          messages: projectImagesForTextModel(resolvedOptions.messages)
        } : resolvedOptions;
        iterator = dispatch(this.forAdapter(projectedOptions, adapter))[Symbol.asyncIterator]();
      } catch (error) {
        yield adapterFailureChunk(error, options.signal);
        return;
      }
      let completed = false;
      try {
        while (true) {
          let item;
          try {
            const next = await iterator.next();
            item = next.done ? { done: true } : {
              done: false,
              value: next.value
            };
          } catch (error) {
            completed = true;
            yield adapterFailureChunk(error, options.signal);
            return;
          }
          if (item.done) {
            completed = true;
            return;
          }
          yield item.value;
        }
      } finally {
        if (!completed) {
          const close = iterator.return?.bind(iterator);
          if (close) await close();
        }
      }
    }
    /**
    * Stream one model call as raw chunks (token-level deltas). Replay state is
    * retained only when the same adapter instance owns its historical provider
    * and the target provider. Final adapter selection remains fixed through
    * asynchronous exact-model resolution and dispatch. Adapter selection,
    * dispatch, and iteration failures become terminal `error` or `aborted`
    * finish chunks; middleware, nested-call, cleanup, and consumer failures
    * remain thrown.
    * @param options - the full request; `options.provider` selects the adapter.
    * @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
    */
    stream(options) {
      return this.streamWithRegistration(options);
    }
    streamWithRegistration(options, prepared) {
      return this.ctx.waterfall(this, "llm/stream", options, () => this.adapterStream(options, prepared));
    }
  }, (() => {
    const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
    _listProviders_decorators = [Remote];
    _listConfigurableProviders_decorators = [Remote];
    _remoteDiscoverModels_decorators = [Remote("discoverModels")];
    __esDecorate(_a, null, _listProviders_decorators, {
      kind: "method",
      name: "listProviders",
      static: false,
      private: false,
      access: {
        has: (obj) => "listProviders" in obj,
        get: (obj) => obj.listProviders
      },
      metadata: _metadata
    }, null, _instanceExtraInitializers);
    __esDecorate(_a, null, _listConfigurableProviders_decorators, {
      kind: "method",
      name: "listConfigurableProviders",
      static: false,
      private: false,
      access: {
        has: (obj) => "listConfigurableProviders" in obj,
        get: (obj) => obj.listConfigurableProviders
      },
      metadata: _metadata
    }, null, _instanceExtraInitializers);
    __esDecorate(_a, null, _remoteDiscoverModels_decorators, {
      kind: "method",
      name: "remoteDiscoverModels",
      static: false,
      private: false,
      access: {
        has: (obj) => "remoteDiscoverModels" in obj,
        get: (obj) => obj.remoteDiscoverModels
      },
      metadata: _metadata
    }, null, _instanceExtraInitializers);
    if (_metadata) Object.defineProperty(_a, Symbol.metadata, {
      enumerable: true,
      configurable: true,
      writable: true,
      value: _metadata
    });
  })(), _a;
})();
function adapterFailureChunk(error, signal) {
  const failure = normalizeLlmFailure(error);
  return {
    type: "finish",
    reason: signal?.aborted || failure.code === "ABORTED" ? {
      kind: "aborted",
      failure
    } : {
      kind: "error",
      failure
    }
  };
}

// src/shared/core.ts
var DEFAULT_CONFIG = {
  continueText: "继续",
  continueTextMaxTokens: "继续",
  guardTools: true,
  guardPendingText: "(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)",
  guardDoneText: "(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)",
  graceMs: 3e3,
  cooldownMs: 2e4,
  maxConsecutive: 3,
  scanOnBoot: true,
  scanLimit: 8,
  freshMs: 15 * 60 * 1e3,
  verbose: true,
  classify: true,
  backoffFactor: 2,
  backoffMaxMs: 3e5,
  notify: false,
  paused: false,
  loopGuard: true,
  loopShortChars: 40,
  loopWindowMs: 3e4,
  loopShortCount: 12,
  loopRepeatText: 4,
  loopToolRepeat: 5,
  loopText: "(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)"
};
function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function resolveConfig(section) {
  const value = section ?? {};
  const text = typeof value.continueText === "string" && value.continueText.trim() !== "" ? value.continueText : DEFAULT_CONFIG.continueText;
  const maxTokensText = typeof value.continueTextMaxTokens === "string" && value.continueTextMaxTokens.trim() !== "" ? value.continueTextMaxTokens : DEFAULT_CONFIG.continueTextMaxTokens;
  const guardPendingText = typeof value.guardPendingText === "string" && value.guardPendingText.trim() !== "" ? value.guardPendingText : DEFAULT_CONFIG.guardPendingText;
  const guardDoneText = typeof value.guardDoneText === "string" && value.guardDoneText.trim() !== "" ? value.guardDoneText : DEFAULT_CONFIG.guardDoneText;
  return {
    continueText: text,
    continueTextMaxTokens: maxTokensText,
    guardTools: booleanOr(value.guardTools, DEFAULT_CONFIG.guardTools),
    guardPendingText,
    guardDoneText,
    graceMs: numberOr(value.graceMs, DEFAULT_CONFIG.graceMs),
    cooldownMs: numberOr(value.cooldownMs, DEFAULT_CONFIG.cooldownMs),
    maxConsecutive: Math.max(1, numberOr(value.maxConsecutive, DEFAULT_CONFIG.maxConsecutive)),
    scanOnBoot: booleanOr(value.scanOnBoot, DEFAULT_CONFIG.scanOnBoot),
    scanLimit: Math.max(1, numberOr(value.scanLimit, DEFAULT_CONFIG.scanLimit)),
    freshMs: numberOr(value.freshMs, DEFAULT_CONFIG.freshMs),
    verbose: booleanOr(value.verbose, DEFAULT_CONFIG.verbose),
    classify: booleanOr(value.classify, DEFAULT_CONFIG.classify),
    backoffFactor: Math.max(1, numberOr(value.backoffFactor, DEFAULT_CONFIG.backoffFactor)),
    backoffMaxMs: numberOr(value.backoffMaxMs, DEFAULT_CONFIG.backoffMaxMs),
    notify: booleanOr(value.notify, DEFAULT_CONFIG.notify),
    paused: booleanOr(value.paused, DEFAULT_CONFIG.paused),
    loopGuard: booleanOr(value.loopGuard, DEFAULT_CONFIG.loopGuard),
    loopShortChars: Math.max(1, numberOr(value.loopShortChars, DEFAULT_CONFIG.loopShortChars)),
    loopWindowMs: Math.max(1e3, numberOr(value.loopWindowMs, DEFAULT_CONFIG.loopWindowMs)),
    loopShortCount: Math.max(2, numberOr(value.loopShortCount, DEFAULT_CONFIG.loopShortCount)),
    loopRepeatText: Math.max(2, numberOr(value.loopRepeatText, DEFAULT_CONFIG.loopRepeatText)),
    loopToolRepeat: Math.max(2, numberOr(value.loopToolRepeat, DEFAULT_CONFIG.loopToolRepeat)),
    loopText: typeof value.loopText === "string" && value.loopText.trim() !== "" ? value.loopText : DEFAULT_CONFIG.loopText
  };
}
function isNonHumanReason(kind) {
  return kind === "error" || kind === "interrupted" || kind === "max-tokens";
}
function isTransientFailure(failure) {
  const haystack = `${failure.code} ${failure.message}`.toLowerCase();
  const status = failure.status;
  if (status !== void 0 && (status === 401 || status === 403)) return false;
  const permanent = /auth|unauthor|forbidden|credential|api[_-]?key|permission/i.test(haystack) || /insufficient.*(balance|quota)|billing|payment|quota.*exceeded.*(?!retry)/i.test(haystack) || /model.*not[_-]?found|unknown[_-]?model|model[_-]?not[_-]?found|not.*support.*model/i.test(haystack) || /context.*(length|limit|overflow|exceed)|token.*limit|max.*context/i.test(haystack) || /invalid[_-]?request|bad[_-]?request/i.test(haystack);
  return !permanent;
}
function formatElapsed(ms) {
  if (ms === void 0 || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1e3);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60 > 0 ? `${s % 60}s` : ""}`;
}
function fillTemplate(template, ctx) {
  return template.replace(/\{code\}/g, ctx.facts?.code ?? "").replace(/\{message\}/g, ctx.facts?.message ?? "").replace(/\{status\}/g, ctx.facts?.status !== void 0 ? String(ctx.facts.status) : "").replace(/\{tool\}/g, ctx.tool ?? "").replace(/\{turn\}/g, ctx.turn !== void 0 ? String(ctx.turn) : "").replace(/\{errorCount\}/g, ctx.errorCount !== void 0 ? String(ctx.errorCount) : "").replace(/\{sessionTitle\}/g, ctx.sessionTitle ?? "").replace(/\{elapsed\}/g, formatElapsed(ctx.elapsedMs)).replace(/\{result\}/g, ctx.result ?? "");
}
var TOOL_RESULT_CAP = 160;
function extractText(blocks, cap) {
  let out = "";
  const walk = (value) => {
    if (out.length >= cap) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = value;
    if (record["type"] === "text" && typeof record["text"] === "string") {
      out += record["text"];
      return;
    }
    for (const child of Object.values(record)) walk(child);
  };
  walk(blocks);
  return out.slice(0, cap);
}
function toolResultFacts(data) {
  const failed = data.error !== void 0 || data.message?.content?.[0]?.isError === true;
  return { ok: !failed, excerpt: extractText(data.message?.content?.[0]?.content, TOOL_RESULT_CAP) };
}
function effectiveCooldown(consecutive, base, factor, max) {
  const multiplier = Math.pow(factor, consecutive);
  return Math.min(Math.max(base, base * multiplier), Math.max(base, max));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function todayKey() {
  const d = /* @__PURE__ */ new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function emptyDayStats() {
  return { date: todayKey(), sent: 0, skipped: 0, recovered: 0, failed: 0, gaveUp: 0, looped: 0, byCode: {} };
}
var freshState = () => ({
  consecutive: 0,
  lastAutoAt: 0,
  lastAttemptAt: 0,
  lastSentText: "",
  pendingTimer: void 0,
  running: void 0,
  queued: 0,
  subagent: false,
  lastFailure: void 0,
  lastFailureAt: 0,
  lastTool: void 0,
  lastToolResult: void 0,
  lastTurn: void 0,
  pendingRecoveryAt: 0,
  shortRun: 0,
  lastShortAt: 0,
  lastAssistantText: "",
  sameTextRun: 0,
  toolRun: void 0,
  loopFired: false,
  loopCancelled: false,
  loopRetryTimer: void 0
});
var RECOVERY_WINDOW_MS = 10 * 60 * 1e3;
var ECHO_WINDOW_MS = 10 * 60 * 1e3;
function isOurEcho(state, event) {
  if (event.type !== "user/message") return false;
  const message = event.data;
  if (message.source.kind !== "user") return false;
  if (state.lastSentText === "") return false;
  if (Date.now() - state.lastAutoAt > ECHO_WINDOW_MS) return false;
  const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
  return text === state.lastSentText;
}

// src/host/engine.ts
var AutoContinueRunner = class {
  /**
   * @param ctx - host plugin context (agents registry, session events, settings).
   * @param getConfig - read the current resolved configuration (settings service).
   */
  constructor(ctx, getConfig) {
    this.ctx = ctx;
    this.getConfig = getConfig;
    this.states = /* @__PURE__ */ new Map();
    this.pauseUntil = /* @__PURE__ */ new Map();
    this.dayStats = emptyDayStats();
    this.notices = [];
    this.noticeListeners = /* @__PURE__ */ new Set();
    this.stateListeners = /* @__PURE__ */ new Set();
    this.disposed = false;
    ctx.on("session/event", (session, event) => this.onHostEvent(session, event));
    const config = this.getConfig();
    if (config.scanOnBoot) {
      void this.bootScanLoop();
    }
    this.log(
      `已启动(host 单实例, 文本="${config.continueText}", 宽限 ${config.graceMs}ms, 冷却 ${config.cooldownMs}ms, 最多连续 ${config.maxConsecutive} 次)`
    );
  }
  log(message) {
    if (this.getConfig().verbose) console.info(`[auto-continue] ${message}`);
  }
  /** 对外(状态桥): 今日统计快照。 */
  todayStats() {
    const today = todayKey();
    if (this.dayStats.date !== today) this.dayStats = emptyDayStats();
    return { ...this.dayStats, byCode: { ...this.dayStats.byCode } };
  }
  /** 对外(状态桥): 当前生效的会话级暂停列表。 */
  activePauses() {
    const now = Date.now();
    const out = [];
    for (const [sessionId, until] of this.pauseUntil) {
      if (until > now) out.push({ sessionId, until });
    }
    return out;
  }
  /** 对外(状态桥): 订阅通知事件(SSE 端点推送)。 */
  subscribeNotices(listener) {
    this.noticeListeners.add(listener);
    return () => {
      this.noticeListeners.delete(listener);
    };
  }
  /** 对外(状态桥): 订阅运行时状态变化(统计/暂停列表)。 */
  subscribeState(listener) {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }
  emitState() {
    for (const listener of this.stateListeners) listener();
  }
  /** 对外(状态桥): 消费待展示的通知。 */
  drainNotices() {
    return this.notices.splice(0, this.notices.length);
  }
  /** 通知动作(browser 通知按钮回传): 立即续跑 / 暂停该会话 / 解除暂停 / 清零统计。 */
  handleNoticeAction(sessionId, action) {
    if (action === "unpause") {
      if (sessionId !== void 0) this.pauseUntil.delete(sessionId);
      this.log(`解除暂停 ${sessionId ?? "?"}`);
    } else if (action === "reset-stats") {
      this.dayStats = emptyDayStats();
      this.log("清零今日统计");
    } else if (sessionId !== void 0) {
      this.onNotifyAction(sessionId, action);
    }
    this.emitState();
  }
  dispose() {
    this.disposed = true;
    for (const state of this.states.values()) {
      if (state.pendingTimer !== void 0) clearTimeout(state.pendingTimer);
      if (state.loopRetryTimer !== void 0) clearTimeout(state.loopRetryTimer);
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
  /**
   * 事件入口(host 单实例): 预处理工具调用/结果/模型消息(护栏与循环信号),
   * 然后交给回合状态机。
   */
  onHostEvent(session, event) {
    const sessionId = session.id;
    if (event.type === "tool/call") {
      const name = event.data.name;
      if (typeof name === "string") {
        const state = this.state(sessionId);
        state.lastTool = name;
        state.lastToolResult = "pending";
        state.shortRun = 0;
        const key = `${name}
${event.data.arguments}`;
        if (state.toolRun?.key === key) {
          state.toolRun.waiting = true;
        } else {
          state.toolRun = { key, count: 1, lastResult: void 0, waiting: false };
        }
      }
    } else if (event.type === "tool/result") {
      const state = this.state(sessionId);
      if (state.lastToolResult === "pending") {
        const facts = toolResultFacts(event.data);
        state.lastToolResult = facts;
        const run = state.toolRun;
        if (run !== void 0 && run.waiting) {
          run.waiting = false;
          if (run.lastResult !== void 0 && run.lastResult === facts.excerpt) {
            run.count += 1;
            this.checkLoop(sessionId, state);
          } else {
            run.lastResult = facts.excerpt;
            run.count = 1;
          }
        } else if (run !== void 0 && !run.waiting) {
          run.lastResult = facts.excerpt;
        }
      }
    } else if (event.type === "assistant/message") {
      const state = this.state(sessionId);
      this.onAssistantMessage(sessionId, state, event);
    }
    this.onSessionEvent(sessionId, event);
  }
  /** 从 assistant/message 事件提取纯文本。 */
  assistantText(event) {
    const content = event.data.message.content;
    if (!Array.isArray(content)) return "";
    return content.filter((part) => part.type === "text").map((part) => part.text).join("");
  }
  onAssistantMessage(sessionId, state, event) {
    if (!this.getConfig().loopGuard) return;
    const text = this.assistantText(event);
    const trimmed = text.trim();
    if (trimmed !== "" && trimmed === state.lastAssistantText) {
      state.sameTextRun += 1;
    } else {
      state.lastAssistantText = trimmed;
      state.sameTextRun = 1;
    }
    if (trimmed.length < this.getConfig().loopShortChars) {
      const now = Date.now();
      if (now - state.lastShortAt > this.getConfig().loopWindowMs) {
        state.shortRun = 0;
      }
      state.shortRun += 1;
      state.lastShortAt = now;
    } else {
      state.shortRun = 0;
      state.lastShortAt = 0;
    }
    this.checkLoop(sessionId, state);
  }
  /** 两个循环信号的公共检查; 命中且本回合未打断过则打断。 */
  checkLoop(sessionId, state) {
    if (!this.getConfig().loopGuard) return;
    if (state.loopFired) return;
    if (!state.running) return;
    const config = this.getConfig();
    if (state.sameTextRun >= config.loopRepeatText) {
      this.log(`检测到空转循环 ${sessionId}: 连续 ${state.sameTextRun} 条相同消息`);
      void this.interruptLoop(sessionId, state);
    } else if (state.shortRun >= config.loopShortCount) {
      this.log(`检测到空转循环 ${sessionId}: 连续 ${state.shortRun} 条短句且无工具调用`);
      void this.interruptLoop(sessionId, state);
    } else if (state.toolRun !== void 0 && state.toolRun.count >= config.loopToolRepeat) {
      const toolName = state.toolRun.key.split("\n")[0] ?? "?";
      this.log(`检测到工具死循环 ${sessionId}: 「${toolName}」连续 ${state.toolRun.count} 次(同参数同结果)`);
      void this.interruptLoop(sessionId, state);
    }
  }
  /**
   * 打断运行中的回合: cancel(带来源标记)+ 进冷却。
   * 随后的 turn/end aborted 会因 loopCancelled 走「可恢复中断」路径,
   * 用 loopText 重启回合——不会与用户手动停止混淆。
   */
  async interruptLoop(sessionId, state) {
    if (state.loopFired) return;
    if (Date.now() - state.lastAttemptAt < this.cooldownFor(state)) {
      this.log(`跳过循环打断 ${sessionId}: 处于冷却期`);
      return;
    }
    state.loopFired = true;
    state.loopCancelled = true;
    state.lastAttemptAt = Date.now();
    this.bumpStat({ looped: 1 });
    try {
      const agent = this.ctx.agents.get(sessionId);
      if (agent === void 0) {
        this.log(`打断循环失败 ${sessionId}: 无 live agent`);
        state.loopCancelled = false;
        return;
      }
      agent.cancel({ kind: "user" }, { keepInbox: true });
      this.log(`已打断循环 ${sessionId}: cancel 已受理`);
    } catch (error) {
      this.log(`打断循环失败 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      state.loopCancelled = false;
    }
  }
  onSessionEvent(sessionId, event) {
    const state = this.state(sessionId);
    switch (event.type) {
      case "turn/start":
        state.running = true;
        state.lastTool = void 0;
        state.lastToolResult = void 0;
        state.shortRun = 0;
        state.lastShortAt = 0;
        state.lastAssistantText = "";
        state.sameTextRun = 0;
        state.toolRun = void 0;
        state.loopFired = false;
        state.loopCancelled = false;
        if (state.loopRetryTimer !== void 0) {
          clearTimeout(state.loopRetryTimer);
          state.loopRetryTimer = void 0;
        }
        this.cancelPending(sessionId, "宿主自行开启新回合");
        break;
      case "turn/end": {
        state.running = false;
        this.cancelPending(sessionId, "收到新的 turn/end");
        const reason = event.data.reason;
        if (reason.kind === "completed") {
          state.consecutive = 0;
          state.lastFailure = void 0;
          this.noteRecovery(sessionId, "completed");
        } else if (reason.kind === "aborted") {
          if (state.loopCancelled) {
            state.loopCancelled = false;
            state.loopFired = false;
            state.pendingRecoveryAt = 0;
            state.shortRun = 0;
            state.lastShortAt = 0;
            state.lastAssistantText = "";
            state.sameTextRun = 0;
            state.toolRun = void 0;
            const cooldown = this.cooldownFor(state);
            const remaining = cooldown - (Date.now() - state.lastAttemptAt);
            if (remaining > 0) {
              if (state.loopRetryTimer !== void 0) clearTimeout(state.loopRetryTimer);
              state.loopRetryTimer = setTimeout(() => {
                state.loopRetryTimer = void 0;
                this.schedule(sessionId, "loop:aborted");
              }, remaining);
              this.log(`loop 重启延迟 ${remaining}ms(冷却期) ${sessionId}`);
            } else {
              this.schedule(sessionId, "loop:aborted");
            }
          } else {
            state.consecutive = 0;
            state.pendingRecoveryAt = 0;
          }
        } else if (reason.kind === "blocked") {
        } else if (reason.kind === "interrupted") {
          state.consecutive = 0;
          state.pendingRecoveryAt = 0;
        } else if (reason.kind === "error") {
          const error = reason.error;
          state.lastFailure = {
            code: typeof error.code === "string" ? error.code : "UNKNOWN",
            message: typeof error.message === "string" ? error.message : String(error),
            ...typeof error.status === "number" ? { status: error.status } : {}
          };
          state.lastTurn = event.data.turn;
          state.lastFailureAt = Date.now();
          this.noteRecovery(sessionId, "error");
          this.onTurnFailure(sessionId, "turn/end:error", state.lastFailure);
        } else if (reason.kind === "max-tokens") {
          state.lastFailureAt = Date.now();
          this.noteRecovery(sessionId, "error");
          this.schedule(sessionId, "turn/end:max-tokens");
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
  onTurnFailure(sessionId, reason, failure) {
    const config = this.getConfig();
    if (config.classify && !isTransientFailure(failure)) {
      const summary = `${failure.code}${failure.status !== void 0 ? ` (HTTP ${failure.status})` : ""}`;
      this.log(`跳过 ${sessionId}(${reason}): 永久性失败 ${summary} — ${failure.message}`);
      this.bumpStat({ skipped: 1, code: failure.code });
      if (config.notify) {
        this.notify(
          "dsh-auto-continue: 未自动继续",
          `${sessionId}: 永久性错误 ${summary}，需要人工处理`,
          this.notifyOptions(sessionId)
        );
      }
      return;
    }
    this.schedule(sessionId, reason);
  }
  /** 通知操作按钮与回调(「立即续跑」/「暂停该会话 1 小时」)。 */
  notifyOptions(sessionId) {
    return {
      actions: [
        { action: "resume", title: "立即续跑" },
        { action: "pause1h", title: "暂停该会话 1 小时" }
      ],
      onAction: (action) => this.onNotifyAction(sessionId, action)
    };
  }
  onNotifyAction(sessionId, action) {
    if (action === "resume") {
      this.log(`通知按钮: 立即续跑 ${sessionId}`);
      void this.resumeNow(sessionId);
    } else if (action === "pause1h") {
      this.log(`通知按钮: 暂停 ${sessionId} 1 小时`);
      this.pauseUntil.set(sessionId, Date.now() + 60 * 60 * 1e3);
      this.cancelPending(sessionId, "通知按钮暂停该会话");
    }
  }
  /** 内存统计(host 单实例): 按今日桶累计。 */
  bumpStat(delta) {
    const today = todayKey();
    if (this.dayStats.date !== today) this.dayStats = emptyDayStats();
    if (delta.sent !== void 0) this.dayStats.sent += delta.sent;
    if (delta.skipped !== void 0) this.dayStats.skipped += delta.skipped;
    if (delta.recovered !== void 0) this.dayStats.recovered += delta.recovered;
    if (delta.failed !== void 0) this.dayStats.failed += delta.failed;
    if (delta.gaveUp !== void 0) this.dayStats.gaveUp += delta.gaveUp;
    if (delta.looped !== void 0) this.dayStats.looped += delta.looped;
    if (delta.code !== void 0) {
      this.dayStats.byCode[delta.code] = (this.dayStats.byCode[delta.code] ?? 0) + 1;
    }
  }
  /** 通知桥: 产生一条通知事件, SSE 端点推给 browser 侧展示。 */
  notify(title, body, options) {
    const notice = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      body,
      ...options?.actions !== void 0 && options.actions.length > 0 ? { actions: options.actions } : { actions: [] },
      at: Date.now()
    };
    this.notices.push(notice);
    for (const listener of this.noticeListeners) listener();
    this.emitState();
  }
  /** 恢复结果记账: 自动发送后窗口内的回合结束, 判定恢复成功或失败。 */
  noteRecovery(sessionId, outcome) {
    const state = this.state(sessionId);
    if (state.pendingRecoveryAt === 0) return;
    if (Date.now() - state.pendingRecoveryAt > RECOVERY_WINDOW_MS) {
      state.pendingRecoveryAt = 0;
      return;
    }
    state.pendingRecoveryAt = 0;
    this.bumpStat(outcome === "completed" ? { recovered: 1 } : { failed: 1 });
    this.log(`恢复结果(${sessionId}): ${outcome === "completed" ? "成功" : "失败"}`);
  }
  /** 立即为该会话发送一次自动继续(无视冷却与连续上限; 由通知按钮触发)。 */
  async resumeNow(sessionId) {
    if (this.disposed) return;
    const state = this.state(sessionId);
    if (state.subagent) return;
    if (state.pendingTimer !== void 0) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = void 0;
    }
    await this.fire(sessionId, "manual:notification", true);
  }
  /** 本会话当前生效的冷却间隔(自适应退避)。 */
  cooldownFor(state) {
    const config = this.getConfig();
    return effectiveCooldown(
      state.consecutive,
      config.cooldownMs,
      config.backoffFactor,
      config.backoffMaxMs
    );
  }
  schedule(sessionId, reason) {
    const state = this.state(sessionId);
    const config = this.getConfig();
    if (state.subagent) return;
    if (config.paused) {
      this.log(`跳过 ${sessionId}(${reason}): 全局暂停中`);
      return;
    }
    if (Date.now() < (this.pauseUntil.get(sessionId) ?? 0)) {
      this.log(`跳过 ${sessionId}(${reason}): 会话暂停中`);
      return;
    }
    if (state.pendingTimer !== void 0) return;
    if (Date.now() - state.lastAttemptAt < this.cooldownFor(state)) return;
    if (state.consecutive >= config.maxConsecutive) {
      this.log(
        `跳过 ${sessionId}(${reason}): 已连续自动继续 ${state.consecutive} 次, 等待用户介入或成功回合`
      );
      return;
    }
    const timer = setTimeout(() => {
      if (state.pendingTimer !== timer) return;
      state.pendingTimer = void 0;
      void this.fire(sessionId, reason);
    }, config.graceMs);
    state.pendingTimer = timer;
    const template = reason.startsWith("loop:") ? config.loopText : reason.includes("max-tokens") ? config.continueTextMaxTokens : config.continueText;
    this.log(
      `检测到非人为中断 ${sessionId}(${reason}), ${config.graceMs}ms 后自动发送「${template}」`
    );
  }
  cancelPending(sessionId, why) {
    const state = this.state(sessionId);
    if (state.pendingTimer === void 0) return;
    clearTimeout(state.pendingTimer);
    state.pendingTimer = void 0;
    this.log(`取消 ${sessionId} 的自动继续(${why})`);
  }
  fire(sessionId, reason, force = false) {
    if (this.disposed) return;
    const state = this.state(sessionId);
    const config = this.getConfig();
    if (state.subagent) return;
    if (config.paused) {
      this.log(`跳过 ${sessionId}(${reason}): 全局暂停中`);
      return;
    }
    if (Date.now() < (this.pauseUntil.get(sessionId) ?? 0)) {
      this.log(`跳过 ${sessionId}(${reason}): 会话暂停中`);
      return;
    }
    if (!force && Date.now() - state.lastAttemptAt < this.cooldownFor(state)) {
      this.log(`跳过 ${sessionId}(${reason}): 处于冷却期`);
      return;
    }
    if (!force && state.consecutive >= config.maxConsecutive) {
      this.log(`跳过 ${sessionId}(${reason}): 已连续自动继续 ${state.consecutive} 次, 等待用户介入或成功回合`);
      return;
    }
    const template = reason.startsWith("loop:") ? config.loopText : reason.includes("max-tokens") ? config.continueTextMaxTokens : config.continueText;
    const text = this.buildContinueText(config, state, template);
    const agent = this.ctx.agents.get(sessionId);
    if (agent === void 0) {
      this.log(`跳过 ${sessionId}(${reason}): 无 live agent`);
      return;
    }
    state.lastAttemptAt = Date.now();
    try {
      agent.followup(
        createUserMessage({
          content: [{ type: "text", text }],
          source: { kind: "user" }
        })
      );
      const now = Date.now();
      state.consecutive += 1;
      state.lastAutoAt = now;
      state.lastSentText = text;
      state.pendingRecoveryAt = now;
      this.bumpStat({ sent: 1, ...state.lastFailure !== void 0 ? { code: state.lastFailure.code } : {} });
      this.log(`已自动发送「${text}」到 ${sessionId}(${reason}), 第 ${state.consecutive} 次连续`);
      if (config.notify) {
        this.notify(
          "dsh-auto-continue: 已自动继续",
          `${sessionId}: 已发送「${text}」(第 ${state.consecutive} 次连续)`,
          this.notifyOptions(sessionId)
        );
      }
      if (state.consecutive >= config.maxConsecutive) {
        this.bumpStat({ gaveUp: 1 });
        this.log(`达到连续上限 ${config.maxConsecutive} 次, 停止自动继续 ${sessionId}`);
        if (config.notify) {
          this.notify(
            "dsh-auto-continue: 已停止自动继续",
            `${sessionId}: 连续失败 ${state.consecutive} 次, 需要人工介入`,
            this.notifyOptions(sessionId)
          );
        }
      }
    } catch (error) {
      this.log(`发送异常 ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /**
   * 组装本次续跑消息: 模板填充 + 幂等护栏。
   * 护栏依据上一步工具调用的执行状态附加指引, 防止重跑副作用操作:
   * - 结果未确认(可能已部分执行)→ 提示先确认状态、不要重复执行
   * - 已确认成功 → 提示已完成、不要重复执行
   * - 已失败 → 不加护栏(重试工具本来就是目的)
   */
  buildContinueText(config, state, template) {
    let text = fillTemplate(template, {
      facts: state.lastFailure,
      tool: state.lastTool,
      turn: state.lastTurn,
      errorCount: state.consecutive + 1,
      elapsedMs: state.lastFailureAt > 0 ? Date.now() - state.lastFailureAt : void 0
    });
    if (!config.guardTools) return text;
    const guard = this.currentGuard(state);
    if (guard.kind === "pending") {
      text += ` ${fillTemplate(config.guardPendingText, { tool: guard.tool, result: guard.result })}`;
    } else if (guard.kind === "done") {
      text += ` ${fillTemplate(config.guardDoneText, { tool: guard.tool, result: guard.result })}`;
    }
    return text;
  }
  /** 上一步工具调用的护栏状态(实时路径, 由 mux 帧维护)。 */
  currentGuard(state) {
    if (state.lastTool === void 0 || state.lastToolResult === void 0) return { kind: "none" };
    if (state.lastToolResult === "pending") return { kind: "pending", tool: state.lastTool };
    if (state.lastToolResult.ok) {
      return { kind: "done", tool: state.lastTool, result: state.lastToolResult.excerpt };
    }
    return { kind: "failed", tool: state.lastTool };
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
    const config = this.getConfig();
    if (config.paused) return true;
    const now = Date.now();
    const candidates = [];
    for (const agent of this.ctx.agents.list()) {
      const session = agent.session;
      if (session.header.origin === "subagent") continue;
      candidates.push({ sessionId: session.id, events: session.events });
    }
    for (const candidate of candidates.slice(0, config.scanLimit)) {
      if (this.disposed) return true;
      const state = this.state(candidate.sessionId);
      if (state.pendingTimer !== void 0) continue;
      if (state.consecutive >= config.maxConsecutive) continue;
      if (now - state.lastAttemptAt < this.cooldownFor(state)) continue;
      if (now < (this.pauseUntil.get(candidate.sessionId) ?? 0)) continue;
      const events = candidate.events;
      let lastEnd;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i];
        if (event !== void 0 && event.type === "turn/end") {
          lastEnd = event;
          break;
        }
      }
      if (lastEnd === void 0) continue;
      const reason = lastEnd.data.reason;
      if (!isNonHumanReason(reason.kind)) continue;
      if (lastEnd.time < now - config.freshMs) continue;
      let superseded = false;
      for (const event of events) {
        if (event.seq <= lastEnd.seq) continue;
        if (event.type === "turn/start") superseded = true;
        if (event.type === "user/message" && event.data.source.kind === "user") superseded = true;
        if (superseded) break;
      }
      if (superseded) continue;
      this.applyGuardFromEvents(state, events, lastEnd.seq);
      this.log(`扫描发现中断 ${candidate.sessionId}(turn/end:${reason.kind}), 安排自动继续`);
      this.schedule(candidate.sessionId, `scan:turn/end:${reason.kind}`);
    }
    return true;
  }
  /** 从历史事件恢复上一步工具调用状态(扫描路径的幂等护栏)。 */
  applyGuardFromEvents(state, events, untilSeq) {
    state.lastTool = void 0;
    state.lastToolResult = void 0;
    let call;
    for (const event of events) {
      if (event.seq >= untilSeq) continue;
      if (event.type === "tool/call") call = event;
    }
    if (call === void 0) return;
    state.lastTool = call.data.name;
    state.lastToolResult = "pending";
    for (const event of events) {
      if (event.seq <= call.seq || event.seq >= untilSeq) continue;
      if (event.type === "tool/result") {
        state.lastToolResult = toolResultFacts(event.data);
        break;
      }
    }
  }
};

// src/index.ts
var AUTO_CONTINUE_NS = "auto-continue";
var AutoContinueSchema = z2.object({
  /** Text automatically sent after an interruption. */
  continueText: z2.string().default("继续"),
  /** Text sent when the output token ceiling is reached (same placeholders as `continueText`). */
  continueTextMaxTokens: z2.string().default("继续"),
  /** Idempotency guard: inspect the last tool call before resuming and steer the model. */
  guardTools: z2.boolean().default(true),
  /** Guard text appended when the last tool call has no confirmed result (it may have partially executed). */
  guardPendingText: z2.string().default("(上一步工具「{tool}」可能未完成, 先确认状态再继续, 不要重复执行)"),
  /** Guard text appended when the last tool call completed successfully (don't rerun it). */
  guardDoneText: z2.string().default("(上一步工具「{tool}」已完成, 结果: {result}; 不要重复执行, 直接继续)"),
  /** Grace period after an interruption before auto-sending (ms). */
  graceMs: z2.natural().default(3e3),
  /** Minimum interval between two auto-continues per session (ms). */
  cooldownMs: z2.natural().default(2e4),
  /** Max consecutive auto-continues per session before stopping. */
  maxConsecutive: z2.natural().min(1).default(3),
  /** Scan recently interrupted sessions on page load / reconnect. */
  scanOnBoot: z2.boolean().default(true),
  /** Max sessions the scan checks (most recently updated). */
  scanLimit: z2.natural().min(1).default(8),
  /** Scan only considers interruptions inside this window (ms). */
  freshMs: z2.natural().default(15 * 60 * 1e3),
  /** Log `[auto-continue]` lines to the browser console. */
  verbose: z2.boolean().default(true),
  /** Classify failures: auto-continue transient errors only; permanent ones are skipped and notified. */
  classify: z2.boolean().default(true),
  /** Cooldown multiplier per consecutive failure (adaptive backoff). */
  backoffFactor: z2.natural().min(1).default(2),
  /** Cap on the effective backoff interval (ms). */
  backoffMaxMs: z2.natural().default(3e5),
  /** Show browser notifications for auto-continue events. */
  notify: z2.boolean().default(false),
  /** Globally pause auto-continue: no live or scan send. */
  paused: z2.boolean().default(false),
  /** Loop guard: detect a running turn spinning in place and restart it. */
  loopGuard: z2.boolean().default(true),
  /** A model message shorter than this many chars counts as a short sentence (loop signal). */
  loopShortChars: z2.natural().min(1).default(40),
  /** Consecutive short sentences within this window (ms) with no tool call in between trip the loop guard. */
  loopWindowMs: z2.natural().min(1e3).default(3e4),
  /** Consecutive short sentences trip the loop guard. */
  loopShortCount: z2.natural().min(2).default(12),
  /** Consecutive identical short sentences trip the loop guard (strongest spinning signal). */
  loopRepeatText: z2.natural().min(2).default(4),
  /** Consecutive identical tool calls with identical arguments AND results trip the loop guard. */
  loopToolRepeat: z2.natural().min(2).default(5),
  /** Text sent after the loop guard cancels and restarts a turn (supports {tool}). */
  loopText: z2.string().default("(检测到你可能陷入循环, 请停止重复刚才的动作, 换一种方式继续)")
});
function apply(ctx) {
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(AUTO_CONTINUE_NS), AutoContinueSchema, {
      applies: "live"
    });
  });
  ctx.inject(["settings", "agents", "webServer"], (engineCtx) => {
    const runner = new AutoContinueRunner(
      engineCtx,
      () => resolveConfig(engineCtx.settings.get(settingsNamespace(AUTO_CONTINUE_NS)))
    );
    const sseClients = /* @__PURE__ */ new Set();
    const pushToAll = (data) => {
      for (const send of sseClients) {
        try {
          send(data);
        } catch {
          sseClients.delete(send);
        }
      }
    };
    const statePayload = () => JSON.stringify({
      type: "state",
      stats: runner.todayStats(),
      paused: runner.activePauses()
    });
    runner.subscribeNotices(() => {
      for (const notice of runner.drainNotices()) {
        pushToAll(`data: ${JSON.stringify({ type: "notice", notice })}

`);
      }
    });
    runner.subscribeState(() => {
      pushToAll(`data: ${statePayload()}

`);
    });
    engineCtx.webServer.register({
      kind: "exact",
      path: "/api/auto-continue-bridge",
      handler: (req, res) => {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive"
        });
        res.write(`data: ${statePayload()}

`);
        const send = (data) => {
          res.write(data);
        };
        sseClients.add(send);
        req.on("close", () => sseClients.delete(send));
      }
    });
    engineCtx.webServer.register({
      kind: "exact",
      path: "/api/auto-continue-action",
      handler: (req, res) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString("utf8");
          if (body.length > 4096) req.destroy();
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            if (typeof parsed.action === "string") {
              runner.handleNoticeAction(parsed.sessionId ?? void 0, parsed.action);
              res.writeHead(200, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
              return;
            }
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false }));
          } catch {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false }));
          }
        });
      }
    });
  });
}
export {
  AUTO_CONTINUE_NS,
  AutoContinueSchema,
  apply
};
