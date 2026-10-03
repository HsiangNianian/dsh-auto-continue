/** Host boundary fixture shared by focused recovery tests. */
import { apply } from '../lib/index.js';

export function makeHost(overrides = {}) {
  const config = { scanOnBoot: true, verbose: false, graceMs: 10, cooldownMs: 0, ...overrides };
  const agents = new Map();
  const handlers = new Map();
  const routes = new Map();
  const cleanups = [];
  let listReads = 0;
  const ctx = {
    agents: { list: () => { listReads += 1; return [...agents.values()]; }, get: (id) => agents.get(id) },
    webServer: {
      register(route) { routes.set(route.path, route); return () => routes.delete(route.path); },
    },
    on(name, callback) {
      const set = handlers.get(name) ?? new Set();
      handlers.set(name, set);
      set.add(callback);
      return () => set.delete(callback);
    },
    effect(start) { const stop = start(); if (typeof stop === 'function') cleanups.push(stop); },
    inject(deps, callback) { if (!deps.includes('settings')) callback(ctx); },
  };
  return {
    config,
    agents,
    listReads: () => listReads,
    start() { apply(ctx, config); },
    emit(agent, event) { for (const callback of handlers.get('session/event') ?? []) callback(agent.session, event); },
    agent(id, events = []) {
      const agent = {
        session: {
          id, header: {}, events,
          snapshotEvents() { agent.reads += 1; return [...events]; },
        },
        reads: 0,
        followups: [],
        inbox: { nextTurn: [] },
        followup(message) { this.followups.push(message); },
      };
      agents.set(id, agent);
      return agent;
    },
    stats() {
      let state;
      let close;
      routes.get('/api/auto-continue-bridge').handler({ on(_name, callback) { close = callback; } }, {
        writeHead() {}, end() {}, write(frame) { state = JSON.parse(frame.slice(6)); },
      });
      close();
      return state.stats;
    },
    postAction(payload) {
      const route = routes.get('/api/auto-continue-action');
      if (route === undefined) throw new Error('action route is not registered');
      return new Promise((resolve) => {
        const handlers = new Map();
        const req = {
          on(name, callback) { handlers.set(name, callback); return req; },
          destroy() {},
        };
        const res = {
          writeHead() {},
          end(body) { resolve(JSON.parse(body)); },
        };
        route.handler(req, res);
        handlers.get('data')?.(Buffer.from(JSON.stringify(payload)));
        handlers.get('end')?.();
      });
    },
    dispose() { for (const stop of cleanups.splice(0).reverse()) stop(); },
  };
}

export function turnEnd(turn, kind, extra = {}) {
  return { type: 'turn/end', seq: turn * 10, time: Date.now(), data: { turn, reason: { kind, ...extra } } };
}

export const turnStart = (turn) => ({ type: 'turn/start', seq: turn * 10 - 9, time: Date.now(), data: { turn } });
