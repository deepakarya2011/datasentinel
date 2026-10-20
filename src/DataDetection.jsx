import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Search, ShieldCheck, Upload } from 'lucide-react';
import { getDetectionPreview, getDetectionRecords, getDetectionRun, runDetection, uploadDetectionCsv, waitDetectionRun } from './services/api';

const STORE = 'datasentinel.detection';
const readState = () => { try { return JSON.parse(sessionStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const saveState = value => sessionStorage.setItem(STORE, JSON.stringify(value));
const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export default function DataDetection({ onDataChange }) {
  const stored = readState();
  const [datasetId, setDatasetId] = useState(stored.datasetId || '');
  const [activeRunId, setActiveRunId] = useState(stored.runId || '');
  const [sourceCleaningRunId, setSourceCleaningRunId] = useState(stored.sourceCleaningRunId || '');
  const [run, setRun] = useState(null);
  const [preview, setPreview] = useState(stored.preview || null);
  const [records, setRecords] = useState(null);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try { saveState({ datasetId, runId: activeRunId, sourceCleaningRunId, preview: preview ? { ...preview, preview: (preview.preview || []).slice(0, 5) } : null }); } catch { saveState({ datasetId, runId: activeRunId, sourceCleaningRunId }); }
  }, [datasetId, activeRunId, sourceCleaningRunId, preview]);
  useEffect(() => {
    if (!datasetId) return;
    let active = true;
    const restore = async () => {
      try {
        if (!preview || preview.dataset_id !== datasetId) {
          const p = await getDetectionPreview(datasetId);
          if (!active) return;
          setPreview(p);
        }
        if (activeRunId) {
          setBusy(true); setBusyText('Restoring detection status...');
          let status = await getDetectionRun(activeRunId);
          if (status.status === 'running') status = await waitDetectionRun(activeRunId);
          if (active && status.dataset_id === datasetId) {
            setRun(status);
            if (status.status === 'success') setRecords(await getDetectionRecords(status.run_id, { page: 1, page_size: 20 }));
          }
        }
      } catch (e) { if (active) setError(e.userMessage || 'Could not restore detection state'); }
      finally { if (active) { setBusy(false); setBusyText(''); } }
    };
    restore(); return () => { active = false; };
  }, [datasetId]);
  useEffect(() => {
    if (!run || run.status !== 'success') return;
    const valid = filter === 'all' ? undefined : filter === 'valid';
    getDetectionRecords(run.run_id, { page, page_size: 20, valid }).then(setRecords).catch(e => setError(e.userMessage || 'Could not load detection results'));
  }, [run?.run_id, run?.status, filter, page]);

  const upload = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true); setBusyText('Uploading and previewing original CSV...'); setError(''); setNotice(''); setRun(null); setRecords(null);
    try {
      const sourceMatch = file.name.match(/-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-cleaned\.csv$/i);
      const sourceRunId = sourceMatch?.[1] || '';
      const result = await uploadDetectionCsv(file, sourceRunId);
      setDatasetId(result.dataset_id); setActiveRunId(''); setSourceCleaningRunId(sourceRunId); setPreview(result); setPage(1); setFilter('all');
      saveState({ datasetId: result.dataset_id, runId: '', sourceCleaningRunId: sourceRunId });
      setNotice(`${result.filename} uploaded · ${result.row_count} rows · ${result.schema} schema detected`); await onDataChange?.();
    } catch (e) { setError(e.userMessage || e.message || 'Upload failed'); }
    finally { setBusy(false); setBusyText(''); }
  };
  const detect = async () => {
    if (!datasetId) return;
    setBusy(true); setBusyText('Validating uploaded values...'); setError(''); setNotice('');
    try {
      const queued = await runDetection(datasetId, sourceCleaningRunId);
      setActiveRunId(queued.run_id);
      setRun(queued); saveState({ datasetId, runId: queued.run_id });
      const result = await waitDetectionRun(queued.run_id); setRun(result); setPage(1);
      saveState({ datasetId, runId: result.run_id });
      setRecords(await getDetectionRecords(result.run_id, { page: 1, page_size: 20 }));
      setNotice(`Detection complete: ${result.valid_records} valid, ${result.invalid_records} invalid.`); await onDataChange?.();
    } catch (e) { setError(e.userMessage || e.message || 'Detection failed'); }
    finally { setBusy(false); setBusyText(''); }
  };
  const download = type => run && window.open(`${baseUrl}/detection/runs/${run.run_id}/download/${type}`, '_blank');

  return <>
    <section className="panel upload-panel">
      <div><p className="eyebrow teal">INDEPENDENT VALIDATION WORKFLOW</p><h3>Data Detection</h3><p>Upload any CSV, including a file downloaded from Data Cleaning. Values are classified exactly as uploaded; this module never cleans them.</p></div>
      <label className="button primary"><Upload size={16} />{busy && !run ? ' Uploading...' : ' Choose CSV'}<input type="file" accept=".csv,text/csv" hidden onChange={upload} disabled={busy} /></label>
    </section>
    {error && <div className="alert error"><AlertTriangle size={16} />{error}</div>}{notice && <div className="alert success"><CheckCircle2 size={16} />{notice}</div>}
    {busy && <section className="panel"><div className="panel-head"><div><h3>{busyText || 'Working...'}</h3><p>Your original CSV is preserved. Detection runs in the background.</p></div><span className="status pending">IN PROGRESS</span></div><div className="progress-track"><div className="progress-fill" /></div></section>}
    {!preview && !busy && <section className="panel empty-state"><ShieldCheck size={26} /><h3>No detection file yet</h3><p>Upload a CSV to inspect its columns, preview the original rows, and start independent validation.</p></section>}
    {preview && <>
      <section className="panel"><div className="panel-head"><div><h3>Step 1 · Original file preview</h3><p>{preview.filename || 'Uploaded CSV'} · {preview.total_records ?? preview.row_count} rows · detected schema: <b>{preview.schema}</b></p></div><span className="tag">{preview.columns?.length || 0} COLUMNS</span></div><div className="toolbar"><span className="tag">Dataset {datasetId.slice(0, 8)}</span>{!run && <button className="button primary" disabled={busy} onClick={detect}>{busy ? 'Detecting...' : 'Run Data Detection'}</button>}</div><div className="table-wrap"><table><thead><tr>{preview.columns?.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{(preview.preview || []).slice(0,10).map((row,index)=><tr key={index}>{preview.columns?.map(column=><td key={column}>{row[column] ?? ''}</td>)}</tr>)}</tbody></table></div></section>
      {run?.status === 'failed' && <section className="panel"><div className="alert error">Detection failed: {run.error_message}</div><button className="button primary" onClick={detect}>Retry detection</button></section>}
      {run?.status === 'success' && <>
        <section className="stats">{[['Total records',run.total_records],['Valid records',run.valid_records],['Invalid records',run.invalid_records],['Quality score',`${run.quality_score}%`]].map(([label,value])=><div className="stat" key={label}><div className="stat-label">{label}</div><strong>{value}</strong></div>)}</section>
        <section className="panel"><div className="panel-head"><div><h3>Step 2 · Validation results</h3><p>Totals are based on the unchanged uploaded CSV: {run.total_records} = {run.valid_records} + {run.invalid_records}</p></div><span className="status good">{run.schema} · complete</span></div>
          {Object.keys(run.issue_counts || {}).length > 0 && <div className="toolbar">{Object.entries(run.issue_counts).map(([type,count])=><span className="tag" key={type}>{type}: {count}</span>)}</div>}
          <div className="toolbar"><div className="tabs">{[['all','All Records'],['valid','Valid Records'],['invalid','Invalid Records']].map(([value,label])=><button key={value} className={filter===value?'tab active':'tab'} onClick={()=>{setFilter(value);setPage(1)}}>{label}</button>)}</div><div className="spacer"/><button className="button secondary small" onClick={()=>download('valid')}><Download size={14}/> Download Valid CSV</button><button className="button secondary small" onClick={()=>download('invalid')}><Download size={14}/> Download Invalid CSV</button><button className="button secondary small" onClick={()=>download('report')}><Download size={14}/> Download Detection Report</button></div>
          {records?.items?.length ? <><div className="table-wrap"><table><thead><tr>{preview.columns?.map(column=><th key={column}>{column}</th>)}<th>Validation</th><th>Exact errors</th></tr></thead><tbody>{records.items.map(item=><tr key={item.row_number}>{preview.columns?.map(column=><td key={column}>{item.data?.[column] ?? ''}</td>)}<td><span className={`status ${item.is_valid?'good':'bad'}`}>{item.is_valid?'Valid':'Invalid'}</span></td><td>{item.errors.join('; ') || '—'}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.total} records · page {page}</span><div><button className="button secondary small" disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button><button className="button secondary small" disabled={page*records.page_size>=records.total} onClick={()=>setPage(page+1)}>Next</button></div></div></> : <div className="empty">No records found in this filter.</div>}
        </section>
      </>}
    </>}
  </>;
}
