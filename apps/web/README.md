# @tieout/web

The Tieout web surface: live wstETH positions (Multicall3 + WebSocket), the
explain-itself report diff, and the Base attestation anchor. It renders **only
real engine/chain output** (AD-16/AD-17) and never re-hashes a report — each
committed report ships its real `reportHash` as data (AD-13).

## Develop

```sh
pnpm dev        # Vite dev server
pnpm build      # production build
pnpm test       # headless view/live tests (node:test)
pnpm typecheck  # tsc --noEmit
```

## Environment (`VITE_*`)

All optional — the app runs out of the box; set these to repoint the demo. Vite
reads them at build time (put them in `.env` or the shell).

| Var | Default | Purpose |
|---|---|---|
| `VITE_WSS_URL` | `wss://ethereum-rpc.publicnode.com` | Mainnet WebSocket RPC for the live position stream (a real `eth_subscribe` transport). A public node rate-limits `eth_call` harder than subscriptions — the panel escalates to a terminal "disconnected" state rather than hanging (AC-5.2.c). |
| `VITE_ANCHOR_CHAIN_ID` | `8453` (Base) | Chain the `AttestationRegistry` anchor is read on. A malformed value falls back to the default rather than rendering "chain NaN". Use `84532` (Base Sepolia) or `31337` (local Anvil) for a demo. |
| `VITE_ANCHOR_RPC_URL` | viem's chain default | Optional RPC override for the anchor chain. |

The registry is not deployed yet, so the anchor panel degrades gracefully to
"not yet anchored" until `VITE_ANCHOR_CHAIN_ID` points at a chain where it lives.
