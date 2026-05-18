const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../logs');
const logFile = path.join(logsDir, 'bot.log');

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

class Logger {
  constructor() {
    this.levels = {
      INFO: 'INFO',
      ERROR: 'ERROR',
      WARN: 'WARN',
      DEBUG: 'DEBUG'
    };
  }

  formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  writeToFile(message) {
    try {
      fs.appendFileSync(logFile, message + '\n');
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  info(message) {
    const formatted = this.formatMessage(this.levels.INFO, message);
    console.log(formatted);
    this.writeToFile(formatted);
  }

  error(message) {
    const formatted = this.formatMessage(this.levels.ERROR, message);
    console.error(formatted);
    this.writeToFile(formatted);
  }

  warn(message) {
    const formatted = this.formatMessage(this.levels.WARN, message);
    console.warn(formatted);
    this.writeToFile(formatted);
  }

  debug(message) {
    const formatted = this.formatMessage(this.levels.DEBUG, message);
    console.log(formatted);
    this.writeToFile(formatted);
  }
}

module.exports = new Logger();
