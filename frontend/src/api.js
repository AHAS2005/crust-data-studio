// API communication layer with Bring-Your-Own-Key header injection

export const getApiHeaders = () => {
  const nvidiaKey = localStorage.getItem('cs_nvidia_key') || '';
  const groqKey = localStorage.getItem('cs_groq_key') || '';
  const provider = localStorage.getItem('cs_provider') || 'mock';
  const customUrl = localStorage.getItem('cs_custom_url') || '';
  const customModel = localStorage.getItem('cs_custom_model') || '';
  const customKey = localStorage.getItem('cs_custom_key') || '';

  return {
    'x-nvidia-api-key': nvidiaKey,
    'x-groq-api-key': groqKey,
    'x-llm-provider': provider,
    'x-custom-url': customUrl,
    'x-custom-model': customModel,
    'x-custom-key': customKey,
  };
};

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const api = {
  getStatus: async () => {
    const res = await fetch(`${API_BASE}/status`);
    if (!res.ok) throw new Error('Failed to fetch status');
    return res.json();
  },

  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },

  loadSample: async () => {
    const res = await fetch(`${API_BASE}/load-sample`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to load sample' }));
      throw new Error(err.detail || 'Failed to load sample');
    }
    return res.json();
  },

  explainAnomaly: async (anomaly) => {
    const res = await fetch(`${API_BASE}/explain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getApiHeaders(),
      },
      body: JSON.stringify({ anomaly }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Explanation request failed' }));
      throw new Error(err.detail || 'Explanation request failed');
    }
    return res.json();
  },

  resetWorkspace: async () => {
    const res = await fetch(`${API_BASE}/reset`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Reset failed');
    return res.json();
  },

  previewFix: async (anomaly, customInstruction = null) => {
    const res = await fetch(`${API_BASE}/preview-fix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getApiHeaders(),
      },
      body: JSON.stringify({ 
        anomaly,
        custom_instruction: customInstruction,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Fix generation failed' }));
      throw new Error(err.detail || 'Fix generation failed');
    }
    return res.json();
  },

  approveFix: async ({ anomalyTarget, description, codeString }) => {
    const res = await fetch(`${API_BASE}/ledger/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anomaly_target: anomalyTarget,
        description,
        code_string: codeString,
        function_name: 'clean_step',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Approval failed' }));
      throw new Error(err.detail || 'Approval failed');
    }
    return res.json();
  },

  rollbackStep: async (stepId, mode = 'cascade') => {
    const res = await fetch(`${API_BASE}/ledger/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_id: stepId, mode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Rollback failed' }));
      throw new Error(err.detail || 'Rollback failed');
    }
    return res.json();
  },

  askQuestion: async (question, mode = 'descriptive') => {
    const res = await fetch(`${API_BASE}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getApiHeaders(),
      },
      body: JSON.stringify({ question, mode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Question failed' }));
      throw new Error(err.detail || 'Question failed');
    }
    return res.json();
  },

  testApiKey: async (provider, apiKey, baseUrl = '', model = '') => {
    const res = await fetch(`${API_BASE}/test-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        provider, 
        api_key: apiKey, 
        base_url: baseUrl, 
        model 
      }),
    });
    return res.json();
  },

  testChat: async (provider, apiKey, message, baseUrl = '', model = '') => {
    const res = await fetch(`${API_BASE}/test-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        provider, 
        api_key: apiKey, 
        message, 
        base_url: baseUrl, 
        model 
      }),
    });
    const data = await res.json().catch(() => ({ success: false, error: 'Failed to parse server response' }));
    return data;
  },

  getDataPreview: async (page = 1, pageSize = 50, modifiedOnly = false, search = '') => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      modified_only: String(modifiedOnly),
      search: search || '',
    });
    const res = await fetch(`${API_BASE}/data-preview?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch data preview' }));
      throw new Error(err.detail || 'Failed to fetch data preview');
    }
    return res.json();
  },

  exportCsvUrl: `${API_BASE}/export-csv`,
  exportLedgerUrl: `${API_BASE}/export-ledger`,
};
