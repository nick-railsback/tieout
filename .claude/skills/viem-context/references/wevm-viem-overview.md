# viem — Overview & Architecture

This is the orientation reference for viem: what it is, how you install it, and the one mental model — **Client + Transport + Actions** — that every other reference builds on. Read this first; other references assume it.

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [What viem is](#what-viem-is)
- [Installation & peer dependencies](#installation--peer-dependencies)
- [Modular design: subpath exports & tree-shaking](#modular-design-subpath-exports--tree-shaking)
- [The core mental model: Client + Transport + Actions](#the-core-mental-model-client--transport--actions)
- [The `.extend()` decorator mechanism](#the-extend-decorator-mechanism)
- [TypeScript-first design & dependencies](#typescript-first-design--dependencies)
- [Platform compatibility](#platform-compatibility)
- [Minimal end-to-end example](#minimal-end-to-end-example)
- [Two FAQ points worth internalizing](#two-faq-points-worth-internalizing)
- [Where to go next](#where-to-go-next)

## What viem is

viem is a TypeScript interface for Ethereum that provides low-level, stateless primitives for interacting with the chain. It is positioned as an alternative to ethers.js and web3.js, built by the authors of [wagmi](https://wagmi.sh) to solve what they call a "quadrilemma": existing low-level libraries each fell short on at least one of developer experience, stability, bundle size, or performance.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/introduction.mdx#L5-L9

The four pillars viem optimizes for are automatic type safety and inference (developer experience), a test suite that runs against forked Ethereum networks (stability), tree-shakable lightweight modules (bundle size), and optimized encoding/parsing that runs async work only when necessary (performance). Its APIs are deliberately more verbose than some alternatives — the trade-off buys composable, easy-to-move building blocks and makes the underlying Ethereum concepts explicit.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/getting-started.mdx#L5-L12

## Installation & peer dependencies

Install with any package manager (`pnpm add viem`, `npm install viem`, `yarn add viem`, `bun add viem`, `deno add viem`), or load it from an ESM CDN like esm.sh via a `<script type="module">` tag. There is a single package — `viem` — with all functionality reached through subpath imports.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/installation.mdx#L5-L38

TypeScript is an **optional** peer dependency pinned to `>=5.0.4`; viem's runtime works without it, but the type-level features (inference, autocomplete, ABI validation) require a recent compiler.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/package.json#L223-L229

Two TypeScript gotchas to flag early: your `tsconfig.json` must have `strict: true` for viem's types to resolve correctly, and viem treats type changes as non-breaking (released as patch versions) — so pin your `viem` version to a specific patch if you depend on exact type behavior.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/typescript.mdx#L5-L15

## Modular design: subpath exports & tree-shaking

viem is ESM-first and marks itself `sideEffects: false`, which is what lets bundlers tree-shake unused code — you pay only for the modules you import. The `exports` map splits the library into subpath entry points so you can reach domain-specific functionality without pulling in the whole surface: `viem` (core), `viem/chains`, `viem/accounts`, `viem/actions`, `viem/ens`, `viem/siwe`, `viem/op-stack`, `viem/zksync`, `viem/celo`, `viem/linea`, `viem/account-abstraction`, `viem/nonce`, `viem/utils`, `viem/window`, and several `viem/experimental/*` and `viem/tempo/*` paths.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/package.json#L20-L157

The bundle-size discipline is enforced in CI via `size-limit` budgets: `import * from 'viem'` (ESM) is capped at 85 kB, while the common `import { createClient, http } from 'viem'` path is capped at just 6.6 kB, and `import { mainnet } from 'viem/chains'` at 500 B. This is the concrete payoff of the modular/tree-shakable design.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/package.json#L136-L207

## The core mental model: Client + Transport + Actions

This is the spine of the entire library. A **Client** is created with a **Transport** (how it talks to the chain) and exposes **Actions** (the operations you call). There are three Client types — a **Public Client** for read-only "public" JSON-RPC methods (`getBlockNumber`, `getBalance`, reading contracts), a **Wallet Client** for account operations (`sendTransaction`, `signMessage`), and a **Test Client** for node-control methods on Anvil/Hardhat/Ganache (`mine`, `impersonateAccount`).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/intro.md#L1-L14

A Transport is the intermediary that executes outgoing RPC requests. The three built-ins are `http` (HTTP JSON-RPC), `webSocket` (WebSocket JSON-RPC), and `custom` (an EIP-1193 `request` function, e.g. `window.ethereum`). You choose a Client type by what you need to do, and a Transport by how you connect.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/intro.md#L15-L23

Each Client factory is a thin wrapper: it builds a base client and decorates it with the matching Actions bundle. `createPublicClient` calls `createClient(...)` with `type: 'publicClient'` and then `.extend(publicActions)`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createPublicClient.ts#L80-L109

`createWalletClient` does the same with `type: 'walletClient'` and `.extend(walletActions)`, and `createTestClient` with `type: 'testClient'` and `.extend(testActions)` (it additionally requires a `mode` of `'anvil' | 'hardhat' | 'ganache'`).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createWalletClient.ts#L124-L135

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createTestClient.ts#L114-L124

The base `createClient` holds the shared config and defaults: `key`/`name`/`type` default to `'base'`/`'Base Client'`/`'base'`, and `pollingInterval` is derived from the chain's block time (half of `blockTime`, clamped between 500 ms and 4000 ms, defaulting to a 12 s block time when the chain doesn't specify one). `cacheTime` defaults to the polling interval. This is why you rarely set these yourself — sensible defaults fall out of the chain.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L263-L315

## The `.extend()` decorator mechanism

Actions are attached to Clients via a decorator pattern rather than inheritance. `client.extend(fn)` runs `fn(client)` to produce a bag of methods, strips any keys that collide with the base client, shallow-merges plain-object namespaces (so `publicActions` and `walletActions` can both contribute to `client.token`), and returns a new object that is itself extendable. This is what lets you compose your own client (e.g. `createPublicClient(...).extend(walletActions)`) and what makes each Action just `(client, params) => result` under the hood.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L317-L338

## TypeScript-first design & dependencies

viem's type safety leans on two upstream libraries. **abitype** provides ABI-to-TypeScript type inference — viem re-exports its ABI types and parsing helpers (`Abi`, `parseAbi`, `parseAbiItem`, `TypedData`, etc.) directly from its own entry point, so contract calls infer argument and return types from the ABI you pass. **ox** provides the low-level Ethereum primitives (encoding, hashing, signing) that viem builds on. The runtime dependency set is small and audited: abitype, ox, `@noble/curves`, `@noble/hashes`, `@scure/bip32`, `@scure/bip39`, `isows`, and `ws`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/package.json#L231-L240

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/index.ts#L2-L37

## Platform compatibility

viem supports all modern browsers and runtimes (Node 18+, Deno, Bun). It relies on modern ECMAScript features — `BigInt`, `fetch`, `Error.cause`, and `TextEncoder` — and documents polyfills for platforms that lack any of them. Note the package's own `engines` field targets Node `>=24.5` for *developing* viem, but the published library runs on Node 18+.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/compatibility.mdx#L1-L28

## Minimal end-to-end example

The canonical starting point: create a Public Client with the `http` transport pointed at a chain, then call an Action. In production, pass an authenticated RPC URL to `http()` — with no argument it falls back to a public RPC provider.

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http(), // pass your RPC URL here in production
})

const blockNumber = await client.getBlockNumber()
```
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/getting-started.mdx#L34-L68

## Two FAQ points worth internalizing

**Wallet Clients do not expose Public Actions.** Wallet providers (injected `window.ethereum`, WalletConnect, etc.) may not implement node methods like `eth_call`, `eth_getLogs`, or `eth_newFilter`, so viem keeps the two Action sets separate. If you need both, create a Public Client for reads and a Wallet Client for writes (or `.extend()` one onto the other when you control the transport).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/faq.mdx#L196-L198

**viem says "Wallet" and "Account", not "Signer".** A Wallet is an interface that holds Account(s); an Account represents an address. A **Local Account** signs synchronously with a private key (signature guaranteed); a **JSON-RPC Account** asks an external wallet to sign over JSON-RPC (signature not guaranteed). The behavioral difference is why viem avoids ethers' "Signer" term.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/faq.mdx#L11-L27

## Where to go next

- **Clients & Transports** (deep dive on `createClient`/`http`/`webSocket`/`custom`, batching, polling) → `wevm-viem-clients-transports.md`
- **Public Actions** (reads: blocks, balances, logs, gas) → `wevm-viem-public-actions.md`
- **Wallet Actions** (writes, signing, accounts) → `wevm-viem-wallet-actions.md`
- **Contract interaction** (`readContract`/`writeContract`/`getContract`, ABI encoding) → `wevm-viem-contract.md`
- **Utilities** (units, hex/bytes, hashing, address helpers) → `wevm-viem-utilities.md`
