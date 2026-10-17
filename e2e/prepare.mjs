// Gives every end-to-end run a fresh embedded database.
import { rmSync } from "node:fs";

rmSync(".e2e", { recursive: true, force: true });
console.log("e2e database reset");
