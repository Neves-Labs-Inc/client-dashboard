import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";
import { isVercelBuild } from "./app/lib/env.ts";

// The Vercel preset splits the server build per function, which breaks
// `react-router-serve ./build/server/index.js`, so it only applies on Vercel.
export default {
  ssr: true,
  presets: isVercelBuild() ? [vercelPreset()] : [],
} satisfies Config;
