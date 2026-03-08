import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from './supabase.js'

// ─── Constants ───────────────────────────────────────────────────────────────
const COLORS = [
  '#FF6B6B','#FFB347','#FFD93D','#6BCB77','#4D96FF',
  '#C77DFF','#FF6FC8','#00C9A7','#FF9A3C','#A8DADC',
  '#F4845F','#86E3CE','#FFDD57','#74B9FF','#FD79A8',
  '#55EFC4','#FDCB6E','#E17055','#81ECEC','#A29BFE',
]

// ─── SVG helpers ─────────────────────────────────────────────────────────────
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
function getArc(cx, cy, r, startAngle, endAngle) {
  const s = polarToCartesian(cx, cy, r, endAngle)
  const e = polarToCartesian(cx, cy, r, startAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y} Z`
}

// Smart truncation per slice angle
function getLabel(title, sliceAngle) {
  if (sliceAngle >= 30) return title.length > 18 ? title.slice(0, 17) + '…' : title
  if (sliceAngle >= 15) return title.length > 12 ? title.slice(0, 11) + '…' : title
  if (sliceAngle >= 8)  return title.length > 7  ? title.slice(0, 6)  + '…' : title
  return title.slice(0, 4) + (title.length > 4 ? '…' : '')
}

// Font size fitted to arc + capped for mobile readability
function calcFontSize(label, sliceAngle, labelR, wheelR) {
  const arcLength = (sliceAngle * Math.PI / 180) * labelR
  const byArc = arcLength / (label.length * 0.58)
  return Math.max(6.5, Math.min(14, byArc, wheelR * 0.055))
}

// ─── Input parser ─────────────────────────────────────────────────────────────
function parseInput(str) {
  const sep = str.includes(' – ') ? ' – ' : str.includes(' - ') ? ' - ' : null
  if (sep) {
    const idx = str.indexOf(sep)
    return { artist: str.slice(0, idx).trim(), title: str.slice(idx + sep.length).trim() }
  }
  return { artist: '', title: str.trim() }
}

// ─── Responsive wheel size ────────────────────────────────────────────────────
function useWheelSize() {
  const [size, setSize] = useState(() => Math.min(400, window.innerWidth - 32))
  useEffect(() => {
    const update = () => setSize(Math.min(400, window.innerWidth - 32))
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return size
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function App() {
  const [albums, setAlbums]           = useState([])
  const [disabledIds, setDisabledIds] = useState(new Set())
  const [input, setInput]             = useState('')
  const [spinning, setSpinning]       = useState(false)
  const [rotation, setRotation]       = useState(0)
  const [winner, setWinner]           = useState(null)
  const [showWinner, setShowWinner]   = useState(false)
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState(false)
  const [toast, setToast]             = useState(null)
  const [removing, setRemoving]       = useState(null)
  const [bounce, setBounce]           = useState(false)
  const [selectedArtist, setSelectedArtist] = useState(null)

  const inputRef = useRef(null)
  const size = useWheelSize()
  const cx = size / 2, cy = size / 2, r = size / 2 - 5

  // ── Load data from Supabase ───────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [albumsRes, stateRes] = await Promise.all([
          supabase.from('albums').select('id, artist, title').order('id'),
          supabase.from('album_wheel_state').select('disabled_ids').eq('id', 'default').single(),
        ])
        if (albumsRes.data) setAlbums(albumsRes.data)
        if (stateRes.data)  setDisabledIds(new Set(stateRes.data.disabled_ids || []))
      } catch {
        showToast('Could not load data')
      }
      setLoading(false)
    }
    load()

    // Realtime sync of disabled_ids across devices
    const channel = supabase
      .channel('wheel_state_changes')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'album_wheel_state', filter: 'id=eq.default',
      }, payload => setDisabledIds(new Set(payload.new.disabled_ids || [])))
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // ── Save disabled state ───────────────────────────────────────────────────
  const saveState = useCallback(async (nd) => {
    setSyncing(true)
    try {
      await supabase.from('album_wheel_state').upsert({
        id: 'default',
        disabled_ids: [...nd],
        updated_at: new Date().toISOString(),
      })
    } catch { showToast('Sync error') }
    finally { setSyncing(false) }
  }, [])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200) }

  // ── Album CRUD ────────────────────────────────────────────────────────────
  const addAlbum = async () => {
    const trimmed = input.trim()
    if (!trimmed) { setBounce(true); setTimeout(() => setBounce(false), 400); return }
    const { artist, title } = parseInput(trimmed)
    if (albums.some(a =>
      a.title.toLowerCase() === title.toLowerCase() &&
      a.artist.toLowerCase() === artist.toLowerCase()
    )) { showToast('Already on the wheel! 🎵'); return }

    setSyncing(true)
    try {
      const { data, error } = await supabase.from('albums').insert({ artist, title }).select().single()
      if (error) throw error
      setAlbums(prev => [...prev, data])
      setInput(''); inputRef.current?.focus()
    } catch { showToast('Could not add album') }
    finally { setSyncing(false) }
  }

  const removeAlbum = (id) => {
    setRemoving(id)
    setTimeout(async () => {
      setSyncing(true)
      try {
        await supabase.from('albums').delete().eq('id', id)
        setAlbums(prev => prev.filter(a => a.id !== id))
        const nd = new Set(disabledIds); nd.delete(id)
        setDisabledIds(nd); await saveState(nd)
      } catch { showToast('Could not remove') }
      finally { setSyncing(false); setRemoving(null) }
    }, 280)
  }

  const toggleAlbum = async (id) => {
    const nd = new Set(disabledIds)
    nd.has(id) ? nd.delete(id) : nd.add(id)
    setDisabledIds(nd); await saveState(nd)
  }

  const toggleArtist = async (artist) => {
    const ids = albums.filter(a => a.artist === artist).map(a => a.id)
    const allOff = ids.every(id => disabledIds.has(id))
    const nd = new Set(disabledIds)
    allOff ? ids.forEach(id => nd.delete(id)) : ids.forEach(id => nd.add(id))
    setDisabledIds(nd); await saveState(nd)
  }

  // Toggle all: if any active → disable all; if all disabled → enable all
  const toggleAll = async () => {
    const nd = activeAlbums.length > 0 ? new Set(albums.map(a => a.id)) : new Set()
    setDisabledIds(nd); await saveState(nd)
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeAlbums = useMemo(() => {
    let f = albums.filter(a => !disabledIds.has(a.id))
    if (selectedArtist && selectedArtist !== '__disabled__')
      f = f.filter(a => a.artist === selectedArtist)
    return f
  }, [albums, disabledIds, selectedArtist])

  const colorMap = useMemo(() => {
    const m = {}; albums.forEach((a, i) => { m[a.id] = i % COLORS.length }); return m
  }, [albums])

  const displayAlbums = useMemo(() => {
    const q = input.trim().toLowerCase()
    let list = albums
    if (selectedArtist === '__disabled__') list = list.filter(a => disabledIds.has(a.id))
    else if (selectedArtist) list = list.filter(a => a.artist === selectedArtist)
    if (q) list = list.filter(a =>
      a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
    )
    return list
  }, [albums, input, selectedArtist, disabledIds])

  const artists = useMemo(() => {
    const counts = {}
    albums.forEach(a => { counts[a.artist] = (counts[a.artist] || 0) + 1 })
    return Object.entries(counts).filter(([, n]) => n >= 3).map(([a]) => a).sort()
  }, [albums])

  const getArtistState = (artist) => {
    const ids = albums.filter(a => a.artist === artist).map(a => a.id)
    const dc  = ids.filter(id => disabledIds.has(id)).length
    return dc === 0 ? 'on' : dc === ids.length ? 'off' : 'partial'
  }

  // ── Spin logic ────────────────────────────────────────────────────────────
  const spin = () => {
    if (spinning || activeAlbums.length < 2) return
    setShowWinner(false); setWinner(null); setSpinning(true)
    const finalRotation = rotation + (6 + Math.floor(Math.random() * 4)) * 360 + Math.random() * 360
    setRotation(finalRotation)
    setTimeout(() => {
      const sliceSize = 360 / activeAlbums.length
      const idx = Math.floor(
        ((360 - ((finalRotation % 360) + 360) % 360) % 360) / sliceSize
      ) % activeAlbums.length
      setWinner(activeAlbums[idx]); setSpinning(false); setShowWinner(true)
    }, 4200)
  }

  const sliceAngle = activeAlbums.length > 0 ? 360 / activeAlbums.length : 360

  // ── Wheel slices (memoized so they don't re-render during spin) ───────────
  const wheelSlices = useMemo(() => {
    if (loading || activeAlbums.length === 0) return null
    if (activeAlbums.length === 1) return (
      <>
        <circle cx={cx} cy={cy} r={r} fill={COLORS[colorMap[activeAlbums[0].id] ?? 0]} />
        <text x={cx} y={cy + 5} textAnchor="middle" fill="white"
          fontSize="12" fontFamily="Nunito, sans-serif" fontWeight="800">
          {getLabel(activeAlbums[0].title, 360)}
        </text>
      </>
    )
    return activeAlbums.map((album, i) => {
      const startAngle = i * sliceAngle
      const endAngle   = (i + 1) * sliceAngle
      const midAngle   = startAngle + sliceAngle / 2
      const labelR     = r * 0.56
      const lp         = polarToCartesian(cx, cy, labelR, midAngle)
      const color      = COLORS[colorMap[album.id] ?? i % COLORS.length]
      const label      = getLabel(album.title, sliceAngle)
      const fs         = calcFontSize(label, sliceAngle, labelR, r)
      return (
        <g key={album.id}>
          <path d={getArc(cx, cy, r, startAngle, endAngle)} fill={color} stroke="#fff" strokeWidth="0.8" />
          <text
            x={lp.x} y={lp.y}
            textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={fs}
            fontFamily="Nunito, sans-serif" fontWeight="800"
            stroke="rgba(0,0,0,0.3)" strokeWidth="2" paintOrder="stroke"
            transform={`rotate(${midAngle - 90}, ${lp.x}, ${lp.y})`}
          >
            {label}
          </text>
        </g>
      )
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlbums, sliceAngle, cx, cy, r, colorMap, loading])

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#FFF9F0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.75rem 1rem 4rem' }}>
      <style>{`
        * { box-sizing: border-box; }
        body { overscroll-behavior: none; }
        .spin-btn {
          background: #FF6B6B; border: 4px solid #222; border-radius: 50px;
          color: white; font-family: 'Fredoka One', cursive; font-size: 1.3rem;
          padding: .65rem 2.4rem; cursor: pointer; box-shadow: 4px 4px 0 #222;
          transition: transform .1s, box-shadow .1s; user-select: none;
        }
        .spin-btn:hover:not(:disabled) { transform: translate(-2px,-2px); box-shadow: 6px 6px 0 #222; }
        .spin-btn:active:not(:disabled) { transform: translate(2px,2px); box-shadow: 2px 2px 0 #222; }
        .spin-btn:disabled { background: #ccc; cursor: not-allowed; box-shadow: 2px 2px 0 #aaa; color: #999; }
        .add-btn {
          background: #FF6B6B; border: 3px solid #222; border-radius: 12px;
          color: white; font-family: 'Fredoka One', cursive; font-size: 1.5rem;
          width: 44px; height: 44px; cursor: pointer; box-shadow: 3px 3px 0 #222;
          transition: transform .1s, box-shadow .1s;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .add-btn:hover  { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 #222; }
        .add-btn:active { transform: translate(1px,1px);   box-shadow: 1px 1px 0 #222; }
        .text-input {
          border: 3px solid #222; border-radius: 12px; padding: .55rem .9rem;
          font-family: 'Nunito', sans-serif; font-size: .95rem; font-weight: 700;
          background: white; color: #222; outline: none; flex: 1;
          box-shadow: 3px 3px 0 #e0e0e0;
        }
        .text-input::placeholder { color: #bbb; }
        .album-item {
          display: flex; align-items: center; gap: .6rem;
          padding: .42rem .75rem; border-bottom: 2px solid #f5ede0;
          transition: opacity .28s, transform .28s;
        }
        .album-item:last-child { border-bottom: none; }
        .album-item.disabled-item { opacity: .35; }
        .remove-btn {
          background: none; border: none; color: #ccc;
          cursor: pointer; font-size: .95rem; padding: 0; line-height: 1;
          transition: color .15s, transform .15s; flex-shrink: 0;
        }
        .remove-btn:hover { color: #FF6B6B; transform: scale(1.3); }
        .toggle-btn {
          background: #e8e8e8; border: 2.5px solid #d0d0d0; border-radius: 50%;
          cursor: pointer; width: 18px; height: 18px; padding: 0; flex-shrink: 0;
          transition: all .15s;
        }
        .toggle-btn.active { background: #F4A44A; border-color: #d4843a; box-shadow: 0 0 0 2.5px #F4A44A33; }
        .toggle-all-btn {
          background: none; border: 2px solid #ccc; border-radius: 8px;
          cursor: pointer; font-size: .72rem; padding: .2rem .5rem;
          color: #999; font-family: 'Fredoka One', cursive;
          transition: all .15s; flex-shrink: 0; line-height: 1.3;
        }
        .toggle-all-btn:hover { border-color: #F4A44A; color: #F4A44A; background: #fff8ef; }
        .artist-chip {
          border: 2.5px solid #222; border-radius: 20px; padding: .22rem .65rem;
          font-family: 'Fredoka One', cursive; font-size: .76rem; cursor: pointer;
          white-space: nowrap; transition: all .12s; flex-shrink: 0;
          box-shadow: 2px 2px 0 #222; background: white; color: #222;
        }
        .artist-chip:hover         { transform: translate(-1px,-1px); box-shadow: 3px 3px 0 #222; }
        .artist-chip.chip-off      { opacity: .5; }
        .artist-chip.chip-partial  { border-color: #FF6B6B; color: #FF6B6B; box-shadow: 2px 2px 0 #FF6B6B; }
        .artist-chip.chip-selected { background: #222; color: white; box-shadow: 2px 2px 0 #555; }
        @keyframes popIn { 0%{opacity:0;transform:scale(.5) rotate(-5deg)} 70%{transform:scale(1.08) rotate(2deg)} 100%{opacity:1;transform:scale(1) rotate(0)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        .winner-emoji { animation: float 1.4s ease-in-out infinite; display: inline-block; }
        .syncing-dot  { animation: pulse 1s ease-in-out infinite; }
        /* The rotating group — transform-origin set to SVG element center via fill-box */
        .wheel-spin-group {
          transform-box: fill-box;
          transform-origin: center;
        }
      `}</style>

      <div style={{ width: '100%', maxWidth: '440px' }}>

        {/* ── Header ── */}
        <div style={{ textAlign: 'center', marginBottom: '1.3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}>
            <h1 style={{ fontFamily: "'Fredoka One', cursive", fontSize: 'clamp(2.2rem,9vw,3rem)', color: '#222', margin: 0, textShadow: '3px 3px 0 #FFB347', lineHeight: 1.1 }}>
              Album Wheel!
            </h1>
            {syncing && <span className="syncing-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#F4A44A', display: 'inline-block', flexShrink: 0 }} />}
          </div>
          <p style={{ fontFamily: "'Nunito', sans-serif", color: '#999', fontSize: '.9rem', fontWeight: 700, margin: '.35rem 0 0' }}>
            Spin to pick your daily listen
          </p>
        </div>

        {/* ── Wheel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.3rem' }}>

          {/* Pointer — sits above the wheel, always static */}
          <svg width="26" height="30" viewBox="0 0 26 30"
            style={{ display: 'block', marginBottom: -2, position: 'relative', zIndex: 10, flexShrink: 0 }}>
            <polygon points="13,28 1,3 25,3" fill="#FF6B6B" stroke="#222" strokeWidth="2.5" strokeLinejoin="round"/>
            <circle cx="13" cy="3" r="3.5" fill="#FF6B6B" stroke="#222" strokeWidth="2"/>
          </svg>

          {/*
            Stable wheel container:
            - Fixed width/height = no layout shifts
            - Only the SVG <g> inside rotates (not any DOM element)
            - transform-box: fill-box + transform-origin: center → perfect center pivot
          */}
          <div style={{
            position: 'relative',
            width: size, height: size,
            flexShrink: 0,
          }}>
            {/* Drop shadow */}
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%', background: '#222',
              transform: 'translate(6px,6px)', zIndex: 0,
            }} />
            {/* Wheel frame */}
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              border: '5px solid #222',
              overflow: 'hidden',
              zIndex: 1,
              touchAction: 'none',
            }}>
              <svg
                width={size} height={size}
                style={{ display: 'block', userSelect: 'none' }}
              >
                {/* Empty state / loading */}
                {(loading || activeAlbums.length === 0) && (
                  <circle cx={cx} cy={cy} r={r} fill={loading ? '#f5f5f5' : '#f5ede0'} />
                )}
                {loading && (
                  <text x={cx} y={cy + 5} textAnchor="middle" fill="#ccc"
                    fontSize="13" fontFamily="Fredoka One, cursive">Loading…</text>
                )}
                {!loading && activeAlbums.length === 0 && (
                  <text x={cx} y={cy + 5} textAnchor="middle" fill="#ccc"
                    fontSize="13" fontFamily="Fredoka One, cursive">Enable albums!</text>
                )}

                {/* Spinning group — ONLY this element rotates */}
                {!loading && activeAlbums.length > 0 && (
                  <g
                    className="wheel-spin-group"
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      transition: spinning
                        ? 'transform 4s cubic-bezier(0.17,0.67,0.12,1.0)'
                        : 'none',
                      willChange: spinning ? 'transform' : 'auto',
                    }}
                  >
                    {wheelSlices}
                  </g>
                )}

                {/* Centre hub — static, always on top */}
                <circle cx={cx} cy={cy} r={14} fill="white" stroke="#222" strokeWidth="3" />
                <circle cx={cx} cy={cy} r={5.5} fill="#FFB347" stroke="#222" strokeWidth="2" />
              </svg>
            </div>
          </div>

          <button className="spin-btn" onClick={spin}
            disabled={spinning || loading || activeAlbums.length < 2}
            style={{ marginTop: '1.25rem' }}
          >
            {loading ? 'Loading… ⏳' : spinning ? 'Spinning… 🌀' : activeAlbums.length < 2 ? 'Enable 2+ albums!' : 'Spin it!'}
          </button>
        </div>

        {/* ── Panel ── */}
        <div style={{ background: 'white', border: '3px solid #222', borderRadius: '18px', overflow: 'hidden', boxShadow: '4px 4px 0 #222' }}>

          {/* Artist filter chips */}
          {artists.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', padding: '.65rem 1rem .55rem', borderBottom: '3px solid #f5ede0', background: '#FFF9F0' }}>
              <button className={`artist-chip ${!selectedArtist ? 'chip-selected' : ''}`}
                onClick={() => setSelectedArtist(null)}>
                All ({albums.length})
              </button>
              <button
                className={`artist-chip ${selectedArtist === '__disabled__' ? 'chip-selected' : disabledIds.size === 0 ? 'chip-off' : ''}`}
                onClick={() => setSelectedArtist(v => v === '__disabled__' ? null : '__disabled__')}>
                Off ({disabledIds.size})
              </button>
              {artists.map(artist => {
                const state      = getArtistState(artist)
                const isSelected = selectedArtist === artist
                const active     = albums.filter(a => a.artist === artist && !disabledIds.has(a.id)).length
                const total      = albums.filter(a => a.artist === artist).length
                return (
                  <button key={artist}
                    className={`artist-chip ${isSelected ? 'chip-selected' : state === 'off' ? 'chip-off' : state === 'partial' ? 'chip-partial' : ''}`}
                    onClick={() => setSelectedArtist(v => v === artist ? null : artist)}
                    onContextMenu={e => { e.preventDefault(); toggleArtist(artist) }}
                    title="Клик — фильтр  •  ПКМ — вкл/выкл всех">
                    {artist} ({active}/{total})
                  </button>
                )
              })}
            </div>
          )}

          {/* Header row */}
          <div style={{ padding: '.65rem 1rem', borderBottom: '3px solid #f5ede0', background: '#FFF9F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem' }}>
            <span style={{ fontFamily: "'Fredoka One', cursive", fontSize: '1rem', color: '#333', flexShrink: 0 }}>
              <span style={{ color: '#FF6B6B', fontSize: '1.4rem', lineHeight: 1 }}>+</span> Add an album
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexShrink: 0 }}>
              <button className="toggle-all-btn" onClick={toggleAll}
                title={activeAlbums.length > 0 ? 'Turn off all albums' : 'Turn on all albums'}>
                {activeAlbums.length > 0 ? 'Off all' : 'On all'}
              </button>
              <span style={{ background: '#F4A44A', color: 'white', fontFamily: "'Fredoka One', cursive", fontSize: '.82rem', padding: '.15rem .65rem', borderRadius: '20px' }}>
                {activeAlbums.length} / {albums.length}
              </span>
            </div>
          </div>

          {/* Input row */}
          <div style={{ padding: '.7rem 1rem', borderBottom: '3px solid #f5ede0' }}>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <input ref={inputRef} className="text-input" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addAlbum(); if (e.key === 'Escape') setInput('') }}
                placeholder="Search or add: Artist – Album"
                style={{ animation: bounce ? 'shake .4s ease' : 'none' }}
              />
              <button className="add-btn" onClick={addAlbum}>+</button>
            </div>
          </div>

          {/* Album list */}
          <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '1.2rem', textAlign: 'center', fontFamily: "'Nunito', sans-serif", color: '#ccc', fontSize: '.85rem', fontWeight: 700 }}>
                Loading albums…
              </div>
            )}
            {!loading && displayAlbums.map(album => {
              const isDisabled = disabledIds.has(album.id)
              return (
                <div key={album.id}
                  className={`album-item${isDisabled ? ' disabled-item' : ''}`}
                  style={{
                    opacity:   removing === album.id ? 0 : undefined,
                    transform: removing === album.id ? 'translateX(28px)' : 'none',
                  }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: COLORS[colorMap[album.id] ?? 0], border: '2px solid #222' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: '.84rem', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {album.title}
                    </div>
                    {album.artist && (
                      <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 600, fontSize: '.71rem', color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {album.artist}
                      </div>
                    )}
                  </div>
                  <button className={`toggle-btn ${!isDisabled ? 'active' : ''}`}
                    onClick={() => toggleAlbum(album.id)}
                    title={isDisabled ? 'Enable' : 'Disable'} />
                  <button className="remove-btn" onClick={() => removeAlbum(album.id)}>✕</button>
                </div>
              )
            })}
            {!loading && displayAlbums.length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', fontFamily: "'Nunito', sans-serif", color: '#ccc', fontSize: '.85rem', fontWeight: 700 }}>
                No albums found
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Winner modal ── */}
      {showWinner && winner && (
        <div onClick={() => setShowWinner(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', border: '5px solid #222', borderRadius: '24px', padding: '2.5rem 2rem', maxWidth: '340px', width: '100%', textAlign: 'center', boxShadow: '8px 8px 0 #222', animation: 'popIn .5s cubic-bezier(.34,1.56,.64,1)' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '.5rem' }}><span className="winner-emoji">🎉</span></div>
            <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: '1rem', color: '#aaa', marginBottom: '.5rem' }}>Today you're listening to...</div>
            <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 'clamp(1.3rem,5vw,1.8rem)', color: '#222', lineHeight: 1.2, marginBottom: '1.5rem', padding: '.75rem 1rem', background: '#FFF9F0', borderRadius: '12px', border: '3px solid #FFB347' }}>
              {winner.title}
              {winner.artist && <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: '.9rem', fontWeight: 700, color: '#aaa', marginTop: '.3rem' }}>{winner.artist}</div>}
            </div>
            <button onClick={() => setShowWinner(false)} style={{ background: '#FF6B6B', border: '3px solid #222', borderRadius: '50px', color: 'white', fontFamily: "'Fredoka One', cursive", fontSize: '1.1rem', padding: '.55rem 2rem', cursor: 'pointer', boxShadow: '3px 3px 0 #222' }}>
              Let's go! 🎧
            </button>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#222', color: 'white', padding: '.6rem 1.25rem', borderRadius: '50px', fontSize: '.85rem', fontFamily: "'Nunito', sans-serif", fontWeight: 700, zIndex: 200, whiteSpace: 'nowrap', animation: 'popIn .3s ease' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
