import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from './supabase.js'

const COLORS = [
  '#FF6B6B','#FFB347','#FFD93D','#6BCB77','#4D96FF',
  '#C77DFF','#FF6FC8','#00C9A7','#FF9A3C','#A8DADC',
  '#F4845F','#86E3CE','#FFDD57','#74B9FF','#FD79A8',
  '#55EFC4','#FDCB6E','#E17055','#81ECEC','#A29BFE'
]

function getArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}
function polarToCartesian(cx, cy, r, angle) {
  const rad = ((angle - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}
function parseInput(str) {
  const sep = str.includes(' – ') ? ' – ' : str.includes(' - ') ? ' - ' : null
  if (sep) {
    const idx = str.indexOf(sep)
    return { artist: str.slice(0, idx).trim(), title: str.slice(idx + sep.length).trim() }
  }
  return { artist: '', title: str.trim() }
}
function calcFontSize(title, sliceAngle, labelR, r) {
  const arcLength = (sliceAngle * Math.PI / 180) * labelR
  const byArc = arcLength / (title.length * 0.62)
  return Math.max(7, Math.min(18, byArc * 1.2, r * 0.58))
}

function useWheelSize() {
  const [size, setSize] = useState(() => Math.min(420, window.innerWidth - 40))
  useEffect(() => {
    const update = () => setSize(Math.min(420, window.innerWidth - 40))
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return size
}

const DEFAULT_ALBUMS = [
  { artist: 'Pink Floyd', title: 'The Wall', id: 1 },
  { artist: 'Radiohead', title: 'OK Computer', id: 2 },
  { artist: 'The Beatles', title: 'Abbey Road', id: 3 },
  { artist: 'David Bowie', title: 'Ziggy Stardust', id: 4 },
  { artist: 'Led Zeppelin', title: 'IV', id: 5 },
  { artist: 'Nirvana', title: 'Nevermind', id: 6 },
  { artist: 'Fleetwood Mac', title: 'Rumours', id: 7 },
  { artist: 'Amy Winehouse', title: 'Back to Black', id: 9 },
  { artist: 'The Strokes', title: 'Is This It', id: 10 },
  { artist: 'Daft Punk', title: 'Random Access Memories', id: 11 },
  { artist: 'Frank Ocean', title: 'Blonde', id: 12 },
  { artist: 'Massive Attack', title: 'Mezzanine', id: 13 },
  { artist: 'Portishead', title: 'Dummy', id: 14 },
  { artist: 'Arctic Monkeys', title: 'AM', id: 15 },
  { artist: 'Tame Impala', title: 'Currents', id: 16 },
  { artist: 'Boards of Canada', title: 'Music Has the Right to Children', id: 17 },
  { artist: 'Gorillaz', title: 'Gorillaz', id: 101 },
  { artist: 'Gorillaz', title: 'Demon Days', id: 102 },
  { artist: 'Gorillaz', title: 'Plastic Beach', id: 103 },
  { artist: 'Gorillaz', title: 'The Fall', id: 104 },
  { artist: 'Gorillaz', title: 'Humanz', id: 105 },
  { artist: 'Gorillaz', title: 'The Now Now', id: 106 },
  { artist: 'Gorillaz', title: 'Song Machine Season One', id: 107 },
  { artist: 'Gorillaz', title: 'Cracker Island', id: 108 },
  { artist: 'Jamiroquai', title: 'Emergency on Planet Earth', id: 201 },
  { artist: 'Jamiroquai', title: 'The Return of the Space Cowboy', id: 202 },
  { artist: 'Jamiroquai', title: 'Travelling Without Moving', id: 203 },
  { artist: 'Jamiroquai', title: 'Synkronized', id: 204 },
  { artist: 'Jamiroquai', title: 'A Funk Odyssey', id: 205 },
  { artist: 'Jamiroquai', title: 'Dynamite', id: 206 },
  { artist: 'Jamiroquai', title: 'Rock Dust Light Star', id: 207 },
  { artist: 'Jamiroquai', title: 'Automaton', id: 208 },
  { artist: 'Kendrick Lamar', title: 'Overly Dedicated', id: 301 },
  { artist: 'Kendrick Lamar', title: 'Section.80', id: 302 },
  { artist: 'Kendrick Lamar', title: 'good kid m.A.A.d city', id: 303 },
  { artist: 'Kendrick Lamar', title: 'To Pimp a Butterfly', id: 304 },
  { artist: 'Kendrick Lamar', title: 'DAMN.', id: 305 },
  { artist: 'Kendrick Lamar', title: 'Mr. Morale & The Big Steppers', id: 306 },
  { artist: 'Kendrick Lamar', title: 'GNX', id: 307 },
  { artist: 'Death Grips', title: 'The Money Store', id: 401 },
  { artist: 'Swans', title: 'To Be Kind', id: 402 },
  { artist: 'Kids See Ghosts', title: 'Kids See Ghosts', id: 403 },
  { artist: 'Daughters', title: "You Won't Get What You Want", id: 404 },
  { artist: 'SPELLLING', title: 'The Turning Wheel', id: 405 },
  { artist: 'Lingua Ignota', title: 'Sinner Get Ready', id: 406 },
  { artist: 'Charli XCX', title: 'Brat', id: 407 },
  { artist: 'Clipse', title: 'Let God Sort Em Out', id: 408 },
  { artist: 'Madvillain', title: 'Madvillainy', id: 409 },
  { artist: 'System of a Down', title: 'Toxicity', id: 410 },
  { artist: 'Björk', title: 'Vespertine', id: 411 },
  { artist: 'Daft Punk', title: 'Discovery', id: 412 },
  { artist: 'Godspeed You! Black Emperor', title: 'Lift Your Skinny Fists Like Antennas to Heaven', id: 413 },
  { artist: 'Lauryn Hill', title: 'The Miseducation of Lauryn Hill', id: 414 },
  { artist: 'Charles Mingus', title: 'The Black Saint and the Sinner Lady', id: 501 },
  { artist: 'Bob Dylan', title: 'Highway 61 Revisited', id: 502 },
  { artist: 'Nina Simone', title: 'Nina Simone Sings the Blues', id: 503 },
  { artist: 'Frank Zappa', title: 'Hot Rats', id: 504 },
  { artist: 'Miles Davis', title: 'Bitches Brew', id: 505 },
  { artist: 'Marvin Gaye', title: "What's Going On", id: 506 },
  { artist: 'Television', title: 'Marquee Moon', id: 507 },
  { artist: 'The Clash', title: 'London Calling', id: 508 },
  { artist: 'Prince', title: 'Purple Rain', id: 509 },
  { artist: 'Kate Bush', title: 'Hounds of Love', id: 510 },
  { artist: 'Led Zeppelin', title: 'Physical Graffiti', id: 511 },
  { artist: 'Talking Heads', title: 'Remain in Light', id: 512 },
  { artist: 'Wu-Tang Clan', title: 'Enter the Wu-Tang (36 Chambers)', id: 513 },
  { artist: 'Neutral Milk Hotel', title: 'In the Aeroplane Over the Sea', id: 514 },
  { artist: 'Massive Attack', title: 'Blue Lines', id: 515 },
  { artist: 'Danny Brown', title: 'Atrocity Exhibition', id: 601 },
  { artist: 'Father John Misty', title: 'Pure Comedy', id: 602 },
  { artist: 'Kamasi Washington', title: 'The Epic', id: 603 },
  { artist: 'Mount Eerie', title: 'A Crow Looked at Me', id: 604 },
  { artist: 'PJ Harvey', title: 'Let England Shake', id: 605 },
  { artist: 'Tyler, the Creator', title: 'Igor', id: 606 },
  { artist: 'Fleet Foxes', title: 'Helplessness Blues', id: 607 },
  { artist: 'Tim Hecker', title: 'Virgins', id: 608 },
  { artist: 'Sun Kil Moon', title: 'Benji', id: 609 },
  { artist: 'Joanna Newsom', title: 'Have One on Me', id: 610 },
  { artist: 'FKA twigs', title: 'LP1', id: 611 },
  { artist: 'Radiohead', title: 'A Moon Shaped Pool', id: 612 },
  { artist: 'Weyes Blood', title: 'Titanic Rising', id: 613 },
  { artist: 'Little Simz', title: 'GREY Area', id: 614 },
  { artist: 'A Tribe Called Quest', title: 'We Got It from Here', id: 615 },
  { artist: 'Perfume Genius', title: 'No Shape', id: 616 },
  { artist: 'Destroyer', title: 'Kaputt', id: 617 },
  { artist: 'Nicolas Jaar', title: 'Space Is Only Noise', id: 618 },
  { artist: 'Billie Eilish', title: 'When We All Fall Asleep Where Do We Go', id: 619 },
  { artist: 'David Bowie', title: 'Blackstar', id: 620 },
  { artist: 'Lingua Ignota', title: 'Caligula', id: 621 },
  { artist: 'Parquet Courts', title: 'Wide Awake!', id: 622 },
  { artist: 'Big K.R.I.T.', title: '4eva Is a Mighty Long Time', id: 623 },
  { artist: 'Sons of Kemet', title: 'Your Queen Is a Reptile', id: 624 },
  { artist: 'Billy Woods', title: 'History Will Absolve Me', id: 625 },
  { artist: 'Prurient', title: 'Frozen Niagara Falls', id: 626 },
  { artist: 'Richard Dawson', title: '2020', id: 627 },
  { artist: 'Swans', title: 'The Glowing Man', id: 628 },
  { artist: 'JPEGMAFIA', title: 'Veteran', id: 629 },
  { artist: 'clipping.', title: 'There Existed an Addiction to Blood', id: 630 },
  { artist: 'Death Grips', title: 'No Love Deep Web', id: 631 },
  { artist: 'Idles', title: 'Joy as an Act of Resistance', id: 632 },
  { artist: 'Young Fathers', title: 'Cocoa Sugar', id: 633 },
  { artist: 'Travis Scott', title: 'Rodeo', id: 634 },
  { artist: 'Rina Sawayama', title: 'Sawayama', id: 635 },
  { artist: 'Otoboke Beaver', title: 'Itekoma Hits', id: 636 },
  { artist: 'Weyes Blood', title: 'And in the Darkness Hearts Aglow', id: 637 },
  { artist: 'Little Simz', title: 'Sometimes I Might Be Introvert', id: 638 },
  { artist: 'JPEGMAFIA & Danny Brown', title: 'Scaring the Hoes', id: 639 },
  { artist: 'McKinley Dixon', title: 'For My Mama and Anyone Who Look Like Her', id: 640 },
  { artist: 'Laura Marling', title: 'Patterns in Repeat', id: 641 },
  { artist: 'Imperial Triumphant', title: 'Goldstar', id: 642 },
  { artist: 'Backxwash', title: 'Only Dust Remains', id: 643 },
  { artist: 'Jane Remover', title: 'Revengeseekerz', id: 644 },
  { artist: 'McKinley Dixon', title: 'Magic Alive!', id: 645 },
  { artist: 'Tropical Fuck Storm', title: 'Fairyland Codex', id: 646 },
  { artist: 'Jill Scott', title: 'To Whom This May Concern', id: 647 },
  { artist: 'By Storm', title: 'My Ghosts Go Ghost', id: 648 },
  { artist: 'Alice Coltrane', title: 'Journey in Satchidananda', id: 701 },
  { artist: 'Aphex Twin', title: 'Selected Ambient Works 85-92', id: 702 },
  { artist: 'Burial', title: 'Untrue', id: 703 },
  { artist: 'Cannibal Ox', title: 'The Cold Vein', id: 704 },
  { artist: 'Captain Beefheart', title: 'Trout Mask Replica', id: 705 },
  { artist: 'Clipse', title: 'Hell Hath No Fury', id: 706 },
  { artist: 'Cocteau Twins', title: 'Heaven or Las Vegas', id: 707 },
  { artist: 'Converge', title: 'Jane Doe', id: 708 },
  { artist: 'Dead Kennedys', title: 'Plastic Surgery Disasters', id: 709 },
  { artist: 'DJ Shadow', title: 'Entroducing.....', id: 710 },
  { artist: 'Elliott Smith', title: 'Elliott Smith', id: 711 },
  { artist: 'Emperor', title: 'In the Nightside Eclipse', id: 712 },
  { artist: 'Fugazi', title: 'Repeater', id: 713 },
  { artist: 'Iron Maiden', title: 'The Number of the Beast', id: 714 },
  { artist: 'Janet Jackson', title: 'The Velvet Rope', id: 715 },
  { artist: 'Jimi Hendrix', title: 'Electric Ladyland', id: 716 },
  { artist: 'Johnny Cash', title: 'At Folsom Prison', id: 717 },
  { artist: 'Joy Division', title: 'Unknown Pleasures', id: 718 },
  { artist: 'King Crimson', title: 'In the Court of the Crimson King', id: 719 },
  { artist: 'Kraftwerk', title: 'Trans-Europe Express', id: 720 },
  { artist: 'M.I.A.', title: 'Arular', id: 721 },
  { artist: 'Michael Jackson', title: 'Thriller', id: 722 },
  { artist: 'The Microphones', title: 'The Glow Pt. 2', id: 723 },
  { artist: 'My Bloody Valentine', title: 'Loveless', id: 724 },
  { artist: 'My Chemical Romance', title: 'The Black Parade', id: 725 },
  { artist: 'N.W.A.', title: 'Straight Outta Compton', id: 726 },
  { artist: 'Nas', title: 'Illmatic', id: 727 },
  { artist: 'Nine Inch Nails', title: 'The Downward Spiral', id: 728 },
  { artist: 'Nina Simone', title: 'Pastel Blues', id: 729 },
  { artist: 'A Tribe Called Quest', title: 'The Low End Theory', id: 730 },
  { artist: 'Stevie Wonder', title: 'Songs in the Key of Life', id: 731 },
  { artist: 'Yellow Magic Orchestra', title: 'Solid State Survivor', id: 732 },
  { artist: 'The Smiths', title: 'The Queen Is Dead', id: 733 },
  { artist: 'Sade', title: 'Diamond Life', id: 734 },
  { artist: 'The Avalanches', title: 'Since I Left You', id: 735 },
  { artist: 'Bone Thugs-n-Harmony', title: 'E. 1999 Eternal', id: 736 },
  { artist: 'Dolly Parton', title: 'Jolene', id: 737 },
  { artist: 'Morbid Angel', title: 'Altars of Madness', id: 738 },
  { artist: 'Nine Inch Nails', title: 'Pretty Hate Machine', id: 739 },
  { artist: 'M.I.A.', title: 'Kala', id: 740 },
  { artist: 'J. Cole', title: 'Cole World: The Sideline Story', id: 801 },
  { artist: 'J. Cole', title: 'Born Sinner', id: 802 },
  { artist: 'J. Cole', title: '2014 Forest Hills Drive', id: 803 },
  { artist: 'J. Cole', title: '4 Your Eyez Only', id: 804 },
  { artist: 'J. Cole', title: 'KOD', id: 805 },
  { artist: 'J. Cole', title: 'The Off-Season', id: 806 },
  { artist: 'J. Cole', title: "It's a Boy", id: 807 },
  { artist: 'Mac Miller', title: 'Best Day Ever', id: 901 },
  { artist: 'Mac Miller', title: 'Blue Slide Park', id: 902 },
  { artist: 'Mac Miller', title: 'Watching Movies with the Sound Off', id: 903 },
  { artist: 'Mac Miller', title: 'GO:OD AM', id: 904 },
  { artist: 'Mac Miller', title: 'The Divine Feminine', id: 905 },
  { artist: 'Mac Miller', title: 'Swimming', id: 906 },
  { artist: 'Mac Miller', title: 'Circles', id: 907 },
  { artist: 'ASAP Rocky', title: 'Long.Live.ASAP', id: 1001 },
  { artist: 'ASAP Rocky', title: 'At.Long.Last.ASAP', id: 1002 },
  { artist: 'ASAP Rocky', title: 'Testing', id: 1003 },
  { artist: 'ASAP Rocky', title: "Don't Be Dumb", id: 1004 },
]

export default function App() {
  const [albums, setAlbums] = useState(DEFAULT_ALBUMS)
  const [disabledIds, setDisabledIds] = useState(new Set())
  const [input, setInput] = useState('')
  const [spinning, setSpinning] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [winner, setWinner] = useState(null)
  const [showWinner, setShowWinner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [bounce, setBounce] = useState(false)
  const [selectedArtist, setSelectedArtist] = useState(null)
  const inputRef = useRef(null)
  const size = useWheelSize()

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('album_wheel_state')
          .select('albums, disabled_ids')
          .eq('id', 'default')
          .single()
        const stored = data?.albums || []
        const newDisabled = new Set(data?.disabled_ids || [])
        const merged = [...stored]
        for (const def of DEFAULT_ALBUMS) {
          const exists = merged.some(
            a => a.title.toLowerCase() === def.title.toLowerCase() &&
                 a.artist.toLowerCase() === def.artist.toLowerCase()
          )
          if (!exists) merged.push(def)
        }
        setAlbums(merged)
        setDisabledIds(newDisabled)
        // Always persist — saves defaults on first run, new albums on updates
        await supabase.from('album_wheel_state').upsert({
          id: 'default',
          albums: merged,
          disabled_ids: [...newDisabled],
          updated_at: new Date().toISOString()
        })
      } catch (e) {}
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel('album_wheel_changes')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'album_wheel_state', filter: 'id=eq.default'
      }, (payload) => {
        setAlbums(payload.new.albums || [])
        setDisabledIds(new Set(payload.new.disabled_ids || []))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  const save = useCallback(async (newAlbums, newDisabledIds) => {
    setSyncing(true)
    try {
      await supabase.from('album_wheel_state').upsert({
        id: 'default',
        albums: newAlbums,
        disabled_ids: [...newDisabledIds],
        updated_at: new Date().toISOString()
      })
    } catch (e) {
      showToast('Sync error')
    } finally {
      setSyncing(false)
    }
  }, [])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200) }

  const addAlbum = async () => {
    const trimmed = input.trim()
    if (!trimmed) { setBounce(true); setTimeout(() => setBounce(false), 400); return }
    const { artist, title } = parseInput(trimmed)
    if (albums.some(a => a.title.toLowerCase() === title.toLowerCase() && a.artist.toLowerCase() === artist.toLowerCase())) {
      showToast('Already on the wheel! 🎵'); return
    }
    const newAlbums = [...albums, { artist, title, id: Date.now() }]
    setAlbums(newAlbums)
    await save(newAlbums, disabledIds)
    setInput(''); inputRef.current?.focus()
  }

  const removeAlbum = async (id) => {
    setRemoving(id)
    setTimeout(async () => {
      const newAlbums = albums.filter(a => a.id !== id)
      const newDisabled = new Set(disabledIds); newDisabled.delete(id)
      setAlbums(newAlbums); setDisabledIds(newDisabled)
      await save(newAlbums, newDisabled); setRemoving(null)
    }, 300)
  }

  const toggleAlbum = async (id) => {
    const newDisabled = new Set(disabledIds)
    if (newDisabled.has(id)) newDisabled.delete(id); else newDisabled.add(id)
    setDisabledIds(newDisabled); await save(albums, newDisabled)
  }

  const toggleArtist = async (artist) => {
    const ids = albums.filter(a => a.artist === artist).map(a => a.id)
    const allDisabled = ids.every(id => disabledIds.has(id))
    const newDisabled = new Set(disabledIds)
    if (allDisabled) ids.forEach(id => newDisabled.delete(id)); else ids.forEach(id => newDisabled.add(id))
    setDisabledIds(newDisabled); await save(albums, newDisabled)
  }

  const activeAlbums = useMemo(() => {
    let f = albums.filter(a => !disabledIds.has(a.id))
    if (selectedArtist && selectedArtist !== '__disabled__') f = f.filter(a => a.artist === selectedArtist)
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
    if (q) list = list.filter(a => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q))
    return list
  }, [albums, input, selectedArtist, disabledIds])

  const artists = useMemo(() => {
    const counts = {}
    albums.forEach(a => { counts[a.artist] = (counts[a.artist] || 0) + 1 })
    return Object.entries(counts).filter(([, n]) => n >= 3).map(([a]) => a).sort()
  }, [albums])

  const getArtistState = (artist) => {
    const ids = albums.filter(a => a.artist === artist).map(a => a.id)
    const dc = ids.filter(id => disabledIds.has(id)).length
    return dc === 0 ? 'on' : dc === ids.length ? 'off' : 'partial'
  }

  const spin = () => {
    if (spinning || activeAlbums.length < 2) return
    setShowWinner(false); setWinner(null); setSpinning(true)
    const finalRotation = rotation + (6 + Math.floor(Math.random() * 4)) * 360 + Math.random() * 360
    setRotation(finalRotation)
    setTimeout(() => {
      const sliceSize = 360 / activeAlbums.length
      const idx = Math.floor(((360 - ((finalRotation % 360) + 360) % 360) % 360) / sliceSize) % activeAlbums.length
      setWinner(activeAlbums[idx]); setSpinning(false); setShowWinner(true)
    }, 4200)
  }

  const cx = size / 2, cy = size / 2, r = size / 2 - 6
  const sliceAngle = activeAlbums.length > 0 ? 360 / activeAlbums.length : 360

  return (
    <div style={{ minHeight: '100vh', background: '#FFF9F0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem 4rem' }}>
      <style>{`
        * { box-sizing: border-box; }
        .spin-btn { background: #FF6B6B; border: 4px solid #222; border-radius: 50px; color: white; font-family: 'Fredoka One', cursive; font-size: 1.3rem; padding: 0.7rem 2.5rem; cursor: pointer; box-shadow: 4px 4px 0px #222; transition: transform 0.1s, box-shadow 0.1s; }
        .spin-btn:hover:not(:disabled) { transform: translate(-2px,-2px); box-shadow: 6px 6px 0px #222; }
        .spin-btn:active:not(:disabled) { transform: translate(2px,2px); box-shadow: 2px 2px 0px #222; }
        .spin-btn:disabled { background: #ccc; cursor: not-allowed; box-shadow: 2px 2px 0px #aaa; color: #999; }
        .add-btn { background: #FF6B6B; border: 3px solid #222; border-radius: 12px; color: white; font-family: 'Fredoka One', cursive; font-size: 1.5rem; width: 44px; height: 44px; cursor: pointer; box-shadow: 3px 3px 0px #222; transition: transform 0.1s, box-shadow 0.1s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .add-btn:hover { transform: translate(-1px,-1px); box-shadow: 4px 4px 0px #222; }
        .add-btn:active { transform: translate(1px,1px); box-shadow: 1px 1px 0px #222; }
        .text-input { border: 3px solid #222; border-radius: 12px; padding: 0.55rem 0.9rem; font-family: 'Nunito', sans-serif; font-size: 0.95rem; font-weight: 700; background: white; color: #222; outline: none; flex: 1; box-shadow: 3px 3px 0px #e0e0e0; transition: box-shadow 0.1s, border-color 0.1s; }
        .text-input:focus { border-color: #222; box-shadow: 3px 3px 0px #ccc; }
        .text-input::placeholder { color: #bbb; }
        .album-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.75rem; border-bottom: 2px solid #f5ede0; transition: opacity 0.3s, transform 0.3s; }
        .album-item:last-child { border-bottom: none; }
        .album-item.disabled-item { opacity: 0.38; }
        .remove-btn { background: none; border: none; color: #ccc; cursor: pointer; font-size: 1rem; padding: 0; line-height: 1; transition: color 0.15s, transform 0.15s; flex-shrink: 0; }
        .remove-btn:hover { color: #FF6B6B; transform: scale(1.3); }
        .toggle-btn { background: #e8e8e8; border: 2.5px solid #d0d0d0; border-radius: 50%; cursor: pointer; width: 18px; height: 18px; padding: 0; flex-shrink: 0; transition: all 0.15s; }
        .toggle-btn.active { background: #F4A44A; border-color: #d4843a; box-shadow: 0 0 0 2.5px #F4A44A33; }
        .artist-chip { border: 2.5px solid #222; border-radius: 20px; padding: 0.22rem 0.65rem; font-family: 'Fredoka One', cursive; font-size: 0.76rem; cursor: pointer; white-space: nowrap; transition: all 0.12s; flex-shrink: 0; box-shadow: 2px 2px 0px #222; background: white; color: #222; }
        .artist-chip:hover { transform: translate(-1px,-1px); box-shadow: 3px 3px 0px #222; }
        .artist-chip.chip-off { opacity: 0.5; }
        .artist-chip.chip-partial { border-color: #FF6B6B; color: #FF6B6B; box-shadow: 2px 2px 0px #FF6B6B; }
        .artist-chip.chip-selected { background: #222; color: white; box-shadow: 2px 2px 0px #555; }
        @keyframes popIn { 0% { opacity:0; transform: scale(0.5) rotate(-5deg); } 70% { transform: scale(1.08) rotate(2deg); } 100% { opacity:1; transform: scale(1) rotate(0deg); } }
        @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
        @keyframes shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .winner-emoji { animation: float 1.4s ease-in-out infinite; display: inline-block; }
        .syncing-dot { animation: pulse 1s ease-in-out infinite; }
      `}</style>

      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}>
            <h1 style={{ fontFamily: "'Fredoka One', cursive", fontSize: 'clamp(2.2rem, 9vw, 3rem)', color: '#222', margin: 0, textShadow: '3px 3px 0px #FFB347', lineHeight: 1.1 }}>Album Wheel!</h1>
            {syncing && <span className="syncing-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#F4A44A', display: 'inline-block', flexShrink: 0 }} title="Syncing..." />}
          </div>
          <p style={{ fontFamily: "'Nunito', sans-serif", color: '#999', fontSize: '0.9rem', fontWeight: 700, margin: '0.4rem 0 0' }}>Spin to pick your daily listen</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
              <svg width="28" height="40" viewBox="0 0 28 40">
                <polygon points="14,38 2,6 26,6" fill="#FF6B6B" stroke="#222" strokeWidth="2.5" strokeLinejoin="round"/>
                <circle cx="14" cy="6" r="4" fill="#FF6B6B" stroke="#222" strokeWidth="2"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', top: '8px', left: '8px', width: size, height: size, borderRadius: '50%', background: '#222', zIndex: 0 }} />
            <div style={{ position: 'relative', zIndex: 1, border: '5px solid #222', borderRadius: '50%', overflow: 'hidden', width: size, height: size, touchAction: 'none' }}>
              <div style={{
                width: '100%', height: '100%',
                transform: `translateZ(0) rotate(${rotation}deg)`,
                transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 1.0)' : 'none',
                willChange: spinning ? 'transform' : 'auto',
                backfaceVisibility: 'hidden',
                pointerEvents: spinning ? 'none' : 'auto',
              }}>
              <svg width={size} height={size} style={{ display: 'block' }}>
                {loading ? (
                  <circle cx={cx} cy={cy} r={r} fill="#f5f5f5" />
                ) : activeAlbums.length === 0 ? (
                  <><circle cx={cx} cy={cy} r={r} fill="#f5ede0" /><text x={cx} y={cy} textAnchor="middle" fill="#ccc" fontSize="14" fontFamily="Fredoka One, cursive">Enable some albums!</text></>
                ) : activeAlbums.length === 1 ? (
                  <><circle cx={cx} cy={cy} r={r} fill={COLORS[colorMap[activeAlbums[0].id] ?? 0]} /><text x={cx} y={cy+5} textAnchor="middle" fill="white" fontSize="13" fontFamily="Nunito, sans-serif" fontWeight="800">{truncate(activeAlbums[0].title, 18)}</text></>
                ) : (
                  activeAlbums.map((album, i) => {
                    const startAngle = i * sliceAngle, endAngle = (i + 1) * sliceAngle
                    const midAngle = startAngle + sliceAngle / 2
                    const labelR = r * 0.55
                    const labelPos = polarToCartesian(cx, cy, labelR, midAngle)
                    const color = COLORS[colorMap[album.id] ?? i % COLORS.length]
                    const fontSize = calcFontSize(album.title, sliceAngle, labelR, r)
                    return (
                      <g key={album.id}>
                        <path d={getArc(cx, cy, r, startAngle, endAngle)} fill={color} stroke="#222" strokeWidth="2" />
                        <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={fontSize} fontFamily="Nunito, sans-serif" fontWeight="800" stroke="#00000044" strokeWidth="2.5" paintOrder="stroke" transform={`rotate(${midAngle - 90}, ${labelPos.x}, ${labelPos.y})`}>{album.title}</text>
                      </g>
                    )
                  })
                )}
                <circle cx={cx} cy={cy} r={16} fill="white" stroke="#222" strokeWidth="3" />
                <circle cx={cx} cy={cy} r={7} fill="#FFB347" stroke="#222" strokeWidth="2" />
              </svg>
              </div>
            </div>
          </div>
          <button className="spin-btn" onClick={spin} disabled={spinning || activeAlbums.length < 2} style={{ marginTop: '1.5rem' }}>
            {spinning ? 'Spinning… 🌀' : activeAlbums.length < 2 ? 'Enable 2+ albums!' : 'Spin it!'}
          </button>
        </div>

        <div style={{ background: 'white', border: '3px solid #222', borderRadius: '18px', overflow: 'hidden', boxShadow: '4px 4px 0px #222', marginBottom: '1rem' }}>
          {artists.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', padding: '0.7rem 1rem 0.6rem', borderBottom: '3px solid #f5ede0', background: '#FFF9F0' }}>
              <button className={`artist-chip ${!selectedArtist ? 'chip-selected' : ''}`} onClick={() => setSelectedArtist(null)}>All ({albums.length})</button>
              <button className={`artist-chip ${selectedArtist === '__disabled__' ? 'chip-selected' : disabledIds.size === 0 ? 'chip-off' : ''}`} onClick={() => setSelectedArtist(selectedArtist === '__disabled__' ? null : '__disabled__')}>Off ({disabledIds.size})</button>
              {artists.map(artist => {
                const state = getArtistState(artist)
                const isSelected = selectedArtist === artist
                const activeCount = albums.filter(a => a.artist === artist && !disabledIds.has(a.id)).length
                const total = albums.filter(a => a.artist === artist).length
                return (
                  <button key={artist} className={`artist-chip ${isSelected ? 'chip-selected' : state === 'off' ? 'chip-off' : state === 'partial' ? 'chip-partial' : ''}`}
                    onClick={() => setSelectedArtist(isSelected ? null : artist)}
                    onContextMenu={e => { e.preventDefault(); toggleArtist(artist) }}
                    title="Click to filter • Right-click to enable/disable all">
                    {artist} ({activeCount}/{total})
                  </button>
                )
              })}
            </div>
          )}
          <div style={{ padding: '0.7rem 1rem', borderBottom: '3px solid #f5ede0', background: '#FFF9F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: "'Fredoka One', cursive", fontSize: '1rem', color: '#333' }}>
              <span style={{ color: '#FF6B6B', fontSize: '1.5rem', lineHeight: 1 }}>+</span> Add an album
            </span>
            <span style={{ background: '#F4A44A', color: 'white', fontFamily: "'Fredoka One', cursive", fontSize: '0.82rem', padding: '0.15rem 0.65rem', borderRadius: '20px' }}>
              {activeAlbums.length} / {albums.length}
            </span>
          </div>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '3px solid #f5ede0' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input ref={inputRef} className="text-input" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addAlbum(); if (e.key === 'Escape') setInput('') }}
                placeholder="Search or add: Artist – Album"
                style={{ animation: bounce ? 'shake 0.4s ease' : 'none' }} />
              <button className="add-btn" onClick={addAlbum}>+</button>
            </div>
          </div>
          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
            {displayAlbums.map((album) => {
              const isDisabled = disabledIds.has(album.id)
              return (
                <div key={album.id} className={`album-item${isDisabled ? ' disabled-item' : ''}`}
                  style={{ opacity: removing === album.id ? 0 : undefined, transform: removing === album.id ? 'translateX(30px)' : 'none' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, background: COLORS[colorMap[album.id] ?? 0], border: '2px solid #222' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: '0.85rem', color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{album.title}</div>
                    {album.artist && <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 600, fontSize: '0.72rem', color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{album.artist}</div>}
                  </div>
                  <button className={`toggle-btn ${!isDisabled ? 'active' : ''}`} onClick={() => toggleAlbum(album.id)} title={isDisabled ? 'Enable' : 'Disable'} />
                  <button className="remove-btn" onClick={() => removeAlbum(album.id)}>✕</button>
                </div>
              )
            })}
            {displayAlbums.length === 0 && <div style={{ padding: '1rem', textAlign: 'center', fontFamily: "'Nunito', sans-serif", color: '#ccc', fontSize: '0.85rem', fontWeight: 700 }}>No albums found</div>}
          </div>
        </div>
      </div>

      {showWinner && winner && (
        <div onClick={() => setShowWinner(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', border: '5px solid #222', borderRadius: '24px', padding: '2.5rem 2rem', maxWidth: '340px', width: '100%', textAlign: 'center', boxShadow: '8px 8px 0px #222', animation: 'popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}><span className="winner-emoji">🎉</span></div>
            <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: '1rem', color: '#aaa', marginBottom: '0.5rem' }}>Today you're listening to...</div>
            <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 'clamp(1.3rem, 5vw, 1.8rem)', color: '#222', lineHeight: 1.2, marginBottom: '1.5rem', padding: '0.75rem 1rem', background: '#FFF9F0', borderRadius: '12px', border: '3px solid #FFB347' }}>
              {winner.title}
              {winner.artist && <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.9rem', fontWeight: 700, color: '#aaa', marginTop: '0.3rem' }}>{winner.artist}</div>}
            </div>
            <button onClick={() => setShowWinner(false)} style={{ background: '#FF6B6B', border: '3px solid #222', borderRadius: '50px', color: 'white', fontFamily: "'Fredoka One', cursive", fontSize: '1.1rem', padding: '0.55rem 2rem', cursor: 'pointer', boxShadow: '3px 3px 0px #222' }}>Let's go! 🎧</button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: '#222', color: 'white', padding: '0.6rem 1.25rem', borderRadius: '50px', fontSize: '0.85rem', fontFamily: "'Nunito', sans-serif", fontWeight: 700, zIndex: 200, whiteSpace: 'nowrap', animation: 'popIn 0.3s ease' }}>{toast}</div>
      )}
    </div>
  )
}
