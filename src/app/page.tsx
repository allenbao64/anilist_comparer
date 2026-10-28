'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchAllUserData, AnimeStatus, UserStatusData } from '@/utils/anilist';
import { GameSession } from '@/types/session';
import SessionShell, { type WorkspaceProps } from '@/components/shell';

const STATUS_OPTIONS: { label: string; value: AnimeStatus }[] = [
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Watching', value: 'CURRENT' },
  { label: 'Plan to Watch', value: 'PLANNING' },
  { label: 'Dropped', value: 'DROPPED' },
  { label: 'Paused', value: 'PAUSED' },
];

const STATUS_ICONS: Record<AnimeStatus, string> = {
  COMPLETED: '✅',
  CURRENT: '📺',
  PLANNING: '⏳',
  DROPPED: '❌',
  PAUSED: '⏸️',
  REPEATING: '🔁',
};

const FORMAT_OPTIONS: { label: string; value: string }[] = [
  { label: 'TV Show', value: 'TV' },
  { label: 'Movie', value: 'MOVIE' },
  { label: 'TV Short', value: 'TV_SHORT' },
  { label: 'OVA', value: 'OVA' },
  { label: 'ONA', value: 'ONA' },
  { label: 'Special', value: 'SPECIAL' },
  { label: 'Music', value: 'MUSIC' },
];

const FORMAT_LABELS: Record<string, string> = {
  TV: 'TV Show',
  TV_SHORT: 'TV Short',
  MOVIE: 'Movie',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Music',
};

function UntilFound({
  collapsed,
  onReveal,
  children,
}: {
  collapsed: boolean;
  onReveal: () => void;
  children: ReactNode;
}) {
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const bindingRef = useRef<{ node: HTMLDivElement; handler: () => void } | null>(null);

  const bind = useCallback((node: HTMLDivElement | null) => {
    const prev = bindingRef.current;
    if (prev) {
      prev.node.removeEventListener('beforematch', prev.handler);
      bindingRef.current = null;
    }
    if (!node) return;

    if (collapsed) {
      node.setAttribute('hidden', 'until-found');
      const handler = () => onRevealRef.current();
      node.addEventListener('beforematch', handler);
      bindingRef.current = { node, handler };
    } else {
      node.removeAttribute('hidden');
    }
  }, [collapsed]);

  return <div ref={bind}>{children}</div>;
}

export function Home({
  session,
  onSessionChange,
  availableGenres,
  availableTags,
  suggestedUserList,
}: WorkspaceProps) {
  const [activeUserIndex, setActiveUserIndex] = useState<number | null>(null);
  const [userSuggestions, setUserSuggestions] = useState<string[]>([]);
  const [cachedUserData, setCachedUserData] = useState<UserStatusData[]>([]);
  const [userLastUpdated, setUserLastUpdated] = useState<Record<string, number>>({});
  const [userUpdatesBehind, setUserUpdatesBehind] = useState<Record<string, number | null>>({});
  const [syncingUsers, setSyncingUsers] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const abortLoadingRef = useRef(false);

  const {
    usernames,
    fetchStatuses,
    activeStatuses,
    requiredUsers,
    selectedGenres,
    selectedTags,
    selectedFormats,
    minEpisodes,
    maxEpisodes,
    minYear,
    maxYear,
    sortBy,
  } = session;

  const patch = (next: Partial<GameSession>) => onSessionChange(next);

  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  const toggleFormat = (format: string) => {
    if (selectedFormats.includes(format)) {
      patch({ selectedFormats: selectedFormats.filter(f => f !== format) });
    } else {
      patch({ selectedFormats: [...selectedFormats, format] });
    }
  };

  // Display Options
  const [showAllDetails, setShowAllDetails] = useState(false);
  const [customExpanded, setCustomExpanded] = useState<Record<number, boolean>>({});

  const toggleAnimeDetails = (id: number) => {
    setCustomExpanded(prev => {
      const isCurrentlyExpanded = prev[id] ?? showAllDetails;
      return { ...prev, [id]: !isCurrentlyExpanded };
    });
  };

  const toggleAllDetails = () => {
    setShowAllDetails(prev => !prev);
    setCustomExpanded({});
  };

  // Update tag suggestions when input changes
  useEffect(() => {
    if (tagInput.trim().length > 1) {
      const filtered = availableTags
        .filter(tag => tag.toLowerCase().includes(tagInput.toLowerCase()) && !selectedTags.includes(tag))
        .slice(0, 10);
      setTagSuggestions(filtered);
    } else {
      setTagSuggestions([]);
    }
  }, [tagInput, availableTags, selectedTags]);

  const toggleFetchStatus = (status: AnimeStatus) => {
    if (fetchStatuses.includes(status)) {
      if (fetchStatuses.length > 1) {
        patch({ fetchStatuses: fetchStatuses.filter(s => s !== status) });
      }
    } else {
      patch({ fetchStatuses: [...fetchStatuses, status] });
    }
  };

  const addUser = () => {
    if (usernames.length < 10) {
      patch({ usernames: [...usernames, ''] });
    }
  };

  const removeUser = (index: number) => {
    const newUsers = [...usernames];
    newUsers.splice(index, 1);
    patch({ usernames: newUsers });
  };

  const updateUsername = (index: number, value: string) => {
    const newUsers = [...usernames];
    newUsers[index] = value;
    patch({ usernames: newUsers });
    showUserSuggestions(index, value);
  };

  const showUserSuggestions = (index: number, value: string) => {
    const filtered = suggestedUserList.filter(u => 
      u.toLowerCase().includes(value.toLowerCase()) && 
      !usernames.includes(u)
    );
    setUserSuggestions(filtered);
    setActiveUserIndex(index);
  };

  const selectUserSuggestion = (index: number, username: string) => {
    const newUsers = [...usernames];
    newUsers[index] = username;
    patch({ usernames: newUsers });
    setUserSuggestions([]);
    setActiveUserIndex(null);
  };

  const toggleStatusFilter = (status: AnimeStatus) => {
    if (activeStatuses.includes(status)) {
      if (activeStatuses.length > 1) {
        patch({ activeStatuses: activeStatuses.filter(s => s !== status) });
      }
    } else {
      patch({ activeStatuses: [...activeStatuses, status] });
    }
  };

  const toggleRequiredUser = (username: string) => {
    if (requiredUsers.includes(username)) {
      patch({ requiredUsers: requiredUsers.filter(u => u !== username) });
    } else {
      patch({ requiredUsers: [...requiredUsers, username] });
    }
  };

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      patch({ selectedGenres: selectedGenres.filter(g => g !== genre) });
    } else {
      patch({ selectedGenres: [...selectedGenres, genre] });
    }
  };

  const addTag = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      patch({ selectedTags: [...selectedTags, tag] });
    }
    setTagInput('');
    setTagSuggestions([]);
  };

  const removeTag = (tag: string) => {
    patch({ selectedTags: selectedTags.filter(t => t !== tag) });
  };

  const reset = () => {
    patch({
      usernames: ['', '', '', ''],
      requiredUsers: [],
      selectedGenres: [],
      selectedTags: [],
      selectedFormats: [],
      minEpisodes: '',
      maxEpisodes: '',
      minYear: '',
      maxYear: '',
    });
    setCachedUserData([]);
    setErrors([]);
    setTagInput('');
    setIsLoading(false);
    setProgressMessage('');
    abortLoadingRef.current = false;
  };

  const stopLoading = () => {
    abortLoadingRef.current = true;
    setProgressMessage('Stopping...');
  };

  const formatLastUpdated = (timestampSec?: number) => {
    if (!timestampSec) return null;
    const date = new Date(timestampSec * 1000);
    const now = Date.now();
    const diffMin = Math.floor((now - date.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const syncSpecificUsers = async (targetUsernames: string[], forceFull = false) => {
    if (targetUsernames.length === 0) return;
    
    // Mark these users as syncing
    setSyncingUsers(prev => {
      const next = { ...prev };
      targetUsernames.forEach(u => { next[u] = true; });
      return next;
    });

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: targetUsernames, forceFullRefresh: forceFull }),
      });

      if (!res.ok) {
        throw new Error(`Sync failed with status ${res.status}`);
      }

      const data = await res.json();
      if (data.users && Array.isArray(data.users)) {
        // Update cachedUserData state
        setCachedUserData(prev => {
          const map = new Map(prev.map(item => [item.username.toLowerCase(), item]));
          data.users.forEach((updated: any) => {
            map.set(updated.username.toLowerCase(), {
              username: updated.username,
              statusData: updated.statusData,
            });
          });
          return Array.from(map.values());
        });

        // Update timestamps and reset updates behind
        setUserLastUpdated(prev => {
          const next = { ...prev };
          data.users.forEach((updated: any) => {
            next[updated.username] = updated.lastUpdated;
          });
          return next;
        });

        setUserUpdatesBehind(prev => {
          const next = { ...prev };
          data.users.forEach((updated: any) => {
            next[updated.username] = 0; // Just synced with live AniList!
          });
          return next;
        });
      }

      if (data.errors && Object.keys(data.errors).length > 0) {
        const errorList = Object.entries(data.errors).map(([u, e]) => `${u}: ${e}`);
        setErrors(prev => [...prev, ...errorList]);
      }
    } catch (err: any) {
      console.error('Error during sync:', err);
      setErrors(prev => [...prev, `Sync error: ${err.message || 'Unknown'}`]);
    } finally {
      setSyncingUsers(prev => {
        const next = { ...prev };
        targetUsernames.forEach(u => { delete next[u]; });
        return next;
      });
    }
  };

  const startGrandLoad = async (opts?: { preserveFilters?: boolean }) => {
    const validUsernames = usernames.filter(u => u.trim() !== '');
    if (validUsernames.length < 1) {
      setErrors(['Please enter at least one username.']);
      return;
    }

    setIsLoading(true);
    setErrors([]);
    setProgressMessage('Checking cached lists...');
    abortLoadingRef.current = false;
    
    if (!opts?.preserveFilters) {
      patch({ activeStatuses: [...fetchStatuses] });
    }
    
    const results: UserStatusData[] = [];
    const timestamps: Record<string, number> = {};
    const updatesBehindMap: Record<string, number | null> = {};
    const missingUsernames: string[] = [];

    // Step 1: Check server cache via /api/users (with checkFreshness=true)
    try {
      const checkRes = await fetch(`/api/users?users=${encodeURIComponent(validUsernames.join(','))}&checkFreshness=true`);
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.users && Array.isArray(checkData.users)) {
          const foundMap = new Map<string, any>();
          checkData.users.forEach((u: any) => {
            foundMap.set(u.username.toLowerCase(), u);
          });

          for (const username of validUsernames) {
            const found = foundMap.get(username.toLowerCase());
            if (found && found.statusData) {
              results.push({ username: found.username, statusData: found.statusData });
              timestamps[found.username] = found.lastUpdated;
              updatesBehindMap[found.username] = typeof found.updatesBehind === 'number' ? found.updatesBehind : null;
            } else {
              missingUsernames.push(username);
            }
          }
        } else {
          missingUsernames.push(...validUsernames);
        }
      } else {
        missingUsernames.push(...validUsernames);
      }
    } catch (e) {
      console.warn('Could not contact /api/users, will sync or fetch directly:', e);
      missingUsernames.push(...validUsernames);
    }

    // Step 2: If any users were missing from cache, sync them
    if (missingUsernames.length > 0 && !abortLoadingRef.current) {
      setProgressMessage(`Syncing ${missingUsernames.length} user(s) from AniList...`);
      try {
        const syncRes = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames: missingUsernames }),
        });

        if (syncRes.ok) {
          const syncData = await syncRes.json();
          if (syncData.users && Array.isArray(syncData.users)) {
            const syncedMap = new Map<string, any>();
            syncData.users.forEach((u: any) => {
              syncedMap.set(u.username.toLowerCase(), u);
            });

            const stillMissing: string[] = [];
            for (const username of missingUsernames) {
              const synced = syncedMap.get(username.toLowerCase());
              if (synced && synced.statusData) {
                results.push({ username: synced.username, statusData: synced.statusData });
                timestamps[synced.username] = synced.lastUpdated;
                updatesBehindMap[synced.username] = 0; // Newly synced
              } else {
                stillMissing.push(username);
              }
            }

            // If some failed via server sync, fallback to direct client-side fetch for them
            if (stillMissing.length > 0 && !abortLoadingRef.current) {
              await clientSideFetchFallback(stillMissing, results);
            }
          } else {
            await clientSideFetchFallback(missingUsernames, results);
          }
        } else {
          await clientSideFetchFallback(missingUsernames, results);
        }
      } catch (e) {
        console.warn('Sync route failed, falling back to client-side AniList:', e);
        await clientSideFetchFallback(missingUsernames, results);
      }
    }

    setCachedUserData(results);
    setUserLastUpdated(timestamps);
    setUserUpdatesBehind(updatesBehindMap);
    if (!opts?.preserveFilters) {
      patch({ requiredUsers: results.map(r => r.username) });
    }
    setIsLoading(false);
    setProgressMessage('');
  };

  const clientSideFetchFallback = async (usernamesToFetch: string[], results: UserStatusData[]) => {
    let pending = [...usernamesToFetch];
    const fatalErrors: string[] = [];

    while (pending.length > 0 && !abortLoadingRef.current) {
      const current = pending[0];
      try {
        const statusData = await fetchAllUserData(current, fetchStatuses, (msg) => {
          setProgressMessage(msg);
        });
        results.push({ username: current, statusData });
        pending.shift();
      } catch (err: any) {
        const errMsg = err.message || '';
        if (errMsg.includes('FATAL')) {
          fatalErrors.push(`${current}: User not found or private.`);
          pending.shift();
        } else {
          for (let i = 5; i > 0; i--) {
            if (abortLoadingRef.current) break;
            setProgressMessage(`Error with ${current}. Retrying in ${i}s...`);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    }

    if (fatalErrors.length > 0) {
      setErrors(prev => [...prev, ...fatalErrors]);
    }
  };

  const autoLoadStarted = useRef(false);
  useEffect(() => {
    if (autoLoadStarted.current) return;
    if (!usernames.some(u => u.trim() !== '')) return;
    autoLoadStarted.current = true;
    void startGrandLoad({ preserveFilters: true });
    // Mount-only: session.id keys the workspace so switching games remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredResults = useMemo(() => {
    if (cachedUserData.length === 0) return [];

    const animeMap = new Map<number, { 
      id: number; 
      title: string; 
      userStatuses: Record<string, AnimeStatus>; 
      userScores: Record<string, number | null>;
      userProgresses: Record<string, number | null>;
      genres: string[]; 
      tags: string[];
      year: number | null;
      episodes: number | null;
      format: string | null;
      averageScore: number | null;
      popularity: number | null;
    }>();

    cachedUserData.forEach(user => {
      activeStatuses.forEach(status => {
        if (user.statusData[status]) {
          user.statusData[status].forEach(entry => {
            if (!animeMap.has(entry.id)) {
              animeMap.set(entry.id, { 
                id: entry.id,
                title: entry.title, 
                userStatuses: {},
                userScores: {},
                userProgresses: {},
                genres: entry.genres, 
                tags: entry.tags,
                year: entry.year,
                episodes: entry.episodes,
                format: entry.format,
                averageScore: entry.averageScore,
                popularity: entry.popularity,
              });
            }
            const item = animeMap.get(entry.id)!;
            item.userStatuses[user.username] = status;
            item.userScores[user.username] = entry.userScore;
            item.userProgresses[user.username] = entry.userProgress;
          });
        }
      });
    });

    const parsedMinYear = minYear.trim() !== '' ? parseInt(minYear, 10) : null;
    const parsedMaxYear = maxYear.trim() !== '' ? parseInt(maxYear, 10) : null;
    const parsedMinEp = minEpisodes.trim() !== '' ? parseInt(minEpisodes, 10) : null;
    const parsedMaxEp = maxEpisodes.trim() !== '' ? parseInt(maxEpisodes, 10) : null;

    return Array.from(animeMap.values())
      .filter(item => {
        // Must be seen by EVERY user in requiredUsers
        const matchesUsers = requiredUsers.every(reqUser => !!item.userStatuses[reqUser]);
        
        // If genres are selected, must match at least one
        const matchesGenres = selectedGenres.length === 0 || 
          selectedGenres.some(g => item.genres.includes(g));

        // If tags are selected, must match at least one
        const matchesTags = selectedTags.length === 0 || 
          selectedTags.some(t => item.tags.includes(t));

        // Release year range filter
        const matchesMinYear = parsedMinYear === null || (item.year !== null && item.year >= parsedMinYear);
        const matchesMaxYear = parsedMaxYear === null || (item.year !== null && item.year <= parsedMaxYear);
        const matchesYear = matchesMinYear && matchesMaxYear;

        // Episode count range filter
        const matchesMinEp = parsedMinEp === null || (item.episodes !== null && item.episodes >= parsedMinEp);
        const matchesMaxEp = parsedMaxEp === null || (item.episodes !== null && item.episodes <= parsedMaxEp);
        const matchesEpisodes = matchesMinEp && matchesMaxEp;

        // Format filter
        const matchesFormat = selectedFormats.length === 0 ||
          (item.format !== null && selectedFormats.includes(item.format));

        return matchesUsers && matchesGenres && matchesTags && matchesYear && matchesEpisodes && matchesFormat;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'averageScore':
            return (b.averageScore ?? -1) - (a.averageScore ?? -1);
          case 'year':
            return (b.year ?? 0) - (a.year ?? 0);
          case 'popularity':
            return (b.popularity ?? 0) - (a.popularity ?? 0);
          default:
            return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        }
      });
  }, [cachedUserData, activeStatuses, requiredUsers, selectedGenres, selectedTags, minYear, maxYear, minEpisodes, maxEpisodes, selectedFormats, sortBy]);

  const copyToClipboard = () => {
    if (filteredResults.length === 0) return;
    
    const userList = cachedUserData.map(u => u.username);
    const headers = ['Anime Title', ...userList];
    
    // Plain text version (TSV)
    const tsvRows = filteredResults.map(anime => {
      const userIcons = userList.map(username => {
        const status = anime.userStatuses[username];
        if (!status) return '';
        const score = anime.userScores[username];
        const progress = anime.userProgresses[username];
        const isNotCompleted = status !== 'COMPLETED';
        let text = STATUS_ICONS[status] || '';
        if (score) text += ` ${score}`;
        if (isNotCompleted && progress !== null && progress !== undefined) {
          text += ` (${progress} eps seen)`;
        }
        return text;
      });
      return [anime.title, ...userIcons].join('\t');
    });
    const tsvText = [headers.join('\t'), ...tsvRows].join('\n');

    // HTML version for better Google Docs/Word compatibility
    const htmlHeader = `<thead><tr>${headers.map(h => `<th style="border: 1px solid #ccc; padding: 8px; background: #eee;">${h}</th>`).join('')}</tr></thead>`;
    const htmlRows = filteredResults.map(anime => {
      const cells = [
        `<td style="border: 1px solid #ccc; padding: 8px;">${anime.title}</td>`,
        ...userList.map(username => {
          const status = anime.userStatuses[username];
          const icon = status ? STATUS_ICONS[status] : '';
          const score = anime.userScores[username];
          const progress = anime.userProgresses[username];
          const isNotCompleted = status && status !== 'COMPLETED';
          let content = icon;
          if (score) content += ` ${score}`;
          if (isNotCompleted && progress !== null && progress !== undefined) {
            content += `<div style="font-size: 0.65rem; color: #666;">${progress} eps seen</div>`;
          }
          return `<td style="border: 1px solid #ccc; padding: 8px; text-align: center; font-size: 1.1rem;">${content}</td>`;
        })
      ];
      return `<tr>${cells.join('')}</tr>`;
    }).join('');
    
    const htmlTable = `<table style="border-collapse: collapse; width: 100%; font-family: sans-serif;">${htmlHeader}<tbody>${htmlRows}</tbody></table>`;

    try {
      const blobText = new Blob([tsvText], { type: 'text/plain' });
      const blobHtml = new Blob([htmlTable], { type: 'text/html' });
      const data = [new ClipboardItem({
        'text/plain': blobText,
        'text/html': blobHtml
      })];
      
      navigator.clipboard.write(data).then(() => {
        alert('Copied to clipboard for table!');
      }).catch(err => {
        console.error('Could not copy to clipboard', err);
        // Fallback to text-only if write fails
        navigator.clipboard.writeText(tsvText);
        alert('Copied to clipboard (Text only fallback)');
      });
    } catch (e) {
      // Fallback for older browsers
      navigator.clipboard.writeText(tsvText);
      alert('Copied to clipboard (Text only fallback)');
    }
  };

  return (
    <>
      <section style={{ backgroundColor: 'var(--gray-100)', padding: '1.5rem', borderRadius: 'var(--border-radius)', marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Phase 1: Enter Contestants (Max 10)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {usernames.map((u, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
              <input
                type="search"
                placeholder={`User ${i + 1}`}
                value={u}
                onChange={(e) => updateUsername(i, e.target.value)}
                onFocus={(e) => showUserSuggestions(i, e.target.value)}
                onBlur={() => setTimeout(() => { if (activeUserIndex === i) setActiveUserIndex(null); }, 200)}
                style={{ width: '100%' }}
                disabled={isLoading}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-bitwarden-ignore="true"
                data-bwignore="true"
                data-lpignore="true"
                data-1p-ignore
              />
              {activeUserIndex === i && userSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  border: '2px solid var(--primary)',
                  borderRadius: '4px',
                  zIndex: 20,
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                  maxHeight: '150px',
                  overflowY: 'auto'
                }}>
                  {userSuggestions.map(suggestion => (
                    <div
                      key={suggestion}
                      onClick={() => selectUserSuggestion(i, suggestion)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--gray-300)',
                        fontSize: '0.9rem',
                        fontWeight: 'bold'
                      }}
                      className="suggestion-item"
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}
              {usernames.length > 2 && (
                <button 
                  onClick={() => removeUser(i)} 
                  disabled={isLoading}
                  style={{ background: 'var(--accent)', color: 'white', padding: '0 10px' }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {usernames.length < 10 && (
            <button 
              onClick={addUser} 
              disabled={isLoading}
              style={{ background: 'var(--gray-300)', padding: '8px 12px' }}
            >
              + Add User
            </button>
          )}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.8rem', fontSize: '1rem' }}>Statuses to Load</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {STATUS_OPTIONS.map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={fetchStatuses.includes(opt.value)}
                  onChange={() => toggleFetchStatus(opt.value)}
                  disabled={isLoading}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {!isLoading ? (
            <button
              onClick={() => startGrandLoad()}
              style={{
                background: 'var(--primary)',
                color: 'white',
                padding: '14px 28px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                flex: 1
              }}
            >
              Phase 1: Load All Data
            </button>
          ) : (
            <button
              onClick={stopLoading}
              style={{
                background: 'var(--accent)',
                color: 'white',
                padding: '14px 28px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                flex: 1
              }}
            >
              Stop Loading
            </button>
          )}
          <button onClick={reset} disabled={isLoading} style={{ background: 'var(--gray-300)', padding: '14px 28px' }}>Reset All</button>
        </div>

        {isLoading && (
          <div style={{ marginTop: '1.5rem', textAlign: 'center', padding: '1rem', background: 'white', borderRadius: '8px', border: '2px solid var(--primary)' }}>
            <div className="spinner" style={{ marginBottom: '0.5rem', fontSize: '2rem' }}>⏳</div>
            <div style={{ fontWeight: 'bold', color: 'var(--primary-dark)' }}>{progressMessage}</div>
            <p style={{ fontSize: '0.8rem', color: 'var(--gray-800)', marginTop: '0.5rem' }}>
              This may take a minute if contestants have large lists.
            </p>
          </div>
        )}

        {errors.length > 0 && (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fff5f5', border: '1px solid var(--accent)', borderRadius: 'var(--border-radius)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>⚠️ {errors.length} issue(s) occurred.</span>
              <button onClick={() => setShowErrorDetails(!showErrorDetails)} style={{ background: 'none', color: 'var(--primary)', padding: 0 }}>
                {showErrorDetails ? 'Hide' : 'Show Details'}
              </button>
            </div>
            {showErrorDetails && (
              <ul style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#c53030' }}>
                {errors.map((err, i) => <li key={i}>• {err}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Phase 2: The Filter Section */}
      {cachedUserData.length > 0 && (
        <section style={{ backgroundColor: 'var(--gray-200)', padding: '1.5rem', borderRadius: 'var(--border-radius)', marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '1.2rem', fontSize: '1.2rem', color: 'var(--primary-dark)' }}>Phase 2: Filters (Instant)</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.8rem' }}>Toggle Statuses</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
                {STATUS_OPTIONS.filter(opt => fetchStatuses.includes(opt.value)).map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={activeStatuses.includes(opt.value)}
                      onChange={() => toggleStatusFilter(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.8rem' }}>Required Contestants</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem' }}>
                {cachedUserData.map(user => (
                  <div key={user.username} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={requiredUsers.includes(user.username)}
                        onChange={() => toggleRequiredUser(user.username)}
                      />
                      <span>{user.username}</span>
                    </label>
                    <a
                      href={`https://anilist.co/user/${encodeURIComponent(user.username)}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`View ${user.username}'s AniList profile`}
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--primary)',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        opacity: 0.8
                      }}
                    >
                      ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.8rem' }}>Episode Count (Range)</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Min (e.g. 1)"
                  value={minEpisodes}
                  onChange={(e) => patch({ minEpisodes: e.target.value })}
                  style={{ width: '105px', padding: '6px 10px', fontSize: '0.85rem' }}
                  min="1"
                  aria-label="Minimum episode count"
                />
                <span>–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Max (e.g. 26)"
                  value={maxEpisodes}
                  onChange={(e) => patch({ maxEpisodes: e.target.value })}
                  style={{ width: '105px', padding: '6px 10px', fontSize: '0.85rem' }}
                  min="1"
                  aria-label="Maximum episode count"
                />
                {(minEpisodes !== '' || maxEpisodes !== '') && (
                  <button
                    type="button"
                    onClick={() => { patch({ minEpisodes: '', maxEpisodes: '' }); }}
                    style={{ background: 'none', color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'underline', padding: '0 4px' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.8rem' }}>Release Year (Range)</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Min (e.g. 2000)"
                  value={minYear}
                  onChange={(e) => patch({ minYear: e.target.value })}
                  style={{ width: '120px', padding: '6px 10px', fontSize: '0.85rem' }}
                  aria-label="Minimum release year"
                />
                <span>–</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Max (e.g. 2024)"
                  value={maxYear}
                  onChange={(e) => patch({ maxYear: e.target.value })}
                  style={{ width: '120px', padding: '6px 10px', fontSize: '0.85rem' }}
                  aria-label="Maximum release year"
                />
                {(minYear !== '' || maxYear !== '') && (
                  <button
                    type="button"
                    onClick={() => { patch({ minYear: '', maxYear: '' }); }}
                    style={{ background: 'none', color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'underline', padding: '0 4px' }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.8rem' }}>Filter by Format</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.5rem' }}>
                {FORMAT_OPTIONS.map(format => (
                  <button
                    key={format.value}
                    type="button"
                    onClick={() => toggleFormat(format.value)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.85rem',
                      background: selectedFormats.includes(format.value) ? 'var(--primary)' : 'var(--gray-100)',
                      color: selectedFormats.includes(format.value) ? 'white' : 'var(--foreground)',
                      border: `1px solid ${selectedFormats.includes(format.value) ? 'var(--primary)' : 'var(--gray-300)'}`,
                      borderRadius: '16px'
                    }}
                  >
                    {format.label}
                  </button>
                ))}
                {selectedFormats.length > 0 && (
                  <button 
                    type="button"
                    onClick={() => patch({ selectedFormats: [] })}
                    style={{ background: 'none', color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'underline' }}
                  >
                    Clear Formats
                  </button>
                )}
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.8rem' }}>Filter by Genres</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.5rem' }}>
                {availableGenres.map(genre => (
                  <button
                    key={genre}
                    onClick={() => toggleGenre(genre)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.85rem',
                      background: selectedGenres.includes(genre) ? 'var(--primary)' : 'var(--gray-200)',
                      color: selectedGenres.includes(genre) ? 'white' : 'var(--foreground)',
                      border: `1px solid ${selectedGenres.includes(genre) ? 'var(--primary)' : 'var(--gray-300)'}`,
                      borderRadius: '16px'
                    }}
                  >
                    {genre}
                  </button>
                ))}
                {selectedGenres.length > 0 && (
                  <button 
                    onClick={() => patch({ selectedGenres: [] })}
                    style={{ background: 'none', color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'underline' }}
                  >
                    Clear Genres
                  </button>
                )}
              </div>

              <h3 style={{ fontSize: '1rem', marginBottom: '0.8rem' }}>Filter by Tags</h3>
              <div style={{ position: 'relative', maxWidth: '400px', marginBottom: '1rem' }}>
                <input
                  type="text"
                  placeholder="Type a tag (e.g. Time Travel, Isekai)..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  style={{ width: '100%' }}
                />
                {tagSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'var(--background)',
                    color: 'var(--foreground)',
                    border: '2px solid var(--primary)',
                    borderRadius: '4px',
                    zIndex: 10,
                    boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {tagSuggestions.map(tag => (
                      <div
                        key={tag}
                        onClick={() => addTag(tag)}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--gray-300)',
                          fontWeight: 'bold'
                        }}
                        className="suggestion-item"
                      >
                        {tag}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                {selectedTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => removeTag(tag)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.85rem',
                      background: 'var(--primary)',
                      color: 'white',
                      border: '1px solid var(--primary)',
                      borderRadius: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {tag} <span style={{ fontSize: '1.1rem', lineHeight: '0' }}>×</span>
                  </button>
                ))}
                {selectedTags.length > 0 && (
                  <button 
                    onClick={() => patch({ selectedTags: [] })}
                    style={{ background: 'none', color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'underline' }}
                  >
                    Clear Tags
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Results Section */}
      {cachedUserData.length > 0 && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.8rem' }}>
            <h2>
              Shared Anime ({filteredResults.length})
            </h2>
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <label htmlFor="sort-select" style={{ fontSize: '0.85rem', color: 'var(--gray-800)', whiteSpace: 'nowrap' }}>Sort by:</label>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={(e) => patch({ sortBy: e.target.value as GameSession['sortBy'] })}
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.85rem',
                    border: '1px solid var(--gray-300)',
                    borderRadius: 'var(--border-radius)',
                    background: 'var(--gray-100)',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="title">Alphabetical</option>
                  <option value="averageScore">AniList Score ↓</option>
                  <option value="popularity">Popularity ↓</option>
                  <option value="year">Release Date ↓</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => syncSpecificUsers(cachedUserData.map(u => u.username))}
                disabled={Object.values(syncingUsers).some(Boolean)}
                title="Fetch any newly added or updated anime from AniList without re-downloading everything"
                style={{
                  background: 'var(--gray-200)',
                  color: 'var(--foreground)',
                  padding: '8px 16px',
                  fontWeight: 'bold',
                  border: '1px solid var(--gray-300)',
                  cursor: Object.values(syncingUsers).some(Boolean) ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🔄</span>
                <span>{Object.values(syncingUsers).some(Boolean) ? 'Updating...' : 'Update All Lists'}</span>
              </button>
              <button
                type="button"
                onClick={toggleAllDetails}
                style={{
                  background: showAllDetails ? 'var(--primary)' : 'var(--gray-200)',
                  color: showAllDetails ? 'white' : 'var(--foreground)',
                  padding: '8px 16px',
                  fontWeight: 'bold',
                  border: `1px solid ${showAllDetails ? 'var(--primary)' : 'var(--gray-300)'}`
                }}
              >
                {showAllDetails ? '🏷️ Hide Genres & Tags' : '🏷️ Show Genres & Tags'}
              </button>
              <button
                onClick={copyToClipboard}
                style={{ background: 'var(--secondary)', color: 'var(--gray-800)', padding: '8px 16px', fontWeight: 'bold' }}
              >
                📋 Copy for Table
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--background)' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--gray-300)' }}>
                  <th style={{ padding: '12px' }}>Anime Title</th>
                  {cachedUserData.map(user => {
                    const isUserSyncing = !!syncingUsers[user.username];
                    const updatedText = formatLastUpdated(userLastUpdated[user.username]);
                    return (
                      <th key={user.username} style={{ padding: '12px', textAlign: 'center', minWidth: '110px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                          <a
                            href={`https://anilist.co/user/${encodeURIComponent(user.username)}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="user-profile-link"
                            title={`View ${user.username}'s AniList profile`}
                            style={{
                              color: requiredUsers.includes(user.username) ? 'var(--primary)' : 'inherit',
                              textDecoration: 'none',
                              fontWeight: 'bold',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              justifyContent: 'center',
                              transition: 'color 0.15s ease'
                            }}
                          >
                            <span>{user.username}</span>
                            <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => syncSpecificUsers([user.username])}
                            disabled={isUserSyncing}
                            title={`Update ${user.username}'s list`}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: isUserSyncing ? 'wait' : 'pointer',
                              padding: '2px',
                              lineHeight: 1,
                              fontSize: '0.85rem',
                              opacity: isUserSyncing ? 0.4 : 0.7,
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ display: 'inline-block', animation: isUserSyncing ? 'spin 1s linear infinite' : 'none' }}>
                              🔄
                            </span>
                          </button>
                        </div>
                        {updatedText && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--gray-800)', marginTop: '2px', opacity: 0.8 }}>
                            {updatedText}
                          </div>
                        )}
                        {typeof userUpdatesBehind[user.username] === 'number' && (
                          <div
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              marginTop: '2px',
                              color: userUpdatesBehind[user.username]! > 0 ? '#d97706' : '#16a34a',
                            }}
                          >
                            {userUpdatesBehind[user.username]! > 0
                              ? `${userUpdatesBehind[user.username]} update${userUpdatesBehind[user.username]! > 1 ? 's' : ''} behind`
                              : 'Up to date'}
                          </div>
                        )}
                        {requiredUsers.includes(user.username) && (
                          <div style={{ fontSize: '0.6rem', color: 'var(--primary)', marginTop: '2px', fontWeight: 600 }}>
                            Required
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((anime, idx) => {
                  const isExpanded = customExpanded[anime.id] ?? showAllDetails;
                  return (
                    <tr
                      key={anime.id}
                      style={{
                        borderBottom: '1px solid var(--gray-200)',
                        background: idx % 2 === 0 ? 'transparent' : 'var(--gray-100)',
                      }}
                    >
                      <td style={{ padding: isExpanded ? '10px 12px' : '8px 12px', fontWeight: 500 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => toggleAnimeDetails(anime.id)}
                            aria-expanded={isExpanded}
                            className="title-toggle-btn"
                            title="Click to toggle genres & tags"
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              margin: 0,
                              font: 'inherit',
                              color: 'inherit',
                              textAlign: 'left',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                fontSize: '0.65rem',
                                color: 'var(--primary)',
                                display: 'inline-block',
                                transition: 'transform 0.15s ease',
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                              }}
                            >
                              ▶
                            </span>
                            <span style={{ fontWeight: 600 }}>{anime.title}</span>
                          </button>
                          <a
                            href={`https://anilist.co/anime/${anime.id}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="anilist-link-badge"
                            title={`Open ${anime.title} on AniList`}
                            style={{
                              fontSize: '0.7rem',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--gray-200)',
                              color: 'var(--primary)',
                              textDecoration: 'none',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              border: '1px solid var(--gray-300)',
                              lineHeight: '1.4',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            AniList ↗
                          </a>
                        </div>
                        <UntilFound
                          collapsed={!isExpanded}
                          onReveal={() => {
                            setCustomExpanded(prev => ({ ...prev, [anime.id]: true }));
                          }}
                        >
                          <div style={{ marginTop: '4px', paddingLeft: '14px' }}>
                            {(anime.format || anime.episodes !== null || anime.year !== null || anime.averageScore !== null || anime.popularity !== null) && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--foreground)', marginTop: '2px', display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                                {anime.format && (
                                  <span><span style={{ fontWeight: 'bold' }}>Format:</span> {FORMAT_LABELS[anime.format] || anime.format}</span>
                                )}
                                {anime.episodes !== null && (
                                  <span><span style={{ fontWeight: 'bold' }}>Episodes:</span> {anime.episodes}</span>
                                )}
                                {anime.year !== null && (
                                  <span><span style={{ fontWeight: 'bold' }}>Year:</span> {anime.year}</span>
                                )}
                                {anime.averageScore !== null && (
                                  <span><span style={{ fontWeight: 'bold' }}>AniList Score:</span> {anime.averageScore}%</span>
                                )}
                                {anime.popularity !== null && (
                                  <span><span style={{ fontWeight: 'bold' }}>Popularity:</span> {anime.popularity.toLocaleString()}</span>
                                )}
                              </div>
                            )}
                            <div style={{ fontSize: '0.7rem', color: 'var(--gray-800)', marginTop: '2px' }}>
                              <span style={{ fontWeight: 'bold' }}>Genres:</span> {anime.genres.length > 0 ? anime.genres.join(', ') : 'None'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--gray-600)', marginTop: '2px' }}>
                              <span style={{ fontWeight: 'bold' }}>Tags:</span> {anime.tags.length > 0 ? (
                                anime.tags.slice(0, 10).join(', ') + (anime.tags.length > 10 ? '...' : '')
                              ) : 'None'}
                            </div>
                          </div>
                        </UntilFound>
                      </td>
                      {cachedUserData.map(user => {
                        const status = anime.userStatuses[user.username];
                        const score = anime.userScores[user.username];
                        const progress = anime.userProgresses?.[user.username];
                        const isNotCompleted = status && status !== 'COMPLETED';
                        return (
                          <td key={user.username} style={{ padding: isExpanded ? '10px 12px' : '8px 12px', textAlign: 'center', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>
                            {status ? (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                  <span>{STATUS_ICONS[status]}</span>
                                  {score !== null && score !== undefined && score > 0 && (
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>
                                      {score}
                                    </span>
                                  )}
                                </div>
                                {isNotCompleted && progress !== null && progress !== undefined && (
                                  <div style={{ fontSize: '0.65rem', color: 'var(--gray-800)', marginTop: '2px', lineHeight: 1.1 }}>
                                    {progress} eps seen
                                  </div>
                                )}
                              </div>
                            ) : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <style jsx>{`
        .suggestion-item:hover {
          background-color: var(--gray-300);
          color: var(--primary-dark);
        }
        .title-toggle-btn:hover span:last-child {
          color: var(--primary);
        }
        .anilist-link-badge:hover {
          background-color: var(--primary) !important;
          color: white !important;
          border-color: var(--primary) !important;
        }
        .user-profile-link:hover {
          color: var(--primary-dark) !important;
          text-decoration: underline !important;
        }
      `}</style>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="container"><p>Loading…</p></main>}>
      <SessionShell Workspace={Home} />
    </Suspense>
  );
}
