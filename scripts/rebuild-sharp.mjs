import { spawnSync } from "node:child_process"

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"

const result = spawnSync(npmCommand, ["rebuild", "sharp"], {
  stdio: "inherit",
  env: {
    ...process.env,
    SHARP_IGNORE_GLOBAL_LIBVIPS: "1"
  }
})

process.exit(result.status ?? 1)
