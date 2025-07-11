import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function GeneratingLoader() {
  return (
    <span className="generating-loader">
      Generating
      <span className="dot dot1">.</span>
      <span className="dot dot2">.</span>
      <span className="dot dot3">.</span>
    </span>
  );
}

function splitExample(example) {
  const lines = example.split('\n');
  const question = lines[0] || '';
  const answer = lines.slice(1).join('\n').trim();
  return { question, answer, approved: true };
}

function App() {
  const [companyText, setCompanyText] = useState('');
  const [companyTextBackup, setCompanyTextBackup] = useState('');
  const [file, setFile] = useState(null);
  const [examples, setExamples] = useState([]); // [{question, answer, approved}]
  const [displayed, setDisplayed] = useState([]); // [{question, answer, visible}]
  const [isAnimating, setIsAnimating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showRequired, setShowRequired] = useState(false);
  const [trainerQuestions, setTrainerQuestions] = useState(''); // New state for Trainer questions
  const [qaPairs, setQaPairs] = useState([]); // New state for Q&A pairs

  // Refs for all question and answer textareas
  const questionRefs = useRef([]);
  const answerRefs = useRef([]);

  // Auto-resize all textareas after each render
  useEffect(() => {
    qaPairs.forEach((pair, i) => {
      const qEl = questionRefs.current[i];
      if (qEl) {
        qEl.style.height = 'auto';
        qEl.style.height = qEl.scrollHeight + 'px';
      }
      if (i !== 0) {
        const aEl = answerRefs.current[i];
        if (aEl) {
          aEl.style.height = 'auto';
          aEl.style.height = aEl.scrollHeight + 'px';
        }
      }
    });
  }, [qaPairs]);

  // Typewriter and fade-in effect on generation only
  useEffect(() => {
    if (!isAnimating || qaPairs.length === 0) return;
    let cancelled = false;
    const newDisplayed = qaPairs.map(() => ({ question: '', answer: '', visible: false }));
    setDisplayed(newDisplayed);

    const typeWriter = async (i) => {
      if (cancelled || i >= qaPairs.length) {
        setIsAnimating(false);
        return;
      }
      // Fade in
      setDisplayed(disp => {
        const arr = [...disp];
        arr[i] = { ...arr[i], visible: true };
        return arr;
      });
      // Typewriter for question
      await new Promise(resolve => {
        let idx = 0;
        const full = qaPairs[i].question;
        const step = () => {
          if (cancelled) return;
          setDisplayed(disp => {
            const arr = [...disp];
            arr[i] = { ...arr[i], question: full.slice(0, idx + 1) };
            return arr;
          });
          if (idx < full.length - 1) {
            idx++;
            setTimeout(step, 12);
          } else {
            resolve();
          }
        };
        step();
      });
      // Typewriter for answer (if not the first box)
      if (i !== 0) {
        await new Promise(resolve => {
          let idx = 0;
          const full = qaPairs[i].answer;
          const step = () => {
            if (cancelled) return;
            setDisplayed(disp => {
              const arr = [...disp];
              arr[i] = { ...arr[i], answer: full.slice(0, idx + 1) };
              return arr;
            });
            if (idx < full.length - 1) {
              idx++;
              setTimeout(step, 12);
            } else {
              resolve();
            }
          };
          step();
        });
      }
      // Next box
      setTimeout(() => typeWriter(i + 1), 120);
    };
    setTimeout(() => typeWriter(0), 120);
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [isAnimating, qaPairs]);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f && !['text/plain', 'application/pdf'].includes(f.type)) {
      setError('Only .txt and .pdf files are allowed.');
      setFile(null);
      return;
    }
    setError('');
    setFile(f);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!companyText.trim()) {
      setCompanyTextBackup(companyText);
      setCompanyText('Required');
      setShowRequired(true);
      return;
    }
    setShowRequired(false);
    setLoading(true);
    setError('');
    setExamples([]);
    setDisplayed([]);
    setTrainerQuestions(''); // Clear previous trainer questions
    try {
      const formData = new FormData();
      formData.append('companyText', companyText);
      if (file) formData.append('file', file);
      const res = await fetch('http://localhost:3001/generate-examples', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setQaPairs((data.qaPairs || []).map(pair => ({ question: pair.question, answer: pair.answer })));
        setTrainerQuestions(data.trainerQuestions || ''); // Set trainer questions
        setIsAnimating(true);
      } else {
        setError(data.error || 'Failed to generate examples.');
      }
    } catch (err) {
      setError('Error: ' + err.message);
    }
    setLoading(false);
  };

  const handleCompanyFocus = () => {
    if (showRequired) {
      setCompanyText(companyTextBackup);
      setShowRequired(false);
    }
  };

  const handleCompanyChange = (e) => {
    if (showRequired) {
      setShowRequired(false);
      setCompanyTextBackup('');
    }
    setCompanyText(e.target.value);
  };

  const handleExampleChange = (i, field, val) => {
    const newExamples = [...examples];
    newExamples[i][field] = val;
    setExamples(newExamples);
    // Also update displayed so editing is instant
    setDisplayed(disp => {
      const arr = [...disp];
      if (arr[i]) arr[i][field] = val;
      return arr;
    });
  };

  const handleApprove = (i) => {
    const newExamples = [...examples];
    newExamples[i].approved = true;
    setExamples(newExamples);
  };

  const handleDeny = (i) => {
    const newExamples = [...examples];
    newExamples.splice(i, 1);
    setExamples(newExamples);
    setDisplayed(disp => {
      const arr = [...disp];
      arr.splice(i, 1);
      return arr;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const approvedExamples = examples.filter(ex => ex.approved).map(ex => ({ question: ex.question, answer: ex.answer }));
      const res = await fetch('http://localhost:3001/save-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examples: approvedExamples })
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Failed to save.');
      else alert('Examples saved to database!');
    } catch (err) {
      setError('Error: ' + err.message);
    }
    setSaving(false);
  };

  const handleReset = () => {
    setCompanyText('');
    setCompanyTextBackup('');
    setFile(null);
    setExamples([]);
    setDisplayed([]);
    setIsAnimating(false);
    setShowRequired(false);
    setError('');
    setTrainerQuestions(''); // Clear trainer questions on reset
  };

  return (
    <div className="app-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="header">
        <div className="logo">
          <img src="/Expand AI.png" alt="Expand AI Logo" className="logo-icon" style={{ width: 40, height: 40, objectFit: 'contain', marginRight: 10 }} />
          <span className="logo-text">AI<span className="accent">Expand</span></span>
        </div>
      </header>
      <main className="main-content" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <section className="card right-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 className="section-title" style={{ textAlign: 'center' }}>Provide Company Info Here</h2>
          <form className="company-form" onSubmit={handleGenerate} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 500, marginLeft: -20 }}>
              <textarea
                value={companyText}
                onChange={handleCompanyChange}
                onFocus={handleCompanyFocus}
                rows={4}
                className="company-textarea"
                placeholder={showRequired ? '' : 'Describe your company, upload docs, or paste info...'}
                style={{ width: '100%', color: showRequired ? '#ff3b3b' : '', fontWeight: showRequired ? 700 : 400, background: showRequired ? '#1a1a1a' : '' }}
              />
            </div>
            <div className="input-group" style={{ width: '100%', maxWidth: 500, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginLeft: -20 }}>
              <input
                type="file"
                accept=".txt,application/pdf"
                onChange={handleFileChange}
                className="file-input"
                style={{ maxWidth: 400, margin: '10px auto' }}
              />
            </div>
            <button type="submit" className="btn start-btn" disabled={loading} style={{ width: 150, margin: '10px auto' }}>
              <span>{loading ? <GeneratingLoader /> : 'Start'}</span>
            </button>
          </form>
          {error && <div className="error-msg" style={{ textAlign: 'center' }}>{error}</div>}
          {trainerQuestions && (
            <div className="trainer-section" style={{ width: '100%', maxWidth: 500, margin: '0 auto 24px auto', background: '#232136', borderRadius: 8, padding: 16 }}>
              <h3 style={{ textAlign: 'center', marginBottom: 8 }}>Trainer (Ollama) Questions</h3>
              <ul style={{ color: '#e0e0e0', background: 'none', fontSize: 15, paddingLeft: 20 }}>
                {trainerQuestions
                  .split(/\n|(?:^|\n)\d+\.\s+/) // split on newlines or numbered list
                  .map(q => q.trim())
                  .filter(q => q.length > 0)
                  .map((q, idx) => (
                    <li key={idx}>{q}</li>
                  ))}
              </ul>
            </div>
          )}
          {qaPairs.length > 0 && (
            <div className="examples-section" style={{ width: '100%', maxWidth: 500, margin: '0 auto' }}>
              <h3 style={{ textAlign: 'center' }}>Edit Example Responses</h3>
              {qaPairs.map((pair, i) => (
                <div
                  key={i}
                  className="example-edit-group fade-in"
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24, width: '100%',
                    opacity: 1,
                    transition: 'opacity 0.6s',
                  }}
                >
                  <div style={{ width: '100%', maxWidth: 400 }}>
                    <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>Question</label>
                    <textarea
                      value={pair.question}
                      readOnly
                      className="example-textarea"
                      style={{ width: '100%', overflow: 'hidden', resize: 'none' }}
                      rows={1}
                    />
                    <label style={{ fontWeight: 600, margin: '8px 0 4px 0', display: 'block' }}>Answer</label>
                    <textarea
                      value={pair.answer}
                      readOnly
                      className="example-textarea"
                      style={{ width: '100%', overflow: 'hidden', resize: 'none' }}
                      rows={1}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button type="button" className="btn approve-btn">
                      <span>Approve</span>
                    </button>
                    <button type="button" className="btn deny-btn">
                      <span>Deny</span>
                    </button>
                  </div>
                </div>
              ))}
              <button className="btn save-btn" onClick={handleSave} disabled={saving} style={{ width: 200, margin: '18px auto' }}>
                <span>{saving ? 'Saving...' : 'Save to Database'}</span>
              </button>
              <button className="btn reset-btn" type="button" onClick={handleReset} style={{ width: 200, margin: '18px auto 0 auto', background: 'linear-gradient(90deg, #a1a1aa 0%, #52525b 100%)', color: '#fff', fontWeight: 700, borderRadius: 8, boxShadow: '0 2px 8px 0 #52525b44' }}>
                <span>Reset</span>
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
