import type { ProviderId } from "@app/auth"
import type { ComponentType } from "react"

import { EmailPasswordMethod } from "./email-password-method"

export type AuthMode = "login" | "signup"

export interface AuthMethodProps {
  mode: AuthMode
}

/**
 * The pluggable seam on the client: every provider id the server can enable
 * maps here to the component that renders it. A later task adds "google",
 * "apple", or "passkey" by adding an entry — the page shell, the fetch, and
 * the render loop below never change shape.
 *
 * A provider that is enabled server-side but has no entry here (true for
 * every method except email/password, until those tasks land) simply
 * contributes nothing: that is the intended forward-compatible state, not an
 * error.
 */
const METHOD_COMPONENTS: Partial<Record<ProviderId, ComponentType<AuthMethodProps>>> = {
  "email-password": EmailPasswordMethod,
}

/** The enabled methods this build actually has UI for, in server order. */
export function renderableMethods(methods: readonly ProviderId[]): ProviderId[] {
  return methods.filter((method) => method in METHOD_COMPONENTS)
}

export function AuthMethodList({
  methods,
  mode,
}: {
  methods: readonly ProviderId[]
  mode: AuthMode
}) {
  return (
    <>
      {renderableMethods(methods).map((method) => {
        const MethodComponent = METHOD_COMPONENTS[method]
        // renderableMethods already filtered to keys present in the map.
        if (!MethodComponent) return null
        return <MethodComponent key={method} mode={mode} />
      })}
    </>
  )
}
