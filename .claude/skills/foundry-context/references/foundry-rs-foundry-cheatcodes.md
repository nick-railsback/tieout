# Foundry cheatcodes (`crates/cheatcodes/`)

Cheatcodes are the `vm.*` calls that Forge tests and scripts use to manipulate EVM state, assert on behaviour, and reach outside the VM (filesystem, FFI, RPC forks). This reference covers how they are exposed to Solidity, how the spec drives codegen, how a call is decoded and dispatched to a Rust impl, the major categories with representative examples, and the safety/status model. For how tests actually invoke these, see the sibling `references/foundry-rs-foundry-overview.md` and Forge's test runner rather than duplicating it here.

## Contents

- What cheatcodes are and how they're intercepted
- The spec-driven pipeline: one `sol!` + the `Cheatcode` derive
- The generated `Vm` interface and JSON spec
- The `Cheatcode` trait, `CheatsCtxt`, and dispatch
- Categories with representative cheatcodes
- Access-control: safety levels, status, and FS/FFI gating
- Adding a cheatcode

## What cheatcodes are and how they're intercepted

A cheatcode is a call to one constant address, the "cheatcode handler" `0x7109…D12D`, computed as `address(uint160(uint256(keccak256("hevm cheat code"))))` and pinned as `CHEATCODE_ADDRESS`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/evm/core/src/constants.rs#L8-L14
The `Cheatcodes` struct is a `revm::Inspector`: on every EVM call it checks whether the target is `CHEATCODE_ADDRESS`, and if so intercepts the call instead of executing it as a normal contract call. The dev docs sketch this listener pattern and the address derivation.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/docs/dev/cheatcodes.md#L27-L57

In the inspector's `call` hook, a match on `call.target_address == CHEATCODE_ADDRESS` routes to `apply_cheatcode`, which returns the ABI-encoded return data as a synthetic `CallOutcome` (or a revert on error) so the VM sees a normal precompile-like result.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/inspector.rs#L930-L945

## The spec-driven pipeline: one `sol!` + the `Cheatcode` derive

The crate is three layers: `assets/` (generated JSON + schema), `spec/` (traits/structs + the `Vm` interface), and `src/` (Rust impls). Every cheatcode is declared once in a single `sol!` macro call.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/README.md#L5-L23
The declaration lives in `spec/src/vm.rs`: an Alloy `sol!` block wrapping `#[derive(Debug, Cheatcode)] interface Vm { … }`, with a comment block explaining the view/pure/none mutability rules. Alloy's `sol!` generates the raw Rust call structs (`prankCall`, etc.) and the `VmCalls` dispatch enum; the internal `Cheatcode` derive layers Foundry metadata on top.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/spec/src/vm.rs#L1-L21

The derive is a proc-macro in the `foundry-macros` crate, applied recursively to every item in the interface.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/macros/src/lib.rs#L23-L28
`derive_cheatcode` branches on the item kind by name suffix: `*Call` structs get `CheatcodeDef`, `*Calls` enums get the `CHEATCODES` table and a `vm_calls!` macro, `*Errors`/`*Events`/other structs/enums get their spec constants.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/macros/src/cheatcodes.rs#L13-L26
For each `*Call`, `derive_call` parses the `#[cheatcode(group, status, safety)]` attribute and the doc-comment (via `func_docstring`) into a `const CHEATCODE: &Cheatcode` — id, description, declaration, selector, group, status, safety — and warns at compile time on `memory` params, undocumented items, or missing named params.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/macros/src/cheatcodes.rs#L29-L108
For the `VmCalls` enum, `derive_calls_enum` emits `pub const CHEATCODES: &[&Cheatcode]` plus the `vm_calls!` helper macro used later to generate the dispatch `match` — so adding a Solidity function fails compilation until you add its trait impl.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/macros/src/cheatcodes.rs#L120-L138

## The generated `Vm` interface and JSON spec

Each call struct implements `CheatcodeDef`, whose `const CHEATCODE` carries a `Function` (signature, selector, mutability) plus manually-specified `group`, `status`, and `safety`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/spec/src/cheatcode.rs#L5-L30
The `Function` struct is the ABI-level view (id, description, declaration, `Visibility`, `Mutability`, signature, hex selector, selector bytes).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/spec/src/function.rs#L4-L30
`spec::Cheatcodes::new()` assembles the whole interface (errors, enums, structs, and `Vm::CHEATCODES`) into one serializable value. Structs/enums are hardcoded here because Rust can't enumerate a module's items — this list must be updated when adding a new struct/enum/error.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/spec/src/lib.rs#L74-L110

That same value is what `cargo cheats` serializes to keep the assets in sync: `spec_up_to_date` writes `assets/cheatcodes.json`, `schema_up_to_date` writes the JSON schema, and `iface_up_to_date` renders the Solidity `interface Vm` to `testdata/utils/Vm.sol` used for internal tests. `ensure_file_contents` rewrites the file and fails the test if stale, which is how CI detects an out-of-date spec.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/spec/src/lib.rs#L119-L170
The JSON (563 cheatcode entries) is the stable third-party interface; a single entry pairs the `func` metadata with `group`/`status`/`safety`, e.g. `prank(address)` → group `evm`, status `stable`, safety `unsafe`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/assets/cheatcodes.json#L8411-L8434

## The `Cheatcode` trait, `CheatsCtxt`, and dispatch

Each `*Call` struct is hand-implemented against the `Cheatcode` trait, which offers three apply methods layered by how much EVM access they need: `apply` (pure, state only), `apply_stateful` (needs `CheatsCtxt`/EVM context), and `apply_full` (needs the executor for recursive EVM calls). Implement exactly one.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/lib.rs#L71-L101
`CheatsCtxt` bundles the inspector `state`, the EVM `ecx`, the original `caller`, and the call `gas_limit`, and derefs to the EVM context for convenience; it also guards against using precompiles as arguments.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/lib.rs#L103-L139

`apply_cheatcode` decodes the calldata into `Vm::VmCalls` (surfacing an "unknown selector … forge-std/forge mismatch" hint on failure), checks cheatcode access in forking mode, then calls `apply_dispatch`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/inspector.rs#L799-L829
`apply_dispatch` uses the generated `vm_calls!` macro twice: once to fetch the static `Cheatcode` metadata (recording deprecation warnings), once for a monomorphized `match` that calls `Cheatcode::apply_full` on the concrete variant — no trait objects — and prefixes errors with the `vm.<name>:` label.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/inspector.rs#L3038-L3093

## Categories with representative cheatcodes

Environment/state (`Group::Evm`): `warp` sets `block.timestamp`, `deal` overwrites balance (recording the old value in `eth_deals` so it can roll back on revert), `store`/`load` read and write raw storage slots, `etch` sets code, `roll` sets block number. These are `apply_stateful` impls that mutate `ccx.ecx`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/evm.rs#L659-L710
Impersonation lives in a dedicated module: `prank`/`startPrank` (one-shot vs recurrent) route to a shared `prank()` helper with flags for `txOrigin` override and delegatecall; overloads add those parameters.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/evm/prank.rs#L57-L92
The Solidity declarations for these carry `#[cheatcode(group = Evm, safety = Unsafe)]`, e.g. the `prank`/`startPrank` family and `deal`/`etch`/`store`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/spec/src/vm.rs#L730-L762

Expectations (`Group::Testing`): `expectRevert`, `expectEmit`, and `expectCall` register expectations that the inspector verifies later during `call`/`call_end`; the module is large because each has many overloads (reverter, count, emitter, gas).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/test/expect.rs#L214-L315
Mocking: `mockCall`/`mockCalls`/`mockCallRevert`/`mockFunction` install canned return data or reverts keyed by callee/value/selector, consulted when the VM would otherwise dispatch the call.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/evm/mock.rs#L46-L182

Forking: `createFork`/`createSelectFork`/`selectFork`/`rollFork`/`activeFork` create and switch multi-fork backends and roll a fork to a block or transaction, delegating to the forking `DatabaseExt` backend.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/evm/fork.rs#L18-L91
Filesystem & FFI (`Group::Filesystem`): `readFile`/`writeFile` and friends run every path through `state.config.ensure_path_allowed(..)` (read vs write), and `ffi` shells out only after asserting `state.config.ffi`, returning stdout/exit code.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/fs.rs#L106-L209
The `ffi` gate produces the familiar "FFI is disabled; add the `--ffi` flag" error when the config flag is off.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/fs.rs#L797-L815

Signing/wallets (`Group::Crypto`): `addr` derives an address from a private key (a pure impl in `evm.rs`), and the `sign` overloads produce `(v, r, s)` from a private key, `Wallet`, or configured signer.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/evm.rs#L253-L276

## Access-control: safety levels, status, and FS/FFI gating

Each cheatcode carries a `Group`, a `Status`, and a `Safety`. `Group` classifies by domain (Evm, Testing, Scripting, Filesystem, Environment, String, Json, Toml, Crypto, Utilities) and each group has a default safety.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/spec/src/cheatcode.rs#L62-L131
`Group::safety()` returns `Some(Safe)` for the utility-ish groups but `None` for the ambiguous `Evm`/`Testing` groups — forcing those cheatcodes to declare `safety` explicitly (the derive panics otherwise).
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/spec/src/cheatcode.rs#L133-L167
`Safety` is just `Safe`/`Unsafe`: "unsafe" means the cheatcode mutates state in a way that isn't sound inside a broadcast script (e.g. `prank`, `deal`, `store`). Scripts warn/refuse on unsafe cheatcodes.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/spec/src/cheatcode.rs#L169-L196
`Status` (Stable, Experimental, Deprecated(reason), Removed, Internal) drives runtime warnings and hard errors; the dispatcher records `Deprecated` replacements, and `Removed` selectors reject outright.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/spec/src/cheatcode.rs#L32-L60
Runtime enforcement is backed by `CheatsConfig`, which holds the `ffi` flag, `fs_permissions`, and `internal_expect_revert`, and exposes `ensure_path_allowed`.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/crates/cheatcodes/src/config.rs#L20-L146

## Adding a cheatcode

The workflow: declare the Solidity function in `spec/src/vm.rs` (documented, named params), implement the `Cheatcode` trait in the matching `src/` module, update `spec::Cheatcodes::new` if you added a struct/enum/error, run `cargo cheats` twice to regenerate assets, and add an integration test under `testdata/default/cheats/`. The compile error from the generated dispatch `match` is the intended reminder to add the impl.
https://github.com/foundry-rs/foundry/blob/f1bcb750977289c434f0f9576b09898541e1aaa7/docs/dev/cheatcodes.md#L128-L160

## Source provenance

- `crates/cheatcodes/README.md` — sha256:`55e212ce`
- `crates/cheatcodes/src/lib.rs` — sha256:`7d661984`
- `crates/cheatcodes/src/inspector.rs` — sha256:`1071cfc9`
- `crates/cheatcodes/src/evm.rs` — sha256:`765ce9c2`
- `crates/cheatcodes/src/evm/prank.rs` — sha256:`ad26fbf0`
- `crates/cheatcodes/src/evm/mock.rs` — sha256:`1c8c7a52`
- `crates/cheatcodes/src/evm/fork.rs` — sha256:`cb47ef66`
- `crates/cheatcodes/src/fs.rs` — sha256:`ee979b4c`
- `crates/cheatcodes/src/test/expect.rs` — sha256:`60ee26cf`
- `crates/cheatcodes/src/config.rs` — sha256:`99502786`
- `crates/cheatcodes/spec/src/lib.rs` — sha256:`407d1d72`
- `crates/cheatcodes/spec/src/cheatcode.rs` — sha256:`3caebdd3`
- `crates/cheatcodes/spec/src/function.rs` — sha256:`2cddc47e`
- `crates/cheatcodes/spec/src/vm.rs` — sha256:`561da854`
- `crates/cheatcodes/assets/cheatcodes.json` — sha256:`9615204d`
- `crates/macros/src/lib.rs` — sha256:`4f762286`
- `crates/macros/src/cheatcodes.rs` — sha256:`f85313df`
- `crates/evm/core/src/constants.rs` — sha256:`408182d9`
- `docs/dev/cheatcodes.md` — sha256:`01f54601`

As-of commit f1bcb750977289c434f0f9576b09898541e1aaa7
