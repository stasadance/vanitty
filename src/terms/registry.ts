import type { TermSession } from "./session";

/** Live terminals by session uid. */
export const terms = new Map<string, TermSession>();
