Sidekick Local Runtime
======================

Release builds can bundle a local model runtime here so non-technical users do
not need to install Ollama or any other developer tool.

Expected layout:

- macOS Apple Silicon: `assets/runtime/macos-arm64/ollama`
- macOS Intel: `assets/runtime/macos-x64/ollama`
- Windows x64: `assets/runtime/windows-x64/ollama.exe`
- Linux x64: `assets/runtime/linux-x64/ollama`

The app copies `assets/` into Electron resources. At runtime, Sidekick first
checks these bundled paths, then an app-managed runtime under user data, then
offers in-app runtime setup if no binary is present.

Use this command before packaging to fetch the runtime for the current platform:

```sh
npm run runtime:download
```

`npm run app:build` runs that command automatically.

Only the runtime should be bundled. Model weights are intentionally excluded so
the first installer stays small. Users choose a language profile in the app, and
the selected model downloads directly through the local runtime from the upstream
model registry.

Bundled binaries must be executable on Unix platforms:

```sh
chmod +x assets/runtime/macos-arm64/ollama
```
