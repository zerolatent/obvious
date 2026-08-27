import type { CBORType } from "@levischuck/tiny-cbor"
import { cose, isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers"
import { createHash, generateKeyPairSync, sign as signWithKey, type KeyObject } from "node:crypto"

interface StoredCredential {
  privateKey: KeyObject
  publicKeyCose: Uint8Array
  userId: Uint8Array
  counter: number
}

const FLAG_UP = 0x01 // user present
const FLAG_UV = 0x04 // user verified
const FLAG_AT = 0x40 // attested credential data included

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest())
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function uint32BE(value: number): Uint8Array {
  const buffer = new Uint8Array(4)
  new DataView(buffer.buffer).setUint32(0, value, false)
  return buffer
}

function uint16BE(value: number): Uint8Array {
  const buffer = new Uint8Array(2)
  new DataView(buffer.buffer).setUint16(0, value, false)
  return buffer
}

/** Builds the `authData` bytes a real authenticator produces, per the WebAuthn spec. */
function buildAuthenticatorData(options: {
  rpId: string
  flags: number
  counter: number
  attestedCredentialData?: Uint8Array
}): Uint8Array {
  return concatBytes(
    [
      sha256(new TextEncoder().encode(options.rpId)),
      new Uint8Array([options.flags]),
      uint32BE(options.counter),
      options.attestedCredentialData,
    ].filter((part): part is Uint8Array => part !== undefined),
  )
}

function buildClientDataJSON(options: { type: "webauthn.create" | "webauthn.get"; challenge: string; origin: string }): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      type: options.type,
      challenge: options.challenge,
      origin: options.origin,
      crossOrigin: false,
    }),
  )
}

function toBytes(value: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer> {
  // Always copy into a freshly allocated ArrayBuffer-backed view: the input
  // may be a Uint8Array over a SharedArrayBuffer or another typed array's
  // buffer, neither of which the CBOR/base64 helpers below accept.
  const view = value instanceof Uint8Array ? value : new Uint8Array("buffer" in value ? value.buffer : value)
  return new Uint8Array(view)
}

/**
 * A minimal `DOMException` stand-in: jsdom's own `DOMException` works fine,
 * but constructing it directly keeps this file usable in a plain Node
 * context too (no DOM globals required beyond what jsdom already patches
 * onto `navigator`).
 */
function notAllowedError(message: string): DOMException {
  return new DOMException(message, "NotAllowedError")
}

interface FakePublicKeyCredential {
  id: string
  rawId: Uint8Array
  type: "public-key"
  response: Record<string, unknown>
  authenticatorAttachment: null
  getClientExtensionResults: () => Record<string, never>
}

function fakeCredential(id: string, rawId: Uint8Array, response: Record<string, unknown>): PublicKeyCredential {
  const credential: FakePublicKeyCredential = {
    id,
    rawId,
    type: "public-key",
    response,
    authenticatorAttachment: null,
    getClientExtensionResults: () => ({}),
  }
  // @simplewebauthn/browser only reads the fields above off the credential
  // it gets back from navigator.credentials; the full DOM PublicKeyCredential
  // interface has members no test double can meaningfully implement.
  return credential as unknown as PublicKeyCredential
}

/**
 * A software WebAuthn authenticator standing in for a real security key or
 * platform authenticator in tests. It implements just enough of
 * `navigator.credentials.create()`/`.get()` for `@simplewebauthn/browser`'s
 * `startRegistration`/`startAuthentication` — invoked inside Better Auth's
 * passkey client — to produce responses `@simplewebauthn/server` accepts:
 * `fmt: "none"` attestation, a real ES256 (P-256) keypair, and a real
 * ASN.1 DER-encoded ECDSA assertion signature, exactly as the spec
 * requires and exactly what the real verification code checks.
 */
export class VirtualAuthenticator {
  private readonly credentials = new Map<string, StoredCredential>()

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
  ) {}

  /** Replaces `navigator.credentials` with this authenticator for the current test. */
  install(): void {
    Object.defineProperty(globalThis.navigator, "credentials", {
      configurable: true,
      value: {
        create: (options: CredentialCreationOptions) => this.create(options),
        get: (options: CredentialRequestOptions) => this.get(options),
      },
    })
  }

  /** How many credentials this authenticator currently holds (for assertions). */
  get credentialCount(): number {
    return this.credentials.size
  }

  /** Simulates the user dismissing the next ceremony's prompt instead of completing it. */
  cancelNextCeremony(): void {
    this.cancelled = true
  }

  private cancelled = false

  private async create(options: CredentialCreationOptions): Promise<PublicKeyCredential> {
    if (this.cancelled) {
      this.cancelled = false
      throw notAllowedError("The user cancelled the registration ceremony")
    }

    const publicKey = options.publicKey
    if (!publicKey) throw new Error("Missing publicKey options for credential creation")

    const { privateKey, publicKey: publicKeyObject } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    })
    const jwk = publicKeyObject.export({ format: "jwk" }) as { x: string; y: string }
    const x = isoBase64URL.toBuffer(jwk.x)
    const y = isoBase64URL.toBuffer(jwk.y)
    const publicKeyCose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [cose.COSEKEYS.kty, cose.COSEKTY.EC2],
        [cose.COSEKEYS.alg, cose.COSEALG.ES256],
        [cose.COSEKEYS.crv, cose.COSECRV.P256],
        [cose.COSEKEYS.x, x],
        [cose.COSEKEYS.y, y],
      ]),
    )

    const realCredentialId = crypto.getRandomValues(new Uint8Array(32))
    const credentialId = isoBase64URL.fromBuffer(realCredentialId)
    const userId = toBytes(publicKey.user.id)

    this.credentials.set(credentialId, { privateKey, publicKeyCose, userId, counter: 0 })

    const attestedCredentialData = concatBytes([
      new Uint8Array(16), // aaguid: zeroed out — this is a generic test authenticator, not a real model
      uint16BE(realCredentialId.length),
      realCredentialId,
      publicKeyCose,
    ])

    const authenticatorData = buildAuthenticatorData({
      rpId: this.rpId,
      flags: FLAG_UP | FLAG_UV | FLAG_AT,
      counter: 0,
      attestedCredentialData,
    })

    const clientDataJSON = buildClientDataJSON({
      type: "webauthn.create",
      challenge: isoBase64URL.fromBuffer(toBytes(publicKey.challenge)),
      origin: this.origin,
    })

    const attestationObject = isoCBOR.encode(
      new Map<string, CBORType>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authenticatorData],
      ]),
    )

    return fakeCredential(credentialId, realCredentialId, {
      attestationObject,
      clientDataJSON,
    })
  }

  private async get(options: CredentialRequestOptions): Promise<PublicKeyCredential> {
    if (this.cancelled) {
      this.cancelled = false
      throw notAllowedError("The user cancelled the authentication ceremony")
    }

    const publicKey = options.publicKey
    if (!publicKey) throw new Error("Missing publicKey options for credential request")

    const resolved = this.resolveCredential(publicKey)
    if (!resolved) throw notAllowedError("No matching passkey is registered on this authenticator")
    const [credentialId, credential] = resolved

    credential.counter += 1
    const authenticatorData = buildAuthenticatorData({
      rpId: this.rpId,
      flags: FLAG_UP | FLAG_UV,
      counter: credential.counter,
    })

    const clientDataJSON = buildClientDataJSON({
      type: "webauthn.get",
      challenge: isoBase64URL.fromBuffer(toBytes(publicKey.challenge)),
      origin: this.origin,
    })

    const signedData = concatBytes([authenticatorData, sha256(clientDataJSON)])
    const signature = signWithKey("sha256", signedData, credential.privateKey)

    return fakeCredential(credentialId, isoBase64URL.toBuffer(credentialId), {
      authenticatorData,
      clientDataJSON,
      signature,
      userHandle: credential.userId,
    })
  }

  private resolveCredential(
    publicKey: PublicKeyCredentialRequestOptions,
  ): [string, StoredCredential] | undefined {
    const allowList = publicKey.allowCredentials
      ?.map((descriptor) => isoBase64URL.fromBuffer(toBytes(descriptor.id)))
      .filter((id) => this.credentials.has(id))

    const [id] = allowList ?? []
    if (id !== undefined) {
      const credential = this.credentials.get(id)
      return credential ? [id, credential] : undefined
    }

    // Discoverable login: an empty/absent allow-list means the platform is
    // letting the user pick from whatever passkeys it holds for this RP. A
    // test authenticator only ever holds the one credential it registered.
    const [first] = this.credentials.entries()
    return first
  }
}
