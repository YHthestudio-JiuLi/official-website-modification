const PY_DB_URL = process.env.PY_DB_URL || 'http://127.0.0.1:5100';
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class QuestionsService {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers
      }
    });

    if (!response.ok) {
      const text = await response.text();
      let message = text || `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        message = parsed.detail || parsed.message || parsed.error || message;
        if (Array.isArray(message)) {
          message = message.map((item) => item?.msg || String(item)).join('; ');
        }
      } catch {
        // 非 JSON 响应保持原文
      }
      throw new Error(message);
    }

    return response.json();
  }

  async findAll(createdByUserId = null) {
    const list = await this.request('/api/questions');
    if (!Array.isArray(list)) return [];
    const filtered = createdByUserId != null
      ? list.filter((item) => Number(item.created_by_user_id || 0) === Number(createdByUserId))
      : list;
    return filtered.map(item => this.enrichWithFileSizes(item));
  }

  async findById(id) {
    const item = await this.request(`/api/questions/${id}`);
    return this.enrichWithFileSizes(item);
  }

  getFileSize(filePath) {
    if (!filePath) return null;
    try {
      const raw = String(filePath).trim();
      if (!raw) return null;
      const uploadsRoot = path.join(process.cwd(), 'uploads');
      const candidatePaths = [];

      if (path.isAbsolute(raw)) {
        candidatePaths.push(raw);
        const idx = raw.replace(/\\/g, '/').indexOf('/uploads/');
        if (idx !== -1) {
          const relFromUploads = raw.replace(/\\/g, '/').slice(idx + '/uploads/'.length);
          candidatePaths.push(path.join(uploadsRoot, relFromUploads));
        }
      } else {
        candidatePaths.push(path.join(process.cwd(), raw.replace(/^\/+/, '')));
      }

      let stat = null;
      for (const abs of candidatePaths) {
        if (!abs) continue;
        if (!fs.existsSync(abs)) continue;
        stat = fs.statSync(abs);
        if (stat && stat.isFile()) break;
        stat = null;
      }
      if (!stat) return null;
      if (!stat.isFile()) return null;
      return stat.size;
    } catch (_error) {
      return null;
    }
  }

  enrichWithFileSizes(item) {
    if (!item || typeof item !== 'object') return item;
    const dbSize = this.getFileSize(item.db_file_path);
    const vectorSize = this.getFileSize(item.vector_file_path);
    return {
      ...item,
      db_file_size: dbSize,
      vector_file_size: vectorSize,
      total_file_size: (dbSize || 0) + (vectorSize || 0)
    };
  }

  async createWithFiles(formData) {
    console.log('[QuestionsService] Creating question with FormData');
    
    try {
      const response = await axios.post(`${this.baseUrl}/api/questions`, formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      
      console.log('[QuestionsService] Success:', response.data);
      return response.data;
    } catch (error) {
      console.error('[QuestionsService] Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.detail || error.message);
    }
  }

  async updateWithFiles(id, formData) {
    console.log('[QuestionsService] Updating question with FormData');
    
    try {
      const response = await axios.put(`${this.baseUrl}/api/questions/${id}`, formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      
      console.log('[QuestionsService] Success:', response.data);
      return response.data;
    } catch (error) {
      console.error('[QuestionsService] Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.detail || error.message);
    }
  }

  async delete(id) {
    return this.request(`/api/questions/${id}`, {
      method: 'DELETE'
    });
  }
}

module.exports = new QuestionsService(PY_DB_URL);