/**
 * Converts an unknown caught error into a human-readable string.
 * Use this in every catch block instead of (error as object).toString().
 */
export function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    return String(error)
}
