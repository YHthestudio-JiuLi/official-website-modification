const path = require('path');
const fs = require('fs');

/**
 * 创建设备 artifact 路径解析器（绑定 uploads 根目录，防止路径穿越）。
 */
function createDeviceArtifactPathResolver({ rootDir, uploadsPath }) {
  function resolveUploadPathSafely(storedPath) {
    let raw = String(storedPath || '').trim().replace(/\\/g, '/');
    if (!raw) throw new Error('empty-path');

    // 兼容历史数据：Python 曾把本机绝对路径写入 SQLite，换机器部署后须截成 /uploads/... 再解析
    if (path.isAbsolute(raw)) {
      const idx = raw.indexOf('/uploads/');
      if (idx !== -1) {
        raw = raw.slice(idx);
      }
    }

    let absPath = '';
    if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) {
      absPath = path.join(rootDir, raw.replace(/^\//, ''));
    } else if (path.isAbsolute(raw)) {
      absPath = raw;
    } else {
      absPath = path.join(rootDir, raw);
    }

    const resolved = path.resolve(absPath);
    const uploadsRoot = path.resolve(uploadsPath);
    const relative = path.relative(uploadsRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('path-outside-uploads');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error('file-not-found');
    }
    return resolved;
  }

  /** 设备绑定资源在磁盘上的字节数（供 Jetson 进度条在缺少 Content-Length 时兜底） */
  function safeArtifactByteSize(storedPath) {
    try {
      const abs = resolveUploadPathSafely(storedPath);
      const st = fs.statSync(abs);
      return typeof st.size === 'number' && st.size > 0 ? st.size : null;
    } catch (_e) {
      return null;
    }
  }

  return { resolveUploadPathSafely, safeArtifactByteSize };
}

/**
 * 解析 RFC 7233 单区间 Range: bytes=...（不支持 multipart）。
 * 返回 { start, end }（含端点）；不可满足返回 { unsatisfiable: true }；无法解析返回 null。
 */
function parseBytesRange(rangeHeader, fileSize) {
  if (!rangeHeader || typeof rangeHeader !== 'string' || fileSize <= 0) {
    return null;
  }
  const raw = rangeHeader.trim();
  if (!/^bytes=/i.test(raw)) {
    return null;
  }
  const first = raw.replace(/^bytes=/i, '').split(',')[0].trim();
  const m = /^(\d*)-(\d*)$/.exec(first);
  if (!m) {
    return null;
  }
  let start = m[1] === '' ? null : parseInt(m[1], 10);
  let end = m[2] === '' ? null : parseInt(m[2], 10);
  if (start !== null && Number.isNaN(start)) return null;
  if (end !== null && Number.isNaN(end)) return null;

  if (start === null && end === null) {
    return null;
  }
  // 后缀区间：bytes=-500
  if (start === null && end !== null) {
    const suffixLen = end;
    if (suffixLen <= 0) {
      return { unsatisfiable: true };
    }
    if (suffixLen >= fileSize) {
      start = 0;
      end = fileSize - 1;
    } else {
      start = fileSize - suffixLen;
      end = fileSize - 1;
    }
  } else if (start !== null && end === null) {
    end = fileSize - 1;
  }

  if (start < 0 || start >= fileSize) {
    return { unsatisfiable: true };
  }
  if (end < start) {
    return { unsatisfiable: true };
  }
  end = Math.min(end, fileSize - 1);
  return { start, end };
}

module.exports = {
  createDeviceArtifactPathResolver,
  parseBytesRange,
};
