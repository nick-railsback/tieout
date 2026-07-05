/**
 * The browser entry point. All shell logic lives in `createShell` (`shell.ts`),
 * extracted there so its DOM painting and error paths are testable headless;
 * this module just mounts it against the real DOM, `fetch`, and chain effects.
 */
import { createShell } from "./shell.ts";

createShell().mount();
