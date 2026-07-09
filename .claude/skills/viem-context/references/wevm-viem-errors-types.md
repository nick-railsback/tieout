# viem — Errors & TypeScript

How viem models runtime errors (one `BaseError` hierarchy with pretty, walkable cause chains) and how its type system gives you end-to-end safety (template-literal value types, Chain/Account inference on clients, and abitype-powered ABI inference). This reference owns error handling and viem's TypeScript design; it does not document per-action signatures (see the action topic references) or ABI-typing internals (see `wevm-viem-abi.md`).

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [The BaseError mental model](#the-baseerror-mental-model)
- [`.walk()` — finding an error in a cause chain](#walk--finding-an-error-in-a-cause-chain)
- [The error hierarchy](#the-error-hierarchy)
- [`instanceof` and typed `catch`](#instanceof-and-typed-catch)
- [TypeScript: value types are template literals](#typescript-value-types-are-template-literals)
- [Chain & Account inference on clients](#chain--account-inference-on-clients)
- [ABI inference via `const` assertions](#abi-inference-via-const-assertions)
- [Glossary: the types you meet most](#glossary-the-types-you-meet-most)

## The BaseError mental model

Every error viem throws extends `BaseError`, which extends the native `Error`. `BaseError` carries structured fields alongside the flat `message`: `shortMessage` (the one-line human summary), `metaMessages` (extra context lines), `details` (the underlying cause's message), `docsPath` (a link into viem.sh), and `version` (pinned to the installed `viem@x.y.z`). Prefer reading these fields over regex-parsing `message`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/base.ts#L37-L76

The constructor composes `message` deterministically from those parts: `shortMessage`, then a blank line, then `metaMessages`, then `Docs:`, `Details:`, and `Version:` footer lines. It also *inherits from the cause*: if `args.cause` is itself a `BaseError`, `details` and `docsPath` are pulled up from that cause, so the outermost error surfaces the root problem's detail text and docs link without you unwrapping it.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/base.ts#L46-L76

The `name` is a discriminant. `BaseError` sets `override name = 'BaseError'`, and every subclass overrides it (via the `name` arg) to its own class name — `'ContractFunctionRevertedError'`, `'InternalRpcError'`, etc. Each subclass also exports a `<Name>ErrorType` alias intersecting the class with `{ name: '<Name>' }`, which is what makes `error.name === '...'` narrow correctly in a typed `catch`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/base.ts#L36-L44

## `.walk()` — finding an error in a cause chain

viem errors are nested: a high-level action error wraps lower-level causes (e.g. `ContractFunctionExecutionError` → `ContractFunctionRevertedError` → an RPC error). `BaseError.walk(fn)` traverses the `.cause` chain and returns the first error for which `fn` returns `true`, or `null` if none match. Called with no argument, `walk()` returns the deepest cause (the root error).

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/base.ts#L78-L98

This is the canonical way to test "did this ultimately revert?" without knowing how deep the revert is. The documented pattern, from `simulateContract`, guards on `BaseError` first, then walks for the specific class and reads its decoded fields:

```ts
try {
  await publicClient.simulateContract({ /* ... */ })
} catch (err) {
  if (err instanceof BaseError) {
    const revertError = err.walk(e => e instanceof ContractFunctionRevertedError)
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName ?? ''
      // handle the custom Solidity error by name
    }
  }
}
```

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/contract/simulateContract.md#L187-L202

## The error hierarchy

Errors are grouped by domain under `src/errors/*.ts`, all descending from `BaseError`. A few representative branches:

Contract errors wrap the call stack. `ContractFunctionExecutionError` is the outer error for a failed contract call; it captures `abi`, `args`, `functionName`, `contractAddress`, and `sender`, and pretty-prints the call for the message.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/contract.ts#L88-L165

`ContractFunctionRevertedError` is the one you usually want to catch: when revert `data` is present it runs `decodeErrorResult` against the ABI and exposes `data` (the decoded `{ errorName, args }`), `reason` (for a plain `Error(string)`/`Panic`), `signature`, and `raw`. This is what lets you branch on a custom Solidity error by name.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/contract.ts#L167-L262

RPC errors implement JSON-RPC 2.0 / EIP-1474 codes. `RpcError` is the base and exposes a numeric `code`; concrete subclasses pin a `static code` — e.g. `InternalRpcError` is `-32603`, and `UserRejectedRequestError` (an EIP-1193 `ProviderRpcError`) is `4001`. Check `error.code` to distinguish these, or `error.name`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/rpc.ts#L37-L62

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/rpc.ts#L204-L223

Node execution errors carry a `static nodeMessage` regex used to classify a raw node string into a typed error — `ExecutionRevertedError` (`code = 3`), `InsufficientFundsError`, the nonce/fee-cap family, etc.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/node.ts#L18-L20

Transaction errors cover the send/wait lifecycle: `TransactionExecutionError`, `TransactionNotFoundError`, `TransactionReceiptNotFoundError`, and `WaitForTransactionReceiptTimeoutError`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/transaction.ts#L159-L159

Validation/transport errors are small and self-describing: `InvalidAddressError` (bad hex or failed checksum) and `AccountNotFoundError` (an action needing an account got none from the call or the client) are typical, and both add `metaMessages` telling you how to fix the input.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/address.ts#L6-L16

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/account.ts#L6-L20

The full catalog lives in the errors glossary; treat it as the index into `src/errors/**`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/glossary/errors.md#L1-L20

## `instanceof` and typed `catch`

TypeScript has no typed exceptions, so `catch (e)` gives you `unknown`. viem's two idioms are: narrow with `instanceof` (`if (e instanceof ContractFunctionRevertedError) …`) when you have the class in scope, or — since every module also exports a `<Module>ErrorType` — cast the caught value and switch on the string `name`. Every action exports its own error type: `getBlockNumber` exports `GetBlockNumberErrorType`, and after `const error = e as GetBlockNumberErrorType`, checking `error.name === 'InternalRpcError'` narrows to expose `error.code`, `error.name === 'HttpRequestError'` narrows to `error.status`/`error.headers`, and so on.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/error-handling.mdx#L1-L52

Rule of thumb: use `instanceof BaseError` + `.walk(...)` when the interesting error is buried in a cause chain (contract reverts, RPC failures under actions); use the `<Module>ErrorType` cast + `name` switch when you only care about the top-level failure of one action.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/errors/base.ts#L78-L98

## TypeScript: value types are template literals

viem's "opaque" value types are TypeScript template-literal types, not runtime brands. `Hex` and `Hash` are both `` `0x${string}` `` and `ByteArray` is `Uint8Array`. Because a plain `string` is not assignable to `` `0x${string}` ``, these act as lightweight compile-time brands: you cannot pass an arbitrary `string` where a `Hex` is expected without a cast or a validated helper (`toHex`, `isHex`, etc.). They do not, however, validate hex-ness at runtime — a wrong literal like `'0xzz'` still type-checks.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/misc.ts#L1-L38

`Address` is re-exported from abitype and is likewise a `` `0x${string}` `` template literal used pervasively across the type surface (accounts, receipts, logs). Use `getAddress`/`isAddress` when you need real checksum validation at runtime — the type alone won't catch a bad checksum.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/log.ts#L28-L46

## Chain & Account inference on clients

`Client` is generic over its `transport`, `chain`, and `account` (plus `rpcSchema`, extensions, and tokens). Those generics flow into the action parameters, so the *presence or absence* of a chain/account on the client changes which fields an action requires from you.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L149-L216

Account inference: `GetAccountParameter` makes the `account` argument **required** when the client's `account` generic is `undefined`, and **optional** when the client already has one. So a client created without an account forces every write action to pass `account`, while a client created with an account lets you omit it — enforced at compile time, mirroring the runtime `AccountNotFoundError`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/account.ts#L11-L30

Chain inference works the same way via `GetChainParameter`: if the client has no `chain`, the action's `chain` field is required (`{ chain: chainOverride | null }`); if it does, `chain` becomes optional. This is why `createWalletClient({ chain: mainnet, ... })` lets `sendTransaction` omit `chain`, but a chainless client must supply one per call.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/chain.ts#L299-L304

The other half of narrowing is which actions exist at all: a public vs. wallet client exposes different decorators, and the `chain`/`account` generics on the client propagate into every decorated action's parameter and return types. See the client topic references for how the decorators are composed.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L177-L216

## ABI inference via `const` assertions

viem infers argument and return types directly from an ABI using abitype. For inference to fire, the `abi` (or EIP-712 `types`) must be a literal the compiler can read structurally — either declared inline or with an `as const` assertion. Without `const`, TypeScript widens the array to `object[]` and inference silently degrades to loose types.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/typescript.mdx#L22-L74

```ts
const abi = [{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ type: 'address' }],
  outputs: [{ type: 'uint256' }],
}] as const // ← without this, args/return are not inferred
```

If autocomplete or arg-checking isn't working, the usual cause is a missing `const` assertion or an ABI imported from JSON (TypeScript can't treat JSON as `const`; use `@wagmi/cli` or `parseAbi`). ABI-typing mechanics are owned by `wevm-viem-abi.md`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/typescript.mdx#L74-L78

## Glossary: the types you meet most

The types glossary is the canonical index; the ones you handle most often:

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/glossary/types.md#L49-L127

- `Address` — `` `0x${string}` ``, re-exported from abitype; the address used everywhere. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/log.ts#L28-L29
- `Hex` — arbitrary `` `0x${string}` `` hex data (calldata, encoded values). https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/misc.ts#L4-L4
- `Hash` — a `` `0x${string}` `` 32-byte hash (tx/block hashes); structurally identical to `Hex`, distinct in intent. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/misc.ts#L5-L5
- `Chain` — chain config: `id`, `name`, `nativeCurrency`, `rpcUrls`, optional `blockExplorers`/`contracts`. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/chain.ts#L22-L70
- `Account` — a `OneOf` union of `JsonRpcAccount` (address + `type: 'json-rpc'`), `LocalAccount`, or `SmartAccount`. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L14-L61
- `TransactionReceipt` — post-mining result: `status` (`'success' | 'reverted'`), `blockNumber`, `gasUsed`, `logs`, `contractAddress`, etc. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/transaction.ts#L38-L80
- `Log` — an event log, generic over the ABI event so `args`/`topics`/`eventName` can be inferred when a strict ABI is supplied. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/log.ts#L15-L46
