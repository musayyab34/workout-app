/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads existing TypeScript through a local transpiler */
const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
const orig = Module._resolveFilename;
Module._resolveFilename = function (s, p, ...r) {
  return orig.call(
    this,
    s.startsWith("@/") ? path.join(process.cwd(), "src", s.slice(2)) : s,
    p,
    ...r,
  );
};
require.extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    f,
  );
