const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const winston = require('winston');

// 加载环境变量
dotenv.config();

const rootDir = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-here';

const logDir = path.join(rootDir, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

const distPath = path.join(rootDir, 'dist');
const uploadsPath = path.join(rootDir, 'uploads');
const productUploadsPath = path.join(uploadsPath, 'products');
const questionUploadsPath = path.join(uploadsPath, 'questions');
const questionChunksPath = path.join(questionUploadsPath, '.chunks');
const nanoFirmwareUploadsPath = path.join(uploadsPath, 'nano-firmwares');
const nanoFirmwareChunksPath = path.join(nanoFirmwareUploadsPath, '.chunks');

const uploadDirs = [
  productUploadsPath,
  questionUploadsPath,
  questionChunksPath,
  nanoFirmwareUploadsPath,
  nanoFirmwareChunksPath
];

for (const dir of uploadDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  rootDir,
  PORT,
  HOST,
  SESSION_SECRET,
  logger,
  distPath,
  uploadsPath,
  productUploadsPath,
  questionUploadsPath,
  questionChunksPath,
  nanoFirmwareUploadsPath,
  nanoFirmwareChunksPath
};
