import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const brandingDir = path.join(rootDir, 'public', 'branding')
const sourcePng = path.join(brandingDir, 'appicon.png')
const outputIco = path.join(brandingDir, 'appicon.ico')

async function generateIcon() {
  try {
    await fs.access(sourcePng)
  } catch {
    throw new Error(`Brak pliku ikony PNG: ${sourcePng}`)
  }

  const icoBuffer = await pngToIco(sourcePng)
  await fs.writeFile(outputIco, icoBuffer)
  console.log(`Wygenerowano ikonę instalatora: ${outputIco}`)
}

generateIcon().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
