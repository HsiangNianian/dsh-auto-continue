import dns from 'node:dns';
import os from 'node:os';

/** Resolves `true` when the host looks online. Must never reject. */
export type ConnectivityProbe = () => Promise<boolean>;

/**
 * 任一可解析即视为在线。覆盖国内外网络; 只做 DNS 解析, 不建立连接、不发请求。
 * 走 fake-ip / TUN 代理时解析总会成功, 结果是"放行", 与关闭本功能等价, 不会误挂起。
 */
const PROBE_HOSTS = ['api.deepseek.com', 'www.baidu.com', 'one.one.one.one'] as const;
const PROBE_TIMEOUT_MS = 3000;

function hasExternalInterface(): boolean {
  try {
    return Object.values(os.networkInterfaces()).some(list =>
      list?.some(entry => !entry.internal) ?? false);
  } catch {
    return true; // 读不到网卡信息时不猜, 放行
  }
}

/** 显式 HTTP(S) 代理下本地 DNS 可能本就不可用, 只看网卡, 避免永久误判断网。 */
function usesExplicitProxy(): boolean {
  const env = process.env;
  return [env.HTTPS_PROXY, env.https_proxy, env.HTTP_PROXY, env.http_proxy, env.ALL_PROXY, env.all_proxy]
    .some(value => typeof value === 'string' && value.trim() !== '');
}

function lookupWithin(host: string, ms: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dns lookup timed out: ${host}`)), ms);
    (timer as { unref?: () => void }).unref?.();
    dns.promises.lookup(host).then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

/** Host-side connectivity check: a non-loopback interface plus one resolvable public name. */
export const probeConnectivity: ConnectivityProbe = async () => {
  if (!hasExternalInterface()) return false;
  if (usesExplicitProxy()) return true;
  return new Promise<boolean>((resolve) => {
    let pending: number = PROBE_HOSTS.length;
    for (const host of PROBE_HOSTS) {
      lookupWithin(host, PROBE_TIMEOUT_MS).then(
        () => resolve(true),
        () => { pending -= 1; if (pending === 0) resolve(false); },
      );
    }
  });
};
