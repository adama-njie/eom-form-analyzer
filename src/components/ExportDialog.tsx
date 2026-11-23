import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from '@/lib/analyse';
import { findings } from '@/lib/analyse';
import {
  PRESETS,
  countOwnSlides,
  estimateSlides,
  exportableQuestions,
  questionKey,
  selectedQuestions,
  type ExportSelection,
} from '@/lib/selection';

export type ExportKind = 'pptx' | 'report' | 'print';

const KIND_LABEL: Record<ExportKind, { title: string; verb: string; unit: string }> = {
  pptx: { title: 'Build PowerPoint', verb: 'Build deck', unit: 'slides' },
  report: { title: 'Build Word report', verb: 'Build report', unit: 'sections' },
  print: { title: 'Print or save as PDF', verb: 'Print', unit: 'sections' },
};

export default function ExportDialog({
  dataset,
  kind,
  initial,
  busy,
  onCancel,
  onConfirm,
}: {
  dataset: Dataset;
  kind: ExportKind;
  initial: ExportSelection;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (selection: ExportSelection) => void;
}) {
  const [sel, setSel] = useState<ExportSelection>(initial);
  const [search, setSearch] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const questions = useMemo(() => exportableQuestions(dataset), [dataset]);
  const flagged = useMemo(
    () => new Set(findings(dataset, undefined, 50).map((f) => questionKey(f.question))),
    [dataset],
  );

  const chosen = useMemo(() => new Set(sel.questions), [sel.questions]);

  const bySection = useMemo(() => {
    const groups = new Map<string, typeof questions>();
    for (const q of questions) {
      const key = q.section || 'Other';
      const list = groups.get(key) ?? [];
      list.push(q);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [questions]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return null;
    return new Set(
      questions
        .filter(
          (q) =>
            q.label.toLowerCase().includes(needle) || q.code.toLowerCase().includes(needle),
        )
        .map(questionKey),
    );
  }, [questions, search]);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const setQuestions = (next: string[]) =>
    setSel((s) => ({ ...s, questions: orderOf(questions, next) }));

  const toggle = (key: string) =>
    setQuestions(chosen.has(key) ? sel.questions.filter((k) => k !== key) : [...sel.questions, key]);

  const toggleSection = (section: string, on: boolean) => {
    const keys = (bySection.find(([s]) => s === section)?.[1] ?? []).map(questionKey);
    const set = new Set(sel.questions);
    for (const k of keys) {
      if (on) set.add(k);
      else set.delete(k);
    }
    setQuestions([...set]);
  };

  // Exact rather than approximate: the same packing rule the deck uses, so
  // the number in the dialogue is the number of slides that come out.
  const heavy = useMemo(
    () => countOwnSlides(dataset, selectedQuestions(dataset, sel)),
    [dataset, sel],
  );
  const slides = estimateSlides(
    sel,
    chosen.size,
    heavy,
    dataset.geo && dataset.constituencies.length > 0,
  );
  const nothingChosen =
    !sel.coverage && !sel.maps && !sel.findingsTable && !sel.ratings && chosen.size === 0;

  return (
    <div
      className="modal-backdrop no-print"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        ref={dialogRef}
      >
        <header className="modal-head">
          <h2 id="export-title">{KIND_LABEL[kind].title}</h2>
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            Close
          </button>
        </header>

        <div className="modal-body">
          <div className="field-row">
            <label>
              <span className="muted small">Title</span>
              <input
                ref={firstFieldRef}
                value={sel.title}
                onChange={(e) => setSel((s) => ({ ...s, title: e.target.value }))}
              />
            </label>
            <label>
              <span className="muted small">Prepared by</span>
              <input
                value={sel.preparedBy}
                placeholder="e.g. Data Analysis team"
                onChange={(e) => setSel((s) => ({ ...s, preparedBy: e.target.value }))}
              />
            </label>
          </div>

          <div className="field-row">
            <label>
              <span className="muted small">Election</span>
              <input
                placeholder="e.g. Presidential Election - The Gambia"
                value={sel.election}
                onChange={(e) => setSel((s) => ({ ...s, election: e.target.value }))}
              />
            </label>
            <label>
              <span className="muted small">Polling day</span>
              <input
                value={sel.electionDate}
                placeholder="e.g. 5 December 2026"
                onChange={(e) => setSel((s) => ({ ...s, electionDate: e.target.value }))}
              />
            </label>
          </div>

          <h3 className="modal-h3">Start from</h3>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="preset"
                onClick={() => setSel((s) => ({ ...s, ...p.build(dataset) }))}
              >
                <strong>{p.name}</strong>
                <span className="muted small">{p.description}</span>
              </button>
            ))}
          </div>

          <h3 className="modal-h3">Sections</h3>
          <div className="checkrow">
            {([
              ['coverage', 'Coverage'],
              ['maps', 'Maps'],
              ['findingsTable', 'Ranked findings'],
              ['ratings', 'Overall assessments'],
            ] as const).map(([key, label]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={sel[key]}
                  onChange={(e) => setSel((s) => ({ ...s, [key]: e.target.checked }))}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {sel.maps && !dataset.geo && (
            <p className="muted small">
              The places in this file are not Gambian, so maps will be skipped.
            </p>
          )}

          <div className="modal-h3 row-between">
            <h3>Questions</h3>
            <span className="muted small">
              {chosen.size} of {questions.length} selected
            </span>
          </div>

          <div className="qpick-toolbar">
            <input
              type="search"
              placeholder="Filter by code or text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className="ghost" onClick={() => setQuestions(questions.map(questionKey))}>
              All
            </button>
            <button type="button" className="ghost" onClick={() => setQuestions([])}>
              None
            </button>
            <button
              type="button"
              className="ghost"
              title="Questions whose answers indicate a problem"
              onClick={() => setQuestions([...flagged])}
            >
              Flagged ({flagged.size})
            </button>
          </div>

          <div className="qpick">
            {bySection.map(([section, list]) => {
              const shown = visible ? list.filter((q) => visible.has(questionKey(q))) : list;
              if (shown.length === 0) return null;
              const keys = list.map(questionKey);
              const allOn = keys.every((k) => chosen.has(k));
              return (
                <section key={section}>
                  <div className="qpick-section">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => {
                          if (el) el.indeterminate = !allOn && keys.some((k) => chosen.has(k));
                        }}
                        onChange={(e) => toggleSection(section, e.target.checked)}
                      />
                      <strong>Section {section}</strong>
                    </label>
                    <span className="muted small">{list.length}</span>
                  </div>
                  {shown.map((q) => {
                    const key = questionKey(q);
                    return (
                      <label key={key} className="check qpick-item">
                        <input
                          type="checkbox"
                          checked={chosen.has(key)}
                          onChange={() => toggle(key)}
                        />
                        <span>
                          <span className="qcode">{q.code}</span> {q.label}
                        </span>
                        {flagged.has(key) && <span className="flagpill">flagged</span>}
                      </label>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </div>

        <footer className="modal-foot">
          <span className="muted small">
            {kind === 'pptx'
              ? `About ${slides} slides`
              : `${chosen.size} question${chosen.size === 1 ? '' : 's'} plus the chosen sections`}
          </span>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || nothingChosen}
              onClick={() => onConfirm(sel)}
            >
              {busy ? 'Working…' : KIND_LABEL[kind].verb}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Keep selections in form order, not the order they were clicked. */
function orderOf(questions: ReturnType<typeof exportableQuestions>, keys: string[]): string[] {
  const wanted = new Set(keys);
  return questions.map(questionKey).filter((k) => wanted.has(k));
}
