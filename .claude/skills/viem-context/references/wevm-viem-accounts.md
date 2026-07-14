# viem — Accounts & Signing

An **Account** in viem represents an Ethereum actor that can authorize actions. This reference covers how accounts are created, the difference between the two account kinds, the `LocalAccount` signing interface, and nonce management. The actions that *consume* accounts (`sendTransaction`, `signMessage` on a client, etc.) live in `wevm-viem-wallet-actions.md`; signature verification/recovery utilities live in `wevm-viem-utilities.md`.

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [Two kinds of account](#two-kinds-of-account)
- [Local account constructors](#local-account-constructors)
- [Key & mnemonic generation](#key--mnemonic-generation)
- [HD derivation paths](#hd-derivation-paths)
- [The LocalAccount signing interface](#the-localaccount-signing-interface)
- [How signing works under the hood](#how-signing-works-under-the-hood)
- [Hoisting vs. per-action accounts](#hoisting-vs-per-action-accounts)
- [Nonce management](#nonce-management)
- [Smart / ERC-4337 accounts](#smart--erc-4337-accounts)

## Two kinds of account

The `Account` type is a `OneOf` union of a `JsonRpcAccount`, a `LocalAccount`, and a `SmartAccount`. The two you construct directly here are the first two — they differ in *where the private key lives and who signs*. Everything is imported from the `viem/accounts` entrypoint.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L14-L16
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/index.ts#L23-L107

A **JSON-RPC Account** is just an address (`{ address, type: 'json-rpc' }`). It holds no key; signing is *deferred* to an external wallet (MetaMask, WalletConnect, a backend) over JSON-RPC. You create one implicitly by passing an address string wherever an account is expected — `parseAccount` wraps a bare address into this shape.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L58-L61
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/utils/parseAccount.ts#L8-L14

A **Local Account** (`type: 'local'`) holds the signing material (private key / mnemonic) on the consumer's machine and signs transactions & messages *before* they are broadcast over JSON-RPC. It carries the full signing interface (`signMessage`, `signTypedData`, `signTransaction`, `sign`) plus `address`, `publicKey`, and a `source` tag (`'privateKey'`, `'hd'`, `'custom'`).

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L63-L73
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/accounts/local.md#L1-L9

## Local account constructors

`privateKeyToAccount(privateKey, { nonceManager? })` is the common case. It derives the uncompressed public key with `secp256k1`, computes the address via `publicKeyToAddress`, and returns a `PrivateKeyAccount` (a `LocalAccount` that additionally guarantees `sign` and `signAuthorization`). Use `privateKeyToAddress` if you only need the address without the full account.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/privateKeyToAccount.ts#L43-L76
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L101-L107

```ts
import { privateKeyToAccount } from 'viem/accounts'
const account = privateKeyToAccount('0x...') // PrivateKeyAccount
```

`mnemonicToAccount(mnemonic, { passphrase?, accountIndex?, addressIndex?, changeIndex?, path? })` turns a BIP-39 phrase into an `HDAccount`. It computes the seed with `mnemonicToSeedSync` (honoring an optional BIP-39 `passphrase`) and delegates to `hdKeyToAccount`. `hdKeyToAccount(hdKey, options)` is the lower-level form: it takes a `@scure/bip32` `HDKey`, derives one child key, and builds a `PrivateKeyAccount` under the hood, tagging `source: 'hd'` and exposing `getHdKey()`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/mnemonicToAccount.ts#L23-L29
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/hdKeyToAccount.ts#L23-L42

`toAccount(source)` is the escape hatch for a **custom** local account: pass an `address` plus your own `signMessage` / `signTransaction` / `signTypedData` (and optional `sign` / `signAuthorization` / `nonceManager`) implementations and it returns a `LocalAccount` with `source: 'custom'`. Pass a bare address string instead and it returns a `JsonRpcAccount`. Both branches validate the address (non-strict checksum) and throw `InvalidAddressError` on a bad value.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/toAccount.ts#L35-L60
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/accounts/local/toAccount.md#L1-L60

## Key & mnemonic generation

`generatePrivateKey()` returns a random 32-byte hex private key from `secp256k1.utils.randomPrivateKey()`. `generateMnemonic(wordlist, strength?)` returns a random BIP-39 phrase; `strength` is entropy in bits (128–256, default 128 → 12 words). The `wordlist` argument is **required** — there is no default.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/generatePrivateKey.ts#L14-L16
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/generateMnemonic.ts#L14-L19

Wordlists are re-exported from `@scure/bip39`: `english`, `czech`, `french`, `italian`, `japanese`, `korean`, `portuguese`, `simplifiedChinese`, `traditionalChinese`, `spanish`. Import the one you want alongside `generateMnemonic`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/wordlists.ts#L2-L11

```ts
import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts'
const account = mnemonicToAccount(generateMnemonic(english))
```

## HD derivation paths

For `mnemonicToAccount` / `hdKeyToAccount`, `HDOptions` is a discriminated union: either supply the numeric indices (`accountIndex`, `changeIndex`, `addressIndex`, each defaulting to `0`) *or* an explicit `path` — never both. The default derivation is `m/44'/60'/${accountIndex}'/${changeIndex}/${addressIndex}`, i.e. `m/44'/60'/0'/0/0`. To iterate wallet addresses from one seed, bump `addressIndex`.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L83-L99
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/hdKeyToAccount.ts#L33-L35

```ts
mnemonicToAccount(mnemonic, { addressIndex: 1 })          // m/44'/60'/0'/0/1
mnemonicToAccount(mnemonic, { path: "m/44'/60'/0'/0/2" }) // explicit path
```

## The LocalAccount signing interface

The signing methods come from `CustomSource`, which `LocalAccount` extends. The four load-bearing async methods are `signMessage({ message })`, `signTypedData(typedData)`, `signTransaction(transaction, { serializer? })`, and the low-level `sign({ hash })` — all returning a `Hex` signature. `nonceManager` is an optional field on the account, and `signAuthorization` (EIP-7702) is present on private-key accounts. Note: on a raw `CustomSource`, `sign` and `signAuthorization` are optional (marked for v3), so prefer the `PrivateKeyAccount` type when you need them guaranteed.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L23-L52
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L101-L107

These account methods are thin wrappers over the standalone utilities in `src/accounts/utils`, each of which hashes the payload then calls `sign`. You rarely call them off the account directly — wallet actions do it for you — but they're exported for advanced use.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/privateKeyToAccount.ts#L51-L69

## How signing works under the hood

`sign({ hash, privateKey, to })` is the ECDSA primitive: `secp256k1.sign` with `lowS: true` (canonical low-S signatures), returning `r`, `s`, `v` (27n/28n), and `yParity`. It can emit an object (default), raw `bytes`, or serialized `hex`. `setSignEntropy(true | hex)` opts into extra entropy for nondeterministic k-values.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/utils/sign.ts#L55-L81
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/utils/sign.ts#L42-L45

Each higher-level util hashes to a domain-specific format before signing: `signMessage` uses EIP-191 (`hashMessage`), `signTypedData` uses EIP-712 (`hashTypedData`), `signAuthorization` uses EIP-7702 (`hashAuthorization`), and `signTransaction` RLP-serializes then `keccak256`-hashes the transaction (dropping EIP-4844 sidecars before hashing, then re-serializing with the signature).

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/utils/signMessage.ts#L30-L35
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/utils/signTransaction.ts#L40-L72

## Hoisting vs. per-action accounts

Every wallet action that needs a signer takes an `account`. You can pass it **per action** (`client.sendTransaction({ account, ... })`) — necessary when one client serves many accounts — or **hoist** it once onto the client via `account` in `createWalletClient`, after which actions no longer require it. Hoisting is the ergonomic default for single-account apps.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/accounts/local.md#L70-L93

```ts
// Hoisted: set once, omit thereafter
const client = createWalletClient({ account, chain: mainnet, transport: http() })
await client.sendTransaction({ to, value }) // no `account` needed
```

Whichever way you pass it, actions normalize the value through `parseAccount`, so a bare address string is always acceptable (it becomes a JSON-RPC account). JSON-RPC accounts obtained from a browser wallet are typically read via `eth_requestAccounts` and passed as the address.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/accounts/jsonRpc.md#L1-L24

## Nonce management

A `NonceManager` auto-increments transaction nonces so you can fire concurrent transactions without them colliding on the same nonce. It exposes `consume` (get-and-increment), `get`, `increment`, and `reset`, keyed by `address.chainId`. Attach one when constructing a local account (`privateKeyToAccount(pk, { nonceManager })`); `prepareTransactionRequest` then calls `nonceManager.consume(...)` to fill the nonce when you don't specify one.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/nonceManager.ts#L17-L28
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/prepareTransactionRequest.ts#L342-L355

viem exports a ready-made default `nonceManager` (a `createNonceManager` instance backed by a JSON-RPC `source` that reads `eth_getTransactionCount` at the `pending` block tag). Build your own with `createNonceManager({ source })` for a custom backing store. Nonce managers only apply to **local** accounts — for JSON-RPC accounts the wallet/backend owns nonce sequencing.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/nonceManager.ts#L118-L137
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/accounts/local/createNonceManager.md#L1-L9

```ts
import { privateKeyToAccount, nonceManager } from 'viem/accounts'
const account = privateKeyToAccount('0x...', { nonceManager })
```

## Smart / ERC-4337 accounts

Smart-contract (ERC-4337) accounts are a distinct `SmartAccount` member of the `Account` union and live in the separate `viem/account-abstraction` entrypoint — out of scope here, deferred to a future reference.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L1-L16
