# Foundry Configuration (`crates/config/`)

`crates/config/` defines the `Config` struct and the `foundry.toml` system that every Foundry binary (`forge`, `cast`, `anvil`, `chisel`) consumes. It is its own crate precisely because config is cross-cutting: the CLIs, the compiler pipeline, the test runner, and the RPC/verification layers all deserialize the same `Config`, so keeping it standalone avoids circular dependencies and gives every tool one merge/precedence story. Config loading is built on the [`figment`](https://docs.rs/figment) layered-provider library, re-exported so CLI arg types can implement `figment::Provider` and merge their own overrides.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L102-L104

## Contents

- [The `Config` struct](#the-config-struct)
- [Loading and merging (figment)](#loading-and-merging-figment)
- [Profiles and `FOUNDRY_PROFILE`](#profiles-and-foundry_profile)
- [Environment variables](#environment-variables)
- [Standalone sections](#standalone-sections)
- [Key config groups](#key-config-groups)
- [Fuzz and invariant sub-tables](#fuzz-and-invariant-sub-tables)
- [RPC endpoints and Etherscan](#rpc-endpoints-and-etherscan)
- [Remappings resolution](#remappings-resolution)
- [Inspecting config: `forge config`](#inspecting-config-forge-config)

## The `Config` struct

`pub struct Config` is one large `#[derive(Serialize, Deserialize)]` struct — every knob is a field, so `foundry.toml` keys map 1:1 to fields. `profile` and `profiles` are `#[serde(skip)]`: `profile` is not stored in the file, it names which figment profile was selected during extraction, and `root` is skipped from serialization but read back so commands can override it.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L180-L208

`Config` is itself a figment `Provider`: `metadata()` names it `"Foundry Config"`, `data()` emits its fields into the default meta-profile (re-inserting `root`), and `profile()` returns the selected profile. This is what lets a default `Config` seed the figment before file/env layers merge on top.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L2688-L2709

`Config::default()` supplies the baseline values that appear when no `foundry.toml` exists: `src="src"`, `test="test"`, `out="out"`, `libs=["lib"]`, `cache=true`, `evm_version=Osaka`, `optimizer=None`, `auto_detect_solc=true`, `gas_reports=["*"]`, `sender`/`tx_origin` = `DEFAULT_SENDER`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L2711-L2777

## Loading and merging (figment)

`Config::load*` builds a figment then extracts a `Config`. `figment()` starts from `Config::default()`; `figment_with_root(root)` starts from `with_root()`, which autodetects the project layout (`src`/`out`/`libs`) before layering files and env.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L1960-L2013

`to_figment` defines precedence by merge order (later wins): the default `Config`, then the global `~/.foundry/foundry.toml`, then the project `foundry.toml` (path overridable via `FOUNDRY_CONFIG`), then `DAPP_*`/`DAPP_TEST_*` env, the Dapp/Etherscan compat providers, and finally `FOUNDRY_*` env — with remappings resolved last. The whole stack is then `.select(profile)`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L939-L1031

Relative paths in the toml stay relative to `root`; `canonic_at` joins `src`/`out`/`libs`/`cache_path`/etc. against the root so consumers get absolute paths without the file having to.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L1043-L1084

## Profiles and `FOUNDRY_PROFILE`

Config is organized as `[profile.<name>]` tables. The default profile is `"default"` (`DEFAULT_PROFILE`), with a built-in `"hardhat"` profile constant; `PROFILE_SECTION = "profile"` and the file name is `foundry.toml`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L721-L759

`selected_profile()` reads `FOUNDRY_PROFILE` from the environment, falling back to `DEFAULT_PROFILE`. `merge_toml_provider` renames `[profile.<name>]` to `[<name>]` and strict-selects `default` + the active profile, so a named profile inherits `default` and overrides only what it sets.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L2147-L2474

If `FOUNDRY_PROFILE` names a profile absent from the config, `from_figment_fallback` warns (`Warning::UnknownProfile`) and silently reverts to the default profile rather than erroring.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L863-L909

## Environment variables

Two env prefixes are honored: legacy `DAPP_*`/`DAPP_TEST_*` (dapptools compatibility) and canonical `FOUNDRY_*`. `FOUNDRY_PROFILE`, `FOUNDRY_REMAPPINGS`, `FOUNDRY_LIBRARIES`, `FOUNDRY_FFI`, and `FOUNDRY_FS_PERMISSIONS` are ignored by the generic mapper (handled specially). Keys whose prefix matches a `STANDALONE_SECTIONS` entry get their first `_` rewritten to `.` so e.g. `FOUNDRY_FUZZ_RUNS` targets `fuzz.runs`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L965-L994

## Standalone sections

`STANDALONE_SECTIONS` are top-level tables (`rpc_endpoints`, `etherscan`, `fmt`, `lint`, `doc`, `fuzz`, `invariant`, `coverage`, `mutation`, `labels`, `dependencies`, `soldeer`, `vyper`, `bind_json`) that may live outside a `[profile.<name>]` block and are folded into the selected profile during merge.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L734-L756

## Key config groups

Project layout: `src`, `test`, `script`, `out`, `libs`, `remappings`, `auto_detect_remappings`, `cache`, `cache_path`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L210-L231

Compiler: `evm_version`, `solc` (a `SolcReq` accepting either a version like `"0.8.20"` or a path — also fed by the legacy `solc_version` key), `auto_detect_solc`, `offline`, `optimizer`, `optimizer_runs`, `optimizer_details`, and `via_ir` (routes compilation through Yul IR). `solc_version()` returns the pinned version when `solc` holds one.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L250-L293

`via_ir` is a plain bool defaulting to `false`; `verbosity` is a `u8` test/log verbosity level.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L478-L480

Testing/EVM: `verbosity`, `gas_limit`, `block_number`, `fork_block_number` (pins the state fork), `chain` (aliased from `chain_id`/`chain`), plus the `fuzz` and `invariant` sub-tables.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L403-L415

## Fuzz and invariant sub-tables

`FuzzConfig` (the `[fuzz]` table) defaults to `runs=256`, `max_test_rejects=65536`, `fail_on_revert=true`, plus a flattened `dictionary`/`corpus` config and `seed`/`timeout` options.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/fuzz.rs#L8-L57

`InvariantConfig` (the `[invariant]` table) carries `runs`, `depth` (calls per run), `fail_on_revert`, `call_override`, `shrink_run_limit`, and its own flattened fuzz `dictionary`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/invariant.rs#L126-L163

## RPC endpoints and Etherscan

`[rpc_endpoints]` deserializes into `RpcEndpoints`, a `BTreeMap<alias, RpcEndpoint>`. A value is either a raw URL string or a config object; `resolved()` expands each entry, and unresolved entries surface as errors.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/endpoints.rs#L11-L75

Endpoint and Etherscan values support `${VAR}` env-var interpolation via `RE_PLACEHOLDER` and `interpolate`, so secrets (API keys, URLs) stay out of the committed toml; a missing var yields `UnresolvedEnvVarError`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/resolve.rs#L6-L30

`[etherscan]` deserializes into `EtherscanConfigs`, a `BTreeMap<alias, EtherscanConfig>` where each entry has an optional `chain`, `url`, and `key`. `resolved()` interpolates keys and `find_chain` looks up the config matching a chain for verification.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/etherscan.rs#L63-L98

## Remappings resolution

Remappings resolve last, after all other providers, so file/env-supplied `libs` and explicit `remappings` are known first. `RemappingsProvider` merges user remappings, then (when `auto_detect_remappings`) scans lib dirs and nested `foundry.toml` files, skipping suspicious auto-detected names like `lib/`/`src/`/`contracts/`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/providers/remappings.rs#L200-L240

## Inspecting config: `forge config`

`forge config` prints the fully resolved config (all layers merged, evm/optimizer normalized) — the canonical way to see what Foundry actually computed. `--basic` prints just the `BasicConfig` subset (`src`/`out`/`libs`/`remappings`), `--json` emits JSON, and `--fix` rewrites deprecated keys.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/forge/src/cmd/config.rs#L29-L59

`BasicConfig::to_string_pretty` serializes under a `[profile.<name>]` header, mirroring how the value would appear in `foundry.toml`.

https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/config/src/lib.rs#L2933-L2957

## Source provenance

- `crates/config/src/lib.rs` — sha256:`a19c3d53`
- `crates/config/src/fuzz.rs` — sha256:`62a20848`
- `crates/config/src/invariant.rs` — sha256:`560c5c9b`
- `crates/config/src/endpoints.rs` — sha256:`f0286e1a`
- `crates/config/src/etherscan.rs` — sha256:`49df8f26`
- `crates/config/src/resolve.rs` — sha256:`d1fa59e9`
- `crates/config/src/providers/remappings.rs` — sha256:`63950800`
- `crates/forge/src/cmd/config.rs` — sha256:`f2c0ae60`

As-of commit f1bcb750977289c434f0f9576b09898541e1aaa7
