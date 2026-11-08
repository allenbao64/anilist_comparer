'use client';

import { useState, useMemo, useRef } from 'react';
import type { GameSession, PlannedQuestion, SessionPlan } from '@/types/session';
import type { AnimeEntry, AnimeStatus, UserStatusData } from '@/utils/anilist';
import { simplifyFranchiseTitle } from '@/utils/seriesGrouping';

interface GamePlannerProps {
  session: GameSession;
  onSessionChange: (patch: Partial<GameSession>) => void;
  cachedUserData: UserStatusData[];
}

interface CandidateItem {
  id: number;
  originalTitle: string;
  displayTitle: string;
  seenUsers: string[];
  unseenUsers: string[];
  isEveryone: boolean;
  userProgressInfo?: Record<string, string>;
}

export default function GamePlanner({ session, onSessionChange, cachedUserData }: GamePlannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  
  // Question creation state
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionAnimeSearch, setNewQuestionAnimeSearch] = useState('');
  const [selectedAnimeForNewQ, setSelectedAnimeForNewQ] = useState<CandidateItem[]>([]);
  const [manualUnseenUsers, setManualUnseenUsers] = useState<string[]>([]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const plan: SessionPlan = session.plan || {
    questions: [],
    crossedOffAnimeIds: [],
    titleOverrides: {},
  };

  const updatePlan = (nextPlan: Partial<SessionPlan>) => {
    onSessionChange({
      plan: {
        ...plan,
        ...nextPlan,
      },
    });
  };

  const loadedUsernames = useMemo(() => {
    return cachedUserData.map(u => u.username);
  }, [cachedUserData]);

  // Compute all anime in the active pool from cachedUserData
  // Rule: Candidate items must be seen by at least 2 contestants.
  // Grouped into "EVERYONE" (seen by all loaded contestants) and "NO [User]" (unseen by exactly 1 contestant).
  const candidatePool = useMemo(() => {
    if (loadedUsernames.length < 2) return [];

    const animeMap = new Map<number, {
      id: number;
      title: string;
      seenUsers: string[];
      unseenUsers: string[];
      progressMap: Record<string, string>;
    }>();

    // Collect all seen entries across loaded users
    cachedUserData.forEach(user => {
      session.activeStatuses.forEach(status => {
        const list = user.statusData[status] || [];
        list.forEach(entry => {
          if (!animeMap.has(entry.id)) {
            animeMap.set(entry.id, {
              id: entry.id,
              title: entry.title,
              seenUsers: [],
              unseenUsers: [],
              progressMap: {},
            });
          }
          const item = animeMap.get(entry.id)!;
          if (!item.seenUsers.includes(user.username)) {
            item.seenUsers.push(user.username);
            if (entry.userProgress !== null && entry.userProgress !== undefined && status !== 'COMPLETED') {
              item.progressMap[user.username] = `${entry.userProgress} eps`;
            }
          }
        });
      });
    });

    // Populate unseen users
    const results: CandidateItem[] = [];
    animeMap.forEach(item => {
      const unseen = loadedUsernames.filter(u => !item.seenUsers.includes(u));
      item.unseenUsers = unseen;

      // Filter: Question must be theoretically answerable by at least 2 contestants
      // So at least 2 people must have seen it!
      if (item.seenUsers.length >= 2) {
        // Also limit pool to either EVERYONE or exactly 1 person has NOT seen it (matching planning doc)
        if (unseen.length <= 1) {
          const override = plan.titleOverrides[item.id];
          const displayTitle = override || simplifyFranchiseTitle(item.title);
          results.push({
            id: item.id,
            originalTitle: item.title,
            displayTitle,
            seenUsers: item.seenUsers,
            unseenUsers: unseen,
            isEveryone: unseen.length === 0,
            userProgressInfo: item.progressMap,
          });
        }
      }
    });

    return results.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
  }, [cachedUserData, loadedUsernames, session.activeStatuses, plan.titleOverrides]);

  // Group candidate pool by column: EVERYONE, and NO [User]
  const columns = useMemo(() => {
    const cols: { key: string; label: string; items: CandidateItem[] }[] = [
      {
        key: 'everyone',
        label: 'EVERYONE',
        items: candidatePool.filter(c => c.isEveryone),
      },
    ];

    loadedUsernames.forEach(username => {
      cols.push({
        key: username,
        label: `NO ${username.toUpperCase()}`,
        items: candidatePool.filter(c => !c.isEveryone && c.unseenUsers.includes(username)),
      });
    });

    return cols;
  }, [candidatePool, loadedUsernames]);

  // Tally unfairness counter: Number of questions where each user has NOT seen the anime
  const unseenQuestionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    loadedUsernames.forEach(u => { counts[u] = 0; });

    plan.questions.forEach(q => {
      q.unseenUsers.forEach(u => {
        if (counts[u] !== undefined) {
          counts[u] += 1;
        }
      });
    });

    return counts;
  }, [loadedUsernames, plan.questions]);

  // Candidate toggle crossed off
  const toggleCrossedOff = (animeId: number) => {
    const isCrossed = plan.crossedOffAnimeIds.includes(animeId);
    const nextCrossed = isCrossed
      ? plan.crossedOffAnimeIds.filter(id => id !== animeId)
      : [...plan.crossedOffAnimeIds, animeId];
    updatePlan({ crossedOffAnimeIds: nextCrossed });
  };

  // Title override save
  const saveTitleOverride = (animeId: number) => {
    const clean = titleDraft.trim();
    const nextOverrides = { ...plan.titleOverrides };
    if (!clean) {
      delete nextOverrides[animeId];
    } else {
      nextOverrides[animeId] = clean;
    }
    updatePlan({ titleOverrides: nextOverrides });
    setEditingTitleId(null);
    setTitleDraft('');
  };

  // Add question
  const handleAddQuestion = () => {
    if (!newQuestionText.trim() && selectedAnimeForNewQ.length === 0) return;

    // Automatically compute unseen users from the selected anime
    const unionUnseen = new Set<string>(manualUnseenUsers);
    selectedAnimeForNewQ.forEach(anime => {
      anime.unseenUsers.forEach(u => unionUnseen.add(u));
    });

    const newQ: PlannedQuestion = {
      id: crypto.randomUUID(),
      text: newQuestionText.trim() || `Question ${plan.questions.length + 1}`,
      animeIds: selectedAnimeForNewQ.map(a => a.id),
      animeTitles: selectedAnimeForNewQ.map(a => a.displayTitle),
      unseenUsers: Array.from(unionUnseen),
    };

    // Automatically cross off the anime used in this question
    const newlyCrossed = new Set(plan.crossedOffAnimeIds);
    selectedAnimeForNewQ.forEach(a => newlyCrossed.add(a.id));

    updatePlan({
      questions: [...plan.questions, newQ],
      crossedOffAnimeIds: Array.from(newlyCrossed),
    });

    // Reset inputs
    setNewQuestionText('');
    setSelectedAnimeForNewQ([]);
    setManualUnseenUsers([]);
    setNewQuestionAnimeSearch('');
  };

  // Delete question
  const handleDeleteQuestion = (questionId: string) => {
    updatePlan({
      questions: plan.questions.filter(q => q.id !== questionId),
    });
  };

  // Toggle unseen user manually on a question
  const toggleQuestionUnseenUser = (questionId: string, username: string) => {
    const nextQuestions = plan.questions.map(q => {
      if (q.id !== questionId) return q;
      const isUnseen = q.unseenUsers.includes(username);
      const nextUnseen = isUnseen
        ? q.unseenUsers.filter(u => u !== username)
        : [...q.unseenUsers, username];
      return { ...q, unseenUsers: nextUnseen };
    });
    updatePlan({ questions: nextQuestions });
  };

  // Export JSON
  const exportPlanJson = () => {
    const data = {
      version: '1.0',
      sessionId: session.id,
      sessionName: session.name,
      usernames: session.usernames,
      exportedAt: new Date().toISOString(),
      plan: plan,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.name.replace(/[^a-z0-9_-]/gi, '_')}_planner.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = JSON.parse(event.target?.result as string);
        const importedPlan = raw.plan || raw;
        if (Array.isArray(importedPlan.questions)) {
          updatePlan({
            questions: importedPlan.questions,
            crossedOffAnimeIds: Array.isArray(importedPlan.crossedOffAnimeIds) ? importedPlan.crossedOffAnimeIds : [],
            titleOverrides: typeof importedPlan.titleOverrides === 'object' ? importedPlan.titleOverrides : {},
          });
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Search suggestions for anime to attach to new question
  const filteredSearchCandidates = useMemo(() => {
    if (!newQuestionAnimeSearch.trim()) return [];
    const q = newQuestionAnimeSearch.toLowerCase();
    return candidatePool
      .filter(c => c.displayTitle.toLowerCase().includes(q) || c.originalTitle.toLowerCase().includes(q))
      .slice(0, 8);
  }, [newQuestionAnimeSearch, candidatePool]);

  return (
    <div style={{ marginTop: '2.5rem', borderTop: '2px solid var(--gray-300)', paddingTop: '1.5rem' }}>
      {/* Header & Toggle Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            style={{
              background: isOpen ? 'var(--primary-dark)' : 'var(--primary)',
              color: 'white',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              padding: '10px 20px',
              borderRadius: 'var(--border-radius)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>{isOpen ? '▼' : '▶'}</span>
            <span>Game Planner & Fairness Tracker</span>
            <span style={{ fontSize: '0.85rem', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px' }}>
              {plan.questions.length} questions
            </span>
          </button>
        </div>

        {isOpen && (
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={exportPlanJson}
              title="Export this game plan to a JSON file"
              style={{
                background: 'var(--gray-200)',
                color: 'var(--foreground)',
                border: '1px solid var(--gray-300)',
                padding: '6px 12px',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderRadius: '4px',
              }}
            >
              📥 Export JSON
            </button>
            <label
              title="Import an existing plan from a JSON file"
              style={{
                background: 'var(--gray-200)',
                color: 'var(--foreground)',
                border: '1px solid var(--gray-300)',
                padding: '6px 12px',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              📤 Import JSON
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleImportJson}
              />
            </label>
          </div>
        )}
      </div>

      {isOpen && (
        <div style={{ background: 'var(--gray-100)', padding: '1.5rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--gray-300)' }}>
          {/* Fairness Counters Banner */}
          <div style={{ marginBottom: '1.5rem', background: 'var(--background)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--gray-300)' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '0.6rem', color: 'var(--primary-dark)' }}>
              ⚖️ Contestant Question Fairness (Anime Not Seen by Player)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-800)', marginBottom: '0.8rem' }}>
              Shows how many questions in this game each person <strong>cannot answer</strong>. Keep these numbers balanced across all contestants:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {loadedUsernames.map(username => {
                const count = unseenQuestionCounts[username] || 0;
                return (
                  <div
                    key={username}
                    style={{
                      padding: '8px 16px',
                      background: count > 3 ? '#fff5f5' : 'var(--gray-100)',
                      border: `1.5px solid ${count > 3 ? 'var(--accent)' : 'var(--gray-300)'}`,
                      borderRadius: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{username}</span>
                    <span style={{ fontSize: '0.85rem', color: count > 0 ? 'var(--accent)' : '#16a34a', fontWeight: 600 }}>
                      {count} anime not seen
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 1: Candidate Pool Table (Like Google Doc) */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                📋 Candidate Anime Pool (Answerable by ≥ 2 Contestants)
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--gray-800)' }}>
                Click an anime to cross it off as used. Click ✏️ to rename or group seasons into a series.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))`, gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {columns.map(col => (
                <div
                  key={col.key}
                  style={{
                    background: 'var(--background)',
                    borderRadius: '6px',
                    border: '1px solid var(--gray-300)',
                    padding: '0.8rem',
                    maxHeight: '480px',
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', borderBottom: '2px solid var(--primary)', paddingBottom: '6px', marginBottom: '8px', color: 'var(--primary-dark)' }}>
                    {col.label} ({col.items.length})
                  </div>
                  {col.items.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray-800)', fontStyle: 'italic', padding: '8px 0' }}>None</div>
                  ) : (
                    <ol style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.85rem' }}>
                      {col.items.map(item => {
                        const isCrossed = plan.crossedOffAnimeIds.includes(item.id);
                        const isEditing = editingTitleId === item.id;

                        return (
                          <li
                            key={item.id}
                            style={{
                              marginBottom: '6px',
                              textDecoration: isCrossed ? 'line-through' : 'none',
                              opacity: isCrossed ? 0.45 : 1,
                            }}
                          >
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                                <input
                                  type="text"
                                  value={titleDraft}
                                  onChange={(e) => setTitleDraft(e.target.value)}
                                  placeholder="Series display name..."
                                  style={{ width: '100%', padding: '2px 4px', fontSize: '0.8rem' }}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveTitleOverride(item.id);
                                    if (e.key === 'Escape') setEditingTitleId(null);
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => saveTitleOverride(item.id)}
                                  style={{ padding: '2px 6px', fontSize: '0.75rem', background: 'var(--primary)', color: 'white' }}
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                <span
                                  onClick={() => toggleCrossedOff(item.id)}
                                  style={{ cursor: 'pointer', fontWeight: 500 }}
                                  title="Click to cross off / uncross"
                                >
                                  {item.displayTitle}
                                </span>
                                {item.userProgressInfo && Object.entries(item.userProgressInfo).length > 0 && (
                                  <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>
                                    ({Object.entries(item.userProgressInfo).map(([u, p]) => `${u} ${p}`).join(', ')})
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTitleId(item.id);
                                    setTitleDraft(item.displayTitle);
                                  }}
                                  title="Rename / group series (e.g. 'AoT (S1 only)')"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '0 2px',
                                    fontSize: '0.7rem',
                                    cursor: 'pointer',
                                    opacity: 0.6,
                                  }}
                                >
                                  ✏️
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Questions List & Builder */}
          <div style={{ background: 'var(--background)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--gray-300)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.8rem' }}>
              ✍️ Questions & Associated Anime ({plan.questions.length})
            </h3>

            {/* Question Creation Box */}
            <div style={{ background: 'var(--gray-100)', padding: '1rem', borderRadius: '6px', marginBottom: '1.2rem', border: '1px solid var(--gray-300)' }}>
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                <input
                  type="text"
                  placeholder="Question text or topic (e.g. 'Opening theme trivia #1' or 'Who voiced this character?')..."
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  style={{ flex: 2, minWidth: '240px', padding: '8px 10px', fontSize: '0.9rem' }}
                />

                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                  <input
                    type="text"
                    placeholder="Search candidate anime to link..."
                    value={newQuestionAnimeSearch}
                    onChange={(e) => setNewQuestionAnimeSearch(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.9rem' }}
                  />
                  {filteredSearchCandidates.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'var(--background)',
                        border: '1px solid var(--primary)',
                        borderRadius: '4px',
                        zIndex: 30,
                        maxHeight: '180px',
                        overflowY: 'auto',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
                      }}
                    >
                      {filteredSearchCandidates.map(c => (
                        <div
                          key={c.id}
                          onClick={() => {
                            if (!selectedAnimeForNewQ.some(a => a.id === c.id)) {
                              setSelectedAnimeForNewQ([...selectedAnimeForNewQ, c]);
                            }
                            setNewQuestionAnimeSearch('');
                          }}
                          style={{
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            borderBottom: '1px solid var(--gray-200)',
                          }}
                        >
                          <strong>{c.displayTitle}</strong>
                          {c.unseenUsers.length > 0 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', marginLeft: '6px' }}>
                              (Unseen: {c.unseenUsers.join(', ')})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAddQuestion}
                  style={{
                    background: 'var(--primary)',
                    color: 'white',
                    padding: '8px 16px',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    borderRadius: 'var(--border-radius)',
                  }}
                >
                  + Add Question
                </button>
              </div>

              {/* Selected Anime Badges for new question */}
              {selectedAnimeForNewQ.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--gray-800)' }}>Linked Anime:</span>
                  {selectedAnimeForNewQ.map(a => (
                    <span
                      key={a.id}
                      style={{
                        background: 'var(--primary)',
                        color: 'white',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>{a.displayTitle}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedAnimeForNewQ(selectedAnimeForNewQ.filter(x => x.id !== a.id))}
                        style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0 }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Planned Questions List */}
            {plan.questions.length === 0 ? (
              <div style={{ fontSize: '0.9rem', color: 'var(--gray-800)', fontStyle: 'italic', padding: '1rem 0' }}>
                No questions added yet. Link anime from the pool above or add questions manually.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {plan.questions.map((q, idx) => (
                  <div
                    key={q.id}
                    style={{
                      background: 'var(--gray-100)',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      border: '1px solid var(--gray-300)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.8rem',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '4px' }}>
                        {idx + 1}. {q.text}
                      </div>
                      {q.animeTitles.length > 0 && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--primary-dark)', marginBottom: '4px' }}>
                          🎬 {q.animeTitles.join(', ')}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--gray-800)' }}>Cannot answer:</span>
                        {loadedUsernames.map(username => {
                          const isUnseen = q.unseenUsers.includes(username);
                          return (
                            <button
                              key={username}
                              type="button"
                              onClick={() => toggleQuestionUnseenUser(q.id, username)}
                              title={`Click to toggle whether ${username} cannot answer this question`}
                              style={{
                                padding: '2px 8px',
                                fontSize: '0.75rem',
                                borderRadius: '10px',
                                background: isUnseen ? '#fed7d7' : 'var(--gray-200)',
                                color: isUnseen ? '#c53030' : 'var(--gray-800)',
                                border: `1px solid ${isUnseen ? '#feb2b2' : 'var(--gray-300)'}`,
                                cursor: 'pointer',
                                fontWeight: isUnseen ? 'bold' : 'normal',
                              }}
                            >
                              {isUnseen ? `✕ ${username}` : username}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(q.id)}
                      title="Delete question"
                      style={{
                        background: 'none',
                        color: 'var(--accent)',
                        fontSize: '1rem',
                        padding: '4px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
