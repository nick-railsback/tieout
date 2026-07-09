# viem — Chains

A **Chain** is the plain-object descriptor viem attaches to a Client so it knows a network's id, native currency, RPC endpoints, block explorers, well-known contract addresses, and any per-chain fee/format/serialize customizations. This file covers the `viem/chains` barrel of prebuilt chains, the `Chain` type shape, `defineChain`, and the `extractChain` / `getChainContractAddress` / `assertCurrentChain` utilities.

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [The Chain object & mental model](#the-chain-object--mental-model)
- [Using prebuilt chains (`viem/chains`)](#using-prebuilt-chains-viemchains)
- [The `Chain` type shape](#the-chain-type-shape)
- [`defineChain` — custom chains](#definechain--custom-chains)
- [`extractChain` — find a chain by id](#extractchain--find-a-chain-by-id)
- [`getChainContractAddress` — resolve on-chain contracts](#getchaincontractaddress--resolve-on-chain-contracts)
- [Fees customization (`chain.fees`)](#fees-customization-chainfees)
- [Formatters & serializers](#formatters--serializers)
- [How a chain attaches to a client](#how-a-chain-attaches-to-a-client)
- [Out of scope](#out-of-scope)

## The Chain object & mental model

A Chain is data, not behavior: it is a `Chain`-typed object literal you either import from `viem/chains` or build with `defineChain`, then pass as the `chain` option when creating a Client. viem reads it to build the correct `chainId`, format RPC responses, resolve contract addresses (like `multicall3`), and derive fees. `defineChain`, `extractChain`, `getChainContractAddress`, and `assertCurrentChain` are all re-exported from the root `viem` entrypoint (and from `viem/chains/utils`).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/index.ts#L1487-L1503

## Using prebuilt chains (`viem/chains`)

`viem/chains` is a barrel exporting ~700 prebuilt chain objects (`mainnet`, `sepolia`, `optimism`, `arbitrum`, `base`, `polygon`, `zora`, …) plus a re-export of the `Chain` type. Import the one you need and hand it to a client — you rarely build mainnet-family chains yourself.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/chains/index.ts#L1-L25

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({ chain: mainnet, transport: http() })
```

Each definition is a `defineChain(...)` call. `mainnet` (`id: 1`) shows the common shape: `id`, `name`, `nativeCurrency`, a `default` RPC url set, a `default` block explorer, and a `contracts` map (here `multicall3` and `ensUniversalResolver`, each with the address and the `blockCreated` block it was deployed at).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/chains/definitions/mainnet.ts#L3-L30

Testnets set `testnet: true`; `sepolia` is a representative example (note its distinct `multicall3.blockCreated`).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/chains/definitions/sepolia.ts#L3-L30

L2 definitions spread a shared `chainConfig` (formatters/serializers/contracts for that stack) and set `sourceId` to their L1. `optimism` (`id: 10`, `sourceId: 1`) also demonstrates the per-`sourceId` contract shape — some contracts are keyed by the source chain id, e.g. `portal: { [sourceId]: { address } }`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/chains/definitions/optimism.ts#L6-L51

## The `Chain` type shape

The `Chain` type is defined in `src/types/chain.ts`. Required fields are `id: number`, `name: string`, `nativeCurrency`, and `rpcUrls` (which must have a `default` key). Everything else is optional: `blockExplorers`, `contracts`, `testnet`, `blockTime`, `sourceId`, `ensTlds`, plus the `ChainConfig` extensions.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/chain.ts#L22-L72

The leaf shapes are small records: `nativeCurrency` is `{ name; symbol; decimals }`, `ChainContract` is `{ address; blockCreated? }`, `ChainRpcUrls` is `{ http: readonly string[]; webSocket?: readonly string[] }`, and a block explorer is `{ name; url; apiUrl? }`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/chain.ts#L310-L331

The `contracts` map is open-ended (`[key: string]`) but has well-known optional slots: `multicall3`, `ensRegistry`, `ensUniversalResolver`, and `erc6492Verifier`. An entry may be a single `ChainContract` or a `{ [sourceId: number]: ChainContract }` map for L2s that resolve the address per source chain.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/chain.ts#L37-L52

The `ChainConfig` half (mixed into every `Chain`) carries the behavioral overrides: `fees`, `formatters`, `serializers`, `prepareTransactionRequest`, `verifyHash`, and the `extendSchema`/`extend` custom-data mechanism (`custom` is deprecated in favor of `extend`).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/chain.ts#L93-L128

## `defineChain` — custom chains

`defineChain(chain)` is the sanctioned way to build a custom or not-yet-listed EVM chain. It preserves the literal's precise types (via a `const` generic) and fills `formatters`, `fees`, and `serializers` with `undefined` when you omit them, so downstream type inference stays correct.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/chain/defineChain.ts#L15-L24

```ts
import { defineChain } from 'viem'

export const myChain = defineChain({
  id: 42_069,
  name: 'My Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mychain.example'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.mychain.example' } },
  contracts: { multicall3: { address: '0xca11bde05977b3631167028862be2a173976ca11', blockCreated: 5882 } },
})
```

The returned object also carries an `.extend(...)` method (present when you declare an `extendSchema`) for merging typed custom data onto the chain and returning a new extended chain — the modern replacement for the deprecated `custom` field.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/chain/defineChain.ts#L26-L39

The docs' "Custom Chains" section frames the same pattern conceptually and links the barrel for adding chains upstream.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/chains/introduction.md#L24-L53

## `extractChain` — find a chain by id

`extractChain({ chains, id })` finds the chain with a matching `id` in an array (typically `Object.values(chains)` from `viem/chains`). Its value is mostly in the types: passing a `const` array narrows the return type to the exact matching chain, giving you a fully-typed chain object rather than `Chain | undefined`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/chain/extractChain.ts#L19-L33

```ts
import { extractChain } from 'viem'
import * as chains from 'viem/chains'

const optimism = extractChain({ chains: Object.values(chains), id: 10 })
// typed as the OP Mainnet chain, not `Chain | undefined`
```

## `getChainContractAddress` — resolve on-chain contracts

`getChainContractAddress({ chain, contract, blockNumber? })` looks up a named contract in `chain.contracts` and returns its `address`. If the chain has no such contract it throws `ChainDoesNotSupportContract`; if you pass a `blockNumber` earlier than the contract's `blockCreated`, it also throws (the contract didn't exist yet at that block).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/chain/getChainContractAddress.ts#L10-L41

This is how actions resolve well-known contracts from the chain instead of hard-coding addresses. For example, `multicall` reads `multicall3` off `client.chain` via this helper (respecting `blockNumber`), and ENS actions resolve the registry/resolver the same way.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/multicall.ts#L157-L166

## Fees customization (`chain.fees`)

`chain.fees` lets a chain override how `estimateFeesPerGas` derives gas prices. The three knobs are `baseFeeMultiplier`, `maxPriorityFeePerGas` (a.k.a. the deprecated `defaultPriorityFee`), and `estimateFeesPerGas`. Each can be a static value or an async function receiving `{ block, client, request }`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/chain.ts#L177-L210

`baseFeeMultiplier` (default **1.2**) is applied to the latest block's `baseFeePerGas` to buffer against fee fluctuation between estimation and inclusion. In the action, viem resolves the multiplier (falling back to `1.2`), rejects values `< 1`, and builds a bigint-safe `multiply(base)` that scales by the multiplier's decimal precision.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/estimateFeesPerGas.ts#L113-L128

If `chain.fees.estimateFeesPerGas` is defined, viem calls it first (with the same `multiply` helper and the fee `type`) and returns its result when non-null — a full escape hatch. Otherwise viem falls back to the standard EIP-1559 path (`multiply(baseFeePerGas) + maxPriorityFeePerGas`) or, for `type: 'legacy'`, `multiply(gasPrice)`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/estimateFeesPerGas.ts#L134-L177

The fees doc walks the same three properties with usage snippets, including the async-function forms.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/chains/fees.md#L21-L115

## Formatters & serializers

`chain.formatters` customizes how raw RPC `block`, `transaction`, `transactionReceipt`, and `transactionRequest` payloads are parsed/typed — needed for chains whose structures differ from mainnet (Celo, OP Stack). Each formatter is built with the `defineBlock` / `defineTransaction` / `defineTransactionReceipt` / `defineTransactionRequest` helpers, can `exclude` mainnet fields, and its return type flows through actions like `getBlock`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/chain.ts#L216-L230

The formatters doc shows the full `format`/`exclude` pattern and how the extra fields (e.g. `l1Fee`, `mint`) surface on the typed results.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/chains/formatters.md#L29-L97

`chain.serializers.transaction` overrides how a transaction is RLP-serialized for signing — the hook chains that need custom transaction envelopes plug into. It receives `(transaction, signature?)` and returns the serialized `0x`-hex string.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/types/chain.ts#L236-L251

The serializers doc shows the minimal shape (delegating to `serializeTransaction`).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/chains/serializers.md#L18-L42

## How a chain attaches to a client

You attach a chain via the `chain` option on `createClient`/`createPublicClient`/`createWalletClient`; it becomes `client.chain` and drives id, formatting, contract lookups, and fee derivation. The chain's `blockTime` also feeds client defaults (e.g. `pollingInterval` defaults to `blockTime / 3`). Client construction itself is covered elsewhere — see `wevm-viem-clients-transports.md`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L79-L98

On write paths, the configured chain's `id` is asserted against the wallet's live `eth_chainId` to prevent broadcasting to the wrong network. `sendTransaction` fetches the current chain id and calls `assertCurrentChain`, which throws `ChainNotFoundError` when no chain is set and `ChainMismatchError` when ids disagree.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendTransaction.ts#L220-L229

`assertCurrentChain` itself is a tiny guard: no chain → `ChainNotFoundError`, mismatched id → `ChainMismatchError`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/chain/assertCurrentChain.ts#L20-L27

## Out of scope

The OP Stack, zkSync, and Celo chain-**extension** modules (their `chainConfig`, custom formatters/serializers, and stack-specific actions) are deferred to future references — one-line note only. Client and transport creation → `wevm-viem-clients-transports.md`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/chains/index.ts#L1-L6
