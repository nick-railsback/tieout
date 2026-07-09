# viem — Core Utilities

viem ships a large surface of pure, tree-shakeable helper functions for the low-level work of Ethereum: converting between hex/bytes/numbers, manipulating byte data, formatting token amounts, hashing, deriving/validating addresses, and working with signatures. They are framework-agnostic (no client needed) and import directly from `viem`. This file catalogs those standalone utilities by category.

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [Mental model & shared conventions](#mental-model--shared-conventions)
- [Data: byte/hex primitives](#data-bytehex-primitives)
- [Encoding: values ⇄ hex/bytes](#encoding-values--hexbytes)
- [RLP](#rlp)
- [Units (wei / gwei / ether)](#units-wei--gwei--ether)
- [Hashing](#hashing)
- [Address](#address)
- [Signatures](#signatures)
- [Encoding extras & out of scope](#encoding-extras--out-of-scope)

## Mental model & shared conventions

Two data types recur everywhere: `Hex` (a `` `0x${string}` `` prefixed string) and `ByteArray` (a `Uint8Array`). Most helpers accept and preserve either — e.g. `slice`, `pad`, `concat`, and `trim` are generic over `Hex | ByteArray` and return the same shape they were given. `size` is always measured in **bytes**, not hex characters or array elements-in-doubt.

The `size` option that many encoders accept means the fixed byte-width of the output (a 32-byte word is `size: 32`), and passing a value that overflows that width throws `SizeOverflowError`. Numeric values are amounts of type `bigint` unless the API is explicitly a JS `number`. Every function also exports a matching `*ErrorType` union so callers can narrow errors in TypeScript; those are documentation-only types and carry no runtime cost.

- Data helpers (generic over Hex/ByteArray): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/data/slice.ts#L28-L41
- `assertSize` / `SizeOverflowError`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/fromHex.ts#L21-L30

## Data: byte/hex primitives

`concat(values)` joins an array of all-hex or all-bytes values into one of the same type (it branches on the first element). `size(value)` returns the byte length. `isHex(value, { strict })` tests for a `0x` string — `strict` (default `true`) additionally requires the body to be valid hex digits. `isBytes(value)` tests for a `Uint8Array`.

- `concat`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/data/concat.ts#L13-L44
- `size`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/data/size.ts#L14-L17
- `isHex` (strict default true): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/data/isHex.ts#L6-L13
- `isBytes`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/data/isBytes.ts#L6-L13

`pad(value, { dir, size = 32 })` pads to a fixed byte-width, defaulting to a 32-byte word and left-padding (`dir: 'right'` for right-pad); it throws `SizeExceedsPaddingSizeError` if the value is already larger than `size`. `padHex`/`padBytes` are the typed variants. `trim(value, { dir = 'left' })` is the inverse, stripping leading (or with `dir: 'right'`, trailing) zero bytes. `slice(value, start, end, { strict })` returns a byte-offset section; with `strict: true` it asserts the resulting length matches `end - start`.

```ts
pad('0x1a4')                        // '0x00...01a4' (32 bytes)
pad('0x1a4', { size: 4 })           // '0x000001a4'
trim('0x000001a4')                  // '0x01a4'
slice('0x0123456789', 1, 4)         // '0x234567'
```

- `pad` (default size 32, left dir): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/data/pad.ts#L18-L43
- `trim` (default dir left): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/data/trim.ts#L13-L38
- `slice` + strict end-offset assert: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/data/slice.ts#L28-L78

## Encoding: values ⇄ hex/bytes

`toHex(value, { size? })` encodes a `string | number | bigint | boolean | ByteArray` to `Hex`, dispatching to `numberToHex`, `stringToHex`, `boolToHex`, or `bytesToHex`. A key gotcha: numbers are **left**-padded to `size` (big-endian integer) while strings and bytes are **right**-padded (they read left-to-right). `numberToHex` supports `{ signed: true }` for two's-complement and throws `IntegerOutOfRangeError` when the value exceeds the width.

- `toHex` dispatch: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/toHex.ts#L52-L63
- `numberToHex` (signed, size, range check): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/toHex.ts#L182-L216
- `bytesToHex` right-pads: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/toHex.ts#L131-L143

`fromHex(hex, to)` decodes the other direction, where `to` is `'string' | 'number' | 'bigint' | 'bytes' | 'boolean'` (or an options object with `to` and `size`). The individual decoders are also exported: `hexToNumber`, `hexToBigInt` (with `signed`), `hexToString`, `hexToBool`, and `hexToBytes`. `hexToNumber` throws if the value isn't a safe JS integer — reach for `hexToBigInt` past 2^53.

```ts
toHex(420)                              // '0x1a4'
toHex('Hello', { size: 32 })            // right-padded
fromHex('0x1a4', 'number')              // 420
fromHex('0x...', { to: 'bigint', signed: true })
```

- `fromHex` dispatch: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/fromHex.ts#L91-L102
- `hexToBigInt` / `hexToNumber` (signed, safe-int guard): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/fromHex.ts#L132-L226

`toBytes(value, { size? })` mirrors `toHex` but returns a `Uint8Array`; note it treats a `0x`-prefixed input as hex (`hexToBytes`) rather than a UTF-8 string. `fromBytes(bytes, to)` decodes to `'string' | 'hex' | 'bigint' | 'number' | 'boolean'`. `hexToBytes`/`bytesToHex` are the direct hex⇄bytes converters used throughout the codebase.

- `toBytes` (hex-vs-string branch) + `hexToBytes`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/toBytes.ts#L54-L175
- `fromBytes` dispatch: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/fromBytes.ts#L70-L88

## RLP

`toRlp(value, to = 'hex')` recursive-length-prefix-encodes a (possibly nested) array of hex or byte values into `Hex` (or `'bytes'`). `fromRlp(value, to = 'hex')` decodes back, guarding against malformed input and enforcing a 1024-level nesting depth limit (`RlpDepthLimitExceededError`). These underpin transaction and CREATE-address serialization.

```ts
toRlp(['0x123456789', '0x123456789'])   // '0x...'
fromRlp('0x...', 'hex')
```

- `toRlp`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/toRlp.ts#L32-L42
- `fromRlp` (depth limit): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/encoding/fromRlp.ts#L36-L69

## Units (wei / gwei / ether)

On-chain amounts are integers of the smallest unit (**wei**), so viem represents them as `bigint` and gives you string ⇄ bigint converters. `parseUnits(value, decimals)` multiplies a decimal string by `10 ** decimals` and returns a `bigint`; it validates the format, and if the fraction has more digits than `decimals` it **rounds** (not truncates) the excess. `formatUnits(value, decimals)` is the inverse, dividing and trimming trailing zeros to produce a human string.

- `parseUnits` (validation + rounding): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/parseUnits.ts#L17-L57
- `formatUnits`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/formatUnits.ts#L16-L32

The named wrappers hard-code the decimal counts: ether = 18, gwei = 9. `parseEther('1.5')` → `1500000000000000000n`; `formatEther(wei)` → ether string; `parseGwei('420')` → wei bigint for gas prices; `formatGwei(wei)` → gwei string. Use `parseUnits`/`formatUnits` directly for ERC-20 tokens with non-18 decimals (e.g. USDC's 6).

```ts
parseEther('1.5')          // 1500000000000000000n
formatEther(10n ** 18n)    // '1'
parseGwei('420')           // 420000000000n
parseUnits('1.5', 6)       // 1500000n  (USDC)
```

- `parseEther` / `formatEther`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/parseEther.ts#L19-L21
- `parseGwei`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/unit/parseGwei.ts#L19-L21
- Decimal constants (ether 18, gwei 9): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/constants/unit.ts#L1-L12

## Hashing

`keccak256(value, to = 'hex')` is the workhorse Ethereum hash; it accepts `Hex | ByteArray` and returns `Hex` (or bytes). `sha256` and `ripemd160` have the identical signature (both delegate to `@noble/hashes`) for the occasional non-EVM need. `isHash(value)` checks a value is a `0x` string of exactly 32 bytes.

```ts
keccak256('0xdeadbeef')                 // '0x...'
keccak256(toBytes('hello'), 'bytes')    // Uint8Array
```

- `keccak256`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/hash/keccak256.ts#L21-L31
- `sha256`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/hash/sha256.ts#L21-L31
- `ripemd160`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/hash/ripemd160.ts#L21-L31
- `isHash`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/hash/isHash.ts#L8-L10

For ABI dispatch, `toFunctionSelector(fn)` returns the 4-byte selector (the first 4 bytes of the keccak of the normalized signature), while `toEventSelector(event)` returns the full 32-byte topic hash. Both accept either a human-readable string (`'function ownerOf(uint256 tokenId)'`) or an AbiItem object. `toFunctionSignature`/`toEventSignature` return just the normalized signature string (`'ownerOf(uint256)'`) — both are aliases of the shared `toSignature`, which normalizes and drops names/modifiers before hashing.

```ts
toFunctionSelector('function ownerOf(uint256 tokenId)') // '0x6352211e'
toEventSelector('Transfer(address,address,uint256)')    // '0xddf252ad...'
```

- `toFunctionSelector` (first 4 bytes): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/hash/toFunctionSelector.ts#L22-L23
- `toEventSelector` = full signature hash: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/hash/toEventSelector.ts#L16
- `toSignatureHash` / `toSignature` normalize: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/hash/toSignature.ts#L28-L34

## Address

`getAddress(address)` validates an address and returns its EIP-55 checksummed form; it throws `InvalidAddressError` on malformed input. Checksumming is derived by keccak-hashing the lowercase hex and upper-casing nibbles per the hash; results are memoized in an LRU cache for speed. It accepts an optional `chainId` for EIP-1191, but the source explicitly warns that EIP-1191 checksums are **not** ecosystem-compatible and should generally be avoided.

- `getAddress` (EIP-55) + `checksumAddress` + EIP-1191 warning: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/address/getAddress.ts#L20-L81

`isAddress(address, { strict })` is a type guard; `strict` (default `true`) requires the input to match its own checksum, so a lowercased address returns `false` under strict mode — pass `{ strict: false }` to accept any well-formed address regardless of casing. `isAddressEqual(a, b)` compares two addresses case-insensitively (both must be valid or it throws).

- `isAddress` (strict default true): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/address/isAddress.ts#L22-L39
- `isAddressEqual`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/address/isAddressEqual.ts#L13-L19

`getContractAddress(opts)` computes a not-yet-deployed contract's address. With `opcode: 'CREATE'` (default) it hashes RLP of `[from, nonce]` — pass `{ from, nonce }` as a `bigint` nonce. With `opcode: 'CREATE2'` it hashes `0xff ++ from ++ salt ++ keccak256(bytecode)`, taking `{ from, salt, bytecode }` (or a precomputed `bytecodeHash`). `getCreate2Address` is the direct CREATE2 export.

```ts
getContractAddress({ from, nonce: 0n })
getContractAddress({ opcode: 'CREATE2', from, salt, bytecode })
```

- `getContractAddress` / `getCreateAddress` / `getCreate2Address`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/address/getContractAddress.ts#L36-L87

## Signatures

`hashMessage(message)` produces the EIP-191 personal-sign digest: it prefixes the message with `"\x19Ethereum Signed Message:\n" + length` before keccak-hashing. `message` is a `SignableMessage` — either a UTF-8 `string` or `{ raw: Hex | ByteArray }` to sign arbitrary bytes without UTF-8 encoding. `hashTypedData(parameters)` computes the EIP-712 typed-data digest from `{ domain, types, primaryType, message }`, validating the data against the declared types.

- `hashMessage` + prefix: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/hashMessage.ts#L14-L19
- EIP-191 prefixing (`toPrefixedMessage`): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/toPrefixedMessage.ts#L19-L26
- `SignableMessage` (`string | { raw }`): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/misc.ts#L7-L12
- `hashTypedData`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/hashTypedData.ts#L46-L60

The recovery family is `async` (it lazily imports `@noble/curves`). `recoverPublicKey({ hash, signature })` returns the uncompressed public key from a 65-byte/`Signature` over a digest; `recoverAddress({ hash, signature })` derives the signer address from it. The convenience wrappers hash for you: `recoverMessageAddress({ message, signature })` and `recoverTypedDataAddress({ ...typedData, signature })`.

- `recoverAddress` / `recoverPublicKey`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/recoverPublicKey.ts#L24-L57
- `recoverMessageAddress`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/recoverMessageAddress.ts#L27-L32
- `recoverTypedDataAddress`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/recoverTypedDataAddress.ts#L25-L42

`verifyMessage({ address, message, signature })` and `verifyTypedData({ address, ...typedData, signature })` return a boolean by recovering the signer and comparing to `address`. Gotcha: these standalone helpers only support Externally Owned Accounts — for smart-contract signatures (EIP-1271/6492) use the client actions `publicClient.verifyMessage` / `verifyTypedData` instead.

- `verifyMessage` (EOA-only note): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/verifyMessage.ts#L36-L57
- `verifyTypedData`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/verifyTypedData.ts#L45-L45

For the wire format, `serializeSignature({ r, s, yParity | v })` packs a structured signature into 65-byte hex (it normalizes `v`↔`yParity`), and `parseSignature(hex)` unpacks hex back into `{ r, s, yParity, v? }`. `compactSignatureToSignature` converts EIP-2098 compact `{ r, yParityAndS }` into the full form. `isErc6492Signature(sig)` detects the ERC-6492 wrapper by its trailing 32-byte magic suffix (used for signatures from not-yet-deployed smart accounts).

```ts
serializeSignature({ r, s, yParity: 1 })  // '0x...1c' (65 bytes)
parseSignature('0x...')                    // { r, s, v: 28n, yParity: 1 }
```

- `serializeSignature`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/serializeSignature.ts#L38-L57
- `parseSignature`: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/parseSignature.ts#L22-L44
- `compactSignatureToSignature` (EIP-2098): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/compactSignatureToSignature.ts#L28-L37
- `isErc6492Signature` (magic-bytes check): https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/signature/isErc6492Signature.ts#L11-L15

## Encoding extras & out of scope

`toBase58`/`fromBase58` and `toBase64`/`fromBase64` are listed in the docs but are placeholder ("Coming soon") pages in this version — no corresponding `src/utils/**` implementation exists at this commit, so treat them as not-yet-available rather than importable.

- Base58 doc placeholder: https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/utilities/toBase58.md#L1-L3

Out of scope (documented elsewhere): the ABI parameter codec `encodeAbiParameters` / `encodePacked` → see `wevm-viem-abi.md`; ENS `namehash` / `normalize` / `labelhash` → see `wevm-viem-ens.md`.
