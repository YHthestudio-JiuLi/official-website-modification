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
      const error = await response.text();
      throw new Error(error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async findAll() {
    const list = await this.request('/api/questions');
    if (!Array.isArray(list)) return [];
    return list.map(item => this.enrichWithFileSizes(item));
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
      let abs = raw;
      if (!path.isAbsolute(raw)) {
        abs = path.join(process.cwd(), raw.replace(/^\/+/, ''));
      }
      const stat = fs.statSync(abs);
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