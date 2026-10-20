import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { analyze, decideAIInsight, generateAIInsights, getAIInsights } from './services/api';

export default function AIInsights({ datasets, runs, refresh }) {
  const [datasetId, setDatasetId] = useState('');
  const [insights, setInsights] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const latestRunId = runs.find(r => r.dataset_id === datasetId && r.status === 'success')?.run_id;

  useEffect(() => { if (!datasetId && datasets.length) setDatasetId(datasets[0].id); }, [datasets, datasetId]);
  const load = async () => {
    if (!datasetId) return;
    setBusy(true); setError('');
    try { setInsights(await getAIInsights(datasetId)); }
    catch (e) { setError(e.userMessage || 'Could not load AI insights'); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [datasetId, latestRunId]);
  const completed = runs.filter(r => r.dataset_id === datasetId && r.status === 'success');
  const generate = async () => {
    if (!completed.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await generateAIInsights(completed[0].run_id);
      setNotice(result.available ? `${result.proposals.length} review suggestion(s) generated.` : result.message || 'AI is unavailable. Deterministic cleaning is unaffected.');
      await load();
    } catch (e) { setError(e.userMessage || 'AI analysis failed'); }
    finally { setBusy(false); }
  };
  const decide = async (insight, index, decision) => {
    setBusy(true); setError('');
    try {
      await decideAIInsight(insight.id, index, decision);
      setNotice(decision === 'approve' ? 'Suggestion approved, schema-validated, and saved as a new cleaned version.' : 'Suggestion rejected and recorded in the audit log.');
      await load();
      if (decision === 'approve') await refresh();
    } catch (e) { setError(e.userMessage || 'Could not record decision'); }
    finally { setBusy(false); }
  };

  return <>
    <section className="panel insight">
      <div className="insight-badge"><Sparkles size={21} /></div>
      <h2>AI Data Cleaning Analyst</h2>
      <p>Deterministic cleaning runs first. AI receives aggregated quality facts and redacted, relevant examples; it can suggest changes but cannot modify your dataset.</p>
      <div className="toolbar">
        <select value={datasetId} onChange={e => setDatasetId(e.target.value)}><option value="">Select dataset</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.filename}</option>)}</select>
        <button className="button primary" disabled={busy || !completed.length} onClick={generate}><Sparkles size={15} />{busy ? 'Analyzing...' : 'Analyze latest completed run'}</button>
      </div>
      {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
      {!completed.length && <p className="muted">Run deterministic cleaning for this dataset before requesting AI insights.</p>}
    </section>
    {insights.map(insight => <section className="panel" key={insight.id}>
      <div className="panel-head"><div><h3>Cleaning review · {insight.run_id.slice(0, 8)}</h3><p>{insight.provider_error || `${insight.proposals.length} suggestion(s) · ${insight.status}`}</p></div><span className="tag">HUMAN REVIEW REQUIRED</span></div>
      {insight.latest_revision && <div className="toolbar"><span>Revised quality: {insight.latest_revision.metrics.after_quality_score}% · {insight.latest_revision.metrics.rows_valid_after} valid rows</span><button className="button secondary small" onClick={() => window.open(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'}/ai/insights/${insight.id}/revisions/${insight.latest_revision.id}/download`, '_blank')}>Download approved cleaned version</button></div>}
      {insight.proposals.length ? insight.proposals.map((proposal, index) => <article className="ai-result" key={`${insight.id}-${index}`} style={{ padding: 18, marginBottom: 12 }}>
        <div className="panel-head"><div><h3>{proposal.issue_type} · {proposal.column}</h3><p>Row {proposal.row_reference}</p></div><span className="status pending">{proposal.status || 'pending'}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Original</th><th>Current</th><th>Proposed</th><th>Confidence</th></tr></thead><tbody><tr>
          <td>{String(proposal.original_value ?? 'Missing')}</td><td>{String(proposal.current_value ?? 'Missing')}</td><td>{proposal.proposed_value == null ? 'No correction proposed' : String(proposal.proposed_value)}</td><td>{Math.round(proposal.confidence * 100)}%</td>
        </tr></tbody></table></div>
        <p><b>Explanation:</b> {proposal.explanation}</p><p><b>Evidence:</b> {Array.isArray(proposal.evidence) ? proposal.evidence.join('; ') : ''}</p>
        {proposal.proposed_value == null && <p className="text-warn">AI recommends investigation; no value can be applied.</p>}
        {proposal.status === 'pending' && <div className="toolbar"><button className="button primary" disabled={busy || proposal.proposed_value == null} onClick={() => decide(insight, index, 'approve')}>Approve and validate</button><button className="button secondary" disabled={busy} onClick={() => decide(insight, index, 'reject')}>Reject</button></div>}
      </article>) : <div className="empty">No structured suggestions were returned.</div>}
    </section>)}
    <section className="panel insight"><h3>AI incident analyst</h3><p>Legacy run-level interpretation remains available. It uses verified aggregate metrics only.</p><button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); try { const result = await analyze(); setNotice(result.available ? result.analysis : result.message); } catch { setError('AI incident analysis failed'); } finally { setBusy(false); } }}>Generate aggregate analysis</button></section>
  </>;
}
