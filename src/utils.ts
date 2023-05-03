export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export const noop = () => {};

export const now = () => Math.floor(Date.now() / 1000);
