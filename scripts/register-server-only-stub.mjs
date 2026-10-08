// Registers a resolution shim so server-only guard modules (and other
// Next-specific imports) can be loaded under tsx/node for audit tests.
// Test infrastructure only — never imported by the app.
import Module from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const stub = pathToFileURL(resolve(process.cwd(), "src/lib/stubs/empty.js")).href;

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") {
    return origResolve.call(this, stub, ...rest);
  }
  return origResolve.call(this, request, ...rest);
};
