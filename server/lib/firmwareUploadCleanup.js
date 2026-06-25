const fs = require('fs');
const path = require('path');
const { resolveStoredUploadPath } = require('./questionUploadCleanup');

/**
 * 删除固件在 uploads/nano-firmwares 下的物理文件
 */
function deleteFirmwareFileLocally(removed, nanoFirmwareUploadsPath, rootDir) {
  if (!removed || typeof removed !== 'object') return;

  const fileUrl = removed.file_url;
  if (fileUrl) {
    const abs = resolveStoredUploadPath(fileUrl, rootDir);
    if (abs && abs.startsWith(nanoFirmwareUploadsPath) && fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch (error) {
        console.warn('[FirmwareUpload] 删除固件文件失败:', abs, error.message);
      }
    }
  }
}

module.exports = { deleteFirmwareFileLocally };
