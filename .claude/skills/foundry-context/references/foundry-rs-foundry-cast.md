# Foundry `cast` — the EVM Swiss Army knife CLI

`cast` (`crates/cast/`) is Foundry's command-line tool for interacting with EVM chains: querying chain/state, sending transactions, and doing local ABI/unit/encoding math. This reference maps its command surface, the two core structs that back it, how it reaches a node, and the practically-important commands per group. Line ranges are pinned to commit `f1bcb750977289c434f0f9576b09898541e1aaa7`.

## Contents

- [Entry point & dispatch](#entry-point--dispatch)
- [The command surface: `Cast` + `CastSubcommand`](#the-command-surface-cast--castsubcommand)
- [Two core structs: `Cast<P,N>` vs `SimpleCast`](#two-core-structs-castpn-vs-simplecast)
- [Talking to a node (RPC provider)](#talking-to-a-node-rpc-provider)
- [Chain & state queries](#chain--state-queries)
- [Sending transactions](#sending-transactions)
- [ABI & data utilities](#abi--data-utilities)
- [Unit & format conversions](#unit--format-conversions)
- [Wallet & signing](#wallet--signing)
- [ENS & utility helpers](#ens--utility-helpers)
- [Shared primitives](#shared-primitives)
- [Source provenance](#source-provenance)

## Entry point & dispatch

The binary is a thin wrapper: `bin/main.rs::main` calls `cast::args::run()` and, on error, formats the error chain either as JSON (when `--json`) or via `sh_err!`, then exits non-zero.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/bin/main.rs#L10-L32

`run()` (in `src/args.rs`) parses `CastArgs` with clap, initializes global args, and drives a Tokio runtime into `run_command`, the async giant `match` that dispatches every subcommand.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/args.rs#L43-L51

`run_command` groups arms with section comments — `// Constants`, `// Conversions & transformations`, `// ABI encoding & decoding`, `// Blockchain & RPC queries`, `// 4Byte`, `// ENS`, `// Misc` — a good map of the command taxonomy. Query arms build a provider then call a `Cast::new(provider)` method; pure arms call `SimpleCast::*` and print.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/args.rs#L63-L85

## The command surface: `Cast` + `CastSubcommand`

`CastArgs` is the re-exported clap `Cast` struct in `src/opts.rs`: it flattens `GlobalArgs` and holds one `#[command(subcommand)] cmd: CastSubcommand`. Note `Cast` (the CLI parser) is distinct from `Cast<P,N>` (the RPC client in `lib.rs`).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L44-L59

`CastSubcommand` is the one big `#[derive(Subcommand)]` enum — ~150 variants, each a doc-commented clap command with `visible_aliases` (e.g. `to-hex`/`th`/`2h`). It is the authoritative list of what `cast` can do; imports at the top of `opts.rs` show which variants delegate to a dedicated `*Args` struct under `src/cmd/`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L61-L62

Larger commands live in their own modules under `src/cmd/` (`call.rs`, `send.rs`, `mktx.rs`, `storage.rs`, `wallet/`, `rpc.rs`, `logs.rs`, `run.rs`, …) and are wired into the enum as tuple variants like `Call(CallArgs)` or `Send(SendTxArgs)`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L1-L33

## Two core structs: `Cast<P,N>` vs `SimpleCast`

`Cast<P, N = AnyNetwork>` wraps an alloy `Provider` and exposes node-backed methods; `Cast::new(provider)` is the constructor used throughout `run_command`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/lib.rs#L80-L103

Its methods are the RPC verbs: `call` (read-only eth_call), `balance`, `nonce`, `block`, `storage`, `storage_root`, and `publish` (broadcast a raw signed tx). Each takes an optional `BlockId` where a historical query makes sense.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/lib.rs#L145-L149

`SimpleCast` is a unit struct of pure, node-free helpers — encoding, hashing, and unit math that need no RPC. This is what powers the offline conversion commands and keeps them testable in isolation.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/lib.rs#L1250-L1252

## Talking to a node (RPC provider)

Query commands resolve config (via figment) and call `utils::get_provider(&config)`, which builds a `RootProvider<AnyNetwork>` from the RPC settings, defaulting to `http://localhost:8545` and mainnet.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cli/src/utils/mod.rs#L102-L112

The `--rpc-url` (and `ETH_RPC_URL`) plus timeout/rate-limit/headers/JWT/flashbots knobs come from the shared `RpcOpts` struct in `foundry_cli`, flattened into individual subcommands that need a node so the same flags work everywhere.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cli/src/opts/rpc.rs#L18-L52

## Chain & state queries

State readers: `Balance` (`b`), `Code`/`Codesize`, `Nonce` (`n`), `Storage` (`st`) and `StorageRoot`, each taking an address/name and optional `--block`. `Storage` delegates to `StorageArgs` for slot decoding.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L839-L843

Chain/block readers: `Block` (`bl`), `BlockNumber` (`bn`), `Chain`, `ChainId`, `GasPrice`, plus `Age`. Read-only contract calls go through `Call(CallArgs)`, which builds a transaction request and runs `eth_call`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L400-L436

`Rpc(RpcArgs)` (`rp`) is the escape hatch: a raw JSON-RPC request (`cast rpc <method> [params...]`) for anything without a dedicated subcommand.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L1187-L1189

## Sending transactions

`MakeTx(MakeTxArgs)` (`mktx`) builds and signs a tx without broadcasting; `SendTx(SendTxArgs)` (`send`/`s`) signs and publishes one; `PublishTx` (`publish`/`p`) broadcasts an already-signed raw tx. `--async`/`CAST_ASYNC` prints just the hash and returns immediately.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L589-L613

`Estimate(EstimateArgs)` (`e`) returns the gas cost of a would-be tx; batch variants `BatchMakeTx`/`BatchSend` (Tempo) and `AccessList` round out the sending group.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L615-L617

## ABI & data utilities

Encode/decode: `AbiEncode`/`AbiDecode`, `AbiEncodeEvent`, `CalldataEncode`/`CalldataDecode`, and `Sig` (compute or optimize a 4-byte selector). These map to `SimpleCast::abi_encode`, `abi_decode`, `calldata_encode`, and `get_selector`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L686-L690

Selector/signature lookup: `FourByte` (`4byte`), `FourByteCalldata`, `FourByteEvent`, and `UploadSignature` query/upload against the openchain.xyz registry. `Keccak` (`k`) hashes arbitrary data via `SimpleCast::keccak`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L776-L810

`SimpleCast::calldata_encode`/`abi_encode` and `keccak` are the offline implementations behind these commands.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/lib.rs#L2065-L2069

## Unit & format conversions

Ether/wei math: `ToWei` (`--to-wei`/`tw`/`2w`, default from `eth`), `FromWei` (`--from-wei`/`fw`), and the more general `ToUnit` (`tun`/`2un`) plus arbitrary-decimal `ParseUnits`/`FormatUnits` for non-18-decimal tokens.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L310-L336

Base/format conversions: `ToHex` (`th`/`2h`) and `ToDec` (`td`/`2d`) share a `ToBaseArgs`; alongside them sit `ToHexdata`, `ToAscii`/`ToUtf8`/`FromUtf8`, `ToBytes32`, `ToInt256`/`ToUint256`, and RLP `ToRlp`/`FromRlp`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L369-L374

The implementations are pure `SimpleCast` functions, e.g. `to_unit`, `from_wei`, and `to_wei`, so conversions run with no RPC connection.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/lib.rs#L1534-L1538

## Wallet & signing

`Wallet(WalletSubcommands)` (`cast wallet`) is a nested subcommand group defined in `src/cmd/wallet/mod.rs`, covering `New`, `Vanity`, `Address`, `Sign`, `Import`, `List`, and `PrivateKey`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/cmd/wallet/mod.rs#L40-L43

`cast wallet sign` (`s`) signs a message, raw 32-byte hash (`--no-hash`), or EIP-712 typed data (`--data`, optionally `--from-file`), using the wallet resolved from key/keystore/mnemonic/hardware flags.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/cmd/wallet/mod.rs#L120-L136

## ENS & utility helpers

ENS: `ResolveName` (`rn`, name→address, optional `--verify` reverse-check), `LookupAddress` (`la`, address→name), and `Namehash`. All take a flattened `RpcOpts` since resolution hits a node.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L941-L967

Misc utilities: `Create2` (`c2`, vanity CREATE2 address mining), `FindBlock` (`f`, block nearest a timestamp), `Run` (`r`, replay a published tx and print its trace), `Interface`, `Bind`, and `Completions` for shell scripts.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L1168-L1185

## Shared primitives

`cast` shares its foundation with the rest of Foundry: alloy types (`Address`, `B256`, `U256`, `Selector`, `BlockId`) and providers for chain access, and `foundry_cli` for `GlobalArgs`, `RpcOpts`, `EtherscanOpts`, and `get_provider`. `lib.rs` even re-exports `foundry_evm::*`, so the same EVM, config, and RPC plumbing used by `forge`/`anvil` backs `cast run` traces and calls.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cast/src/opts.rs#L34-L41

## Source provenance

- `crates/cast/bin/main.rs` — sha256:`8ccc0b1d`
- `crates/cast/src/args.rs` — sha256:`29bc8171`
- `crates/cast/src/opts.rs` — sha256:`4fe3c47c`
- `crates/cast/src/lib.rs` — sha256:`3ef1ece6`
- `crates/cast/src/cmd/wallet/mod.rs` — sha256:`a2cc64db`
- `crates/cli/src/utils/mod.rs` — sha256:`fc135d99`
- `crates/cli/src/opts/rpc.rs` — sha256:`80c43266`

As-of commit f1bcb750977289c434f0f9576b09898541e1aaa7
