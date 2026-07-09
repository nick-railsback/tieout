# viem — Clients & Transports

A **Client** bundles a **Transport** (how RPC requests leave the process) with an optional **Chain** and **Account**, then exposes a set of **Actions**. This file covers the four client factories, their shared config and defaults, `client.extend`, and every built-in transport. The Actions themselves live in `wevm-viem-public-actions.md` / `wevm-viem-wallet-actions.md` / `wevm-viem-test-actions.md`; account creation lives in `wevm-viem-accounts.md`.

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [Mental model](#mental-model)
- [The four client factories](#the-four-client-factories)
- [Shared client config & defaults](#shared-client-config--defaults)
- [client.extend](#clientextend)
- [The Transport abstraction](#the-transport-abstraction)
- [http](#http)
- [webSocket](#websocket)
- [custom (EIP-1193)](#custom-eip-1193)
- [ipc](#ipc)
- [fallback](#fallback)
- [Polling vs subscriptions for watch actions](#polling-vs-subscriptions-for-watch-actions)

## Mental model

A Client is `transport` + optional `chain`/`account`, decorated with Actions. viem ships three public-facing client types — Public (read-only JSON-RPC + `readContract`), Wallet (signing + writes), and Test (Anvil/Hardhat/Ganache node control) — each built on the same lower-level `createClient`. A Client is roughly an Ethers.js Provider; a Transport is the intermediary that actually executes outgoing requests. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/intro.md#L1-L23

The three public factories are thin wrappers: each calls `createClient(...)` with a default `key`/`name`/`type`, then `.extend(...)` to attach the relevant Action decorator. So everything about config, defaults, and the transport pipeline is defined once in `createClient`. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L263-L339

## The four client factories

`createClient` is the base. Only `transport` is required; `chain`, `account`, and everything else are optional. It parses the account, invokes the transport with `{ account, chain, pollingInterval }`, folds the transport's `config`+`value` into `client.transport`, assigns a unique `uid`, and attaches `extend`. Defaults: `key: 'base'`, `name: 'Base Client'`, `type: 'base'`. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L263-L315

`createPublicClient({ chain, transport })` sets `key: 'public'`, `name: 'Public Client'`, `type: 'publicClient'` and extends with `publicActions`. Use it for reads: `getBlockNumber`, `getBalance`, `readContract`, `call`, event watching, etc. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createPublicClient.ts#L80-L109

`createWalletClient({ chain, transport, account? })` sets `key: 'wallet'`, `name: 'Wallet Client'`, `type: 'walletClient'` and extends with `walletActions`. Pair it with `custom(window.ethereum)` for a JSON-RPC (browser/injected) account, or `http()` + a local `account` for private-key/mnemonic signing. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createWalletClient.ts#L124-L136

`createTestClient({ mode, chain, transport })` sets `key: 'test'`, `name: 'Test Client'`, `type: 'testClient'`, records `mode` (`'anvil' | 'hardhat' | 'ganache'`) on the client, and extends with `testActions({ mode })` for node control (`mine`, `impersonateAccount`, `setBalance`, …). https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createTestClient.ts#L115-L127

## Shared client config & defaults

The full `ClientConfig` surface (used by all factories) is defined on `createClient`. Key fields: `account`, `batch`, `cacheTime`, `ccipRead`, `chain`, `key`, `name`, `pollingInterval`, `rpcSchema`, `transport`, `type`. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L29-L105

**`transport`** (required) is the RPC layer — see the sections below. **`chain`** is optional but recommended: many actions need chain metadata, and `http`/`webSocket` fall back to the chain's default RPC URL when you don't pass one explicitly. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L78-L102

**`account` (hoisting).** Passing `account` to the client "hoists" it so you don't repeat it on every action that needs a signer. A bare address string is coerced to a JSON-RPC account via `parseAccount`; an `Account` object (e.g. from `privateKeyToAccount`) is used as a local account. Hoisting is the common pattern for Wallet Clients. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L289-L296

The wallet docs walk through both flows and note that hoisting lets you drop the per-action `account` argument entirely. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/wallet.md#L88-L112

**`batch.multicall`** enables `eth_call` aggregation: every action backed by `eth_call` (e.g. `readContract`) is batched over a short window and sent as a single `aggregate3` multicall, cutting round-trips and RPC compute units. Options: `batchSize` (max calldata bytes per chunk, default `1_024`), `wait` (ms before flush, default `0` — i.e. end of the current microtask queue), and `deployless`. This is distinct from the `http` transport's JSON-RPC batching. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L225-L232

The conceptual framing for multicall aggregation (why and when to enable it) is in the Public Client docs. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/public.md#L42-L68

**`pollingInterval`** (ms) drives polling-based actions/events. When unset it is computed as `min(max(floor(blockTime / 2), 500), 4_000)` where `blockTime` comes from `chain.blockTime` (falling back to `12_000`), so it resolves to `4_000` on most chains and shrinks on fast-block chains. Note the `@default chain.blockTime / 3` JSDoc is stale — the runtime formula above is authoritative. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L280-L287

**`cacheTime`** (ms, how long responses like block number stay cached) defaults to the resolved `pollingInterval`. **`key`** and **`name`** are cosmetic identifiers with the per-factory defaults listed above; **`ccipRead`** configures EIP-3668 offchain lookups and is enabled by default — pass `ccipRead: false` to disable. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L48-L90

## client.extend

`extend(fn)` composes custom actions onto a client. It calls `fn(client)`, strips any keys that collide with the base client's own properties, shallow-merges the rest, and (for plain-object namespaces present on both) merges their members rather than overwriting — then re-attaches a fresh `extend` so extensions chain. This is exactly how `publicActions`/`walletActions`/`testActions` are applied, and how you add project-specific helpers. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L317-L347

A common composition: extend a Wallet Client with `publicActions` so one client can both `simulateContract` (read) and `writeContract` (write) without juggling two clients. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/wallet.md#L208-L231

```ts
const client = createWalletClient({ account, chain: mainnet, transport: http() })
  .extend(publicActions)
  .extend((c) => ({ getBlockGasUsed: async () => (await c.getBlock()).gasUsed }))
```

## The Transport abstraction

A Transport is a factory `({ chain, pollingInterval, retryCount, timeout }) => { config, request, value }`. `createTransport` wraps a raw `request` with `buildRequest` (friendly errors + retries) and standardizes the config. Shared defaults across all transports: `retryCount: 3`, `retryDelay: 150` ms. `value` carries transport-specific extras (e.g. `webSocket`'s `subscribe`, `fallback`'s `onResponse`). https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/createTransport.ts#L64-L95

`buildRequest` maps raw JSON-RPC/provider error codes to typed viem errors and retries transient failures with exponential backoff (`(1 << count) * retryDelay`), honoring a `Retry-After` header when present. It only retries "retryable" errors — HTTP 403/408/413/429/500/502/503/504, RPC `-32603` (internal), `-32005` (limit exceeded), `429`, and unknown (`-1`) — not user rejections or reverts. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/buildRequest.ts#L124-L323

## http

`http(url?, config?)` is the default for most apps — polling-based, one HTTP request per RPC call unless batching is on. If `url` is omitted it uses `chain.rpcUrls.default.http[0]` (throws `UrlRequiredError` if neither exists). `timeout` defaults to `10_000` ms. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/http.ts#L100-L195

Config knobs: `batch` (JSON-RPC batching — many RPC calls coalesced into one HTTP request; `batchSize` default `1_000` requests, `wait` default `0`), `fetchOptions` (passed to `fetch`, e.g. custom headers/auth), `fetchFn`, `onFetchRequest`/`onFetchResponse` callbacks, `retryCount`/`retryDelay`, `timeout`, and `maxResponseBodySize` (default `10_485_760` bytes). https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/http.ts#L22-L67

Note the two independent batching layers: `http({ batch: true })` merges distinct RPC methods into one HTTP payload, while client-level `batch.multicall` merges `eth_call`s into a single contract call. They compose. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/transports/http.md#L29-L46

## webSocket

`webSocket(url?, config?)` maintains a persistent socket and supports push subscriptions via `eth_subscribe`. `url` falls back to `chain.rpcUrls.default.webSocket?.[0]`; `timeout` defaults to `10_000` ms. It exposes `subscribe({ params: ['newHeads' | 'newPendingTransactions' | ['logs', …] | 'syncing'], onData, onError })` returning `{ subscriptionId, unsubscribe }`, plus `getRpcClient()`. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/webSocket.ts#L104-L203

Reliability options: `keepAlive` (ping/pong to hold the connection, default `true`) and `reconnect` (auto-reconnect on socket failure, default `true`; when an object, `attempts` defaults to `5` and `delay` to `2_000` ms). https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/webSocket.ts#L59-L82

## custom (EIP-1193)

`custom(provider, config?)` wraps any object exposing an EIP-1193 `request` function — `window.ethereum`, a WalletConnect/injected provider, or your own. It just binds `provider.request`; there's no URL and no built-in `timeout` (the provider owns transport). Inherits `retryCount: 3` / `retryDelay: 150`. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/custom.ts#L35-L55

Gotcha: if you pair `custom` with a Public Client, the underlying provider must actually support the Public Actions you call — injected wallet providers often don't implement every read method. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/transports/custom.md#L146-L148

## ipc

`ipc(path, config?)` connects to a local node over a Unix-domain/IPC socket (e.g. Geth/Reth `.ipc`), which is faster and unmetered versus HTTP for local nodes. Like `webSocket`, it supports `subscribe`/`getRpcClient`, `reconnect` (default `true`), and `timeout` (default `10_000` ms). https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/ipc.ts#L91-L177

## fallback

`fallback([t1, t2, …], config?)` tries transports in order and moves to the next on failure, giving you automatic failover across RPC providers. Each candidate is invoked with `retryCount: 0` so the fallback itself controls stepping; before advancing it checks the next transport's `methods` include/exclude filter so it won't route a method the fallback can't serve. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/fallback.ts#L107-L208

Failover is selective: `shouldThrow` immediately rethrows non-retryable, user-facing errors (transaction/user rejection, execution reverted, WalletConnect settlement, CAIP-25) instead of wastefully retrying them against another provider. Override it via `config.shouldThrow`. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/fallback.ts#L210-L222

With `rank: true` (default `false`), transports are continuously re-ordered by a weighted moving score over recent pings — stability weighted `0.7`, latency `0.3`. Tunable via `rank` options: `interval` (default `client.pollingInterval`), `sampleCount` (default `10`), `timeout` (default `1_000` ms), `ping`, and `weights`. Best-scoring provider is prioritized. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/transports/fallback.ts#L225-L317

The ranking algorithm and its cadence are described in the fallback docs. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/transports/fallback.md#L28-L35

## Polling vs subscriptions for watch actions

Watch actions (`watchBlockNumber`, `watchContractEvent`, …) pick their mechanism from the transport type. With `http` (or `custom`) they **poll** on `pollingInterval`; with `webSocket` or `ipc` they use a real-time `eth_subscribe` **subscription**. For `fallback`, the choice follows the first transport in the list. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/watchBlockNumber.ts#L94-L108

You can force polling on a socket transport with `poll: true` per action. Practically: reach for `webSocket`/`ipc` when you want low-latency push updates and can hold a connection; use `http` (simpler, stateless, CDN-friendly) when polling at `pollingInterval` is acceptable — the default for most apps. https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/watchBlockNumber.ts#L30-L62
