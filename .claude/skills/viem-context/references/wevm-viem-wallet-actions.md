# viem — Wallet Actions

Wallet Actions map one-to-one with signable/wallet Ethereum RPC methods (`eth_sendTransaction`, `personal_sign`, `wallet_switchEthereumChain`, …) and run on a Wallet Client. They send transactions, sign messages/data, expose accounts, and manage chains/assets. The single most important thing to understand here is the account model — **Local Account** vs **JSON-RPC Account** — because it decides which of these actions actually work and where signing happens.

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [The account model (read this first)](#the-account-model-read-this-first)
- [Sending: the prepare → sign → send pipeline](#sending-the-prepare--sign--send-pipeline)
- [prepareTransactionRequest](#preparetransactionrequest)
- [signTransaction and sendRawTransaction](#signtransaction-and-sendrawtransaction)
- [Signing messages and typed data](#signing-messages-and-typed-data)
- [Account access](#account-access)
- [Chain and asset management](#chain-and-asset-management)
- [Cross-cutting gotchas](#cross-cutting-gotchas)
- [Out of scope](#out-of-scope)

## The account model (read this first)

An `Account` in viem is a union of `JsonRpcAccount`, `LocalAccount`, and `SmartAccount`. A **JSON-RPC Account** is just `{ address, type: 'json-rpc' }` — it holds no key and **defers** signing to a wallet over RPC (MetaMask, WalletConnect). A **Local Account** carries the signing primitives (`sign`, `signMessage`, `signTransaction`, `signTypedData`) directly, so viem signs **locally, offline**, then only broadcasts. See the union at [accounts/types.ts#L14-L52](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L14-L52) and the `JsonRpcAccount`/`LocalAccount` shapes at [types.ts#L58-L73](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/types.ts#L58-L73).

The account can be **supplied per-action** (`account:` in the parameters) or **hoisted** once onto the client (`createWalletClient({ account })`). Every action resolves it the same way: `account: account_ = client.account` — the per-action value wins, otherwise it falls back to the hoisted one; if neither exists it throws `AccountNotFoundError`. See the fallback in `sendTransaction` at [sendTransaction.ts#L166-L192](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendTransaction.ts#L166-L192) and the client-side hoisting via `ParseAccount` at [createWalletClient.ts#L105-L119](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createWalletClient.ts#L105-L119).

A bare address string is coerced to a JSON-RPC account by `parseAccount` — anything that is a `string` becomes `{ address, type: 'json-rpc' }`. So passing `account: '0x…'` (rather than a `privateKeyToAccount(...)` object) means viem will route to the wallet, not sign locally. That is the usual source of "why is `signTransaction` unsupported?" confusion.

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/utils/parseAccount.ts#L8-L14

The branch each action takes is decided by `account.type`. Local accounts have local signing methods and go the offline route; json-rpc accounts issue an RPC call. Concretely: `signTransaction` is fully supported for Local Accounts but frequently **unsupported** for JSON-RPC accounts, because injected wallets rarely implement `eth_signTransaction` (they expose `eth_sendTransaction` instead). The conceptual framing lives in the Wallet Client docs. See [docs/clients/wallet.md#L18-L20](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/wallet.md#L18-L20) (JSON-RPC defers signing) and [wallet.md#L114-L116](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/wallet.md#L114-L116) (Local signs before RPC).

All actions are bound onto the client by `walletActions` so you call `client.sendTransaction(...)` rather than importing the standalone function; the tree-shakable functions take `(client, parameters)`. See the decorator bindings at [decorators/wallet.ts#L1419-L1445](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/decorators/wallet.ts#L1419-L1445).

## Sending: the prepare → sign → send pipeline

`sendTransaction` creates, signs, and broadcasts a transaction and returns the transaction hash. Its behavior forks entirely on account type at [sendTransaction.ts#L220-L377](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendTransaction.ts#L220-L377).

For a **JSON-RPC (or bare-address) account**, viem does minimal work: it fetches the chain id, optionally asserts it matches the client's chain (`assertChainId`, default `true`), formats the request, and hands the whole thing to the wallet via `eth_sendTransaction`. The wallet fills fees/gas/nonce and signs. If the transport rejects `eth_sendTransaction` with an "invalid input / method not found" error, viem retries once with `wallet_sendTransaction` and caches whether that namespace is supported per client. See the JSON-RPC branch and fallback at [sendTransaction.ts#L220-L309](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendTransaction.ts#L220-L309).

For a **Local account**, viem runs the full offline pipeline itself: `prepareTransactionRequest` (assemble nonce, fees, gas, type, chainId) → `account.signTransaction(...)` (serialize + sign locally) → `sendRawTransaction` (`eth_sendRawTransaction`). This is why a Local Account works even against a dumb `http()` transport with no signing wallet behind it. See the local branch at [sendTransaction.ts#L312-L363](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendTransaction.ts#L312-L363). A `smart` account throws `AccountTypeNotSupportedError` pointing you at `sendUserOperation` ([L365-L372](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendTransaction.ts#L365-L372)).

Two commonly-missed parameters: `dataSuffix` (appended to calldata, defaulting to `client.dataSuffix`) and `assertChainId`. Both are pulled from parameters with their defaults at [sendTransaction.ts#L166-L186](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendTransaction.ts#L166-L186). If a Local Account has a `nonceManager` and no explicit nonce, viem resolves a chain id for the manager and resets it on failure so nonces don't leak — see [sendTransaction.ts#L312-L321](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendTransaction.ts#L312-L321) and the error path at [L378-L387](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendTransaction.ts#L378-L387).

```ts
// Local Account: hoisted, viem signs offline, http() transport is fine.
const client = createWalletClient({ account: privateKeyToAccount('0x…'), chain: mainnet, transport: http() })
const hash = await client.sendTransaction({ to: '0x70…', value: parseEther('1') })

// JSON-RPC Account: wallet signs, account can be hoisted or per-call.
const client = createWalletClient({ chain: mainnet, transport: custom(window.ethereum) })
const hash = await client.sendTransaction({ account: '0xA0…', to: '0x70…', value: 1n })
```

## prepareTransactionRequest

`prepareTransactionRequest` is the assembly step: given a partial request it fills in the fields needed to sign, returning a fully-populated request. Which fields it fills is controlled by `parameters`, defaulting to `['blobVersionedHashes', 'chainId', 'fees', 'gas', 'nonce', 'type']`. See `defaultParameters` at [prepareTransactionRequest.ts#L79-L86](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/prepareTransactionRequest.ts#L79-L86) and the default assignment at [L306-L314](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/prepareTransactionRequest.ts#L306-L314).

Each field is derived lazily and only if absent. **Nonce**: consumed from a `nonceManager` if present, otherwise fetched via `getTransactionCount` at the `pending` block tag. **chainId**: from the request, the chain, or `eth_chainId`. **type**: inferred from the request shape, falling back to probing `block.baseFeePerGas` to pick `eip1559` vs `legacy` (cached per client). **fees**: EIP-1559 (`maxFeePerGas`/`maxPriorityFeePerGas` via `estimateFeesPerGas`) unless the type is legacy/eip2930, in which case `gasPrice`; mixing the two throws `Eip1559FeesNotSupportedError`. **gas**: `estimateGas`. See nonce at [L342-L355](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/prepareTransactionRequest.ts#L342-L355) and [L533-L546](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/prepareTransactionRequest.ts#L533-L546), type/fees/gas at [L575-L658](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/prepareTransactionRequest.ts#L575-L658).

As an optimization, when fees or gas are required viem may batch the fill through a single `eth_fillTransaction` call, falling back to the individual RPC calls above if that method is unsupported (cached per client). The result is validated with `assertRequest` before return. See the fill attempt at [L371-L500](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/prepareTransactionRequest.ts#L371-L500) and the final assert at [L672-L676](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/prepareTransactionRequest.ts#L672-L676). You rarely call this directly — `sendTransaction` invokes it for Local Accounts — but it is useful when you want to inspect or tweak a request before signing.

## signTransaction and sendRawTransaction

`signTransaction` produces a signed, serialized transaction without broadcasting. The fork is the same: if the account carries a local `signTransaction` method it signs offline; otherwise it issues `eth_signTransaction`. Note this action does **not** run the full prepare pipeline — it asserts the request and current chain, then signs what you gave it, so callers typically `prepareTransactionRequest` first. See the local vs RPC branches at [signTransaction.ts#L161-L189](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/signTransaction.ts#L161-L189) and the chain assertion at [L150-L155](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/signTransaction.ts#L150-L155).

`sendRawTransaction` is a thin broadcast of an already-signed serialized transaction via `eth_sendRawTransaction`. It takes no account and does no preparation — it is the final leg the Local-Account `sendTransaction` path uses internally, and is what you call after signing separately (e.g. relaying a transaction signed elsewhere). See [sendRawTransaction.ts#L42-L53](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendRawTransaction.ts#L42-L53).

## Signing messages and typed data

`signMessage` computes an EIP-191 signature (`"\x19Ethereum Signed Message:\n" + len + message`). Local accounts sign via `account.signMessage`; JSON-RPC accounts call `personal_sign`. Pass either a UTF-8 `string` or `{ raw: Hex | Uint8Array }` for pre-hashed/binary data — the string form is hex-encoded before the RPC call. See [signMessage.ts#L82-L112](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/signMessage.ts#L82-L112).

`signTypedData` computes an EIP-712 signature. Local accounts sign via `account.signTypedData`; JSON-RPC accounts serialize and call `eth_signTypedData_v4`. viem injects the `EIP712Domain` type from your `domain` and runs `validateTypedData` at runtime (address/byte/integer range checks TypeScript can't catch). See [signTypedData.ts#L153-L194](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/signTypedData.ts#L153-L194).

The parameter object has four load-bearing keys — `domain`, `types`, `primaryType`, `message`:

```ts
const signature = await client.signTypedData({
  account,                       // optional if hoisted
  domain: { name: 'Ether Mail', version: '1', chainId: 1, verifyingContract: '0xCcCc…' },
  types: {
    Person: [{ name: 'name', type: 'string' }, { name: 'wallet', type: 'address' }],
    Mail:   [{ name: 'from', type: 'Person' }, { name: 'to', type: 'Person' }, { name: 'contents', type: 'string' }],
  },
  primaryType: 'Mail',           // must be a key of `types`
  message: { from: { name: 'Cow', wallet: '0xCD2a…' }, to: { name: 'Bob', wallet: '0xbBbB…' }, contents: 'Hello, Bob!' },
})
```

That shape mirrors the canonical example in source at [signTypedData.ts#L76-L107](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/signTypedData.ts#L76-L107).

Raw `sign` (signing an arbitrary 32-byte hash, no EIP-191/712 prefixing) is **not** a Wallet Action — there is no `eth_` equivalent a JSON-RPC wallet would expose. It lives on a Local Account as `account.sign({ hash })`, backed by the secp256k1 primitive in [accounts/utils/sign.ts#L55-L81](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/utils/sign.ts#L55-L81). Reach for it only when you know you want a raw ECDSA signature over a precomputed digest.

## Account access

`getAddresses` returns the addresses the wallet already exposes via `eth_accounts` (checksummed), without prompting. For a hoisted Local Account it short-circuits and returns `[client.account.address]` with no RPC call. See [getAddresses.ts#L44-L51](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/getAddresses.ts#L44-L51).

`requestAddresses` is the connect prompt: it calls `eth_requestAccounts` (EIP-1102), which triggers the wallet's "connect this dapp?" UI and returns the granted addresses. Use it to establish a connection; use `getAddresses` afterward for silent reads. See [requestAddresses.ts#L39-L50](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/requestAddresses.ts#L39-L50).

Permissions follow the same read-vs-prompt split under EIP-2255: `getPermissions` (`wallet_getPermissions`) reads current grants, while `requestPermissions` (`wallet_requestPermissions`) prompts the user — typically `requestPermissions({ eth_accounts: {} })`. See [getPermissions.ts#L33-L42](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/getPermissions.ts#L33-L42) and [requestPermissions.ts#L44-L58](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/requestPermissions.ts#L44-L58).

## Chain and asset management

`addChain` registers an EVM chain with the wallet via `wallet_addEthereumChain` (EIP-3085). You pass a viem `Chain` object and viem maps it to the RPC shape — hex `chainId`, `chainName`, `nativeCurrency`, the default HTTP `rpcUrls`, and block-explorer URLs. See the mapping at [addChain.ts#L44-L62](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/addChain.ts#L44-L62).

`switchChain` asks the wallet to switch its active chain via `wallet_switchEthereumChain` (EIP-3326), taking just `{ id }`. Wallets commonly reject with a "chain not added" error, so the usual pattern is `switchChain` and, on failure, `addChain` then retry. See [switchChain.ts#L42-L57](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/switchChain.ts#L42-L57).

`watchAsset` asks the wallet to track a token (e.g. ERC-20) via `wallet_watchAsset` (EIP-747), returning a boolean for whether it was added. (Note the doc comment in source misstates the method/EIP; the actual call is `wallet_watchAsset`.) See [watchAsset.ts#L41-L56](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/watchAsset.ts#L41-L56).

`getChainId` (technically a Public Action, but bound on the Wallet Client and used throughout this pipeline) reads the connected network's id via `eth_chainId`. It underpins the `assertChainId` guard in `sendTransaction` and the chainId assembly in `prepareTransactionRequest`. See [getChainId.ts#L42-L51](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getChainId.ts#L42-L51).

## Cross-cutting gotchas

A few patterns recur across every action above, worth internalizing once:

- **Bare address ≠ local signing.** `account: '0x…'` becomes a JSON-RPC account, so signing goes to the wallet even on an `http()` transport — which will fail if there's no wallet behind it. Use `privateKeyToAccount(...)` for offline signing. Coercion at [parseAccount.ts#L8-L14](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/accounts/utils/parseAccount.ts#L8-L14).
- **`signTransaction` may throw for injected wallets.** They implement `eth_sendTransaction`, not `eth_signTransaction`; prefer `sendTransaction` for JSON-RPC accounts. RPC branch at [signTransaction.ts#L171-L189](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/signTransaction.ts#L171-L189).
- **Signing writes retry with `retryCount: 0`.** Transaction/signature RPC calls are deliberately not auto-retried to avoid double submission — visible on each `client.request(..., { retryCount: 0 })` call, e.g. [sendTransaction.ts#L262-L269](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/sendTransaction.ts#L262-L269).
- **Read actions dedupe.** `getAddresses`, `getPermissions`, `addChain`, and `getChainId` pass `{ dedupe: true }` so concurrent identical calls collapse into one request — see [getPermissions.ts#L37-L41](https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/getPermissions.ts#L37-L41).

## Out of scope

Creating accounts (`privateKeyToAccount`, `mnemonicToAccount`, `toAccount`) → see `wevm-viem-accounts.md`. Contract writes and deploys (`writeContract`, `deployContract`) → see `wevm-viem-contract.md`. Reading chain/contract state → see `wevm-viem-public-actions.md`.
