import pino from 'pino';

const formatters = {
  level: (label) => {
    return { level: label.toUpperCase() };
  }
};

/**
 * Formats an error object to include more details
 * @param {Error} error - The error object to format
 * @returns {Object} Formatted error details
 */
const formatError = (error) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...error  // Include any additional properties
    };
  }
  return error;
};

const prettyPrint = {
  colorize: true,
  translateTime: false,
  ignore: 'pid,hostname',
  messageFormat: (log, messageKey, levelLabel) => {
    const time = new Date().toLocaleTimeString();
    const module = log.module ? `[${log.module}]` : '';
    const message = log[messageKey];

    // Format any error objects in the log
    const formattedLog = { ...log };
    if (formattedLog.error) {
      formattedLog.error = formatError(formattedLog.error);
    }

    const data = Object.keys(formattedLog)
      .filter(key => !['module', 'time', 'level', 'msg'].includes(key))
      .map(key => `${key}=${JSON.stringify(formattedLog[key])}`)
      .join(' ');

    return `[${time}] [${levelLabel}] ${module} ${message} ${data}`;
  }
};

// Get log level from environment
const LOG_LEVEL = (typeof process !== 'undefined' && process.env?.LOG_LEVEL?.toLowerCase()) || 'debug';

export const logger = pino({
  browser: {
    write: {
      info: (o) => console.log(prettyPrint.messageFormat(o, 'msg', 'INFO')),
      error: (o) => console.error(prettyPrint.messageFormat(o, 'msg', 'ERROR')),
      warn: (o) => console.warn(prettyPrint.messageFormat(o, 'msg', 'WARN')),
      debug: (o) => console.debug(prettyPrint.messageFormat(o, 'msg', 'DEBUG')),
    }
  },
  level: LOG_LEVEL,
  formatters,
  options: prettyPrint
});

// Create namespaced loggers
export const webrtcLogger = logger.child({ module: 'WebRTC' });
export const roomLogger = logger.child({ module: 'Room' });
export const wsLogger = logger.child({ module: 'WebSocket' });
export const uiLogger = logger.child({ module: 'UI' }); 
export const appLogger = logger.child({ module: 'App' });
export const routerLogger = logger.child({ module: 'Router' });