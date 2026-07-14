# viem — ABI Encoding & Human-Readable ABIs

The low-level ABI codec (`encodeAbiParameters`/`decodeAbiParameters`/`encodePacked`), the human-readable ABI parsers re-exported from **abitype** (`parseAbi` and friends), and `getAbiItem` for pulling a typed function/event/error out of an ABI. This is the primitive layer under viem's contract actions — reach for it directly only when you're serializing raw parameters or building calldata by hand.

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [Mental model](#mental-model)
- [Human-readable ABIs and abitype](#human-readable-abis-and-abitype)
- [encodeAbiParameters / decodeAbiParameters](#encodeabiparameters--decodeabiparameters)
- [encodePacked](#encodepacked)
- [getAbiItem and overload resolution](#getabiitem-and-overload-resolution)
- [Raw codec vs contract actions](#raw-codec-vs-contract-actions)

## Mental model

An ABI in viem is just an array of items (`function`, `event`, `error`, `constructor`, …), each with `inputs`/`outputs` that are `AbiParameter` objects of shape `{ name, type }` (with nested `components` for tuples). Two ways to author one: write the JSON array literally with `as const`, or write Solidity-style signature strings and run them through `parseAbi`. Either way the result is a fully-typed `Abi` that every viem primitive and contract action accepts. The raw codec functions below are the bottom of the stack — `encodeAbiParameters` is used internally by `encodeFunctionData`, `encodeEventTopics`, and the rest, and `decodeAbiParameters` backs `decodeFunctionData`/`decodeEventLog`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/abi/encodeAbiParameters.md#L7-L9
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/abi/decodeAbiParameters.md#L3-L5

## Human-readable ABIs and abitype

`parseAbi`, `parseAbiItem`, `parseAbiParameter`, and `parseAbiParameters` are re-exported verbatim from **abitype** — viem does not reimplement them, it just surfaces them from its top-level entrypoint alongside the `ParseAbi*` type-level equivalents. They convert Solidity signature strings into the exact same typed ABI objects you'd write by hand, which is the ergonomic way to define ABIs.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/index.ts#L23-L37

- `parseAbi(signatures: string[])` → an `Abi` array. Feed it the whole contract surface you care about: `parseAbi(['function balanceOf(address) view returns (uint256)', 'event Transfer(address indexed from, address indexed to, uint256 amount)'])`. Pass the result straight to `readContract`/`writeContract`.
- `parseAbiItem(signature)` → a single ABI item (function/event/error). Multi-string form lets a signature reference a `struct` you declare in the same array.
- `parseAbiParameter('address from')` → one `AbiParameter`; `parseAbiParameters('address from, address to, uint256 amount')` → a fixed-length tuple of `AbiParameter`s. These two feed the raw codec directly (see below), not the contract actions.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/abi/parseAbi.md#L21-L30
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/abi/parseAbiItem.md#L36-L48

The payoff is abitype's compile-time inference. Because these functions return `const`-narrowed types (and any hand-written ABI should carry `as const`), TypeScript can enforce valid function names, argument tuples, and return shapes at every call site — `readContract({ abi, functionName: 'balanceOf', args: ['0x…'] })` red-squiggles a wrong name or arg count before you run it. A plain `Abi` typed value (no `const`) loses this and degrades to loose `unknown`/`AbiItem | undefined` inference, so keep ABIs `const`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/abi/parseAbiItem.md#L20-L27

## encodeAbiParameters / decodeAbiParameters

`encodeAbiParameters(params, values)` serializes a list of values to standard ABI hex. `params` is an array of `{ name?, type }` (the shape of an ABI item's `inputs`/`outputs`), and `values` is the matching tuple; a length mismatch throws `AbiEncodingLengthMismatchError` up front, and an all-static empty result returns `'0x'`. Types are inferred from `params`, so `values` is checked against them.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeAbiParameters.ts#L86-L107

```ts
import { encodeAbiParameters, parseAbiParameters } from 'viem'

// object form
const data = encodeAbiParameters(
  [{ name: 'x', type: 'string' }, { name: 'y', type: 'uint' }, { name: 'z', type: 'bool' }],
  ['wagmi', 420n, true],
)
// human-readable form — identical result
const data2 = encodeAbiParameters(parseAbiParameters('string x, uint y, bool z'), ['wagmi', 420n, true])
```

Internally it splits params into a 32-byte-aligned static head and a dynamic tail: static values go inline, dynamic ones (`string`, `bytes`, `T[]`, dynamic tuples) emit a 32-byte offset in the head pointing into the tail. This is the standard head/tail ABI layout and the reason encoded blobs are always a multiple of 32 bytes.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeAbiParameters.ts#L190-L216

Per-type gotchas worth knowing: `address` values are lowercased (not checksummed) on encode and validated with `isAddress`; integers accept `number | bigint` but are range-checked against the declared bit width and throw `IntegerOutOfRangeError` if out of bounds; fixed `bytesN` must match exactly (else `AbiEncodingBytesSizeMismatchError`) while dynamic `bytes`/`string` are right-padded to the next 32-byte boundary. Array types are parsed by `getArrayComponents` (`T[]` → dynamic, `T[k]` → fixed length k), which is shared with the decoder.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeAbiParameters.ts#L225-L228
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeAbiParameters.ts#L293-L356
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeAbiParameters.ts#L422-L430

`decodeAbiParameters(params, data)` is the inverse, accepting a `Hex` string or `ByteArray`. It guards against empty input (`AbiDecodingZeroDataError`) and sub-32-byte data (`AbiDecodingDataSizeTooSmallError`), then walks each param with a cursor.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeAbiParameters.ts#L56-L86

Two decode gotchas bite people: (1) integers wider than 48 bits decode to `bigint`, while `uint8`…`uint48`/`int48` decode to a JS `number` — the boundary is `size > 48`. (2) Decoded `address` values come back EIP-55 **checksummed**, even though the encoder lowercased them. Also, tuples decode to a plain object keyed by component `name` when every component is named, but to a positional array if any component is unnamed — so `abi[0].outputs` of a named struct yields `{ x, y, z }`, not `[x, y, z]`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeAbiParameters.ts#L270-L280
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeAbiParameters.ts#L135-L138
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeAbiParameters.ts#L295-L300

## encodePacked

`encodePacked(types, values)` implements Solidity's non-standard `abi.encodePacked` — values are concatenated tightly with no 32-byte padding and no length prefixes. Use it for building hash preimages (e.g. `keccak256(encodePacked(...))` for `CREATE2` salts or signature digests), never for calldata, and note that packed output is intentionally **not** decodable (ambiguous by design).

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodePacked.ts#L61-L77

```ts
import { encodePacked } from 'viem'
encodePacked(['address', 'string', 'bytes16[]'], ['0xd8da…6045', 'hello world', ['0xdead…beef', '0xcafe…babe']])
```

Packing rules mirror Solidity: types are packed to their natural byte size (`uintN`/`intN` → N/8 bytes, `bytesN` right-padded to N, `address` → 20 bytes, `bool` → 1 byte, `string`/`bytes` → their raw bytes). The one twist is array elements, which are each padded to a full 32 bytes even in packed mode. Only value types plus arrays-of-value-types are supported — nested/dynamic `tuple` and `struct` are rejected with `UnsupportedPackedAbiType`, unlike the standard codec.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodePacked.ts#L90-L139

## getAbiItem and overload resolution

`getAbiItem({ abi, name, args? })` pulls one item out of an ABI by `name`. Since it's the selection primitive under the contract actions, it also accepts a 4-byte function selector (or event topic hash) in place of `name` — when `name` is hex it filters by `toFunctionSelector`/`toEventSelector` instead of by string name. Returns the matched item, or `undefined` if nothing matches.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/getAbiItem.ts#L80-L103

When several items share a name (overloads), `args` disambiguates: it filters to items whose `inputs` arity matches and whose every argument passes a runtime type check (`isArgOfType` — e.g. `address` args must look like addresses, `uintN` accept `number | bigint`, tuples recurse). With no `args`, it returns the zero-input overload if present.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/getAbiItem.ts#L105-L218

If two overloads both match and their differing parameters encode indistinguishably at runtime — the classic cases being `address` vs `bytes20` and `address` vs `string`/`bytes` when the value happens to be a valid address — it throws `AbiItemAmbiguityError` rather than guessing. Fix it by removing one overload from the ABI you pass in.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/getAbiItem.ts#L121-L148
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/abi.ts#L355-L371

## Raw codec vs contract actions

Default to the contract layer: for real contract interaction use `readContract`/`writeContract`/`simulateContract` or `encodeFunctionData`/`decodeFunctionResult`, which wrap the codec, prepend the 4-byte selector, and give you name/arg type-safety (see `wevm-viem-contract.md`). Drop to `encodeAbiParameters`/`decodeAbiParameters` only when you're serializing bare parameter lists with no function selector — packing constructor args, decoding an opaque `bytes` return, or hand-rolling a struct. Reach for `encodePacked` strictly for hashing preimages. Keccak/selector helpers like `toFunctionSelector` live in `wevm-viem-utilities.md`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/abi/encodeAbiParameters.md#L7-L9
