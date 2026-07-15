import * as fs from 'node:fs'
import * as path from 'node:path'

export function resolveSnapArtifactPath(appDir: string, artifactPath: string): string {
  if (!artifactPath.endsWith('.snap')) {
    throw new Error(`Snap artifact path must end with .snap: ${artifactPath}`)
  }

  const resolved = path.resolve(appDir, artifactPath)
  const relative = path.relative(path.resolve(appDir), resolved)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Snap artifact path must stay inside the app directory: ${artifactPath}`)
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Snap artifact not found: ${resolved}`)
  }

  return resolved
}
