import { authMethodsResponse } from "@app/auth"

import { getAuth } from "../../../lib/auth"

/** Read AUTH_PROVIDERS at request time, never at build time. */
export const dynamic = "force-dynamic"

/**
 * The method list the clients render their buttons from.
 *
 * Derived from the same registry the server was assembled with, so a method
 * advertised here always has routes behind it and vice versa.
 */
export function GET(): Response {
  return Response.json(authMethodsResponse(getAuth().registry))
}
