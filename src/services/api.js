import axios from 'axios';

const API_TIMEOUT_MS = 30000;
const PIPELINE_REQUEST_TIMEOUT_MS = 30000;

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: API_TIMEOUT_MS,
});

api.interceptors.response.use(
  response => response,
  error => {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') {
      error.userMessage = detail;
    } else if (detail?.message) {
      error.userMessage = detail.message;
    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      const method = error.config?.method?.toUpperCase() || 'REQUEST';
      const path = error.config?.url || 'the API';
      const timeoutSeconds = Math.round((error.config?.timeout || API_TIMEOUT_MS) / 1000);
      error.userMessage = `${method} ${path} timed out after ${timeoutSeconds}s`;
    } else if (!error.response) {
      error.userMessage = 'Could not reach the backend. Check that the API server is running.';
    } else {
      error.userMessage = error.message || 'Request failed';
    }
    return Promise.reject(error);
  },
);

export const getHealth = () => api.get('/health').then(r => r.data);
export const getSummary = () => api.get('/quality/summary').then(r => r.data);
export const getDatasets = () => api.get('/datasets').then(r => r.data);
export const getRuns = () => api.get('/pipelines/runs').then(r => r.data);
export const uploadCsv = (file, onUploadProgress) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/datasets/upload', form, { onUploadProgress, timeout: 120000 }).then(r => r.data);
};
export const runPipeline = (id, config) => api
  .post(`/pipelines/run/${id}`, config || null, { timeout: PIPELINE_REQUEST_TIMEOUT_MS })
  .then(r => r.data);
export const getRun = id => api.get(`/pipelines/runs/${id}`).then(r => r.data);
export const runPipelineAndWait = async (id, config) => {
  const queued = await runPipeline(id, config);
  const started = Date.now();
  let delay = 700;
  while (queued.status === 'running') {
    if (Date.now() - started > 20 * 60 * 1000) {
      const error = new Error('Pipeline is still running. Check Pipeline Runs for its status.');
      error.userMessage = error.message;
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    const current = await getRun(queued.run_id);
    if (current.status !== 'running') {
      if (current.status === 'failed') {
        const error = new Error(current.error_message || 'Pipeline failed');
        error.userMessage = error.message;
        throw error;
      }
      return current;
    }
    delay = Math.min(3000, Math.round(delay * 1.35));
  }
  return queued;
};
export const getRecords = (id, params) => api.get(`/datasets/${id}/records`, { params }).then(r => r.data);
export const deleteDataset = id => api.delete(`/datasets/${id}`);
export const getCleaningConfig = id => api.get(`/datasets/${id}/cleaning/config`).then(r => r.data);
export const previewCleaning = (id, config) => api.post(`/datasets/${id}/cleaning/preview`, config).then(r => r.data);
export const getCleaningResult = (datasetId, runId) => api.get(`/datasets/${datasetId}/runs/${runId}/cleaning`).then(r => r.data);
export const getIssues = () => api.get('/quality/issues').then(r => r.data);
export const analyze = () => api.post('/ai/analyze', null, { timeout: 35000 }).then(r => r.data);
export const getAIInsights = datasetId => api.get('/ai/insights', { params: datasetId ? { dataset_id: datasetId } : {} }).then(r => r.data);
export const generateAIInsights = runId => api.post(`/ai/insights/${runId}/generate`).then(r => r.data);
export const decideAIInsight = (insightId, proposalIndex, decision) => api.post(`/ai/insights/${insightId}/proposals/${proposalIndex}/decision`, { decision }).then(r => r.data);
export const previewDataset = id => api.get(`/datasets/${id}/cleaning/original-preview`).then(r => r.data);
export const uploadDetectionCsv = (file, sourceCleaningRunId) => {
  const form = new FormData(); form.append('file', file); if (sourceCleaningRunId) form.append('source_cleaning_run_id', sourceCleaningRunId);
  return api.post('/detection/datasets', form, { timeout: 120000 }).then(r => r.data);
};
export const getDetectionPreview = id => api.get(`/detection/datasets/${id}/preview`).then(r => r.data);
export const runDetection = (id, sourceCleaningRunId) => api.post(`/detection/runs/${id}`, null, { params: sourceCleaningRunId ? { source_cleaning_run_id: sourceCleaningRunId } : {} }).then(r => r.data);
export const getDetectionRun = id => api.get(`/detection/runs/${id}`).then(r => r.data);
export const getDetectionRecords = (runId, params) => api.get(`/detection/runs/${runId}/records`, { params }).then(r => r.data);
export const waitDetectionRun = async runId => {
  const started = Date.now(); let delay = 700;
  while (true) {
    if (Date.now() - started > 20 * 60 * 1000) throw Object.assign(new Error('Detection is still running. Reopen Data Detection to check status.'), { userMessage: 'Detection is still running. Reopen Data Detection to check status.' });
    const current = await getDetectionRun(runId);
    if (current.status !== 'running') { if (current.status === 'failed') throw Object.assign(new Error(current.error_message || 'Detection failed'), { userMessage: current.error_message || 'Detection failed' }); return current; }
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(3000, Math.round(delay * 1.35));
  }
};
export const runDetectionAndWait = async datasetId => { const queued = await runDetection(datasetId); return waitDetectionRun(queued.run_id); };
