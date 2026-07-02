// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

/// @title AttestationRegistry — a thin, identity-free onchain anchor for reportHash
/// @author tieout (Batch 3, Story 3.1)
///
/// ██  PROVES TIMESTAMP — NEVER CORRECTNESS, NEVER AUTHOR IDENTITY  ██
///
/// @notice A minimal, permissionless registry that anchors a `reportHash` on chain
/// **first-write-wins**. The first `attest(reportHash)` records
/// `{uint64 blockNumber, uint64 timestamp}` keyed by the hash and emits
/// {Attested}; any later `attest` of an already-anchored hash is an **idempotent
/// no-op success** — the original record is never overwritten, the call never
/// reverts, and no second {Attested} is emitted.
///
/// **What the anchor proves.** Only that `reportHash` existed / was committed at or
/// after a given block (the recorded timestamp). Correctness of the reconciliation
/// comes solely from `verify` re-derivation off public chain data (Batch 2), never
/// from this contract (AD-14). The anchor also says nothing about the honesty or
/// completeness of the adviser's private books (AD-16).
///
/// **What the anchor does NOT prove — author identity.** The registry is
/// **identity-free**: anyone may `attest`, there is no owner and no access control,
/// and `submitter` (`msg.sender`) is a **recorded fact, not a signature** over the
/// report. Author identity lives off chain in the detached EIP-712 signature
/// (AD-19); do not read `submitter` as an authorship claim. A per-adviser namespace
/// is intentionally **deferred** — tamper-evidence + timestamp is the only claim.
///
/// **Front-run resistance.** Because a repeat `attest` is a no-op success rather
/// than a revert or an overwrite, an adversary who front-runs a public `reportHash`
/// cannot permanently block the true author from anchoring it: the first write
/// stands, and the author's later (or earlier) call simply succeeds without
/// changing state (AD-14).
///
/// The single anchored value is `reportHash = keccak256(canonicalBytes(report))`
/// produced upstream by `recon` (AD-12); this registry is agnostic to how the
/// `bytes32` was produced and treats `bytes32(0)` as an ordinary key (no
/// special-casing). The full record is readable in one `eth_call` via the public
/// {attestations} mapping getter (or the convenience views below), satisfying FR6.
///
/// [Source: docs/ARCHITECTURE-SPINE.md#AD-14]
/// [Source: docs/ARCHITECTURE-SPINE.md#AD-12]
/// [Source: docs/ARCHITECTURE-SPINE.md#AD-16]
contract AttestationRegistry {
    /// @notice A first-write-wins anchor record. Both fields pack into a single
    /// 256-bit storage slot (64 + 64 bits), so a first attest is one `SSTORE`.
    /// @param blockNumber The block the first {attest} was mined in. Doubles as the
    /// "already-anchored" existence sentinel: a real `attest` is mined at block ≥ 1
    /// (genesis / block 0 carries no transactions), so `blockNumber != 0` is a
    /// structurally sound anchored flag — and, unlike a timestamp sentinel, it is
    /// not defeated by a `vm.warp(0)` test recording `timestamp == 0`.
    /// @param timestamp The block timestamp of that first {attest}.
    struct Attestation {
        uint64 blockNumber;
        uint64 timestamp;
    }

    /// @notice The anchor records, keyed by `reportHash`. The auto-generated public
    /// getter returns the full `{blockNumber, timestamp}` tuple in a single
    /// `eth_call` — this is the one-call read AC-3.1.a / FR6 require.
    mapping(bytes32 => Attestation) public attestations;

    /// @notice Emitted on the **first** (and only the first) anchoring of a
    /// `reportHash`. `submitter` is `msg.sender` — a recorded fact, **not** a
    /// signature over the report (AD-14/AD-16). `reportHash` and `submitter` are
    /// indexed so `apps/web` (Batch 5) can query the log by either. `timestamp` is
    /// kept `uint64` to match the stored width — it is not widened to `uint256`.
    /// @param reportHash The anchored `keccak256(canonicalBytes(report))` (AD-12).
    /// @param submitter The caller that first anchored the hash (a fact, not identity).
    /// @param timestamp The block timestamp at which the hash was first anchored.
    event Attested(bytes32 indexed reportHash, address indexed submitter, uint64 timestamp);

    /// @notice Anchor `reportHash` first-write-wins. Permissionless: anyone may call.
    /// @dev First write (sentinel `attestations[reportHash].blockNumber == 0`): store
    /// `{uint64(block.number), uint64(block.timestamp)}` and emit {Attested}. Repeat
    /// (sentinel set): return without changing state, reverting, or re-emitting — an
    /// idempotent no-op success. `block.number` and `block.timestamp` both fit
    /// `uint64` comfortably on the target chains; they are cast explicitly.
    /// @param reportHash The report commitment to anchor. `bytes32(0)` is accepted
    /// like any other key.
    function attest(bytes32 reportHash) external {
        // Existence sentinel keyed on blockNumber (never timestamp): a mined attest
        // sits at block ≥ 1, so a set record always has blockNumber != 0.
        if (attestations[reportHash].blockNumber != 0) {
            // Already anchored — idempotent no-op success. No overwrite (the original
            // record is immutable), no revert, no second Attested. This is what
            // defeats the front-run-block (AD-14).
            return;
        }

        attestations[reportHash] = Attestation(uint64(block.number), uint64(block.timestamp));
        emit Attested(reportHash, msg.sender, uint64(block.timestamp));
    }

    /// @notice Convenience one-`eth_call` boolean: has `reportHash` been anchored?
    /// @dev Reads the same `blockNumber != 0` sentinel as {attest}. Pure legibility
    /// over the public {attestations} getter — the surface stays thin.
    /// @param reportHash The report commitment to check.
    /// @return True if `reportHash` has a first-write-wins anchor record.
    function isAttested(bytes32 reportHash) external view returns (bool) {
        return attestations[reportHash].blockNumber != 0;
    }

    /// @notice Convenience one-`eth_call` read of the full anchor record as named
    /// fields (the public {attestations} getter already returns the tuple).
    /// @param reportHash The report commitment to read.
    /// @return blockNumber The block the hash was first anchored in (0 if unanchored).
    /// @return timestamp The timestamp the hash was first anchored at (0 if unanchored).
    function getAttestation(bytes32 reportHash)
        external
        view
        returns (uint64 blockNumber, uint64 timestamp)
    {
        Attestation storage a = attestations[reportHash];
        return (a.blockNumber, a.timestamp);
    }
}
