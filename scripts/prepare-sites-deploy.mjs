import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')
const clientTarget = path.join(dist, 'client', 'building-manager')
const serverTarget = path.join(dist, 'server')
const entries = await fs.readdir(dist, { withFileTypes: true })

await fs.rm(path.join(dist, 'client'), { recursive: true, force: true })
await fs.rm(serverTarget, { recursive: true, force: true })
await fs.mkdir(clientTarget, { recursive: true })

for (const entry of entries) {
  if (entry.name === 'client' || entry.name === 'server' || entry.name === '.openai') continue
  await fs.cp(path.join(dist, entry.name), path.join(clientTarget, entry.name), { recursive: true })
}

await fs.mkdir(serverTarget, { recursive: true })
await fs.writeFile(path.join(serverTarget, 'index.js'), `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return Response.redirect(new URL("/building-manager/", url), 302);
    }
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    if (url.pathname.startsWith("/building-manager/")) {
      return env.ASSETS.fetch(new Request(new URL("/building-manager/index.html", url), request));
    }
    return response;
  }
};
`, 'utf8')

console.log('Sites deployment bundle prepared.')
