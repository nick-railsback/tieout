# viem — ENS

Viem resolves Ethereum Name Service names through five Public Client read actions (`getEnsAddress`, `getEnsName`, `getEnsResolver`, `getEnsText`, `getEnsAvatar`) plus a set of hashing/encoding utilities (`normalize`, `namehash`, `labelhash`, `packetToBytes`, `toCoinType`). All lookups route through the on-chain ENS Universal Resolver contract and support CCIP-Read offchain resolution. The single most important rule: **always `normalize()` a name before hashing or looking it up.**

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [Mental model: the Universal Resolver](#mental-model-the-universal-resolver)
- [The normalize gotcha (read this first)](#the-normalize-gotcha-read-this-first)
- [Read actions](#read-actions)
- [Shared action options](#shared-action-options)
- [ENS utilities](#ens-utilities)
- [CCIP-Read / offchain resolution](#ccip-read--offchain-resolution)
- [The `viem/ens` subpath export](#the-viemens-subpath-export)
- [Out of scope](#out-of-scope)

## Mental model: the Universal Resolver

Every ENS action is a `readContract` call against a single on-chain entry point: the **ENS Universal Resolver**. Viem never talks to individual name resolvers directly — it hands the Universal Resolver a DNS-encoded name (`packetToBytes`) plus an ABI-encoded resolver call (`addr`, `text`, `reverse`, …), and the Universal Resolver internally finds the correct resolver and dispatches. Forward resolution calls `resolveWithGateways(bytes,bytes,string[])`; reverse resolution calls `reverseWithGateways(bytes,uint256,string[])`; resolver discovery calls `findResolver(bytes)`.

The Universal Resolver address is resolved once per call: an explicit `universalResolverAddress` wins, otherwise viem looks up `chain.contracts.ensUniversalResolver.address` via `getChainContractAddress` — so an ENS action on a client with no chain (and no explicit address) throws `client chain not configured`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsAddress.ts#L129-L141

`getChainContractAddress` throws `ChainDoesNotSupportContract` when the chain has no `ensUniversalResolver` entry, or when a supplied `blockNumber` predates the contract's `blockCreated`. On mainnet that address is `0xeeee…eeee` (created at block 23,085,558), so historical reads before that block need an override.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/chain/getChainContractAddress.ts#L10-L41
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/chains/definitions/mainnet.ts#L20-L24

## The normalize gotcha (read this first)

ENS names must be UTS-46 / ENSIP-15 normalized **before** they are hashed or looked up. Passing a raw, unnormalized, or mixed-case name to any action or hashing utility can silently resolve to the wrong record or throw — `namehash` does no normalization of its own, it only splits on `.` and keccak-hashes each label. Every ENS action's JSDoc repeats this warning, and the docs surface it as a `:::warning` box.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsAddress.ts#L100-L101
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/ens/actions/getEnsAddress.md#L37-L39

The correct pattern is to wrap the name in `normalize()` at the call site:

```ts
import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { getEnsAddress, normalize } from 'viem/ens'

const client = createPublicClient({ chain: mainnet, transport: http() })

const address = await getEnsAddress(client, {
  name: normalize('wevm.eth'), // ALWAYS normalize
})
// '0xd2135CfB216b74109775236E36d4b433F1DF507B'
```
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsAddress.ts#L107-L120

## Read actions

All five actions are Public Client actions, callable either standalone (`getEnsAddress(client, params)`) or off the client (`publicClient.getEnsAddress(params)`). Each returns `null` (or throws, under `strict`) when a name/record does not resolve.

**`getEnsAddress`** — forward resolution. Signature: `getEnsAddress(client, { name, coinType?, gatewayUrls?, strict?, universalResolverAddress?, blockNumber?, blockTag? }) => Promise<Address | null>`. It namehashes the name, encodes an `addr` call, and invokes `resolveWithGateways`. `coinType` (ENSIP-9/19, default `60n` = Ethereum L1) enables chain-specific address resolution — pass `toCoinType(base.id)` to fetch a name's address on another chain. It returns `null` for the zero address and for an empty (`0x`) result.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsAddress.ts#L44-L77
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsAddress.ts#L146-L186

**`getEnsName`** — reverse resolution (address → primary name). Signature: `getEnsName(client, { address, coinType?, gatewayUrls?, strict?, universalResolverAddress?, blockNumber?, blockTag? }) => Promise<string | null>`. It calls `reverseWithGateways(address, coinType, gateways)`; `coinType` defaults to `60n`. Note that a returned name is NOT trustworthy on its own — ENS reverse records are user-set, so a forward-resolution check (`getEnsAddress(normalize(name)) === address`) is the canonical way to prove a name legitimately belongs to an address.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsName.ts#L23-L56
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsName.ts#L92-L140

**`getEnsResolver`** — resolver discovery. Signature: `getEnsResolver(client, { name, universalResolverAddress?, blockNumber?, blockTag? }) => Promise<Address>`. It calls `findResolver(bytes)` and returns the resolver contract address for a name. Unlike the other actions it has no `strict`/`gatewayUrls` and returns an `Address` (not nullable); on chains with `ensTlds` configured, a non-matching TLD throws rather than returning null.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsResolver.ts#L23-L38
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsResolver.ts#L89-L119

**`getEnsText`** — text records. Signature: `getEnsText(client, { name, key, gatewayUrls?, strict?, universalResolverAddress?, blockNumber?, blockTag? }) => Promise<string | null>`. It encodes a `text(namehash, key)` call and routes it through `resolveWithGateways`; `key` is the record name (e.g. `'com.twitter'`, `'url'`, `'avatar'`). An empty string record is normalized to `null`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsText.ts#L38-L51
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsText.ts#L117-L152

**`getEnsAvatar`** — thin wrapper over `getEnsText` with `key: 'avatar'`, then `parseAvatarRecord` resolves the record (NFT URIs, IPFS/Arweave/HTTP) into a usable URL. It adds an `assetGatewayUrls?: { ipfs?, arweave? }` option and returns `null` if the avatar record can't be parsed (the parse failure is swallowed, not thrown).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsAvatar.ts#L19-L31
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsAvatar.ts#L61-L95

## Shared action options

`universalResolverAddress?: Address` — override the Universal Resolver used; defaults to `client.chain.contracts.ensUniversalResolver.address`. Supply it explicitly on chains viem doesn't preconfigure, or to pin a specific Universal Resolver deployment.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsName.ts#L52-L54

`blockNumber?: bigint` / `blockTag?: 'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'` — pin the read to a historical block or tag (both forwarded straight to the underlying `readContract`); `blockTag` defaults to `'latest'`. These are picked from `ReadContractParameters` on every ENS action's params type, so ENS resolution can be read at any point in history.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsText.ts#L38-L40

`strict?: boolean` (default `false`) — by default, "name not found"-class reverts from the Universal Resolver are caught and turned into `null`; set `strict: true` to let them propagate. Viem decides what counts as a null-result revert in `isNullUniversalResolverError`, which whitelists `ResolverNotFound`, `ResolverError`, `HttpError`, `ResolverNotContract`, `ReverseAddressMismatch`, and `UnsupportedResolverProfile`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/ens/errors.ts#L11-L24

`gatewayUrls?: string[]` — CCIP-Read gateway URLs handed to the Universal Resolver's `*WithGateways` variant. When omitted, viem passes `[localBatchGatewayUrl]` (`'x-batch-gateway:true'`), a sentinel that keeps batched offchain requests resolving in-process rather than through a remote batch gateway.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/ens/getEnsAddress.ts#L158-L169

## ENS utilities

**`normalize(name)`** — UTS-46 / ENSIP-15 normalization; REQUIRED before hashing or lookups. In this version it delegates to `ox/Ens`'s `normalize`, which is itself backed by [`@adraffy/ens-normalize`](https://github.com/adraffy/ens-normalize.js) (as the docs state). This is the single heavy dependency in the ENS surface — see the subpath note below.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/ens/normalize.ts#L16-L18
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/ens/utilities/normalize.md#L7-L9

**`namehash(name)`** — EIP-137 recursive hash of a full name to a `bytes32` node. It splits on `.`, hashing labels from right to left; an already-encoded labelhash of the form `[<64-hex>]` is passed through verbatim instead of being re-hashed. Does NOT normalize — normalize first.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/ens/namehash.ts#L37-L52

**`labelhash(label)`** — keccak256 of a single label (e.g. `labelhash('eth')`), used for token IDs and registry operations. Same encoded-labelhash passthrough as `namehash`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/ens/labelhash.ts#L29-L33
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/ens/encodedLabelToLabelhash.ts#L7-L14

**`packetToBytes(name)`** — DNS-wire-encodes a name into the `bytes` the Universal Resolver expects (length-prefixed labels, null-terminated). Labels longer than 255 bytes are replaced by their encoded labelhash for Universal Resolver compatibility. This is viem's internal glue for every action; you rarely call it directly.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/ens/packetToBytes.ts#L30-L53

**`toCoinType(chainId)`** — converts an EVM chain id to an ENSIP-9/SLIP-44 `coinType` for chain-specific `getEnsAddress`/`getEnsName` (chain id `1` maps to `60n`; others to `0x80000000 | chainId`). Throws `EnsInvalidChainIdError` for out-of-range ids.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/ens/toCoinType.ts#L18-L23

## CCIP-Read / offchain resolution

Many ENS names (L2 rollup names, gasless offchain subnames) don't store data on L1; the resolver instead reverts with the EIP-3668 `OffchainLookup` error to redirect the client to an HTTP gateway. Viem handles this automatically inside `call`/`readContract`: when a read reverts with the `OffchainLookup` selector (`0x556f1830`) and `client.ccipRead !== false`, it runs `offchainLookup` and retries with the gateway's answer. CCIP-Read is therefore **on by default**; set `ccipRead: false` on the client to disable it entirely.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/call.ts#L344-L357

`offchainLookup` decodes the revert (`sender`, `urls`, `callData`, `callbackSelector`, `extraData`), verifies the sender matches the target, fetches from the gateway via `ccipRequest` (or a client-supplied `ccipRead.request` override), then re-`call`s the callback selector with the gateway result. Gateway URLs containing `{data}` are fetched with GET, otherwise POST.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/ccip.ts#L63-L129
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/ccip.ts#L145-L166

The `localBatchGatewayUrl` sentinel (`'x-batch-gateway:true'`) short-circuits batch requests: instead of hitting a remote batch gateway, `localBatchGatewayRequest` decodes the batched queries and resolves each one in-process (recursing into nested batches, or issuing individual `ccipRequest`s), which is why the default `gatewayUrls` is `[localBatchGatewayUrl]`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/ens/localBatchGatewayRequest.ts#L13-L48

## The `viem/ens` subpath export

Import ENS actions and utilities from the dedicated `viem/ens` entry point rather than the root `viem` barrel. This isolates the `@adraffy/ens-normalize` dependency (pulled in transitively by `normalize`) so bundlers can tree-shake it out of apps that don't touch ENS. The subpath re-exports all five actions plus `normalize`, `namehash`, `labelhash`, `packetToBytes`, `toCoinType`, and `parseAvatarRecord`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/ens/index.ts#L2-L46

```ts
import { getEnsAddress, getEnsName, normalize, namehash } from 'viem/ens'
```

## Out of scope

- General Public Client read mechanics (`readContract`, `call`, client `ccipRead` config) → see `wevm-viem-public-actions.md`.
- `keccak256` and general hashing utilities → see `wevm-viem-utilities.md`.
