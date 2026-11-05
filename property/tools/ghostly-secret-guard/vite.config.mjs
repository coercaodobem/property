import path from "node:path";
import { fileURLToPath } from "node:url";

const configPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(configPath), "../../..");

export default {
  configFile: false,
  build: {
    lib: {
      entry: path.join(path.dirname(configPath), "entry.ts"),
      name: "PropertySecretGuardBundle",
      formats: ["iife"],
      fileName: () => "secret-guard.js",
    },
    outDir: path.join(repoRoot, "property/web"),
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: { entryFileNames: "secret-guard.js" },
    },
  },
};
