import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceSvg = path.join(repoRoot, "assets/icons/sidekick.svg")
const templateSvg = path.join(repoRoot, "assets/icons/sidekick-template.svg")
const pngDir = path.join(repoRoot, "assets/icons/png")
const macDir = path.join(repoRoot, "assets/icons/mac")
const winDir = path.join(repoRoot, "assets/icons/win")
const trayDir = path.join(repoRoot, "assets/icons/tray")
const publicDir = path.join(repoRoot, "public")
const rendererPublicDir = path.join(repoRoot, "renderer/public")
const rendererSrcDir = path.join(repoRoot, "renderer/src")

const pngSizes = [16, 24, 32, 48, 64, 128, 192, 256, 512, 1024]
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const icnsEntries = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024]
]
const macIconsetEntries = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024]
]

async function renderPng(svgPath, size, outputPath) {
  await sharp(svgPath).resize(size, size).png().toFile(outputPath)
}

async function createIco(svgPath, outputPath) {
  const images = await Promise.all(
    icoSizes.map(async (size) => ({
      size,
      data: await sharp(svgPath).resize(size, size).png().toBuffer()
    }))
  )

  const headerSize = 6
  const directorySize = images.length * 16
  let offset = headerSize + directorySize
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size === 256 ? 0 : size, 0)
    entry.writeUInt8(size === 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })

  await fs.writeFile(outputPath, Buffer.concat([header, ...entries, ...images.map((image) => image.data)]))
}

async function createIcns(svgPath, outputPath) {
  const entries = await Promise.all(
    icnsEntries.map(async ([type, size]) => {
      const data = await sharp(svgPath).resize(size, size).png().toBuffer()
      const header = Buffer.alloc(8)
      header.write(type, 0, 4, "ascii")
      header.writeUInt32BE(data.length + 8, 4)
      return Buffer.concat([header, data])
    })
  )

  const body = Buffer.concat(entries)
  const header = Buffer.alloc(8)
  header.write("icns", 0, 4, "ascii")
  header.writeUInt32BE(body.length + 8, 4)
  await fs.writeFile(outputPath, Buffer.concat([header, body]))
}

async function copySvgTargets() {
  const svg = await fs.readFile(sourceSvg, "utf8")
  await fs.writeFile(path.join(publicDir, "sidekick.svg"), svg)
  await fs.writeFile(path.join(rendererSrcDir, "logo.svg"), svg)
}

async function main() {
  await Promise.all([
    fs.mkdir(pngDir, { recursive: true }),
    fs.mkdir(macDir, { recursive: true }),
    fs.mkdir(winDir, { recursive: true }),
    fs.mkdir(trayDir, { recursive: true }),
    fs.mkdir(publicDir, { recursive: true }),
    fs.mkdir(rendererPublicDir, { recursive: true }),
    fs.mkdir(rendererSrcDir, { recursive: true })
  ])

  await Promise.all([
    ...pngSizes.map((size) => renderPng(sourceSvg, size, path.join(pngDir, `${size}x${size}.png`))),
    renderPng(sourceSvg, 16, path.join(rendererPublicDir, "favicon.png")),
    renderPng(sourceSvg, 192, path.join(rendererPublicDir, "logo192.png")),
    renderPng(sourceSvg, 512, path.join(rendererPublicDir, "logo512.png")),
    renderPng(sourceSvg, 32, path.join(publicDir, "sidekick-32.png")),
    renderPng(sourceSvg, 18, path.join(trayDir, "sidekick.png")),
    renderPng(templateSvg, 18, path.join(trayDir, "sidekickTemplate.png"))
  ])

  await createIco(sourceSvg, path.join(winDir, "icon.ico"))
  await createIco(sourceSvg, path.join(rendererPublicDir, "favicon.ico"))
  await copySvgTargets()

  const iconsetDir = path.join(macDir, "icon.iconset")
  await fs.rm(iconsetDir, { recursive: true, force: true })
  await fs.mkdir(iconsetDir, { recursive: true })
  await Promise.all(
    macIconsetEntries.map(([filename, size]) =>
      renderPng(sourceSvg, size, path.join(iconsetDir, filename))
    )
  )

  const iconutil = spawnSync("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(macDir, "icon.icns")], {
    stdio: "inherit"
  })
  if (iconutil.status !== 0) {
    await createIcns(sourceSvg, path.join(macDir, "icon.icns"))
    console.warn("iconutil rejected the iconset; wrote macOS icns directly.")
  }

  console.log("Generated Sidekick icons from assets/icons/sidekick.svg")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
