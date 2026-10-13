import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from "node:crypto";

// A software WebAuthn authenticator, so Vitest can run real passkey
// ceremonies against the auth module: ES256 keys, "none" attestation, and
// the same JSON the browser's @simplewebauthn/browser posts.

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_DATA = 0x40;
const COSE_KEY_TYPE_EC2 = 2;
const COSE_ALG_ES256 = -7;
const COSE_CURVE_P256 = 1;
const ZERO_AAGUID = new Uint8Array(16);

type CeremonyOptions = { userVerified?: boolean };

// The parts of the server's options JSON the authenticator reads.
type RegistrationOptionsJSON = {
  challenge: string;
  rp: { id?: string };
  user: { id: string };
};
type AuthenticationOptionsJSON = {
  challenge: string;
  allowCredentials?: { id: string }[];
};

export type CredentialJSON = {
  id: string;
  rawId: string;
  type: "public-key";
  authenticatorAttachment: "platform";
  clientExtensionResults: Record<string, never>;
  response: Record<string, unknown>;
};

type Credential = {
  id: Uint8Array;
  privateKey: KeyObject;
  publicKey: KeyObject;
  userHandle: string;
  signCount: number;
};

export class SoftAuthenticator {
  private readonly credentials: Credential[] = [];
  private readonly rpIdHash: Uint8Array;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
  ) {
    this.rpIdHash = sha256(new TextEncoder().encode(rpId));
  }

  get credentialIds(): string[] {
    return this.credentials.map((credential) => toBase64Url(credential.id));
  }

  // navigator.credentials.create() for these options.
  createCredential(
    options: RegistrationOptionsJSON,
    { userVerified = true }: CeremonyOptions = {},
  ): CredentialJSON {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const credential: Credential = {
      id: new Uint8Array(randomBytes(16)),
      privateKey,
      publicKey,
      userHandle: options.user.id,
      signCount: 0,
    };
    this.credentials.push(credential);

    const authenticatorData = concat(
      this.rpIdHash,
      [toFlags(userVerified) | FLAG_ATTESTED_DATA],
      uint32(credential.signCount),
      ZERO_AAGUID,
      uint16(credential.id.length),
      credential.id,
      encodeCoseKey(publicKey),
    );
    const attestationObject = encodeCbor(
      new Map<string | number, CborValue>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authenticatorData],
      ]),
    );
    const id = toBase64Url(credential.id);
    return {
      id,
      rawId: id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: this.clientData("webauthn.create", options.challenge),
        attestationObject: toBase64Url(attestationObject),
        transports: ["internal"],
      },
    };
  }

  // navigator.credentials.get() for these options, answered with the given
  // credential (default: the first one the options allow).
  getAssertion(
    options: AuthenticationOptionsJSON,
    {
      userVerified = true,
      credentialId,
    }: CeremonyOptions & { credentialId?: string } = {},
  ): CredentialJSON {
    const allowed = options.allowCredentials?.map((entry) => entry.id);
    const wanted = credentialId ?? allowed?.[0] ?? this.credentialIds[0];
    const credential = this.credentials.find(
      (candidate) => toBase64Url(candidate.id) === wanted,
    );
    if (!credential) throw new Error(`no credential ${wanted}`);

    credential.signCount += 1;
    const authenticatorData = concat(
      this.rpIdHash,
      [toFlags(userVerified)],
      uint32(credential.signCount),
    );
    const clientDataJSON = this.clientData("webauthn.get", options.challenge);
    const signature = sign(
      "sha256",
      concat(authenticatorData, sha256(fromBase64Url(clientDataJSON))),
      credential.privateKey,
    );
    const id = toBase64Url(credential.id);
    return {
      id,
      rawId: id,
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON,
        authenticatorData: toBase64Url(authenticatorData),
        signature: toBase64Url(signature),
        userHandle: credential.userHandle,
      },
    };
  }

  private clientData(type: string, challenge: string): string {
    const json = JSON.stringify({
      type,
      challenge,
      origin: this.origin,
      crossOrigin: false,
    });
    return toBase64Url(new TextEncoder().encode(json));
  }
}

function toFlags(userVerified: boolean): number {
  return FLAG_USER_PRESENT | (userVerified ? FLAG_USER_VERIFIED : 0);
}

function encodeCoseKey(publicKey: KeyObject): Uint8Array {
  const jwk = publicKey.export({ format: "jwk" });
  if (!jwk.x || !jwk.y) throw new Error("not an EC public key");

  return encodeCbor(
    new Map<string | number, CborValue>([
      [1, COSE_KEY_TYPE_EC2],
      [3, COSE_ALG_ES256],
      [-1, COSE_CURVE_P256],
      [-2, fromBase64Url(jwk.x)],
      [-3, fromBase64Url(jwk.y)],
    ]),
  );
}

// Just enough CBOR for an attestation object and a COSE key.
type CborValue = number | string | Uint8Array | Map<string | number, CborValue>;

const CBOR_UNSIGNED = 0;
const CBOR_NEGATIVE = 1;
const CBOR_BYTES = 2;
const CBOR_TEXT = 3;
const CBOR_MAP = 5;

function encodeCbor(value: CborValue): Uint8Array {
  let encoded: Uint8Array;
  if (typeof value === "number") {
    encoded =
      value >= 0
        ? cborHead(CBOR_UNSIGNED, value)
        : cborHead(CBOR_NEGATIVE, -1 - value);
  } else if (typeof value === "string") {
    const text = new TextEncoder().encode(value);
    encoded = concat(cborHead(CBOR_TEXT, text.length), text);
  } else if (value instanceof Uint8Array) {
    encoded = concat(cborHead(CBOR_BYTES, value.length), value);
  } else {
    const entries = [...value].map(([key, entry]) =>
      concat(encodeCbor(key), encodeCbor(entry)),
    );
    encoded = concat(cborHead(CBOR_MAP, value.size), ...entries);
  }
  return encoded;
}

function cborHead(major: number, length: number): Uint8Array {
  const type = major << 5;
  let head: Uint8Array;
  if (length < 24) {
    head = Uint8Array.of(type | length);
  } else if (length < 0x100) {
    head = Uint8Array.of(type | 24, length);
  } else {
    head = concat([type | 25], uint16(length));
  }
  return head;
}

function uint16(value: number): Uint8Array {
  return Uint8Array.of(value >> 8, value & 0xff);
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  return new Uint8Array(parts.flatMap((part) => [...part]));
}

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

function toBase64Url(data: Uint8Array): string {
  return Buffer.from(data).toString("base64url");
}

function fromBase64Url(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64url"));
}
