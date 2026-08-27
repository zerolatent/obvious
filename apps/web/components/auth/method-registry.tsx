import type { ProviderId } from "@app/auth"
import type { ComponentType } from "react"

import { isPasskeySupported } from "../../lib/webauthn-support"
import { EmailPasswordMethod } from "./email-password-method"
import { PasskeyMethod } from "./passkey-method"
import { AppleMethod, GoogleMethod } from "./social-method"

export type AuthMode = "login" | "signup"

export interface AuthMethodProps {
  mode: AuthMode
}

interface MethodDefinition {
  component: ComponentType<AuthMethodProps>
  /**
   * An extra client-side gate beyond server enablement — e.g. browser
   * capability. Absent means "always renderable once the server enables
   * it." A method whose device can't run it must be hidden outright, never
   * shown disabled or broken, so this filters the method out of
   * `renderableMethods` entirely rather than rendering the component in a
   * disabled state.
   */
  isSupported?: () => boolean
}

/**
 * The pluggable seam on the client: every provider id the server can enable
 * maps here to the component that renders it. A later task adds another
 * provider by adding an entry — the page shell, the fetch, and the render
 * loop below never change shape.
 *
 * A provider that is enabled server-side but has no entry here simply
 * contributes nothing: that is the intended forward-compatible state, not
 * an error.
 */
const METHOD_DEFINITIONS: Partial<Record<ProviderId, MethodDefinition>> = {
  "email-password": { component: EmailPasswordMethod },
  google: { component: GoogleMethod },
  apple: { component: AppleMethod },
  passkey: { component: PasskeyMethod, isSupported: isPasskeySupported },
}

/**
 * The enabled methods this build actually has UI for AND can run on this
 * device, in server order.
 */
export function renderableMethods(methods: readonly ProviderId[]): ProviderId[] {
  return methods.filter((method) => {
    const definition = METHOD_DEFINITIONS[method]
    if (!definition) return false
    return definition.isSupported ? definition.isSupported() : true
  })
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
        const MethodComponent = METHOD_DEFINITIONS[method]?.component
        // renderableMethods already filtered to keys present in the map.
        if (!MethodComponent) return null
        return <MethodComponent key={method} mode={mode} />
      })}
    </>
  )
}
