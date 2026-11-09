'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import type { GameSession, PlannedQuestion, SessionPlan, AnimeGroup } from '@/types/session';
import type { AnimeEntry, AnimeStatus, UserStatusData } from '@/utils/anilist';

interface GamePlannerProps {
  session: GameSession;
  onSessionChange: (patch: Partial<GameSession>) => void;
  cachedUserData: UserStatusData[];
}

interface CandidateItem {
  id: string; // "anime-{id}" or "grp-{id}"
  animeIds: number[];
  groupId?: string;
  originalTitles: string[];
  displayTitle: string;
  seenUsers: string[];
  unseenUsers: string[];
  isEveryone: boolean;
  userProgressInfo?: Record<string, string>;
  isGroup: boolean;
}

export default function GamePlanner({ session, onSessionChange, cachedUserData }: GamePlannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Column height for resizable candidate pool
  const [columnHeight, setColumnHeight] = useState(1170);
  const dragStartRef = useRef<{ y: number; h: number } | null>(null);

  // Per-column grouping mode; all columns stay open by default until the user closes them.
  const [groupOpenColumns, setGroupOpenColumns] = useState<string[]>(() => ['everyone', ...cachedUserData.map(u => u.username)]);
  const [selectedIdsForGroup, setSelectedIdsForGroup] = useState<number[]>([]);
  const [groupCustomName, setGroupCustomName] = useState('');
  
  // Question creation state
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionAnimeSearch, setNewQuestionAnimeSearch] = useState('');
  const [selectedCandidatesForNewQ, setSelectedCandidatesForNewQ] = useState<CandidateItem[]>([]);
  const [manualUnseenUsers, setManualUnseenUsers] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const plan: SessionPlan = session.plan || {
    questions: [],
    crossedOffAnimeIds: [],
    crossedOffGroupIds: [],
    groups: [],
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

  useEffect(() => {
    setGroupOpenColumns(prev => {
      const valid = prev.filter(key => key === 'everyone' || loadedUsernames.includes(key));
      if (valid.length > 0) return valid;
      return ['everyone', ...loadedUsernames];
    });
  }, [loadedUsernames]);

  // If plan.plannerUsernames is defined and has valid names, use only those; otherwise default to all loadedUsernames
  const activePlannerUsernames = useMemo(() => {
    if (plan.plannerUsernames && plan.plannerUsernames.length > 0) {
      const valid = plan.plannerUsernames.filter(u => loadedUsernames.includes(u));
      if (valid.length > 0) return valid;
    }
    return loadedUsernames;
  }, [plan.plannerUsernames, loadedUsernames]);

  const togglePlannerUser = (username: string) => {
    const current = activePlannerUsernames;
    let next: string[];
    if (current.includes(username)) {
      next = current.filter(u => u !== username);
    } else {
      next = [...current, username];
    }
    updatePlan({ plannerUsernames: next });
  };

  const selectAllPlannerUsers = () => {
    updatePlan({ plannerUsernames: [...loadedUsernames] });
  };

  // Build a lookup of anime by id from cachedUserData
  const rawAnimeMap = useMemo(() => {
    const map = new Map<number, {
      id: number;
      title: string;
      seenUsers: string[];
      progressMap: Record<string, string>;
    }>();

    cachedUserData
      .filter(user => activePlannerUsernames.includes(user.username))
      .forEach(user => {
        session.activeStatuses.forEach(status => {
          const list = user.statusData[status] || [];
          list.forEach(entry => {
            if (!map.has(entry.id)) {
              map.set(entry.id, {
                id: entry.id,
                title: entry.title,
                seenUsers: [],
                progressMap: {},
              });
            }
            const item = map.get(entry.id)!;
            if (!item.seenUsers.includes(user.username)) {
              item.seenUsers.push(user.username);
              if (entry.userProgress !== null && entry.userProgress !== undefined && status !== 'COMPLETED') {
                item.progressMap[user.username] = `${entry.userProgress} eps`;
              }
            }
          });
        });
      });

    return map;
  }, [cachedUserData, activePlannerUsernames, session.activeStatuses]);

  // Compute all anime / merged groups in the candidate pool
  const candidatePool = useMemo(() => {
    if (activePlannerUsernames.length < 2) return [];

    const groups = plan.groups || [];
    const groupedAnimeIdSet = new Set<number>();
    groups.forEach(g => {
      g.animeIds.forEach(id => groupedAnimeIdSet.add(id));
    });

    const results: CandidateItem[] = [];

    // 1. Process custom groups first
    groups.forEach(group => {
      const seenSet = new Set<string>();
      const combinedProgress: Record<string, string> = {};
      const titles: string[] = [];

      group.animeIds.forEach(id => {
        const item = rawAnimeMap.get(id);
        if (item) {
          titles.push(item.title);
          item.seenUsers.forEach(u => seenSet.add(u));
          Object.entries(item.progressMap).forEach(([u, p]) => {
            combinedProgress[u] = p;
          });
        }
      });

      const seenUsers = Array.from(seenSet);
      const unseenUsers = activePlannerUsernames.filter(u => !seenSet.has(u));

      if (seenUsers.length >= 2 && unseenUsers.length <= 1) {
        results.push({
          id: group.id,
          animeIds: group.animeIds,
          groupId: group.id,
          originalTitles: titles,
          displayTitle: group.customTitle,
          seenUsers,
          unseenUsers,
          isEveryone: unseenUsers.length === 0,
          userProgressInfo: combinedProgress,
          isGroup: true,
        });
      }
    });

    // 2. Process non-grouped individual anime
    rawAnimeMap.forEach(item => {
      if (groupedAnimeIdSet.has(item.id)) return; // Part of a merged group already

      const unseen = activePlannerUsernames.filter(u => !item.seenUsers.includes(u));

      if (item.seenUsers.length >= 2 && unseen.length <= 1) {
        const override = plan.titleOverrides[item.id];
        results.push({
          id: `anime-${item.id}`,
          animeIds: [item.id],
          originalTitles: [item.title],
          displayTitle: override || item.title,
          seenUsers: item.seenUsers,
          unseenUsers: unseen,
          isEveryone: unseen.length === 0,
          userProgressInfo: item.progressMap,
          isGroup: false,
        });
      }
    });

    return results.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));
  }, [rawAnimeMap, activePlannerUsernames, plan.groups, plan.titleOverrides]);

  // Group candidate pool by column: EVERYONE, and NO [User]
  const columns = useMemo(() => {
    const cols: { key: string; label: string; items: CandidateItem[] }[] = [
      {
        key: 'everyone',
        label: 'EVERYONE',
        items: candidatePool.filter(c => c.isEveryone),
      },
    ];

    activePlannerUsernames.forEach(username => {
      cols.push({
        key: username,
        label: `NO ${username.toUpperCase()}`,
        items: candidatePool.filter(c => !c.isEveryone && c.unseenUsers.includes(username)),
      });
    });

    return cols;
  }, [candidatePool, activePlannerUsernames]);

  // Tally unfairness counter
  const unseenQuestionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    activePlannerUsernames.forEach(u => { counts[u] = 0; });

    plan.questions.forEach(q => {
      q.unseenUsers.forEach(u => {
        if (counts[u] !== undefined) {
          counts[u] += 1;
        }
      });
    });

    return counts;
  }, [activePlannerUsernames, plan.questions]);

  // Check if candidate item is crossed off
  const isCandidateCrossedOff = (candidate: CandidateItem) => {
    if (candidate.isGroup && candidate.groupId) {
      if (plan.crossedOffGroupIds?.includes(candidate.groupId)) return true;
      return candidate.animeIds.some(id => plan.crossedOffAnimeIds.includes(id));
    }
    return candidate.animeIds.some(id => plan.crossedOffAnimeIds.includes(id));
  };

  // Toggle crossed off for candidate item
  const toggleCandidateCrossedOff = (candidate: CandidateItem) => {
    const isCurrentlyCrossed = isCandidateCrossedOff(candidate);

    if (candidate.isGroup && candidate.groupId) {
      const currentGroupCrossed = plan.crossedOffGroupIds || [];
      const nextGroupCrossed = isCurrentlyCrossed
        ? currentGroupCrossed.filter(gid => gid !== candidate.groupId)
        : [...currentGroupCrossed, candidate.groupId];

      const currentAnimeCrossed = plan.crossedOffAnimeIds || [];
      const nextAnimeCrossed = isCurrentlyCrossed
        ? currentAnimeCrossed.filter(id => !candidate.animeIds.includes(id))
        : Array.from(new Set([...currentAnimeCrossed, ...candidate.animeIds]));

      updatePlan({
        crossedOffGroupIds: nextGroupCrossed,
        crossedOffAnimeIds: nextAnimeCrossed,
      });
    } else {
      const animeId = candidate.animeIds[0];
      const currentCrossed = plan.crossedOffAnimeIds || [];
      const nextCrossed = isCurrentlyCrossed
        ? currentCrossed.filter(id => id !== animeId)
        : [...currentCrossed, animeId];
      updatePlan({ crossedOffAnimeIds: nextCrossed });
    }
  };

  // Create combined anime group
  const handleCreateGroup = () => {
    if (selectedIdsForGroup.length < 2) {
      alert('Please select at least 2 anime entries to group together.');
      return;
    }
    const name = groupCustomName.trim();
    if (!name) {
      alert('Please provide a name for this combined entry.');
      return;
    }

    const newGroup: AnimeGroup = {
      id: `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      customTitle: name,
      animeIds: [...selectedIdsForGroup],
    };

    updatePlan({
      groups: [...(plan.groups || []), newGroup],
    });

    setSelectedIdsForGroup([]);
    setGroupCustomName('');
  };

  // Disband / ungroup an anime group
  const handleUngroup = (groupId: string) => {
    const nextGroups = (plan.groups || []).filter(g => g.id !== groupId);
    const nextGroupCrossed = (plan.crossedOffGroupIds || []).filter(gid => gid !== groupId);
    updatePlan({
      groups: nextGroups,
      crossedOffGroupIds: nextGroupCrossed,
    });
  };

  // Add question
  const handleAddQuestion = () => {
    if (!newQuestionText.trim() && selectedCandidatesForNewQ.length === 0) return;

    const allAnimeIds: number[] = [];
    const allTitles: string[] = [];
    const unionUnseen = new Set<string>(manualUnseenUsers);

    selectedCandidatesForNewQ.forEach(candidate => {
      candidate.animeIds.forEach(id => allAnimeIds.push(id));
      allTitles.push(candidate.displayTitle);
      candidate.unseenUsers.forEach(u => unionUnseen.add(u));
    });

    const newQ: PlannedQuestion = {
      id: crypto.randomUUID(),
      text: newQuestionText.trim() || `Question ${plan.questions.length + 1}`,
      animeIds: allAnimeIds,
      animeTitles: allTitles,
      unseenUsers: Array.from(unionUnseen),
    };

    // Cross off the items used
    const newlyCrossedAnime = new Set(plan.crossedOffAnimeIds);
    const newlyCrossedGroups = new Set(plan.crossedOffGroupIds || []);

    selectedCandidatesForNewQ.forEach(candidate => {
      candidate.animeIds.forEach(id => newlyCrossedAnime.add(id));
      if (candidate.isGroup && candidate.groupId) {
        newlyCrossedGroups.add(candidate.groupId);
      }
    });

    updatePlan({
      questions: [...plan.questions, newQ],
      crossedOffAnimeIds: Array.from(newlyCrossedAnime),
      crossedOffGroupIds: Array.from(newlyCrossedGroups),
    });

    setNewQuestionText('');
    setSelectedCandidatesForNewQ([]);
    setManualUnseenUsers([]);
    setNewQuestionAnimeSearch('');
  };

  const handleDeleteQuestion = (questionId: string) => {
    updatePlan({
      questions: plan.questions.filter(q => q.id !== questionId),
    });
  };

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

  const exportPlanJson = () => {
    const data = {
      version: '2.0',
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
            plannerUsernames: Array.isArray(importedPlan.plannerUsernames) ? importedPlan.plannerUsernames : undefined,
            questions: importedPlan.questions,
            crossedOffAnimeIds: Array.isArray(importedPlan.crossedOffAnimeIds) ? importedPlan.crossedOffAnimeIds : [],
            crossedOffGroupIds: Array.isArray(importedPlan.crossedOffGroupIds) ? importedPlan.crossedOffGroupIds : [],
            groups: Array.isArray(importedPlan.groups) ? importedPlan.groups : [],
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

  // Search candidate suggestions for question builder
  const filteredSearchCandidates = useMemo(() => {
    if (!newQuestionAnimeSearch.trim()) return [];
    const q = newQuestionAnimeSearch.toLowerCase();
    return candidatePool
      .filter(c => c.displayTitle.toLowerCase().includes(q) || c.originalTitles.some(t => t.toLowerCase().includes(q)))
      .slice(0, 10);
  }, [newQuestionAnimeSearch, candidatePool]);

  // All individual anime available to select for grouping
  const allUngroupedAnime = useMemo(() => {
    const groupedIdSet = new Set<number>();
    (plan.groups || []).forEach(g => g.animeIds.forEach(id => groupedIdSet.add(id)));
    return Array.from(rawAnimeMap.values())
      .filter(item => !groupedIdSet.has(item.id))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [rawAnimeMap, plan.groups]);

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
          {/* Active Contestants for Game Planner Selector */}
          <div style={{ marginBottom: '1.5rem', background: 'var(--background)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--gray-300)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <h3 style={{ fontSize: '1.05rem', color: 'var(--primary-dark)', margin: 0 }}>
                🎮 Game Contestants ({activePlannerUsernames.length} of {loadedUsernames.length} active)
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {activePlannerUsernames.length < loadedUsernames.length && (
                  <button
                    type="button"
                    onClick={selectAllPlannerUsers}
                    style={{ background: 'none', color: 'var(--primary)', fontSize: '0.8rem', textDecoration: 'underline', padding: 0 }}
                  >
                    Select All
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-800)', marginBottom: '0.8rem' }}>
              Select which players are competing in this specific game. The Candidate Pool and Fairness Tracker will calculate based only on these selected players:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
              {loadedUsernames.map(username => {
                const isSelected = activePlannerUsernames.includes(username);
                return (
                  <label
                    key={username}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      cursor: 'pointer',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '0.85rem',
                      fontWeight: isSelected ? 600 : 'normal',
                      background: isSelected ? 'var(--primary)' : 'var(--gray-200)',
                      color: isSelected ? 'white' : 'var(--foreground)',
                      border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--gray-300)'}`,
                      userSelect: 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePlannerUser(username)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>{username}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Fairness Counters Banner */}
          <div style={{ marginBottom: '1.5rem', background: 'var(--background)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--gray-300)' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '0.6rem', color: 'var(--primary-dark)' }}>
              ⚖️ Contestant Question Fairness (Anime Not Seen by Player)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--gray-800)', marginBottom: '0.8rem' }}>
              Shows how many questions in this game each person <strong>cannot answer</strong>. Keep these numbers balanced across all contestants:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {activePlannerUsernames.map(username => {
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


          {/* Section 1: Candidate Pool Table */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                📋 Candidate Anime Pool (Answerable by ≥ 2 Contestants)
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--gray-800)' }}>
                Click an anime to cross it off (red strikethrough). Grouped entries count as 1.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(240px, 1fr))`, gap: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {columns.map(col => {
                return (
                  <div
                    key={col.key}
                    style={{
                      background: 'var(--background)',
                      borderRadius: '6px',
                      border: '1px solid var(--gray-300)',
                      display: 'flex',
                      flexDirection: 'column',
                      height: `${columnHeight}px`,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0.8rem' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9rem', borderBottom: '2px solid var(--primary)', paddingBottom: '6px', marginBottom: '8px', color: 'var(--primary-dark)' }}>
                        {col.label} ({col.items.length})
                      </div>
                      {col.items.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray-800)', fontStyle: 'italic', padding: '8px 0' }}>None</div>
                      ) : (
                        <ol style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.85rem' }}>
                          {col.items.map(item => {
                            const isCrossed = isCandidateCrossedOff(item);

                            return (
                              <li
                                key={item.id}
                                style={{
                                  marginBottom: '6px',
                                  opacity: isCrossed ? 0.65 : 1,
                                }}
                              >
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                  <span
                                    onClick={() => toggleCandidateCrossedOff(item)}
                                    style={{
                                      cursor: 'pointer',
                                      fontWeight: 500,
                                      textDecoration: isCrossed ? 'line-through' : 'none',
                                      textDecorationColor: isCrossed ? '#e53e3e' : undefined,
                                      textDecorationThickness: isCrossed ? '2px' : undefined,
                                      color: isCrossed ? 'var(--gray-800)' : 'inherit',
                                    }}
                                    title="Click to cross off / uncross"
                                  >
                                    {item.displayTitle}
                                  </span>

                                  {item.isGroup && (
                                    <span
                                      style={{
                                        fontSize: '0.65rem',
                                        background: 'var(--gray-200)',
                                        padding: '1px 5px',
                                        borderRadius: '8px',
                                        color: 'var(--primary-dark)',
                                        fontWeight: 600,
                                      }}
                                      title={`Combined group of ${item.animeIds.length} seasons`}
                                    >
                                      Group ({item.animeIds.length})
                                    </span>
                                  )}

                                  {item.userProgressInfo && Object.entries(item.userProgressInfo).length > 0 && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>
                                      ({Object.entries(item.userProgressInfo).map(([u, p]) => `${u} ${p}`).join(', ')})
                                    </span>
                                  )}

                                  {item.isGroup && item.groupId && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUngroup(item.groupId!);
                                      }}
                                      title="Ungroup this series back into individual entries"
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: '0 2px',
                                        fontSize: '0.7rem',
                                        cursor: 'pointer',
                                        opacity: 0.6,
                                      }}
                                    >
                                      🔓
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                    <div
                      onMouseDown={(e) => {
                        dragStartRef.current = { y: e.clientY, h: columnHeight };
                        const onMove = (ev: MouseEvent) => {
                          if (!dragStartRef.current) return;
                          const delta = ev.clientY - dragStartRef.current.y;
                          setColumnHeight(Math.max(200, dragStartRef.current.h + delta));
                        };
                        const onUp = () => {
                          dragStartRef.current = null;
                          window.removeEventListener('mousemove', onMove);
                          window.removeEventListener('mouseup', onUp);
                        };
                        window.addEventListener('mousemove', onMove);
                        window.addEventListener('mouseup', onUp);
                      }}
                      style={{
                        height: '12px',
                        background: 'var(--gray-200)',
                        borderTop: '1px solid var(--gray-300)',
                        cursor: 'ns-resize',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        userSelect: 'none',
                      }}
                      title="Drag to resize column height"
                    >
                      <span style={{ fontSize: '0.55rem', color: 'var(--gray-800)', opacity: 0.7, letterSpacing: '2px' }}>⠿</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(240px, 1fr))`, gap: '1rem', marginTop: '1rem' }}>
              {columns.map(col => {
                const groupedIdSet = new Set<number>();
                (plan.groups || []).forEach(g => g.animeIds.forEach(id => groupedIdSet.add(id)));
                const ungroupedForCol = col.items
                  .filter(item => !item.isGroup)
                  .flatMap(item => item.animeIds)
                  .filter(id => !groupedIdSet.has(id))
                  .map(id => rawAnimeMap.get(id))
                  .filter((a): a is NonNullable<typeof a> => !!a)
                  .sort((a, b) => a.title.localeCompare(b.title));
                const groupsInThisCol = (plan.groups || []).filter(g =>
                  col.items.some(item => item.isGroup && item.groupId === g.id)
                );
                const isColGroupMode = groupOpenColumns.includes(col.key);

                return (
                  <div
                    key={`${col.key}-group-box`}
                    style={{
                      background: 'var(--gray-100)',
                      border: '1px solid var(--gray-300)',
                      borderRadius: '6px',
                      padding: '0.75rem',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: 'var(--primary-dark)', marginBottom: '0.65rem' }}>
                      {col.label} Groupings
                    </div>

                    {groupsInThisCol.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '0.75rem' }}>
                        {groupsInThisCol.map(g => (
                          <span
                            key={g.id}
                            style={{
                              background: 'var(--gray-200)',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontSize: '0.72rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              border: '1px solid var(--gray-300)',
                            }}
                          >
                            <strong>{g.customTitle}</strong>
                            <button
                              type="button"
                              onClick={() => handleUngroup(g.id)}
                              title="Ungroup"
                              style={{ background: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontWeight: 'bold', fontSize: '0.85rem', lineHeight: 1 }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-800)', marginBottom: '0.75rem', fontStyle: 'italic' }}>
                        No groupings yet.
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setGroupOpenColumns(current =>
                          current.includes(col.key)
                            ? current.filter(key => key !== col.key)
                            : [...current, col.key]
                        );
                        setSelectedIdsForGroup([]);
                        setGroupCustomName('');
                      }}
                      style={{
                        background: isColGroupMode ? '#e53e3e' : 'var(--primary)',
                        color: 'white',
                        padding: '3px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: '4px',
                        width: '100%',
                        marginBottom: '0.5rem',
                      }}
                    >
                      {isColGroupMode ? '✕ Cancel' : '🔗 Group Seasons'}
                    </button>

                    {isColGroupMode && (
                      <div>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
                          <input
                            type="text"
                            placeholder="Series name..."
                            value={groupCustomName}
                            onChange={(e) => setGroupCustomName(e.target.value)}
                            style={{ flex: 1, padding: '4px 6px', fontSize: '0.75rem', minWidth: 0 }}
                          />
                          <button
                            type="button"
                            onClick={handleCreateGroup}
                            style={{
                              background: 'var(--primary)',
                              color: 'white',
                              padding: '4px 8px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              borderRadius: '4px',
                              flexShrink: 0,
                            }}
                          >
                            Combine ({selectedIdsForGroup.length})
                          </button>
                        </div>
                        <div style={{ maxHeight: '130px', overflowY: 'auto', background: 'var(--background)', padding: '4px', borderRadius: '4px', border: '1px solid var(--gray-300)' }}>
                          {ungroupedForCol.length === 0 ? (
                            <div style={{ fontSize: '0.75rem', color: 'var(--gray-800)', fontStyle: 'italic', padding: '4px' }}>No ungrouped entries in this column</div>
                          ) : ungroupedForCol.map(a => {
                            const isChecked = selectedIdsForGroup.includes(a.id);
                            return (
                              <label
                                key={a.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                  padding: '2px 3px',
                                  borderRadius: '3px',
                                  background: isChecked ? 'rgba(61, 180, 242, 0.15)' : 'transparent',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setSelectedIdsForGroup(selectedIdsForGroup.filter(id => id !== a.id));
                                    } else {
                                      setSelectedIdsForGroup([...selectedIdsForGroup, a.id]);
                                      if (!groupCustomName.trim()) {
                                        setGroupCustomName(a.title);
                                      }
                                    }
                                  }}
                                />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.title}>
                                  {a.title}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
                        maxHeight: '200px',
                        overflowY: 'auto',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
                      }}
                    >
                      {filteredSearchCandidates.map(c => (
                        <div
                          key={c.id}
                          onClick={() => {
                            if (!selectedCandidatesForNewQ.some(a => a.id === c.id)) {
                              setSelectedCandidatesForNewQ([...selectedCandidatesForNewQ, c]);
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
                          {c.isGroup && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--primary)', marginLeft: '4px' }}>
                              [Group]
                            </span>
                          )}
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
              {selectedCandidatesForNewQ.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--gray-800)' }}>Linked Anime:</span>
                  {selectedCandidatesForNewQ.map(a => (
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
                        onClick={() => setSelectedCandidatesForNewQ(selectedCandidatesForNewQ.filter(x => x.id !== a.id))}
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
                        {activePlannerUsernames.map(username => {
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
