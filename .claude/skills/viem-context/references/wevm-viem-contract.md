# viem — Contract Interaction

This reference covers contract-level actions in viem: reading view/pure functions, the simulate-then-write pattern for state changes, batching with `multicall`, reading and watching events, `getContract` instances, and the ABI encode/decode helpers those actions are built on. All of these actions take a typed `abi` plus `functionName`/`eventName`, and viem infers argument and return types from a `const`-asserted ABI.

**Grounded in** viem@2.54.1 at commit `e6e0c1bef949fbdc837662fbd41ebe739ccae030`. Permalinks below pin to that commit.

## Contents

- [Mental model](#mental-model)
- [readContract (view/pure)](#readcontract-viewpure)
- [simulateContract → writeContract](#simulatecontract--writecontract)
- [estimateContractGas](#estimatecontractgas)
- [deployContract](#deploycontract)
- [getContract instances](#getcontract-instances)
- [multicall](#multicall)
- [Reading & watching events](#reading--watching-events)
- [ABI encode/decode helpers](#abi-encodedecode-helpers)
- [Type inference](#type-inference)
- [Out of scope](#out-of-scope)

## Mental model

Every contract action is a thin wrapper: it ABI-encodes `{ abi, functionName, args }` into calldata via `encodeFunctionData`, dispatches a generic action (`call`, `estimateGas`, `sendTransaction`, `getLogs`), then decodes the result and rethrows failures as a rich `ContractFunctionExecutionError` carrying the ABI, address, args, and docs path. `readContract` is the clearest example of this encode→`call`→decode pipeline.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/readContract.ts#L116-L148

The split that matters: **read/view/pure** functions cost no gas and go through a `Public Client` (`readContract`, `simulateContract`, `multicall`, event actions); **write** functions change state, cost gas, and go through a `Wallet Client` (`writeContract`, `deployContract`). `simulateContract` straddles both — it validates a write function via a gasless `eth_call` without broadcasting.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/writeContract.ts#L108-L113

## readContract (view/pure)

`readContract(client, { address, abi, functionName, args })` calls a `view`/`pure` function and returns the decoded result, its type inferred from the ABI. `functionName` is constrained to `ContractFunctionName<abi, 'pure' | 'view'>`, so only read functions are offered and `args` are checked against that function's inputs.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/readContract.ts#L107-L115

Parameters extend a subset of `CallParameters` — you can pass `blockNumber`/`blockTag` to read historical state, plus `stateOverride`, `account`, and counterfactual `factory`/`factoryData`. Internally it runs `encodeFunctionData` → `call` → `decodeFunctionResult`; if the call reverts, `getContractError` decodes the revert reason.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/readContract.ts#L31-L57

## simulateContract → writeContract

The recommended pattern for state changes is **simulate, then write**. `writeContract` broadcasts a transaction immediately and does *not* check whether the call will succeed — a doomed write still costs gas and confirms as a reverted tx. `simulateContract` runs the same call as a gasless `eth_call` first, so any revert (bad args, failed `require`, insufficient allowance) surfaces *before* you spend gas.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/writeContract.ts#L103-L152

`simulateContract` returns `{ result, request }`: `result` is the function's decoded return value, and `request` is a fully-populated, type-narrowed write request you pass straight to `writeContract`. This is the ergonomic payoff — simulate validates and produces the exact object `writeContract` needs.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/simulateContract.ts#L153-L185

```ts
const { result, request } = await publicClient.simulateContract({
  address: '0xFBA…',
  abi,
  functionName: 'mint',
  args: [69420n],
  account, // simulate as this account
})
const hash = await walletClient.writeContract(request)
```

Internally `simulateContract` encodes calldata, runs `call` with `batch: false` (so it isn't silently folded into a multicall aggregate), decodes the result, then narrows the returned `request.abi` down to just the called function (`minimizedAbi`) before echoing back the request. It only accepts `nonpayable`/`payable` functions and enforces a `value` field only when the function is payable.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/simulateContract.ts#L273-L314

`writeContract(client, { address, abi, functionName, args, account, ... })` ABI-encodes the call and forwards it to `sendTransaction`, returning a transaction hash. It throws `AccountNotFoundError` if no account is set on the params or client. Both `simulateContract` and `writeContract` accept a `dataSuffix` hex appended to calldata (e.g. attribution tags).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/writeContract.ts#L207-L250

viem also ships `writeContractSync` (waits for inclusion and returns a receipt) — see `src/actions/wallet/writeContractSync.ts`; the async `writeContract` above returns only the hash.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/writeContract.ts#L94-L101

## estimateContractGas

`estimateContractGas(client, { address, abi, functionName, args, account })` returns the gas (as a `bigint`) required to execute a write function, by encoding calldata and delegating to the generic `estimateGas` action. Use it to preflight cost; unlike `simulateContract` it returns only the estimate, not the decoded result.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/estimateContractGas.ts#L99-L146

## deployContract

`deployContract(walletClient, { abi, bytecode, args })` deploys a contract: it `encodeDeployData`-encodes the constructor `args` onto the `bytecode` and sends a transaction with no `to`, returning the deploy tx hash. Constructor `args` are required only when the ABI's constructor takes inputs. Get the deployed address later from the receipt's `contractAddress`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/wallet/deployContract.ts#L71-L88

## getContract instances

`getContract({ abi, address, client })` returns a typed instance so you stop repeating `abi`/`address` on every call. Methods are exposed as namespaces keyed by function/event name: `contract.read.foo(args, opts)`, `contract.simulate.foo(...)`, `contract.write.foo(...)`, `contract.estimateGas.foo(...)`, `contract.getEvents.Foo(...)`, `contract.watchEvent.Foo(...)`, and `contract.createEventFilter.Foo(...)`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/getContract.ts#L470-L490

Which namespaces exist depends on the client you pass. A Public Client unlocks `read`, `simulate`, `estimateGas`, `getEvents`, `watchEvent`, `createEventFilter`; a Wallet Client unlocks `write` (and `estimateGas`). Pass `{ public, wallet }` as a `KeyedClient` to get all of them on one instance.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/getContract.ts#L70-L117

Each namespace is a `Proxy`; accessing `.foo` builds a call to the underlying action (`read` → `readContract`, `write` → `writeContract`, etc.) with `abi`/`address`/`functionName` prefilled. Call args are the first argument and per-call options the second, disambiguated by `getFunctionParameters` (a leading array is treated as `args`).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/getContract.ts#L533-L594

```ts
const wagmi = getContract({ address: '0xFBA…', abi, client: publicClient })
const supply = await wagmi.read.totalSupply()          // no args
const bal = await wagmi.read.balanceOf([owner])        // args as first tuple
const { request } = await wagmi.simulate.mint([1n], { account })
```

Events are similar but `getEventParameters` decides whether the first argument is indexed-arg filters or options based on the event's `inputs`. The instance also re-exposes `contract.abi` and `contract.address`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/getContract.ts#L632-L701

## multicall

`multicall(client, { contracts })` batches many read calls into a single RPC round-trip via the on-chain Multicall3 `aggregate3` function — dramatically fewer requests than looping `readContract`. Each entry is a `{ address, abi, functionName, args }` tuple; results come back in input order.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/multicall.ts#L131-L155

`allowFailure` defaults to **`true`**: each result is `{ status: 'success', result }` or `{ status: 'failure', error }`, so one reverting call doesn't sink the batch — you must narrow on `status` before reading `result`. Set `allowFailure: false` to instead get a bare array of decoded results (any failure throws). This is a per-call vs all-or-nothing tradeoff.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/multicall.ts#L273-L309

Calls are chunked by `batchSize` (default **1024** bytes of calldata per chunk); each chunk is one `aggregate3` call, and chunks run concurrently via `Promise.allSettled`. `multicallAddress` defaults to the chain's registered Multicall3 address; set `deployless: true` to run against `multicall3Bytecode` via a state override when no contract is deployed.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/multicall.ts#L152-L253

Separately, the **client-level** `batch.multicall` option makes ordinary `readContract`/`call` actions transparently coalesce into `aggregate3` under the hood. Enable with `batch: { multicall: true }` on `createClient`, or tune `{ batchSize, wait, deployless }` — `wait` (default `0` ms) is how long to collect calls before firing the batch.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L41-L47

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/clients/createClient.ts#L225-L232

## Reading & watching events

`getContractEvents(client, { abi, address?, eventName?, args?, fromBlock, toBlock, strict? })` fetches historical logs for a contract. It resolves the event ABI item and delegates to `getLogs`, returning typed, decoded logs; omit `eventName` to fetch every event in the ABI. `strict` defaults to `false`, meaning logs whose indexed/non-indexed args don't exactly match the ABI item are still returned (with looser typing).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/getContractEvents.ts#L115-L169

`parseEventLogs({ abi, logs, eventName?, args?, strict? })` is the decode-side companion: given raw logs (e.g. from a transaction receipt), it matches each log's `topics[0]` selector against the ABI's events, decodes the matches, and drops non-matching logs. `eventName` can be a single name or array; `args` filter by indexed values. Here `strict` defaults to **`true`** — set it `false` to keep logs that fail strict decoding as partial results.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/parseEventLogs.ts#L94-L200

`createContractEventFilter(client, { abi, eventName?, args?, fromBlock, toBlock, strict? })` registers a server-side filter via `eth_newFilter` (topics computed with `encodeEventTopics`) and returns a `Filter` you later poll with `getFilterChanges`/`getFilterLogs`. Not all RPC providers support `eth_newFilter`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/createContractEventFilter.ts#L100-L153

`watchContractEvent(client, { abi, eventName?, args?, onLogs, ... })` is the high-level subscription: it returns an `unwatch()` function and pushes batched logs to `onLogs`. Over WebSocket/IPC transports it uses a real `eth_subscribe` log subscription; otherwise it polls — first trying to create an event filter, and falling back to `getContractEvents`/`getLogs` per `pollingInterval` when the provider lacks filter support.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/watchContractEvent.ts#L132-L253

## ABI encode/decode helpers

These pure `src/utils/abi/` functions are the codec layer under every contract action; reach for them directly when you need raw calldata or to decode opaque bytes. `encodeFunctionData({ abi, functionName, args })` produces `selector + encoded args`; `decodeFunctionData({ abi, data })` reverses it back to `{ functionName, args }`.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeFunctionData.ts#L70-L95

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeFunctionData.ts#L56-L78

`decodeFunctionResult({ abi, functionName, data })` decodes a call's return bytes into typed values, and `encodeFunctionResult` does the inverse (useful for mocking return data in tests or state overrides).
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeFunctionResult.ts#L126-L166

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeFunctionResult.ts#L67-L97

`decodeErrorResult({ abi, data })` / `encodeErrorResult` handle custom Solidity errors (revert `data`), and `decodeEventLog({ abi, data, topics })` / `encodeEventTopics` handle event log decoding and topic filter construction — the same primitives the event actions above are built on.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeErrorResult.ts#L66-L92

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeEventLog.ts#L98-L160

`encodeDeployData({ abi, bytecode, args })` builds constructor calldata (used by `deployContract`); `decodeDeployData` recovers the constructor `args` and `bytecode` from it.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/encodeDeployData.ts#L50-L65

https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/utils/abi/decodeDeployData.ts#L42-L60

## Type inference

Type safety hinges on the ABI being a *narrow* literal type. Pass an ABI declared `as const` (or built with `parseAbi([...])`), and viem's generics — `ContractFunctionName<abi, mutability>` and `ContractFunctionArgs<abi, mutability, functionName>` — restrict `functionName` to real functions of the right mutability and type-check `args` against that function's inputs, with the return type inferred. `readContract`/`writeContract` even bind `functionName` to `'pure' | 'view'` vs `'nonpayable' | 'payable'` respectively, so you can't accidentally read a write or vice-versa.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/public/readContract.ts#L31-L70

If the ABI widens to the base `Abi` type (e.g. a plain non-`const` array or `any`), inference collapses to `string`/`unknown[]` and you lose the checks — always keep the ABI narrow. `getContract`'s return type similarly keys its namespaces off `ExtractAbiFunctionNames`/`ExtractAbiEventNames` from the narrowed ABI.
https://github.com/wevm/viem/blob/e6e0c1bef949fbdc837662fbd41ebe739ccae030/src/actions/getContract.ts#L119-L149

## Out of scope

Raw ABI-parameter codec (`encodeAbiParameters`/`decodeAbiParameters`) and human-readable ABI parsing (`parseAbi`/`parseAbiItem`) → see `wevm-viem-abi.md`. Generic `call` and `getLogs`/`watchEvent`/filter primitives → see `wevm-viem-public-actions.md`. Client and transport construction (`createPublicClient`, `createWalletClient`, `http`, `webSocket`) → see `wevm-viem-clients-transports.md`.
