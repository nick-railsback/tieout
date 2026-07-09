# Anvil — the local Ethereum development node

Anvil (`crates/anvil/`) is Foundry's fast local Ethereum testnet node: a full JSON-RPC server backed by an in-memory REVM state, comparable to Hardhat Network, Ganache, or Tenderly. The `anvil` binary is a thin `main` that calls `anvil::args::run`, installs a global allocator, and prints errors before exiting non-zero.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/bin/main.rs#L1-L13

`args::run` parses the clap `Anvil` opts, resolves RPC aliases, and (absent a subcommand like `completions`) raises the fd limit and blocks on `NodeArgs::run` inside a Tokio runtime. Anvil has essentially one command — running the node — with all behavior configured via flags.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/args.rs#L6-L44

## Contents

- [Crate layout](#crate-layout)
- [Spawning the node](#spawning-the-node)
- [The RPC method surface (EthRequest)](#the-rpc-method-surface-ethrequest)
- [The HTTP/WS/IPC server](#the-httpwsipc-server)
- [Mining modes](#mining-modes)
- [Network forking](#network-forking)
- [anvil_* / evm_* cheat methods](#anvil--evm-cheat-methods)
- [Default accounts & config](#default-accounts--config)
- [How anvil reuses Foundry's EVM](#how-anvil-reuses-foundrys-evm)
- [Source provenance](#source-provenance)

## Crate layout

Anvil is split into four crates under `crates/anvil/`: the top-level `anvil` crate (`src/`) holds the node runtime — `cmd.rs`/`args.rs`/`config.rs` (CLI + `NodeConfig`), `eth/` (the `EthApi`, backend, miner, pool), `server/` (RPC handlers), and `lib.rs` (spawn wiring). `core/` (`anvil-core`) defines the wire types — most importantly the `EthRequest` request enum. `rpc/` (`anvil-rpc`) holds generic JSON-RPC request/response/error envelopes. `server/` (`anvil-server`) is the transport-agnostic HTTP/WS/IPC server framework.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/core/src/eth/mod.rs#L44-L44

## Spawning the node

`anvil::spawn` / `try_spawn` take a `NodeConfig`, call `config.setup::<FoundryNetwork>()` to build the in-memory `Backend`, optionally load init state, enable auto-impersonation, then derive the mining mode and construct the `EthApi` wrapper plus a background `NodeService`. It returns `(EthApi, NodeHandle)`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/lib.rs#L116-L239

`config.setup` (in `config.rs`) is where the EVM environment, genesis allocation, and optional fork database are assembled before `mem::Backend::with_genesis` is called — anvil only has a memory-based backend for now.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/config.rs#L1157-L1256

`EthApi<N>` is the cheap-to-clone handle every server task shares. It holds the transaction `pool`, the `Arc<Backend>`, the available `signers`, the `Miner`, the fee-history cache, active `filters`, and an `instance_id` that changes on every reset. All RPC calls funnel through it.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/eth/api.rs#L120-L168

## The RPC method surface (EthRequest)

Every supported JSON-RPC method is a variant of `EthRequest` in `anvil-core`, with serde `rename`/`alias` attributes mapping the method string to the variant. This covers the standard `eth_*` surface — `eth_chainId`, `eth_getBalance`, `eth_getBlockByNumber`, `eth_sendTransaction`, `eth_sendRawTransaction`, `eth_call`, `eth_estimateGas`, `eth_getLogs`, filters, `eth_getProof` — plus `web3_*` and `net_*`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/core/src/eth/mod.rs#L44-L330

`EthApi::execute` is the central dispatcher: it `match`es an `EthRequest` and routes each variant to the corresponding async method, converting the result to a JSON-RPC `ResponseResult`. This is the single place to find which handler backs any method.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/eth/api.rs#L1655-L1706

## The HTTP/WS/IPC server

`HttpEthRpcHandler` and `PubSubEthRpcHandler` (in `src/server/rpc_handlers.rs`) adapt `anvil-server`'s `RpcHandler`/`PubSubRpcHandler` traits to `EthApi`. HTTP requests deserialize into `EthRequest` and call `execute`; the pub-sub handler additionally serves `eth_subscribe`/`eth_unsubscribe` for logs, new heads, pending transactions, receipts, and syncing over WebSocket.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/server/rpc_handlers.rs#L16-L163

The `anvil-server` crate builds an axum `Router` from these handlers — `http_ws_router` wires `POST` (JSON-RPC) and `GET` (WebSocket upgrade) on one route — and separately supports an IPC transport (`--ipc`). `lib.rs` binds a `TcpListener` per host and calls `server::serve_on` for each.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/server/src/lib.rs#L39-L53

## Mining modes

`MiningMode` (in `eth/miner.rs`) has four variants: `None` (mine on demand only), `Auto` (a `ReadyTransactionMiner` that mines as soon as ready transactions appear), `FixedBlockTime` (mine every interval tick), and `Mixed` (both). `Miner::poll` drains the pool per the active mode; the mode is swappable at runtime via `set_mining_mode`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/eth/miner.rs#L148-L226

The mode is chosen at spawn from the config: `--block-time` selects interval mining (or `Mixed` with `--mixed-mining`), `--no-mining` selects `None`, and the default is instant auto-mining driven by a pool ready-listener. `FixedBlockTimeMiner` defaults to a 6-second block time; `ReadyTransactionMiner` coalesces concurrently-submitted txs within a 5ms window into one block.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/lib.rs#L173-L193

CLI flags: `--block-time <SECONDS>` (alias `--blockTime`), `--no-mining` (alias `--no-mine`, conflicts with `--block-time`), and `--mixed-mining` (requires `--block-time`).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/cmd.rs#L92-L111

## Network forking

`--fork-url` (`-f`) points anvil at a remote RPC endpoint so it forks live chain state on demand. `config.rs`'s fork setup builds a `BlockchainDb`-backed `SharedBackend` that lazily fetches accounts/storage/blocks from the provider and caches them, pinned to `--fork-block-number` (or latest). Multiple `--fork-url` values enable round-robin fallback across endpoints.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/config.rs#L1483-L1547

The live fork handle is `ClientFork` (in `eth/backend/fork.rs`): a shared `ClientForkConfig` (fork URLs, pinned block number/hash, chain id, timestamp, base fee) plus the cached storage and forked database. `predates_fork` distinguishes pre-fork blocks (served from the remote) from locally-mined ones. `ClientFork::reset` re-points the fork at new URLs/block, backing `anvil_reset`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/eth/backend/fork.rs#L52-L90

Related CLI flags live in `AnvilEvmArgs` under the "Fork config" heading: `--fork-url`, `--fork-block-number`, `--fork-transaction-hash`, `--retries`, `--timeout`, and retry-backoff — most `require` `--fork-url`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/cmd.rs#L479-L599

## anvil_* / evm_* cheat methods

Beyond standard `eth_*`, `EthRequest` defines custom node-control methods, most named `anvil_*` with `hardhat_*`/`evm_*` aliases for compatibility. Impersonation, balance/nonce/code/storage overrides, mining control, time control, snapshots, and reset all live here; dispatch is in the same `execute` match.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/core/src/eth/mod.rs#L472-L722

Key methods (RPC name → `EthApi` handler):

- `anvil_impersonateAccount` / `anvil_stopImpersonatingAccount` / `anvil_autoImpersonateAccount` — send txs as any address. State lives in `CheatsManager`; handlers call `backend.impersonate(...)`.
- `anvil_setBalance` / `anvil_addBalance`, `anvil_setNonce`, `anvil_setCode`, `anvil_setStorageAt`, `anvil_setCoinbase`, `anvil_setChainId` — direct state overrides.
- `anvil_mine` / `evm_mine` / `anvil_mine_detailed` — mine N blocks on demand, optionally jumping time per block.
- `evm_snapshot` / `evm_revert` (aka `anvil_snapshot`/`anvil_revert`) — capture and restore full node state by id.
- `evm_increaseTime`, `evm_setNextBlockTimestamp`, `evm_setTime`, `anvil_setBlockTimestampInterval` — manipulate block time.
- `anvil_setAutomine` (`evm_setAutomine`), `anvil_setIntervalMining`, `anvil_getAutomine` — switch mining mode at runtime.
- `anvil_reset` (`hardhat_reset`) — reset state, optionally re-forking; `anvil_dumpState`/`anvil_loadState`, `anvil_nodeInfo`, `anvil_reorg`, `anvil_rollback`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/eth/api.rs#L1916-L2027

Handler bodies are small wrappers over the backend/miner. For example `anvil_impersonate_account` calls `backend.impersonate`, `evm_snapshot` calls `backend.create_state_snapshot`, `evm_increase_time` advances `backend.time()`, and `anvil_set_auto_mine`/`anvil_set_interval_mining` swap the `Miner`'s `MiningMode` in place.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/eth/api.rs#L250-L279

Impersonation is backed by `CheatsManager` (`eth/backend/cheats.rs`), which tracks the impersonated-account set and an auto-impersonate flag so `eth_accounts` and signing can honor impersonated senders; it also holds ecrecover signature overrides used by a custom precompile.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/eth/backend/cheats.rs#L19-L97

## Default accounts & config

Constants in `config.rs`: default port `8545` (`NODE_PORT`), chain id `31337` (`CHAIN_ID`), block gas limit `30_000_000` (`DEFAULT_GAS_LIMIT`), and the well-known dev mnemonic `"test test test test test test test test test test test junk"` (`DEFAULT_MNEMONIC`).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/config.rs#L79-L90

`NodeConfig::default` generates 10 dev accounts from that mnemonic via `AccountGenerator::new(10)`, each funded with 100 ETH (`genesis_balance`). The `AccountGenerator` derives keys from the mnemonic using default derivation path `m/44'/60'/0'/0/`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/config.rs#L464-L490

CLI overrides in `NodeArgs`: `--accounts` (default 10), `--balance` (default 10000 ETH), `--mnemonic`/`--mnemonic-random`/`--mnemonic-seed-unsafe`, `--derivation-path`, `--chain-id`, `--port` (`-p`), `--host`, `--hardfork`, and `--fund-accounts` for custom per-address balances.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/cmd.rs#L38-L94

## How anvil reuses Foundry's EVM

Anvil does not implement its own EVM. Its `Cargo.toml` depends on `foundry-evm` (and `revm`/`alloy-evm`), and the in-memory backend's executor imports `foundry_evm::core` env/transaction types to run blocks — the same execution engine `forge` uses for tests. The node-specific code (`eth/backend/mem/`) layers block production, an in-memory/forked DB, and state snapshots on top of that shared EVM.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/anvil/src/eth/backend/executor.rs#L31-L33

## Source provenance

- `crates/anvil/bin/main.rs` — sha256:`014945ca`
- `crates/anvil/src/args.rs` — sha256:`8e270039`
- `crates/anvil/src/lib.rs` — sha256:`8c302236`
- `crates/anvil/src/config.rs` — sha256:`d30d085d`
- `crates/anvil/src/cmd.rs` — sha256:`ad4bbe67`
- `crates/anvil/src/eth/api.rs` — sha256:`aa9c0269`
- `crates/anvil/src/eth/miner.rs` — sha256:`d087d679`
- `crates/anvil/src/eth/backend/cheats.rs` — sha256:`87f1617c`
- `crates/anvil/src/eth/backend/fork.rs` — sha256:`1c4e5f1a`
- `crates/anvil/src/eth/backend/executor.rs` — sha256:`e17a0539`
- `crates/anvil/core/src/eth/mod.rs` — sha256:`e3a9dde9`
- `crates/anvil/src/server/rpc_handlers.rs` — sha256:`e5a12d34`
- `crates/anvil/server/src/lib.rs` — sha256:`f81b7bf1`

As-of commit f1bcb750977289c434f0f9576b09898541e1aaa7
