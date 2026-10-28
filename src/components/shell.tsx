'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { fetchGenres, fetchTags } from '@/utils/anilist';
import { createDefaultSession, GameSession } from '@/types/session';
import {
  EMPTY_SESSION_STORE,
  readSessionStore,
  SessionStore,
  writeSessionStore,
} from '@/utils/sessionStore';
import SessionTabs from '@/components/tabs';

export interface WorkspaceProps {
  session: GameSession;
  onSessionChange: (patch: Partial<GameSession>) => void;
  availableGenres: string[];
  availableTags: string[];
  suggestedUserList: string[];
}

export default function SessionShell({ Workspace }: { Workspace: ComponentType<WorkspaceProps> }) {
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<SessionStore>(EMPTY_SESSION_STORE);
  const [availableGenres, setAvailableGenres] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [suggestedUserList, setSuggestedUserList] = useState<string[]>([]);

  const storeRef = useRef(store);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedIdsRef = useRef<string[]>([]);

  const commit = useCallback((next: SessionStore, immediate = false) => {
    storeRef.current = next;
    setStore(next);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!hydratedRef.current) return;
    if (immediate) {
      writeSessionStore(next);
      return;
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      writeSessionStore(storeRef.current);
    }, 500);
  }, []);

  useEffect(() => {
    const loaded = readSessionStore();
    storeRef.current = loaded;
    hydratedRef.current = true;
    setStore(loaded);
    setReady(true);
  }, []);

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

  useEffect(() => {
    const flush = () => {
      if (!hydratedRef.current) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      writeSessionStore(storeRef.current);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const handleSessionChange = (id: string, patch: Partial<GameSession>) => {
    const current = storeRef.current;
    const existing = current.sessions[id];
    if (!existing) return;
    const nextSession: GameSession = { ...existing, ...patch, id, updatedAt: Date.now() };
    commit({
      ...current,
      sessions: { ...current.sessions, [id]: nextSession },
    });
  };

  const handleSelect = (id: string) => {
    const current = storeRef.current;
    if (!current.sessions[id] || current.activeId === id) return;
    const openIds = current.openIds.includes(id) ? current.openIds : [...current.openIds, id];
    commit({ ...current, openIds, activeId: id }, true);
  };

  const handleCreate = () => {
    const current = storeRef.current;
    const created = createDefaultSession({
      name: `Game ${Object.keys(current.sessions).length + 1}`,
    });
    commit({
      sessions: { ...current.sessions, [created.id]: created },
      openIds: [...current.openIds, created.id],
      activeId: created.id,
    }, true);
  };

  const handleRename = (id: string, name: string) => {
    handleSessionChange(id, { name });
  };

  const handleCloseMany = (ids: string[]) => {
    const current = storeRef.current;
    const toClose = ids.filter(id => current.openIds.includes(id));
    if (toClose.length === 0) return;
    closedIdsRef.current = [...closedIdsRef.current, ...toClose];
    const closeSet = new Set(toClose);
    const openIds = current.openIds.filter(id => !closeSet.has(id));
    let activeId = current.activeId;
    if (activeId && closeSet.has(activeId)) {
      const closedIndex = current.openIds.indexOf(activeId);
      activeId = current.openIds.slice(closedIndex + 1).find(id => !closeSet.has(id))
        ?? [...current.openIds.slice(0, closedIndex)].reverse().find(id => !closeSet.has(id))
        ?? null;
    }
    commit({ ...current, openIds, activeId }, true);
  };

  const handleClose = (id: string) => {
    handleCloseMany([id]);
  };

  const handleCloseOthers = (id: string) => {
    handleCloseMany(storeRef.current.openIds.filter(openId => openId !== id));
  };

  const handleCloseToRight = (id: string) => {
    const index = storeRef.current.openIds.indexOf(id);
    if (index === -1) return;
    handleCloseMany(storeRef.current.openIds.slice(index + 1));
  };

  const handleDuplicate = (id: string) => {
    const current = storeRef.current;
    const source = current.sessions[id];
    if (!source) return;
    const created = createDefaultSession({
      ...source,
      id: crypto.randomUUID(),
      name: source.name.endsWith(' copy') ? source.name : `${source.name} copy`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usernames: [...source.usernames],
      fetchStatuses: [...source.fetchStatuses],
      activeStatuses: [...source.activeStatuses],
      requiredUsers: [...source.requiredUsers],
      selectedGenres: [...source.selectedGenres],
      selectedTags: [...source.selectedTags],
      selectedFormats: [...source.selectedFormats],
    });
    const insertAt = current.openIds.indexOf(id);
    const openIds = [...current.openIds];
    openIds.splice(insertAt === -1 ? openIds.length : insertAt + 1, 0, created.id);
    commit({
      sessions: { ...current.sessions, [created.id]: created },
      openIds,
      activeId: created.id,
    }, true);
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const current = storeRef.current;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.openIds.length || toIndex >= current.openIds.length) return;
    const openIds = [...current.openIds];
    const [moved] = openIds.splice(fromIndex, 1);
    openIds.splice(toIndex, 0, moved);
    commit({ ...current, openIds }, true);
  };

  const handleReopen = () => {
    const current = storeRef.current;
    while (closedIdsRef.current.length > 0) {
      const id = closedIdsRef.current.pop()!;
      if (current.sessions[id] && !current.openIds.includes(id)) {
        handleSelect(id);
        return;
      }
    }
  };

  const cycleTab = (delta: number) => {
    const current = storeRef.current;
    const ids = current.openIds;
    if (ids.length < 2) return;
    const index = Math.max(0, ids.indexOf(current.activeId ?? ''));
    handleSelect(ids[(index + delta + ids.length) % ids.length]);
  };

  const handleDelete = (id: string) => {
    const current = storeRef.current;
    const sessions = { ...current.sessions };
    delete sessions[id];
    closedIdsRef.current = closedIdsRef.current.filter(closedId => closedId !== id);
    const openIds = current.openIds.filter(openId => openId !== id);
    let activeId = current.activeId;
    if (activeId === id) {
      const closedIndex = current.openIds.indexOf(id);
      activeId = openIds[closedIndex] ?? openIds[closedIndex - 1] ?? null;
    }
    commit({ sessions, openIds, activeId }, true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const target = event.target as HTMLElement | null;
      const inField = !!target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      );
      const key = event.key;

      if (event.shiftKey && (key === 'T' || key === 't')) {
        event.preventDefault();
        handleReopen();
        return;
      }

      if (inField) return;

      if (key === 't' || key === 'T') {
        event.preventDefault();
        handleCreate();
      } else if (key === 'w' || key === 'W') {
        event.preventDefault();
        const activeId = storeRef.current.activeId;
        if (activeId) handleClose(activeId);
      } else if (key === 'Tab') {
        event.preventDefault();
        cycleTab(event.shiftKey ? -1 : 1);
      } else if (key === 'PageDown') {
        event.preventDefault();
        cycleTab(1);
      } else if (key === 'PageUp') {
        event.preventDefault();
        cycleTab(-1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const openSessions = store.openIds
    .map(id => store.sessions[id])
    .filter((session): session is GameSession => !!session);
  const savedSessions = Object.values(store.sessions).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      <SessionTabs
        openIds={store.openIds}
        sessions={savedSessions}
        activeId={store.activeId}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onRename={handleRename}
        onClose={handleClose}
        onCloseOthers={handleCloseOthers}
        onCloseToRight={handleCloseToRight}
        onDuplicate={handleDuplicate}
        onReorder={handleReorder}
        onDelete={handleDelete}
      />
      <main className="container">
        <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ color: 'var(--primary)', fontSize: '2.5rem' }}>AniList Comparer</h1>
          <p style={{ color: 'var(--gray-800)' }}>Jeopardy Game Planning Tool</p>
        </header>

        {!ready ? (
          <p style={{ textAlign: 'center', color: 'var(--gray-800)' }}>Loading…</p>
        ) : openSessions.length === 0 ? (
          <button
              onClick={() => handleCreate()}
              style={{
                background: 'var(--primary)',
                color: 'white',
                padding: '14px 28px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                flex: 1
              }}
            >
              Start new game
            </button>
        ) : (
          openSessions.map(session => (
            <div key={session.id} style={{ display: session.id === store.activeId ? undefined : 'none' }}>
              <Workspace
                session={session}
                onSessionChange={patch => handleSessionChange(session.id, patch)}
                availableGenres={availableGenres}
                availableTags={availableTags}
                suggestedUserList={suggestedUserList}
              />
            </div>
          ))
        )}
      </main>
    </>
  );
}
