'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { GameSession } from '@/types/session';

interface SessionTabsProps {
  openIds: string[];
  sessions: GameSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onClose: (id: string) => void;
  onCloseOthers: (id: string) => void;
  onCloseToRight: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete: (id: string) => void;
}

function startOfToday(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

export default function SessionTabs({
  openIds,
  sessions,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onDuplicate,
  onReorder,
  onDelete,
}: SessionTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const previewIdsRef = useRef<string[] | null>(null);
  const droppedRef = useRef(false);

  const byId = useMemo(() => {
    const map = new Map<string, GameSession>();
    for (const session of sessions) map.set(session.id, session);
    return map;
  }, [sessions]);

  const displayIds = previewIds ?? openIds;
  const openTabs = displayIds
    .map(id => byId.get(id))
    .filter((session): session is GameSession => !!session);

  const setPreview = (ids: string[] | null) => {
    previewIdsRef.current = ids;
    setPreviewIds(ids);
  };

  const commitDrag = () => {
    const fromId = dragIdRef.current;
    if (!fromId) return;
    droppedRef.current = true;
    const preview = previewIdsRef.current ?? openIds;
    const fromIndex = openIds.indexOf(fromId);
    const toIndex = preview.indexOf(fromId);
    dragIdRef.current = null;
    setDraggingId(null);
    setPreview(null);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    onReorder(fromIndex, toIndex);
  };

  const previewMove = (overId: string, clientX: number, midpoint: number) => {
    const fromId = dragIdRef.current;
    if (!fromId || fromId === overId) return;
    const ids = previewIdsRef.current ?? openIds;
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1 || from === to) return;
    if (from < to && clientX < midpoint) return;
    if (from > to && clientX > midpoint) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPreview(next);
  };

  useEffect(() => {
    if (!historyOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!historyRef.current?.contains(event.target as Node)) setHistoryOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHistoryOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [historyOpen]);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menu]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onWheel = (event: WheelEvent) => {
      if (openTabs.length < 2) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      event.preventDefault();
      const ids = openTabs.map(tab => tab.id);
      const index = Math.max(0, ids.indexOf(activeId ?? ''));
      const next = ids[(index + (delta > 0 ? 1 : -1) + ids.length) % ids.length];
      onSelect(next);
    };
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, [openTabs, activeId, onSelect]);

  const startRename = (session: GameSession) => {
    setEditingId(session.id);
    setDraftName(session.name);
  };

  const commitRename = () => {
    if (!editingId) return;
    const name = draftName.trim();
    if (name) onRename(editingId, name);
    setEditingId(null);
  };

  const closeOnMiddle = (event: ReactMouseEvent, id: string) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    onClose(id);
  };

  const filtered = sessions.filter(session =>
    session.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const todayStart = startOfToday();
  const today = filtered.filter(session => session.updatedAt >= todayStart);
  const older = filtered.filter(session => session.updatedAt < todayStart);

  const deleteSession = (session: GameSession) => {
    if (!window.confirm(`Delete “${session.name}”? This cannot be undone.`)) return;
    onDelete(session.id);
  };

  const runMenuAction = (action: () => void) => {
    setMenu(null);
    action();
  };

  const renderHistoryRow = (session: GameSession) => {
    const active = session.id === activeId;
    return (
      <div
        key={session.id}
        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <button
          type="button"
          onClick={() => {
            onSelect(session.id);
            setHistoryOpen(false);
          }}
          style={{
            flex: 1,
            background: 'none',
            textAlign: 'left',
            padding: '6px 8px',
            fontWeight: active ? 700 : 500,
            color: 'var(--foreground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ display: 'inline-block', width: '1.1rem', color: 'var(--primary)' }}>
            {active ? '✓' : ''}
          </span>
          {session.name}
        </button>
        <button
          type="button"
          title="Delete saved game"
          onClick={() => deleteSession(session)}
          style={{ background: 'none', color: 'var(--accent)', padding: '4px 8px', fontSize: '0.85rem' }}
        >
          Delete
        </button>
      </div>
    );
  };

  const renderGroup = (label: string, rows: GameSession[]) => {
    if (rows.length === 0) return null;
    return (
      <div key={label} style={{ marginTop: '0.4rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gray-800)', padding: '4px 8px' }}>
          {label}
        </div>
        {rows.map(renderHistoryRow)}
      </div>
    );
  };

  const menuIndex = menu ? openIds.indexOf(menu.id) : -1;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'var(--background)',
        borderBottom: '1px solid var(--gray-300)',
        padding: '0.6rem 2rem 0',
      }}
    >
      <div style={{ maxWidth: 'var(--max-width)', margin: '0 auto', display: 'flex', alignItems: 'flex-end', gap: '0.4rem' }}>
        <div
          ref={stripRef}
          onDragOver={event => {
            if (!dragIdRef.current) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={event => {
            event.preventDefault();
            commitDrag();
          }}
          onDoubleClick={event => {
            if (event.target === event.currentTarget) onCreate();
          }}
          title="Double-click empty space to open a new tab"
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '0.4rem',
            overflowX: 'auto',
            overflowY: 'hidden',
            flex: 1,
            minWidth: 0,
            marginBottom: '-1px',
            cursor: 'default',
            minHeight: '2.4rem',
          }}
        >
        {openTabs.map(tab => {
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              draggable={editingId !== tab.id}
              onDragStart={event => {
                if (editingId === tab.id) {
                  event.preventDefault();
                  return;
                }
                droppedRef.current = false;
                dragIdRef.current = tab.id;
                setDraggingId(tab.id);
                setPreview([...openIds]);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', tab.id);
              }}
              onDragOver={event => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'move';
                const rect = event.currentTarget.getBoundingClientRect();
                previewMove(tab.id, event.clientX, rect.left + rect.width / 2);
              }}
              onDrop={event => {
                event.preventDefault();
                event.stopPropagation();
                commitDrag();
              }}
              onDragEnd={() => {
                dragIdRef.current = null;
                setDraggingId(null);
                if (!droppedRef.current) setPreview(null);
                droppedRef.current = false;
              }}
              onMouseDown={event => closeOnMiddle(event, tab.id)}
              onAuxClick={event => closeOnMiddle(event, tab.id)}
              onContextMenu={event => {
                event.preventDefault();
                setMenu({ id: tab.id, x: event.clientX, y: event.clientY });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 10px',
                borderRadius: '8px 8px 0 0',
                border: '1px solid var(--gray-300)',
                borderBottom: active ? '1px solid var(--background)' : '1px solid var(--gray-300)',
                background: active ? 'var(--gray-100)' : 'transparent',
                minWidth: '8rem',
                maxWidth: '16rem',
                flexShrink: 0,
                opacity: draggingId === tab.id ? 0.5 : 1,
                cursor: 'default',
              }}
            >
              {editingId === tab.id ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  style={{ width: '100%', fontSize: '0.85rem', padding: '2px 6px' }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(tab.id)}
                  onDoubleClick={() => startRename(tab)}
                  onMouseDown={event => closeOnMiddle(event, tab.id)}
                  onAuxClick={event => closeOnMiddle(event, tab.id)}
                  title="Double-click to rename"
                  style={{
                    background: 'none',
                    padding: 0,
                    fontWeight: active ? 700 : 500,
                    color: 'var(--foreground)',
                    textAlign: 'left',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '0.9rem',
                  }}
                >
                  {tab.name}
                </button>
              )}
              <button
                type="button"
                onClick={() => onClose(tab.id)}
                onMouseDown={event => closeOnMiddle(event, tab.id)}
                title="Close tab"
                style={{ background: 'none', padding: '0 4px', color: 'var(--gray-800)', fontSize: '1rem', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          );
        })}
        </div>
        <button
          type="button"
          onClick={onCreate}
          title="New game session"
          style={{
            background: 'var(--gray-200)',
            padding: '8px 12px',
            marginBottom: '4px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          + New
        </button>
        <div ref={historyRef} style={{ position: 'relative', marginBottom: '4px' }}>
          <button
            type="button"
            onClick={() => setHistoryOpen(open => !open)}
            title="Saved games"
            aria-expanded={historyOpen}
            style={{
              background: historyOpen ? 'var(--gray-200)' : 'none',
              padding: '8px 12px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            History
          </button>
          {historyOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: '320px',
                maxHeight: '360px',
                overflowY: 'auto',
                background: 'var(--background)',
                border: '1px solid var(--gray-300)',
                borderRadius: 'var(--border-radius)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                padding: '0.5rem',
                zIndex: 50,
              }}
            >
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search games"
                style={{ width: '100%', fontSize: '0.85rem' }}
              />
              {filtered.length === 0 ? (
                <p style={{ padding: '0.8rem 8px', fontSize: '0.85rem', color: 'var(--gray-800)' }}>
                  No saved games
                </p>
              ) : (
                <>
                  {renderGroup('Today', today)}
                  {renderGroup('Older', older)}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {menu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: menu.x,
            top: menu.y,
            minWidth: '180px',
            background: 'var(--background)',
            border: '1px solid var(--gray-300)',
            borderRadius: 'var(--border-radius)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '4px 0',
            zIndex: 60,
          }}
        >
          {([
            ['Close', () => onClose(menu.id)],
            ['Close others', () => onCloseOthers(menu.id)],
            ['Close to the right', () => onCloseToRight(menu.id), menuIndex >= 0 && menuIndex < openIds.length - 1],
            ['Duplicate', () => onDuplicate(menu.id)],
          ] as [string, () => void, boolean?][]).map(([label, action, enabled]) => (
            enabled === false ? null : (
              <button
                key={label}
                type="button"
                onClick={() => runMenuAction(action)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                  color: 'var(--foreground)',
                  borderRadius: 0,
                }}
              >
                {label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}
