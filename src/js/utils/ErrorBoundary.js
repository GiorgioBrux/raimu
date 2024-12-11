
/**
 * Utility class for wrapping functions with error handling
 */
export class ErrorBoundary {
    /**
     * Wraps a function with error handling logic
     * @param {Function} fn - The function to wrap
     * @param {(error: Error) => any} errorHandler - Function to handle any errors
     * @param {Object} logger - Logger instance for error logging
     * @returns {(...args: any[]) => Promise<any>} Wrapped async function
     */
    static wrap(fn, errorHandler, logger) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                logger.error({ error, args }, 'Error in wrapped function');
                return errorHandler(error);
            }
        };
    }
}