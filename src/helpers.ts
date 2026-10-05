/** Runs `compute` on the first call and returns that result to every later call. */
export function once<T>(compute: () => T): () => T {
    let result: { value: T } | undefined;
    return () => {
        result ??= { value: compute() };
        return result.value;
    };
}

/** Shares one `load()` between callers. A failed load is dropped so the next call retries. */
export function cached<T>(load: () => Promise<T>): () => Promise<T> {
    let result: Promise<T> | undefined;
    const run = async () => {
        try {
            return await load();
        } catch (error) {
            result = undefined;
            throw error;
        }
    };
    return () => {
        result ??= run();
        return result;
    };
}

/** Runs tasks one at a time, in call order, so a slow one can't finish after a newer one. */
export function serial() {
    let tail: Promise<unknown> = Promise.resolve();
    return <T>(task: () => Promise<T>): Promise<T> => {
        const previous = tail;
        const run = (async () => {
            await previous;
            return task();
        })();
        tail = (async () => {
            try {
                await run;
            } catch {
                // The caller handles it; the queue moves on.
            }
        })();
        return run;
    };
}

/** Calls `callback` once `ms` after `schedule()`, ignoring repeat calls while one is pending. */
export function delayed(callback: () => void, ms: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return {
        schedule() {
            timer ??= setTimeout(() => {
                timer = undefined;
                callback();
            }, ms);
        },
        cancel() {
            clearTimeout(timer);
            timer = undefined;
        },
    };
}

/** Returns 0, 1, 2… on successive calls. */
export function counter() {
    let next = 0;
    return () => next++;
}

/** Awaits `promise`, or gives `fallback` if it rejects. */
export async function orElse<T, F>(promise: Promise<T>, fallback: F): Promise<T | F> {
    try {
        return await promise;
    } catch {
        return fallback;
    }
}
