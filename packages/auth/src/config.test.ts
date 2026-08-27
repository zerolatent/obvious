import { describe, expect, it } from "vitest"

import {
  authMethodsResponse,
  createProviderRegistry,
  DEFAULT_PROVIDERS,
  parseProviders,
} from "./config"

describe("parseProviders", () => {
  it("falls back to the default set when AUTH_PROVIDERS is unset or blank", () => {
    expect(parseProviders(undefined)).toEqual([...DEFAULT_PROVIDERS])
    expect(parseProviders("")).toEqual([...DEFAULT_PROVIDERS])
    expect(parseProviders("  , ,")).toEqual([...DEFAULT_PROVIDERS])
  })

  it("trims entries and ignores the order they were written in", () => {
    expect(parseProviders(" passkey , email-password ")).toEqual(["email-password", "passkey"])
  })

  it("deduplicates repeated ids", () => {
    expect(parseProviders("google,google,email-password")).toEqual(["email-password", "google"])
  })

  it("throws on an unknown id rather than silently dropping it", () => {
    // A typo'd provider is a deployment that quietly loses a login method;
    // failing at boot is the whole point of the registry.
    expect(() => parseProviders("email-password,githubb")).toThrowError(/githubb/)
  })

  it("names every unknown id in one error", () => {
    expect(() => parseProviders("facebook,twitter")).toThrowError(/facebook, twitter/)
  })

  it("is case sensitive — ids are literals, not free text", () => {
    expect(() => parseProviders("Google")).toThrowError(/Google/)
  })
})

describe("createProviderRegistry", () => {
  it("answers membership for the parsed set", () => {
    const registry = createProviderRegistry("email-password,passkey")
    expect(registry.has("email-password")).toBe(true)
    expect(registry.has("passkey")).toBe(true)
    expect(registry.has("google")).toBe(false)
    expect(registry.has("apple")).toBe(false)
  })
})

describe("authMethodsResponse", () => {
  it("returns the enabled set in canonical order", () => {
    const registry = createProviderRegistry("passkey,apple,email-password")
    expect(authMethodsResponse(registry)).toEqual({
      methods: ["email-password", "apple", "passkey"],
    })
  })

  it("copies the list so a caller cannot mutate the registry", () => {
    const registry = createProviderRegistry("email-password")
    const response = authMethodsResponse(registry)
    response.methods.push("google")
    expect(registry.enabled).toEqual(["email-password"])
  })
})
