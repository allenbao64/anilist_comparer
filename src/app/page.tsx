'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { fetchAllUserData, fetchGenres, fetchTags, AnimeEntry, AnimeStatus, UserStatusData } from '@/utils/anilist';

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

export default function Home() {
  const [usernames, setUsernames] = useState<string[]>(['', '', '', '']);
  const [suggestedUserList, setSuggestedUserList] = useState<string[]>([]);
  const [activeUserIndex, setActiveUserIndex] = useState<number | null>(null);
  const [userSuggestions, setUserSuggestions] = useState<string[]>([]);
  const [cachedUserData, setCachedUserData] = useState<UserStatusData[]>([]);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [fetchStatuses, setFetchStatuses] = useState<AnimeStatus[]>(['COMPLETED', 'CURRENT']);
  const abortLoadingRef = useRef(false);

  // Filters (Phase 2)
  const [activeStatuses, setActiveStatuses] = useState<AnimeStatus[]>(['COMPLETED', 'CURRENT']);
  const [requiredUsers, setRequiredUsers] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

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

  // Load genres, tags, and suggested users on mount
  useEffect(() => {
    fetchGenres().then(setAvailableGenres).catch(console.error);
    fetchTags().then(setAvailableTags).catch(console.error);
    fetch('/users.txt')
      .then(res => res.text())
      .then(text => {
        const list = text.split('\n').map(u => u.trim()).filter(u => u !== '');
        setSuggestedUserList(list);
      })
      .catch(console.error);
  }, []);

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
        setFetchStatuses(fetchStatuses.filter(s => s !== status));
      }
    } else {
      setFetchStatuses([...fetchStatuses, status]);
    }
  };

  const addUser = () => {
    if (usernames.length < 10) {
      setUsernames([...usernames, '']);
    }
  };

  const removeUser = (index: number) => {
    const newUsers = [...usernames];
    newUsers.splice(index, 1);
    setUsernames(newUsers);
  };

  const updateUsername = (index: number, value: string) => {
    const newUsers = [...usernames];
    newUsers[index] = value;
    setUsernames(newUsers);
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
    setUsernames(newUsers);
    setUserSuggestions([]);
    setActiveUserIndex(null);
  };

  const toggleStatusFilter = (status: AnimeStatus) => {
    if (activeStatuses.includes(status)) {
      if (activeStatuses.length > 1) {
        setActiveStatuses(activeStatuses.filter(s => s !== status));
      }
    } else {
      setActiveStatuses([...activeStatuses, status]);
    }
  };

  const toggleRequiredUser = (username: string) => {
    if (requiredUsers.includes(username)) {
      setRequiredUsers(requiredUsers.filter(u => u !== username));
    } else {
      setRequiredUsers([...requiredUsers, username]);
    }
  };

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const addTag = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
    }
    setTagInput('');
    setTagSuggestions([]);
  };

  const removeTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
  };

  const reset = () => {
    setUsernames(['', '', '', '']);
    setCachedUserData([]);
    setErrors([]);
    setRequiredUsers([]);
    setSelectedGenres([]);
    setSelectedTags([]);
    setTagInput('');
    setIsLoading(false);
    setProgressMessage('');
    abortLoadingRef.current = false;
  };

  const stopLoading = () => {
    abortLoadingRef.current = true;
    setProgressMessage('Stopping...');
  };

  const startGrandLoad = async () => {
    const validUsernames = usernames.filter(u => u.trim() !== '');
    if (validUsernames.length < 1) {
      setErrors(['Please enter at least one username.']);
      return;
    }

    setIsLoading(true);
    setErrors([]);
    setProgressMessage('Starting load...');
    abortLoadingRef.current = false;
    
    // Set Phase 2 filters to match what we are loading
    setActiveStatuses([...fetchStatuses]);
    
    const results: UserStatusData[] = [];
    const fatalErrors: string[] = [];
    
    let pending = [...validUsernames];

    while (pending.length > 0 && !abortLoadingRef.current) {
      const current = pending[0];
      try {
        const statusData = await fetchAllUserData(current, fetchStatuses, (msg) => {
          setProgressMessage(msg);
        });
        results.push({ username: current, statusData });
        pending.shift(); // Success!
      } catch (err: any) {
        const errMsg = err.message || '';
        if (errMsg.includes('FATAL')) {
          fatalErrors.push(`${current}: User not found or private.`);
          pending.shift(); // Can't fix this, skip
        } else {
          for (let i = 5; i > 0; i--) {
            if (abortLoadingRef.current) break;
            setProgressMessage(`Error with ${current}. Retrying in ${i}s...`);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    }

    if (abortLoadingRef.current) {
      setErrors([...fatalErrors, 'Loading was cancelled by user.']);
    } else {
      setErrors(fatalErrors);
    }

    setCachedUserData(results);
    setRequiredUsers(results.map(r => r.username));
    setIsLoading(false);
    setProgressMessage('');
  };

  const filteredResults = useMemo(() => {
    if (cachedUserData.length === 0) return [];

    const animeMap = new Map<number, { id: number; title: string; userStatuses: Record<string, AnimeStatus>; genres: string[]; tags: string[] }>();

    cachedUserData.forEach(user => {
      activeStatuses.forEach(status => {
        if (user.statusData[status]) {
          user.statusData[status].forEach(entry => {
            if (!animeMap.has(entry.id)) {
              animeMap.set(entry.id, { 
                id: entry.id,
                title: entry.title, 
                userStatuses: {}, 
                genres: entry.genres, 
                tags: entry.tags 
              });
            }
            animeMap.get(entry.id)!.userStatuses[user.username] = status;
          });
        }
      });
    });

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

        return matchesUsers && matchesGenres && matchesTags;
      })
      .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
  }, [cachedUserData, activeStatuses, requiredUsers, selectedGenres, selectedTags]);

  const copyToClipboard = () => {
    if (filteredResults.length === 0) return;
    
    const userList = cachedUserData.map(u => u.username);
    const headers = ['Anime Title', ...userList];
    
    // Plain text version (TSV)
    const tsvRows = filteredResults.map(anime => {
      const userIcons = userList.map(username => 
        anime.userStatuses[username] ? STATUS_ICONS[anime.userStatuses[username]] : ''
      );
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
          return `<td style="border: 1px solid #ccc; padding: 8px; text-align: center; font-size: 1.2rem;">${icon}</td>`;
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
    <main className="container">
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ color: 'var(--primary)', fontSize: '2.5rem' }}>AniList Comparer</h1>
        <p style={{ color: 'var(--gray-800)' }}>Jeopardy Game Planning Tool</p>
      </header>

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
              onClick={startGrandLoad}
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
                    onClick={() => setSelectedGenres([])}
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
                    onClick={() => setSelectedTags([])}
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
            <h2>Shared Anime ({filteredResults.length})</h2>
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
                  {cachedUserData.map(user => (
                    <th key={user.username} style={{ padding: '12px', textAlign: 'center' }}>
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
                      {requiredUsers.includes(user.username) && <div style={{ fontSize: '0.6rem', color: 'var(--primary)', marginTop: '2px' }}>Required</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((anime, idx) => {
                  const isExpanded = customExpanded[anime.id] ?? showAllDetails;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--gray-200)', background: idx % 2 === 0 ? 'transparent' : 'var(--gray-100)' }}>
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
                        <div
                          {...({
                            hidden: isExpanded ? undefined : 'until-found',
                            onbeforematch: () => {
                              setCustomExpanded(prev => ({ ...prev, [anime.id]: true }));
                            }
                          } as any)}
                        >
                          <div style={{ marginTop: '4px', paddingLeft: '14px' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--gray-800)', marginTop: '2px' }}>
                              <span style={{ fontWeight: 'bold' }}>Genres:</span> {anime.genres.join(', ')}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--gray-600)', marginTop: '2px' }}>
                              <span style={{ fontWeight: 'bold' }}>Tags:</span> {anime.tags.slice(0, 10).join(', ')}{anime.tags.length > 10 ? '...' : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      {cachedUserData.map(user => (
                        <td key={user.username} style={{ padding: isExpanded ? '10px 12px' : '8px 12px', textAlign: 'center', fontSize: '1.2rem' }}>
                          {anime.userStatuses[user.username] ? STATUS_ICONS[anime.userStatuses[user.username]] : ''}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <style jsx>{`
        .spinner {
          display: inline-block;
          animation: rotate 2s linear infinite;
        }
        @keyframes rotate {
          100% { transform: rotate(360deg); }
        }
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
    </main>
  );
}
