# viem — Test Actions (Anvil / Hardhat)

Test Actions drive a local Ethereum dev node (Anvil, Hardhat, or Ganache) to manipulate chain state directly — mining blocks, warping time, forging balances/code/storage, impersonating accounts, and snapshotting/reverting. They map one-to-one onto the node's `anvil_*` / `hardhat_*` / `evm_*` / `txpool_*` JSON-RPC methods and are attached to a **Test Client** created with `createTestClient`.

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [Mental model & the Test Client](#mental-model--the-test-client)
- [Why `mode` matters (RPC dispatch)](#why-mode-matters-rpc-dispatch)
- [Mining & time control](#mining--time-control)
- [Account & state manipulation](#account--state-manipulation)
- [Snapshots, reset & state dumps](#snapshots-reset--state-dumps)
- [Mempool / txpool](#mempool--txpool)
- [Typical testing workflows](#typical-testing-workflows)
- [Out of scope](#out-of-scope)

## Mental model & the Test Client

A Test Client is a normal viem `Client` decorated with the `TestActions` bundle; you create it with `createTestClient({ mode, transport, chain? })`, where `mode` is `'anvil' | 'hardhat' | 'ganache'`. Unlike Public/Wallet clients, the mode is stored on the client so every action can branch on `client.mode` to pick the correct vendor-specific RPC method name.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createTestClient.ts#L92-L127

`createTestClient` calls `client.extend((config) => ({ mode, ...testActions({ mode })(config) }))`, and `testActions` re-extends the client with `{ mode }` before wiring each action, so `client.mode` is always available inside the actions. `TestClientMode` is the union `'anvil' | 'hardhat' | 'ganache'`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/decorators/test.ts#L719-L777

The idiomatic pattern is to build one Test Client for the local node and `.extend(publicActions).extend(walletActions)` so a single client can mine, read chain state, and send transactions — instead of juggling three clients against the same `chain`/`transport` (typically the `foundry` chain over `http()`).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/site/pages/docs/clients/test.md#L46-L67

```ts
import { createTestClient, http, publicActions, walletActions } from 'viem'
import { foundry } from 'viem/chains'

const client = createTestClient({ mode: 'anvil', chain: foundry, transport: http() })
  .extend(publicActions)
  .extend(walletActions)
```

Every action is also importable standalone from `viem/test` as `action(client, params)`; the client-method form `client.action(params)` is just the decorated equivalent.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/mine.ts#L21-L58

## Why `mode` matters (RPC dispatch)

Anvil, Hardhat, and Ganache expose overlapping but *not identical* RPC surfaces, so many actions rewrite the method name (and occasionally the params) based on `client.mode`. Getting `mode` wrong is the most common source of "method not found" errors: an `anvil_*` call will fail against a Hardhat node and vice-versa. The table below lists the actions where dispatch actually diverges; everything else uses a single stable method for all modes.

| Action | anvil / hardhat | ganache | note |
| --- | --- | --- | --- |
| `mine` | `${mode}_mine` | `evm_mine` | ganache takes `[{ blocks }]`; others `[blocks, interval]` |
| `setAutomine` | `evm_setAutomine` | `miner_start` / `miner_stop` | ganache has no toggle RPC |
| `getAutomine` | `${mode}_getAutomine` | `eth_mining` | |
| `setBalance` | `${mode}_setBalance` | `evm_setAccountBalance` | |
| `setCode` | `${mode}_setCode` | `evm_setAccountCode` | |
| `setIntervalMining` | `evm_setIntervalMining` | `evm_setIntervalMining` | hardhat interval is ms (×1000) |
| `setBlockTimestampInterval` | `${mode}_setBlockTimestampInterval` | — | hardhat interval is ms (×1000) |

Method names built as `` `${client.mode}_mine` `` (etc.) are why the mode string must match your node exactly; see the ganache-vs-others branch in `mine`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/mine.ts#L41-L58

## Mining & time control

`mine({ blocks, interval? })` advances the chain by `blocks` blocks. On anvil/hardhat viem forwards `[numberToHex(blocks), numberToHex(interval || 0)]`, so an omitted `interval` is sent as `0` and the node applies its own spacing; ganache instead receives `evm_mine` with `{ blocks }`. Mining is how pending transactions get included when automine is off.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/mine.ts#L41-L58

`setAutomine(enabled)` and `getAutomine()` toggle/read whether the node mines a block on every submitted transaction. With automine on you rarely call `mine`; with it off you control block production explicitly. Ganache lacks a direct toggle, so viem maps `setAutomine` to `miner_start`/`miner_stop` and `getAutomine` to `eth_mining`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/setAutomine.ts#L32-L47

`setIntervalMining({ interval })` enables periodic mining every `interval` seconds (set `0` to disable) via `evm_setIntervalMining`; note that in `hardhat` mode viem multiplies `interval` by `1000` because Hardhat expects milliseconds.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/setIntervalMining.ts#L38-L54

`setNextBlockTimestamp({ timestamp })` pins the timestamp (in seconds, as a `bigint`) of the *next* mined block via `evm_setNextBlockTimestamp`; the change only lands once you mine.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/setNextBlockTimestamp.ts#L39-L50

`increaseTime({ seconds })` jumps the clock forward by `seconds` (a `number`) via `evm_increaseTime`, and `setBlockTimestampInterval({ interval })` makes each future block's timestamp `lastBlock + interval` (hardhat again gets ms); `removeBlockTimestampInterval()` clears it.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/increaseTime.ts#L41-L52

`setNextBlockBaseFeePerGas({ baseFeePerGas })` (`${mode}_setNextBlockBaseFeePerGas`) and `setBlockGasLimit({ gasLimit })` (`evm_setBlockGasLimit`) let you drive EIP-1559 fee conditions and block gas limits; both take `bigint` wei/gas values encoded to hex.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/setNextBlockBaseFeePerGas.ts#L41-L52

## Account & state manipulation

`setBalance({ address, value })` overwrites an account's balance to `value` wei — pair it with `parseEther` to fund test accounts instantly. It uses `${mode}_setBalance`, except ganache which uses `evm_setAccountBalance`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/setBalance.ts#L46-L63

`setCode({ address, bytecode })` plants raw deployed bytecode at an address (`${mode}_setCode`, or `evm_setAccountCode` on ganache) — useful for injecting a mock/contract without deploying it.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/setCode.ts#L46-L63

`setNonce({ address, nonce })` (`${mode}_setNonce`) forces an account's nonce, and `setStorageAt({ address, index, value })` (`${mode}_setStorageAt`) writes a single 32-byte storage slot; `index` may be a slot number (hex-encoded for you) or a pre-computed slot hash, and `value` must be a full 32-byte hex word.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/setStorageAt.ts#L50-L65

`impersonateAccount({ address })` unlocks sending transactions *from* an address you don't hold the key for (e.g. a whale or a contract), and `stopImpersonatingAccount({ address })` releases it. Both use `${mode}_impersonateAccount` / `${mode}_stopImpersonatingAccount`. While impersonating, send via a Wallet Action with `account: address` (and no local signer).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/impersonateAccount.ts#L42-L53
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/stopImpersonatingAccount.ts#L42-L53

## Snapshots, reset & state dumps

`snapshot()` (`evm_snapshot`) captures the full chain state and returns a snapshot id (`Quantity`); `revert({ id })` (`evm_revert`) rolls the chain back to that id. This snapshot/revert pair is the workhorse for isolating tests cheaply without restarting the node.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/snapshot.ts#L32-L39
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/revert.ts#L39-L50

A snapshot id is **single-use in EVM semantics**: reverting to an id discards it and every snapshot taken after it, so re-snapshot after each revert if you need repeated rollbacks. `revert({ id })` takes the raw `Quantity` id returned by `snapshot()`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/revert.ts#L12-L50

`reset({ blockNumber?, jsonRpcUrl? })` (`${mode}_reset`) hard-resets a forked node back to a fork point, forwarding `{ forking: { blockNumber, jsonRpcUrl } }`; call it with no args to reset to the original fork state. Use this (not `revert`) to re-pin a mainnet fork to a specific block.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/reset.ts#L40-L51

`dumpState()` (`${mode}_dumpState`) serializes the entire node state (code, storage, accounts) into a `Hex` blob, and `loadState({ state })` (`${mode}_loadState`) restores it. Unlike snapshots, a dump is a portable savable artifact you can persist across processes.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/dumpState.ts#L35-L44
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/loadState.ts#L36-L47

## Mempool / txpool

`sendUnsignedTransaction(request)` (`eth_sendUnsignedTransaction`) submits a transaction *without a signature* and returns its hash — an alternative to impersonation for sending from an arbitrary `from`. It formats the request with the chain's `transactionRequest` formatter, so it accepts the same fee/gas/access-list fields as a normal send.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/sendUnsignedTransaction.ts#L51-L97

`dropTransaction({ hash })` (`${mode}_dropTransaction`) evicts a pending transaction from the mempool by hash — handy for testing replacement/stuck-nonce paths.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/dropTransaction.ts#L41-L52

`getTxpoolContent()` (`txpool_content`) returns the full `{ pending, queued }` maps of address → nonce → `RpcTransaction`, while `inspectTxpool()` (`txpool_inspect`) returns the same shape summarized as human-readable strings.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/getTxpoolContent.ts#L43-L52
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/inspectTxpool.ts#L40-L49

`getTxpoolStatus()` (`txpool_status`) returns just the counts `{ pending, queued }`, and viem decodes the node's hex quantities into plain `number`s for you.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/getTxpoolStatus.ts#L39-L52

## Typical testing workflows

Snapshot → mutate → revert keeps each test hermetic: take a snapshot before a scenario, run mutations/transactions, then revert so the next test starts clean.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/snapshot.ts#L32-L39

```ts
const id = await client.snapshot()
await client.setBalance({ address, value: parseEther('100') })
// ... run assertions ...
await client.revert({ id }) // back to pre-mutation state
```

Impersonate → act → stop lets you execute as any address; combine with `mine` when automine is off so the impersonated transaction is actually included.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/test/impersonateAccount.ts#L42-L53

```ts
await client.impersonateAccount({ address: whale })
await client.sendTransaction({ account: whale, to, value }) // Wallet Action
await client.mine({ blocks: 1 })
await client.stopImpersonatingAccount({ address: whale })
```

## Out of scope

Reading chain state and sending signed transactions belong to Public/Wallet Actions — see `wevm-viem-public-actions.md` and `wevm-viem-wallet-actions.md`. Client construction, `mode`, and transport wiring beyond the Test Client basics above are covered in `wevm-viem-clients-transports.md`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createTestClient.ts#L18-L44
