# viem — Public Actions

Read-only, chain-query actions that run against a Public Client (`createPublicClient`). Every action is a tree-shakable function called as `action(client, parameters)` and is also exposed as a method on a Public Client (`publicClient.getBalance({...})`). This file curates the commonly used actions under `src/actions/public/`; it excludes contract-typed reads, ENS, and wallet/sign actions (see below).

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [Mental model & cross-cutting patterns](#mental-model--cross-cutting-patterns)
- [Account & balance](#account--balance)
- [Blocks](#blocks)
- [Transactions](#transactions)
- [Calls & gas](#calls--gas)
- [Chain & state](#chain--state)
- [Events & logs](#events--logs)
- [Out of scope](#out-of-scope)

## Mental model & cross-cutting patterns

**Block selectors.** Most read actions accept a *mutually exclusive* union of `blockNumber` (a `bigint`), `blockTag` (`'latest' | 'earliest' | 'pending' | 'safe' | 'finalized'`), or `blockHash` — never combine them. When you pass none, the default is `blockTag: 'latest'` (overridable per-client via `client.experimental_blockTag`). `blockHash` additionally accepts `requireCanonical` to error on non-canonical blocks. This union shape is repeated across `getBalance`, `getTransactionCount`, `getStorageAt`, `getCode`, `getProof`, `call`, and more.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getBalance.ts#L20-L46

**Request dedupe & caching.** Actions keyed to an immutable target (a specific `blockNumber`/`blockHash`, a tx hash, chain id) pass `{ dedupe: true }` so concurrent identical requests collapse into one RPC call; tag-based queries (`'latest'`) are not deduped since the answer changes. `getBlockNumber` additionally memoizes via `withCache` for `cacheTime` ms (defaults to `client.cacheTime`), so cheap repeated reads don't spam the node.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getBlockNumber.ts#L54-L66

**Numbers are `bigint`.** Wei values, block numbers, and gas are `bigint`; counts that are safely small (`getTransactionCount`, `getBlockTransactionCount`, `getChainId`) return `number`. Responses are run through chain-aware formatters (`client.chain.formatters.block/transaction/transactionReceipt`) before returning, so shapes match viem's typed models rather than raw RPC hex.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getBlock.ts#L128-L131

## Account & balance

**`getBalance({ address, blockTag? | blockNumber? | blockHash? })` → `bigint` (wei).** Convert with `formatEther`. If the client has `batch.multicall` enabled and the chain declares a `multicall3` contract, viem transparently routes the balance through Multicall3's `getEthBalance` instead of `eth_getBalance` so it can batch with other calls.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getBalance.ts#L90-L142

**`getTransactionCount({ address, ...block })` → `number`.** This is the account nonce (`eth_getTransactionCount`). Use `blockTag: 'pending'` to include queued txs when computing the next nonce; `'latest'` counts only mined txs.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getTransactionCount.ts#L20-L53

## Blocks

**`getBlock({ blockNumber? | blockHash? | blockTag?, includeTransactions? })` → formatted block.** Defaults to `blockTag: 'latest'` and `includeTransactions: false` (returns tx hashes; set `true` to embed full tx objects). Dispatches to `eth_getBlockByHash` vs `eth_getBlockByNumber` based on which selector you pass, and throws `BlockNotFoundError` on a null result.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getBlock.ts#L90-L132

**`getBlockNumber({ cacheTime? })` → `bigint`.** The latest block height, cached (see caching note above). Pass `cacheTime: 0` to force a fresh `eth_blockNumber`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getBlockNumber.ts#L31-L66

**`getBlockTransactionCount({ ...block })` → `number`.** Count of transactions in a block, via the `...ByHash`/`...ByNumber` RPC variants; defaults to `'latest'`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getBlockTransactionCount.ts#L69-L99

**`watchBlockNumber({ onBlockNumber, onError?, poll?, pollingInterval?, emitMissed?, emitOnBegin? })` → `unwatch()`.** Streams new heights. Transport decides the mechanism: HTTP polls `eth_blockNumber`; WebSocket/IPC subscribe via `eth_subscribe("newHeads")` unless you force `poll: true`. `emitMissed` back-fills skipped heights during a poll gap; `emitOnBegin` fires immediately with the current height. Always call the returned `unwatch` to stop.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/watchBlockNumber.ts#L80-L165

**`watchBlocks({ onBlock, poll?, pollingInterval?, includeTransactions?, blockTag?, emitMissed?, emitOnBegin? })` → `unwatch()`.** Same polling-vs-`eth_subscribe` model as `watchBlockNumber` but delivers full formatted blocks. `blockTag` (default `'latest'`) lets you watch e.g. `'safe'`/`'finalized'` heads.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/watchBlocks.ts#L29-L96

## Transactions

**`getTransaction(selector)` → formatted transaction.** Accepts exactly one of: `{ hash }`, `{ blockHash, index }`, `{ blockNumber, index }`, `{ blockTag, index }`, or `{ sender, nonce }` (a `OneOf` union). Throws `TransactionNotFoundError` if unresolved. A pending tx has `blockNumber === null`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getTransaction.ts#L24-L59

**`getTransactionReceipt({ hash })` → receipt.** Returns the mined receipt (status, gas used, logs, effective gas price). It throws `TransactionReceiptNotFoundError` while the tx is still pending — it does not return `null` — so wrap in try/catch or prefer `waitForTransactionReceipt` when you're waiting on a mine.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getTransactionReceipt.ts#L54-L75

**`waitForTransactionReceipt({ hash, confirmations?, timeout?, pollingInterval?, checkReplacement?, onReplaced?, retryCount?, retryDelay? })` → receipt.** The workhorse for "did my tx land." Defaults: `confirmations: 1`, `timeout: 180_000` ms (throws `WaitForTransactionReceiptTimeoutError` on expiry), `checkReplacement: true`, `retryCount: 6` with exponential backoff, and `pollingInterval` from the client. It watches new block numbers and re-polls `eth_getTransactionReceipt` each block.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/waitForTransactionReceipt.ts#L53-L90

Gotchas: with `confirmations > 1` it resolves only once `currentBlock - receipt.blockNumber + 1 >= confirmations`, so a single mine is not enough. When the receipt is missing it fetches the target block's transactions and looks for one sharing the original `from`+`nonce`; if found it classifies the replacement as `repriced` (same `to`/`value`/`input`), `cancelled` (self-send, `value === 0`), or `replaced`, fires `onReplaced`, and resolves with the replacement's receipt. This means a sped-up or cancelled tx still resolves rather than hanging until timeout.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/waitForTransactionReceipt.ts#L193-L363

**`getTransactionConfirmations({ hash } | { transactionReceipt })` → `bigint`.** Blocks elapsed since inclusion, computed as `currentBlockNumber - txBlockNumber + 1n`; returns `0n` when the tx is not yet mined. Passing a `transactionReceipt` you already hold saves one RPC round-trip versus passing `hash`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getTransactionConfirmations.ts#L63-L79

## Calls & gas

**`call({ to, data?, account?, value?, ...block, stateOverride?, blockOverrides?, batch?, factory?, factoryData?, code? })` → `{ data: Hex | undefined }`.** The low-level `eth_call`. Prefer `readContract`/`simulateContract` for ABI-typed reads — `call` is for raw calldata, deployless calls (`code`/`factory`), and manual encoding.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/call.ts#L90-L139

`stateOverride` is an address→state map (balance, nonce, code, storage) applied ephemerally before the call — e.g. fake a token balance to simulate a swap — and is serialized to the RPC via `serializeStateOverride`; `blockOverrides` similarly patches block fields (number, timestamp, basefee) for the call.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/call.ts#L250-L253

**`estimateGas({ account, to, value?, data?, ...block, stateOverride?, prepare? })` → `bigint`.** Estimates gas units for a tx without submitting it. `account` is required (it's `msg.sender` for the estimate); `prepare` (default `true`) pre-fills blob/fee fields as needed before the `eth_estimateGas` call.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/estimateGas.ts#L45-L114

**`getGasPrice()` → `bigint`.** Current legacy gas price (`eth_gasPrice`, wei). For EIP-1559 chains use `estimateFeesPerGas` instead.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getGasPrice.ts#L32-L40

**`estimateFeesPerGas({ type?, chain? })` → fee values.** Defaults to `type: 'eip1559'`, returning `{ maxFeePerGas, maxPriorityFeePerGas }`; `type: 'legacy'` returns `{ gasPrice }`. `maxFeePerGas` is derived as `baseFeePerGas * baseFeeMultiplier + maxPriorityFeePerGas`, where the multiplier defaults to `1.2` (headroom for a rising base fee) and can be overridden by the chain's `fees.estimateFeesPerGas`/`baseFeeMultiplier`. Throws `Eip1559FeesNotSupportedError` if the latest block has no `baseFeePerGas`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/estimateFeesPerGas.ts#L106-L177

**`getFeeHistory({ blockCount, rewardPercentiles, ...block })` → `FeeHistory`.** Historical base fees, gas-used ratios, and per-percentile priority-fee rewards over up to 1024 blocks ending at `blockTag`/`blockNumber` (default `'latest'`). Useful for building custom fee oracles.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getFeeHistory.ts#L16-L93

**`getBlobBaseFee()` → `bigint`.** Base fee per blob gas (EIP-4844, `eth_blobBaseFee`), for pricing blob-carrying transactions.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getBlobBaseFee.ts#L32-L42

## Chain & state

**`getChainId()` → `number`.** The network chain id (`eth_chainId`); deduped since it's stable.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getChainId.ts#L40-L50

**`getProof({ address, storageKeys, ...block })` → `Proof`.** EIP-1186 Merkle proof of an account and the given storage slots — used for light-client / cross-chain state verification.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getProof.ts#L19-L52

**`getStorageAt({ address, slot, ...block })` → `Hex | undefined`.** Raw value at a storage slot (`slot` is a hex-encoded position, e.g. `toHex(0)`). Reading structured contract storage means computing slots yourself.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getStorageAt.ts#L15-L94

**`getCode({ address, ...block })` → `Hex | undefined`.** Deployed bytecode at an address. A key gotcha: an empty result (`0x`) is normalized to `undefined`, so `getCode` doubles as a contract-existence check (`undefined` ⇒ EOA or not-yet-deployed).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getCode.ts#L70-L97

## Events & logs

There are two ways to read events. **`getLogs`** is a one-shot `eth_getLogs` query over a block range — stateless, simplest, works everywhere, ideal for historical backfills. **Filters** (`eth_newFilter` family) are server-side cursors you create once and then poll for *changes* since the last poll — lighter per-poll but require the node to support and retain filters, and they can be evicted. `watchEvent` wraps both and picks automatically.

**`getLogs({ address?, event?/events?, args?, fromBlock?, toBlock? | blockHash?, strict? })` → `Log[]`.** Pass a parsed ABI `event` (from `parseAbiItem`) plus `args` to filter indexed params and get decoded, typed logs; omit `event` for raw logs. `strict` defaults to `false` (loosely-matching logs are still included with partially-decoded args). Providers cap the block span, so backfills usually chunk the range.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getLogs.ts#L136-L218

**Filter lifecycle.** Create → poll `getFilterChanges` repeatedly → `uninstallFilter` when done. Creators: `createEventFilter({ event?/events?, args?, address?, fromBlock?, toBlock?, strict? })` for logs, `createBlockFilter()` for new block hashes, `createPendingTransactionFilter()` for pending tx hashes. Each returns a `Filter` object carrying its `id`, `type`, and a scoped `request` fn.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/createEventFilter.ts#L27-L70

`createBlockFilter()` → `Filter<'block'>` (`eth_newBlockFilter`) and `createPendingTransactionFilter()` → `Filter<'transaction'>` (`eth_newPendingTransactionFilter`) take no filtering params; you read them purely through `getFilterChanges`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/createBlockFilter.ts#L34-L43

**`getFilterChanges({ filter })`** returns only what's new since the previous call: decoded logs for event filters, block hashes for block filters, tx hashes for pending-tx filters. It's the incremental read; the return type is discriminated by the filter's `type`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getFilterChanges.ts#L31-L73

**`getFilterLogs({ filter })`** returns *all* logs matching the filter since it was created (not just the delta) and is event-filter-only. Use it to snapshot; use `getFilterChanges` to tail.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getFilterLogs.ts#L50-L77

**`uninstallFilter({ filter })` → `boolean`.** Frees the filter on the node. Always clean up long-lived filters to avoid leaking server resources.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/uninstallFilter.ts#L39-L50

**`watchEvent({ onLogs, event?/events?, args?, address?, fromBlock?, poll?, pollingInterval?, batch?, strict? })` → `unwatch()`.** The high-level event stream. On HTTP it tries to create a filter and poll `getFilterChanges`; if the provider lacks `eth_newFilter` it transparently falls back to `getLogs` per block. On WebSocket/IPC it uses an `eth_subscribe` subscription unless you force `poll: true` (also forced when `fromBlock` is set). `batch` (default `true`) coalesces all logs found within a polling interval into one `onLogs` call. Remember to call `unwatch`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/watchEvent.ts#L122-L191

## Out of scope

Contract-typed reads (`readContract`, `getContractEvents`, `multicall`, `createContractEventFilter`, `watchContractEvent`, `simulateContract`) → see `wevm-viem-contract.md`. ENS resolution actions → see `wevm-viem-ens.md`. Sending/signing (wallet) actions → see `wevm-viem-wallet-actions.md`.
