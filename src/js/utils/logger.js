import pino from 'pino';

const formatters = {
  level: (label) => {
    return { level: label.toUpperCase() };
  }
};

const prettyPrint = {
  colorize: true,
  translateTime: false,
  ignore: 'pid,hostname',
  messageFormat: (log, messageKey, levelLabel) => {
    const time = new Date().toLocaleTimeString();
    const module = log.module ? `[${log.module}]` : '';
    const message = log[messageKey];
    const data = Object.keys(log)
      .filter(key => !['module', 'time', 'level', 'msg'].includes(key))
      .map(key => `${key}=${JSON.stringify(log[key])}`)
      .join(' ');

    return `[${time}] [${levelLabel}] ${module} ${message} ${data}`;
  }
};

export const logger = pino({
  browser: {
    write: {
      info: (o) => console.log(prettyPrint.messageFormat(o, 'msg', 'INFO')),
      error: (o) => console.error(prettyPrint.messageFormat(o, 'msg', 'ERROR')),
      warn: (o) => console.warn(prettyPrint.messageFormat(o, 'msg', 'WARN')),
      debug: (o) => console.debug(prettyPrint.messageFormat(o, 'msg', 'DEBUG')),
    }
  },
  level: 'debug',
  formatters,
  options: prettyPrint
});

// Create namespaced loggers
export const webrtcLogger = logger.child({ module: 'WebRTC' });
export const roomLogger = logger.child({ module: 'Room' });
export const wsLogger = logger.child({ module: 'WebSocket' });
export const uiLogger = logger.child({ module: 'UI' }); 