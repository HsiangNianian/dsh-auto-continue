// Build both halves of the auto-continue plugin.
//
// Host half (src/index.ts → lib/index.js): a plain ESM node module the dsh
// host loader imports. No server-side behavior; kept for parity with the
// plugin manifest.
//
// Browser half (src/client/index.ts → lib/client.js): the dsh client module
// system loads each plugin bundle as a classic script that registers a
// lazy-CJS factory:
//
//   window.__ModuleLoader__.load({
//     id: "<package name>",
//     factory: (require) => {
//       var module = { exports: {} };
//       var exports = module.exports;
//       Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//       // ... CJS bundle body ...
//       return module.exports;
//     }
//   });
//
// esbuild emits plain CJS (module/exports/require globals) for format=cjs, so
// we wrap its output verbatim inside the factory. Every runtime dependency is
// external: the seed words are provided by the shell's static module table,
// and other dsh client packages are graph rows materialized by the loader's
// require on demand.
import { build, context } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const id = pkg.name;

/** Every specifier the factory require() must resolve at runtime. */
const EXTERNALS = [
  // platform seed words (shell static module table)
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-web-react",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-ui-attachment",
  "@deepseek-ai/dsh-client-schema-form",
  // graph-row packages (resolved through the module loader)
  "@deepseek-ai/dsh-client-connection",
  "@deepseek-ai/dsh-client-connection/client",
  "@deepseek-ai/dsh-client-runtime",
  "@deepseek-ai/dsh-client-runtime/client",
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-api-remotes",
  "@deepseek-ai/dsh-api-remotes/client",
  "@deepseek-ai/dsh-session",
  "@deepseek-ai/dsh-session/types",
  "@deepseek-ai/dsh-typert-protocol",
  "@deepseek-ai/dsh-host-apiproxy",
  "@deepseek-ai/dsh-host-apiproxy/api",
  "@deepseek-ai/dsh-llm",
  "@deepseek-ai/dsh-llm/types",
];

const clientOptions = {
  entryPoints: [join(root, "src/client/index.ts")],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: EXTERNALS,
  jsx: "automatic",
  sourcemap: true,
  write: false,
  logLevel: "info",
  charset: "utf8",
};

const hostOptions = {
  entryPoints: [join(root, "src/index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2020",
  external: [
    "@deepseek-ai/cordis",
    "@deepseek-ai/schemastery",
    "@deepseek-ai/dsh-settings",
  ],
  sourcemap: false,
  write: false,
  logLevel: "info",
  charset: "utf8",
};

/** Wrap esbuild's CJS output in the module-loader registration envelope. */
function wrap(body) {
  return `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(id)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
\t\treturn module.exports;
\t}
});
`;
}

async function writeOutputs(result, isClient) {
  mkdirSync(join(root, "lib"), { recursive: true });
  for (const file of result.outputFiles) {
    if (file.path.endsWith(".map")) {
      writeFileSync(join(root, "lib/client.js.map"), file.text);
    } else if (isClient) {
      // esbuild inlines the source map as a data URI when write:false; extract
      // it into a real lib/client.js.map (served by the host at
      // /plugins/<id>/client.js.map and attached to GitHub releases) and point
      // the bundle at it.
      let body = file.text;
      const mapComment = /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/.exec(body);
      if (mapComment) {
        writeFileSync(join(root, "lib/client.js.map"), Buffer.from(mapComment[1], "base64").toString("utf8"));
        body = body.slice(0, mapComment.index) + "//# sourceMappingURL=client.js.map";
      }
      writeFileSync(join(root, "lib/client.js"), wrap(body));
    } else {
      writeFileSync(join(root, "lib/index.js"), file.text);
    }
  }
}

async function main() {
  const watch = process.argv.includes("--watch");
  if (!watch) {
    const [clientResult, hostResult] = await Promise.all([build(clientOptions), build(hostOptions)]);
    await writeOutputs(clientResult, true);
    await writeOutputs(hostResult, false);
    console.log(
      `built lib/client.js (${readFileSync(join(root, "lib/client.js"), "utf8").length} bytes) + lib/index.js`,
    );
    return;
  }
  const client = await context(clientOptions);
  const host = await context(hostOptions);
  await client.watch();
  await host.watch();
  // HMR-friendly rebuild hook: rewrite the wrapped bundle on every rebuild.
  // (The profile's client-hmr row polls the file and pushes a reload frame.)
  client.onRebuild?.(async (error, result) => {
    if (error || !result) return;
    await writeOutputs(result, true);
    console.log(`[watch] rebuilt lib/client.js (${new Date().toLocaleTimeString()})`);
  });
  console.log("watching src/ …");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
