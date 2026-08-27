import { createServer } from "node:http"

import { authMethodsResponse, createAuth } from "@app/auth"
import { toNodeHandler } from "better-auth/node"

/**
 * The headless server: no framework, just `createAuth()` mounted over
 * `node:http`. This is the minimum a deployment needs to run the auth
 * backend without a web app attached to it (a mobile-only product, a
 * service-to-service integration, etc.).
 */

interface ServerInstance {
  registry: ReturnType<typeof createAuth>["registry"]
  handleAuthRequest: ReturnType<typeof toNodeHandler>
}

// Lazy singleton: building at import time would require a live database
// during lint/typecheck tooling, which never sends a request. Deferring
// construction to the first request keeps DATABASE_URL a runtime-only
// requirement, mirroring apps/web's lib/auth.ts.
let instance: ServerInstance | undefined

function getInstance(): ServerInstance {
  if (!instance) {
    const { auth, registry } = createAuth()
    instance = { registry, handleAuthRequest: toNodeHandler(auth.handler) }
  }
  return instance
}

const PORT = Number(process.env.PORT ?? 4000)

const server = createServer((req, res) => {
  // Reuse the same registry-derived response apps/web's route returns, so
  // every client resolves the enabled set from one contract rather than a
  // second, possibly-drifting implementation of the same derivation.
  if (req.method === "GET" && req.url === "/api/auth-methods") {
    const body = JSON.stringify(authMethodsResponse(getInstance().registry))
    res.writeHead(200, { "content-type": "application/json" })
    res.end(body)
    return
  }

  void getInstance().handleAuthRequest(req, res)
})

server.listen(PORT, () => {
  console.log(`examples/api listening on http://localhost:${PORT}`)
})
