import { ADDRESS_TABLE } from "./index.ts";
import { assertAddressTable } from "./guard.ts";

/**
 * Build-time guard entry point (AC-1.1.c). Runs as part of `pnpm build` for
 * `@tieout/addresses`: `tsc && node dist/check.js`. A failed round-trip exits
 * non-zero and fails the build.
 */
assertAddressTable();
process.stdout.write(
  `AD-5 address table OK: ${ADDRESS_TABLE.length} entries round-trip via viem getAddress.\n`,
);
