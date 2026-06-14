/* Sprout — a luminous flower-spirit website pet.
   Mountable ES-module port of the standalone pet.js: `mountSprout(opts)` builds
   her + props/aura/trail, starts the loop, and returns `{ destroy, setActivity }`.
   `setActivity(name|null)` drives her per-page activity (singing / music /
   painting / reading / sleep / null=roam); dark mode overrides everything to
   sleep. `destroy()` removes all DOM, listeners and the RAF loop (StrictMode-safe).

   She also reacts on her own: roams + tracks the cursor, gets curious on hover,
   happy on click/pat, dizzy → mad → sulks off to sleep when shaken, and — in
   `playful` mode (the error page) — chases `window.__ballsState`. */

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
const now = () => performance.now()
const SVGNS = 'http://www.w3.org/2000/svg'

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// rounded, full flower petal from a centre outward (soft lotus/daisy tip)
function petalPath(cx, cy, angDeg, len, wid) {
  const a = (angDeg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const px = -sa
  const py = ca
  const al = (d) => [cx + ca * d, cy + sa * d]
  const P = (pt, s) => `${(pt[0] + px * s).toFixed(1)} ${(pt[1] + py * s).toFixed(1)}`
  const B = al(len * 0.02)
  const T = al(len)
  const c1 = al(len * 0.3)
  const c2 = al(len * 0.85)
  return (
    `M ${P(B, 0)} C ${P(c1, wid)} ${P(c2, wid * 0.5)} ${P(T, 0)} ` +
    `C ${P(c2, -wid * 0.5)} ${P(c1, -wid)} ${P(B, 0)} Z`
  )
}

// belting mouth (open oval that grows with the note)
function singMouth(open) {
  const w = 6 + open * 3
  const cy = 92
  const h = 5 + open * 15
  return `M ${(76 - w).toFixed(1)} ${cy} Q 76 ${(cy - 4).toFixed(1)} ${(76 + w).toFixed(1)} ${cy} Q 76 ${(cy + h).toFixed(1)} ${(76 - w).toFixed(1)} ${cy} Z`
}

// little CSS triangle (sails, mountains, trees in her paintings)
function tri(w, h, color) {
  const d = document.createElement('div')
  d.style.width = '0'
  d.style.height = '0'
  d.style.borderLeft = w + 'px solid transparent'
  d.style.borderRight = w + 'px solid transparent'
  d.style.borderBottom = h + 'px solid ' + color
  return d
}

const MAGIC = [
  { c: '#ff7ab0', g: 'rgba(255,122,176,.6)' },
  { c: '#e25fb0', g: 'rgba(226,95,176,.55)' },
  { c: '#ff9a6b', g: 'rgba(255,154,107,.55)' },
  { c: '#c79bff', g: 'rgba(199,155,255,.55)' },
  { c: '#6fa8ff', g: 'rgba(111,168,255,.55)' },
  { c: '#ffd24a', g: 'rgba(255,210,74,.55)' },
]

const EYE = [
  { x: 65, y: 80 },
  { x: 87, y: 80 },
]
const PETW = 150
const PETH = 168
const NOTE_GLYPHS = ['♪', '♫', '♬', '♩']

const MOUTHS = {
  idle: 'M66 91 Q76 104 86 91',
  happy: 'M66 91 Q76 107 86 91',
  curious: 'M74 92 Q74 89 76 89 Q78 89 78 92 Q78 95.5 76 95.5 Q74 95.5 74 92 Z',
  sleepy: 'M70 95 Q76 99 82 95',
  determined: 'M67 90 Q76 99 85 90 Q80 93 76 93 Q72 93 67 90 Z',
  dizzy: 'M68 95 q4 -5 8 0 q4 5 8 0',
  mad: 'M67 98 Q76 89 85 98',
}
const ACT_DUR = { singing: 6500, music: 7000, painting: 12000, reading: 11500, coding: 10000, fortune: 9000, blooming: 8000 }

const STYLE_TEXT = `
    .kp-pet { position: fixed; left: 0; top: 0; width: 150px; height: 168px; z-index: 9998;
      pointer-events: none; will-change: transform; }
    .kp-pet .kp-hit { position: absolute; left: 48px; top: 50px; width: 54px; height: 62px;
      border-radius: 50%; pointer-events: auto; cursor: grab; }
    .kp-pet.kp-grab .kp-hit { cursor: grabbing; }
    .kp-glow { position: absolute; left: 50%; top: 42%; width: 172px; height: 172px; transform: translate(-50%,-50%);
      pointer-events: none; border-radius: 50%;
      background: radial-gradient(circle, rgba(150,220,150,.55), rgba(120,200,255,.2) 46%, rgba(150,220,150,0) 70%);
      filter: blur(7px); animation: kp-pulse 4.2s ease-in-out infinite; }
    @keyframes kp-pulse { 0%,100% { opacity: .65; transform: translate(-50%,-50%) scale(1); }
      50% { opacity: 1; transform: translate(-50%,-50%) scale(1.13); } }
    .kp-pet svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible;
      filter: drop-shadow(0 6px 12px rgba(120,40,110,.28)); }
    .kp-emotes { position: absolute; left: 50%; top: 2px; width: 0; height: 0; pointer-events: none; }
    .kp-emote { position: absolute; transform: translate(-50%, 0); font: 600 16px 'Space Grotesk', sans-serif;
      color: #fff; text-shadow: 0 1px 4px rgba(150,40,120,.4); animation: kp-float 1.6s ease-out forwards; }
    .kp-emote.spark { color: #ffe08a; } .kp-emote.love { color: #ff86bd; } .kp-emote.sleep { color: #d9c2ff; font-style: italic; }
    .kp-emote.dizzy { color: #cdb8ff; }
    .kp-emote.anger { width: 14px; height: 14px; }
    .kp-emote.anger::before, .kp-emote.anger::after { content:''; position:absolute; background:#e8453a; border-radius:2px; box-shadow:0 0 4px rgba(232,69,58,.6); }
    .kp-emote.anger::before { width:13px; height:3.4px; top:5px; left:.5px; }
    .kp-emote.anger::after { width:3.4px; height:13px; top:.5px; left:5px; }
    @keyframes kp-float { 0% { opacity: 0; transform: translate(-50%, 4px) scale(.6); }
      20% { opacity: 1; } 100% { opacity: 0; transform: translate(calc(-50% + var(--ex,8px)), -48px) scale(1.1); } }

    .kp-trail { position: fixed; inset: 0; z-index: 9997; pointer-events: none; }
    .kp-drop { position: absolute; left: 0; top: 0; border-radius: 50%; will-change: transform, opacity;
      background: radial-gradient(circle at 40% 36%, #fff, var(--mc,#ff7ab0) 58%, rgba(255,122,176,0) 100%);
      box-shadow: 0 0 9px 2px var(--mglow, rgba(255,122,176,.6)); }

    .kp-aura { position: fixed; left: 0; top: 0; z-index: 9997; pointer-events: none; will-change: transform; }
    .kp-mote { position: absolute; left: 0; top: 0; border-radius: 50%; will-change: transform, opacity;
      background: radial-gradient(circle at 40% 36%, #fff, var(--mc,#ffa6d4) 60%, rgba(255,166,212,0) 100%);
      box-shadow: 0 0 10px 3px var(--mglow, rgba(255,150,210,.5));
      animation: kp-mote var(--md,5s) ease-in-out infinite; animation-delay: var(--mdelay,0s); }
    @keyframes kp-mote {
      0%   { transform: translate(var(--bx), var(--by)) scale(.7); opacity: .25; }
      25%  { transform: translate(calc(var(--bx) + 13px), calc(var(--by) - 12px)) scale(1.1); opacity: .95; }
      50%  { transform: translate(calc(var(--bx) - 7px), calc(var(--by) - 23px)) scale(.6); opacity: .5; }
      75%  { transform: translate(calc(var(--bx) - 15px), calc(var(--by) - 6px)) scale(1); opacity: .85; }
      100% { transform: translate(var(--bx), var(--by)) scale(.7); opacity: .25; }
    }
    .kp-act { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
    .kp-note { position: absolute; font-size: 19px; font-weight: 700; line-height: 1; color: var(--nc,#7fd08a);
      text-shadow: 0 1px 7px var(--ng,rgba(127,208,138,.7)); will-change: transform, opacity; }
    .kp-note.up { animation: kp-note-up var(--nd,2.4s) ease-out forwards; }
    .kp-note.in { animation: kp-note-in var(--nd,1.9s) ease-in forwards; }
    .kp-note.belt { animation: kp-note-belt var(--nd,2.8s) ease-out forwards; }
    @keyframes kp-note-belt { 0%{opacity:0;transform:translate(0,0) scale(.4);} 22%{opacity:1;transform:translate(var(--ndx,6px),-14px) scale(1.5);} 58%{opacity:1;transform:translate(var(--ndx,6px),-26px) scale(1.75);} 100%{opacity:0;transform:translate(var(--ndx,10px),-66px) scale(1.95);} }
    @keyframes kp-note-up { 0%{opacity:0;transform:translate(0,0) rotate(0) scale(.5);} 18%{opacity:1;}
      100%{opacity:0;transform:translate(var(--ndx,18px),-74px) rotate(var(--nr,16deg)) scale(1.15);} }
    @keyframes kp-note-in { 0%{opacity:0;transform:translate(var(--sx,60px),var(--sy,-10px)) scale(.5);} 25%{opacity:1;}
      100%{opacity:0;transform:translate(0,-4px) scale(.35);} }

    .kp-easel { position:absolute; left:120px; top:40px; width:66px; height:104px; opacity:0; transform:translateX(10px) scale(.9);
      transform-origin:left center; transition:opacity .45s ease, transform .45s cubic-bezier(.3,1.3,.5,1); }
    .kp-easel.on { opacity:1; transform:translateX(0) scale(1); }
    .kp-easel .kp-leg { position:absolute; left:28px; top:4px; width:5px; height:84px; background:linear-gradient(#9a7338,#6b4d24); border-radius:2px; box-shadow:0 1px 2px rgba(0,0,0,.25); }
    .kp-easel .kp-leg.a { transform:rotate(-13deg); } .kp-easel .kp-leg.b { transform:rotate(13deg); }
    .kp-canvas { position:absolute; left:4px; top:0; width:58px; height:66px; border-radius:3px; background:linear-gradient(#fcf7ea,#f3ead4);
      border:4px solid #8a5a32; box-shadow:0 4px 10px rgba(60,40,20,.4); transform:rotate(-3deg); overflow:hidden; }
    .kp-brush { position:absolute; left:-2px; top:30px; width:28px; height:5px; border-radius:3px;
      background:linear-gradient(90deg,#7a5128,#caa15f); transform-origin:left center; }
    .kp-brush::after { content:''; position:absolute; right:-7px; top:-3px; width:11px; height:11px; border-radius:50% 50% 50% 55%; background:var(--bc,#e25fb0); box-shadow:0 0 7px var(--bc,#e25fb0); }
    .kp-easel.on .kp-brush { animation: kp-paint 1.15s ease-in-out infinite; }
    @keyframes kp-paint { 0%,100%{transform:translate(0,0) rotate(20deg);} 50%{transform:translate(8px,15px) rotate(6deg);} }
    .kp-dab { position:absolute; width:8px; height:8px; border-radius:50%; transform:scale(0); animation:kp-dab .35s cubic-bezier(.3,1.5,.5,1) forwards; }
    @keyframes kp-dab { to { transform:scale(1); } }

    .kp-book { position:absolute; left:19px; top:97px; width:112px; height:56px; opacity:0; transform:translateY(10px) scale(.92);
      transform-origin:center top; transition:opacity .45s ease, transform .45s cubic-bezier(.3,1.3,.5,1); display:flex; }
    .kp-book.on { opacity:1; transform:translateY(0) scale(1); }
    .kp-book > div { position:relative; height:100%; box-shadow:0 7px 15px rgba(50,28,8,.4); }
    .kp-back { width:50px; border-radius:5px 0 0 5px; padding:4px 3px; overflow:hidden;
      background:linear-gradient(135deg,#244a63,#0f2536); border-right:1px solid rgba(0,0,0,.3); }
    .kp-bl { height:1.5px; background:rgba(255,255,255,.45); border-radius:1px; margin:2px 2px; }
    .kp-bl.head { height:auto; background:none; margin:1px 2px 3px; font:800 3.4px/1 'Space Grotesk',sans-serif; color:#ffce5a; letter-spacing:.02em; }
    .kp-thumbs { position:absolute; bottom:3px; left:3px; right:3px; display:flex; gap:1px; }
    .kp-thumbs i { flex:1; height:9px; border-radius:1px; background:linear-gradient(#3a6e8a,#22455c); box-shadow:inset 0 0 0 .5px rgba(255,255,255,.15); }
    .kp-spine { width:12px; display:flex; align-items:center; justify-content:center;
      background:linear-gradient(#d8761f,#9a4310); border-left:1px solid rgba(0,0,0,.35); border-right:1px solid rgba(0,0,0,.35); }
    .kp-spine span { writing-mode:vertical-rl; transform:rotate(180deg); white-space:nowrap;
      font:800 4.6px/1 Georgia,'Newsreader',serif; color:#fff; letter-spacing:.06em; text-shadow:0 1px 1px rgba(0,0,0,.45); }
    .kp-front { width:50px; border-radius:0 5px 5px 0; overflow:hidden;
      background:radial-gradient(ellipse 82% 70% at 50% 46%, #ffe98a 0%, #f3ad32 50%, #cf6f1e 82%, #8a3d12 100%); }
    .kp-fauthor { position:absolute; top:3px; left:0; right:0; text-align:center; z-index:2;
      font:800 4px/1 'Space Grotesk',sans-serif; color:#21307e; text-shadow:0 1px 1px rgba(255,255,255,.4); }
    .kp-ffig { position:absolute; left:50%; top:9px; width:3px; height:28px; transform:translateX(-50%); z-index:1;
      background:linear-gradient(#eef2ff,#9fb0d8); border-radius:2px; box-shadow:0 0 5px rgba(255,255,255,.55); }
    .kp-ftitle { position:absolute; left:0; right:0; bottom:10px; z-index:2; text-align:center;
      display:flex; flex-direction:column; align-items:center; font:800 8px/0.78 Georgia,'Newsreader',serif; color:#fff; text-shadow:0 1px 1px rgba(80,30,0,.65); }
    .kp-ftitle b { font-size:4px; font-weight:700; margin:.5px 0; }
    .kp-fsub { position:absolute; bottom:3px; left:0; right:0; z-index:2; text-align:center;
      font:italic 600 3.4px/1 Georgia,serif; color:#fff; text-shadow:0 1px 1px rgba(80,30,0,.55); }
    .kp-book.peek { animation: kp-bk-peek 0.8s ease-in-out; }
    @keyframes kp-bk-peek { 0%,100% { transform:translateY(0) scale(1); } 50% { transform:translateY(0) scaleX(0.9); } }

    .kp-phones { position:absolute; inset:0; opacity:0; transition:opacity .4s ease; }
    .kp-phones.on { opacity:1; }
    .kp-phones .kp-band { position:absolute; left:39px; top:43px; width:72px; height:44px; border:7px solid #2c3360;
      border-bottom:none; border-radius:38px 38px 0 0; }
    .kp-phones .kp-cup { position:absolute; top:74px; width:19px; height:27px; border-radius:8px; background:linear-gradient(#3a4475,#222a4a); }
    .kp-phones .kp-cup.l { left:31px; } .kp-phones .kp-cup.r { left:100px; }

    .kp-laptop { position:absolute; left:24px; top:108px; width:102px; height:60px; opacity:0; transform:translateY(10px) scale(.92);
      transform-origin:center bottom; transition:opacity .45s ease, transform .45s cubic-bezier(.3,1.3,.5,1); }
    .kp-laptop.on { opacity:1; transform:translateY(0) scale(1); }
    .kp-screen { position:absolute; left:15px; top:0; width:72px; height:47px; border-radius:7px 7px 2px 2px;
      background:linear-gradient(165deg,#eef1f5 0%,#ccd3db 55%,#aeb6c0 100%); border:1.5px solid #9aa2ad;
      box-shadow:0 5px 10px rgba(40,40,60,.32), inset 0 1px 2px rgba(255,255,255,.7); transform:perspective(140px) rotateX(7deg); }
    .kp-screen::after { content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
      background:linear-gradient(118deg, rgba(255,255,255,.5), rgba(255,255,255,0) 44%); }
    .kp-screen::before { content:''; position:absolute; left:50%; top:16px; width:11px; height:11px; transform:translateX(-50%);
      border-radius:50%; background:radial-gradient(circle at 38% 35%, #ccd1d9, #97a0ab); box-shadow:inset 0 0 2px rgba(0,0,0,.22); }
    .kp-glowspill { position:absolute; left:50%; top:-10px; width:88px; height:36px; transform:translateX(-50%);
      border-radius:50%; pointer-events:none; filter:blur(5px);
      background:radial-gradient(ellipse at 50% 62%, rgba(150,205,255,.6), rgba(175,150,255,.28) 50%, rgba(150,205,255,0) 72%); }
    .kp-laptop.on .kp-glowspill { animation:kp-screenglow 1.5s ease-in-out infinite; }
    @keyframes kp-screenglow { 0%,100%{opacity:.5;} 42%{opacity:.95;} 68%{opacity:.68;} }
    .kp-base { position:absolute; left:13px; bottom:0; width:76px; height:11px; border-radius:3px 3px 7px 7px;
      background:linear-gradient(#e6eaef,#b4bcc6); box-shadow:0 4px 8px rgba(40,40,60,.28); }
    .kp-base::after { content:''; position:absolute; left:6px; width:64px; top:1px; height:2.5px; border-radius:2px; background:#9aa2ad; box-shadow:0 1px 1px rgba(255,255,255,.5); }
    .kp-laptop.on .kp-screen { animation:kp-type 2.6s ease-in-out infinite; }
    @keyframes kp-type { 0%,100%{transform:perspective(140px) rotateX(7deg) translateY(0);} 50%{transform:perspective(140px) rotateX(7deg) translateY(-0.6px);} }

    .kp-fortune { position:absolute; left:50%; top:101px; width:62px; height:66px; transform:translateX(-50%); opacity:0;
      transition:opacity .45s ease, transform .45s cubic-bezier(.3,1.3,.5,1); }
    .kp-fortune.on { opacity:1; }
    .kp-oglow { position:absolute; left:50%; top:4px; width:64px; height:64px; transform:translateX(-50%); border-radius:50%; pointer-events:none;
      background:radial-gradient(circle, rgba(180,140,255,.5), rgba(150,200,255,.2) 50%, rgba(180,140,255,0) 70%); filter:blur(4px); }
    .kp-fortune.on .kp-oglow { animation:kp-opulse 2.6s ease-in-out infinite; }
    @keyframes kp-opulse { 0%,100%{opacity:.5; transform:translateX(-50%) scale(1);} 50%{opacity:.95; transform:translateX(-50%) scale(1.12);} }
    .kp-stand { position:absolute; left:14px; bottom:0; width:34px; height:16px; clip-path:polygon(13% 0,87% 0,100% 100%,0 100%);
      background:linear-gradient(#7a5aa0,#3a2850); box-shadow:0 4px 8px rgba(40,20,60,.4); }
    .kp-orb { position:absolute; left:8px; top:2px; width:46px; height:46px; border-radius:50%; overflow:hidden;
      background:radial-gradient(circle at 36% 30%, rgba(255,255,255,.92), rgba(202,168,255,.55) 38%, rgba(142,98,216,.55) 72%, rgba(96,60,166,.72));
      box-shadow:0 0 16px rgba(185,140,255,.7), inset -5px -6px 12px rgba(80,40,140,.55), inset 5px 5px 9px rgba(255,255,255,.55); }
    .kp-orb::before { content:''; position:absolute; inset:-32%; border-radius:50%;
      background:conic-gradient(from 0deg, rgba(255,255,255,0), rgba(212,182,255,.55), rgba(150,200,255,.22), rgba(255,255,255,0));
      animation:kp-swirl 4.5s linear infinite; }
    .kp-orb::after { content:''; position:absolute; left:28%; top:22%; width:10px; height:6px; border-radius:50%; background:rgba(255,255,255,.85); filter:blur(1px); }
    @keyframes kp-swirl { to { transform:rotate(360deg); } }

    .kp-pet.kp-rest .kp-glow { opacity:.3 !important; animation-duration:7s; }
    .kp-snore { position:absolute; left:81px; top:80px; width:11px; height:11px; border-radius:50%; opacity:0; transform-origin:left center;
      background:radial-gradient(circle at 36% 32%, rgba(255,255,255,.95), rgba(200,235,255,.45) 62%, rgba(200,235,255,0)); border:1px solid rgba(255,255,255,.6); }
    .kp-snore.on { animation: kp-snore 3.4s ease-in-out infinite; }
    @keyframes kp-snore { 0%,30%{opacity:0;transform:scale(.2);} 55%{opacity:.85;transform:scale(1);} 78%{opacity:.9;transform:scale(1.55);} 82%,100%{opacity:0;transform:scale(1.7);} }
    .kp-drool { position:absolute; left:83px; top:96px; width:3px; height:5px; border-radius:0 0 60% 60%; opacity:0; transform-origin:top center;
      background:linear-gradient(rgba(190,228,255,.5),rgba(150,210,255,.85)); }
    .kp-drool.on { animation: kp-drool 4.2s ease-in-out infinite; }
    @keyframes kp-drool { 0%,12%{opacity:0;transform:scaleY(.3);} 35%{opacity:.85;transform:scaleY(1);} 75%{opacity:.9;transform:scaleY(2.4);} 96%,100%{opacity:0;transform:scaleY(2.6);} }
    .kp-bloom { position:absolute; width:0; height:0; transform:translate(-50%,-50%); z-index:3;
      animation: kp-bloomlife var(--dur,3.4s) ease-out forwards; }
    .kp-bloom .kp-petal { position:absolute; left:0; top:0; width:9px; height:12.5px; margin:-6px 0 0 -4.5px;
      border-radius:52% 52% 50% 50% / 64% 64% 40% 40%; transform-origin:50% 100%;
      box-shadow:0 0 5px rgba(255,170,210,.45); }
    .kp-bloom .kp-core { position:absolute; left:0; top:0; width:7px; height:7px; margin:-3.5px 0 0 -3.5px;
      border-radius:50%; background:radial-gradient(circle at 40% 35%, #fff, var(--cc,#ffd86a) 72%);
      box-shadow:0 0 6px rgba(255,216,106,.75); }
    @keyframes kp-bloomlife {
      0%   { transform:translate(-50%,-50%) scale(0) rotate(-55deg); opacity:0; }
      16%  { transform:translate(-50%,-50%) scale(calc(var(--s,1)*1.18)) rotate(8deg); opacity:1; }
      30%  { transform:translate(-50%,-50%) scale(var(--s,1)) rotate(0deg); opacity:1; }
      72%  { opacity:1; }
      100% { transform:translate(calc(-50% + var(--dx,0px)), calc(-50% + var(--dy,-66px))) scale(var(--s,1)) rotate(var(--dr,12deg)); opacity:0; }
    }
    @media (prefers-reduced-motion: reduce) { .kp-pet svg *, .kp-glow, .kp-mote, .kp-note, .kp-brush, .kp-dab, .kp-bloom { animation: none !important; } }
    @keyframes kp-hue { to { filter: hue-rotate(360deg); } }
    .kp-pet .kp-lid { transform-box: fill-box; transform-origin: center top; }
  `

const ROOT_HTML = `
    <div class="kp-glow"></div>
    <svg viewBox="0 0 150 168" aria-hidden="true">
      <defs>
        <linearGradient id="kpMag" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#256b3a"/><stop offset="100%" stop-color="#56a85f"/></linearGradient>
        <linearGradient id="kpPink" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#3f9a5e"/><stop offset="100%" stop-color="#92d489"/></linearGradient>
        <linearGradient id="kpCoral" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#ef6a4e"/><stop offset="100%" stop-color="#ffb06b"/></linearGradient>
        <linearGradient id="kpBlue" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#3257d8"/><stop offset="100%" stop-color="#7fb0ff"/></linearGradient>
        <linearGradient id="kpGold" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#f0a52a"/><stop offset="100%" stop-color="#ffe08a"/></linearGradient>
        <linearGradient id="kpRose" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#9fd496"/><stop offset="100%" stop-color="#e9f8e1"/></linearGradient>
        <radialGradient id="kpFaceG" cx="44%" cy="36%" r="68%">
          <stop offset="0%" stop-color="#f4fff0"/><stop offset="58%" stop-color="#dcf2d3"/><stop offset="100%" stop-color="#bbe4b0"/></radialGradient>
        <linearGradient id="kpFlowG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e8f8e0" stop-opacity=".85"/><stop offset="100%" stop-color="#94d089" stop-opacity="0"/></linearGradient>
        <filter id="kpWC" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.014 0.02" numOctaves="2" seed="5" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>

      <ellipse class="kp-shadow" cx="75" cy="156" rx="34" ry="7" fill="rgba(120,40,110,.18)"/>

      <g class="kp-leaves" filter="url(#kpWC)"></g>

      <g class="kp-body">
        <g class="kp-flow" filter="url(#kpWC)"></g>
        <g class="kp-inner"></g>
        <ellipse cx="75" cy="80" rx="30" ry="31" fill="url(#kpFaceG)"/>
        <ellipse cx="66" cy="66" rx="15" ry="11" fill="#fff" opacity=".35"/>
        <ellipse class="kp-cheek" cx="57" cy="91" rx="8" ry="5.2" fill="#ff7ea8" opacity=".55"/>
        <ellipse class="kp-cheek" cx="95" cy="91" rx="8" ry="5.2" fill="#ff7ea8" opacity=".55"/>
        <g class="kp-face">
          <path class="kp-brow kp-brow-l" d="M57 67 L72 71" stroke="#7a2150" stroke-width="3" stroke-linecap="round" fill="none" opacity="0"/>
          <path class="kp-brow kp-brow-r" d="M95 67 L80 71" stroke="#7a2150" stroke-width="3" stroke-linecap="round" fill="none" opacity="0"/>
          <g class="kp-eye kp-eye-l">
            <ellipse class="kp-eye-w" cx="65" cy="80" rx="7" ry="9" fill="#3a1c44"/>
            <circle class="kp-pup" cx="65" cy="80" r="3.4" fill="#1c0f28"/>
            <circle class="kp-gl" cx="67.4" cy="76.6" r="2.4" fill="#fff"/>
            <ellipse class="kp-lid" cx="65" cy="80" rx="7.7" ry="9.6" fill="#6abf66"/>
          </g>
          <g class="kp-eye kp-eye-r">
            <ellipse class="kp-eye-w" cx="87" cy="80" rx="7" ry="9" fill="#3a1c44"/>
            <circle class="kp-pup" cx="87" cy="80" r="3.4" fill="#1c0f28"/>
            <circle class="kp-gl" cx="89.4" cy="76.6" r="2.4" fill="#fff"/>
            <ellipse class="kp-lid" cx="87" cy="80" rx="7.7" ry="9.6" fill="#6abf66"/>
          </g>
          <path class="kp-mouth" d="M66 91 Q76 104 86 91" stroke="#7a2150" stroke-width="3" fill="#ff6f9e" stroke-linejoin="round" stroke-linecap="round"/>
        </g>
      </g>
    </svg>
    <div class="kp-act"></div>
    <div class="kp-emotes"></div>
    <div class="kp-hit"></div>
  `

export function mountSprout(o) {
  const opts = o || {}

  // ── stylesheet + markup ───────────────────────────────────────────────────
  const style = document.createElement('style')
  style.setAttribute('data-kp-pet', '')
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.className = 'kp-pet'
  root.innerHTML = ROOT_HTML
  document.body.appendChild(root)

  const bodyG = root.querySelector('.kp-body')
  const leavesG = root.querySelector('.kp-leaves')
  const shadow = root.querySelector('.kp-shadow')
  const mouth = root.querySelector('.kp-mouth')
  const lids = [...root.querySelectorAll('.kp-lid')]
  const pups = [...root.querySelectorAll('.kp-pup')]
  const glints = [...root.querySelectorAll('.kp-gl')]
  const cheeks = [...root.querySelectorAll('.kp-cheek')]
  const brows = [...root.querySelectorAll('.kp-brow')]
  const emotes = root.querySelector('.kp-emotes')
  const actLayer = root.querySelector('.kp-act')

  let easel, book, phones, brush, snore, drool, canvasEl, laptop, fortune
  function buildProps() {
    easel = document.createElement('div')
    easel.className = 'kp-easel'
    easel.innerHTML =
      '<div class="kp-leg a"></div><div class="kp-leg b"></div><div class="kp-canvas"></div><div class="kp-brush"></div>'
    book = document.createElement('div')
    book.className = 'kp-book'
    book.innerHTML =
      '<div class="kp-back"><div class="kp-bl head">THE FINAL BATTLE IS HERE</div>' +
      '<div class="kp-bl"></div><div class="kp-bl"></div><div class="kp-bl"></div>' +
      '<div class="kp-thumbs"><i></i><i></i><i></i><i></i><i></i></div></div>' +
      '<div class="kp-spine"><span>KINGDOM OF ASH</span></div>' +
      '<div class="kp-front"><div class="kp-fauthor">SARAH J. MAAS</div><div class="kp-ffig"></div>' +
      '<div class="kp-ftitle">KINGDOM<b>OF</b>ASH</div><div class="kp-fsub">A THRONE OF GLASS NOVEL</div></div>'
    phones = document.createElement('div')
    phones.className = 'kp-phones'
    phones.innerHTML = '<div class="kp-band"></div><div class="kp-cup l"></div><div class="kp-cup r"></div>'
    snore = document.createElement('div')
    snore.className = 'kp-snore'
    drool = document.createElement('div')
    drool.className = 'kp-drool'
    laptop = document.createElement('div')
    laptop.className = 'kp-laptop'
    laptop.innerHTML = '<div class="kp-glowspill"></div><div class="kp-screen"></div><div class="kp-base"></div>'
    fortune = document.createElement('div')
    fortune.className = 'kp-fortune'
    fortune.innerHTML = '<div class="kp-oglow"></div><div class="kp-orb"></div><div class="kp-stand"></div>'
    actLayer.append(easel, book, phones, snore, drool, laptop, fortune)
    brush = easel.querySelector('.kp-brush')
    canvasEl = easel.querySelector('.kp-canvas')
    buildArt(0)
  }

  // ── procedural bloom ───────────────────────────────────────────────────────
  function buildFlower(seed) {
    const rnd = mulberry32(seed)
    const FCx = 75
    const FCy = 80
    const inner = root.querySelector('.kp-inner')
    const flow = root.querySelector('.kp-flow')
    const ACCENT = ['kpBlue', 'kpGold']
    const N = 22
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1)
      const ang = 130 + t * 280
      const len = 54 + (1 - t) * 16 + rnd() * 8 + (t < 0.22 ? 12 : 0)
      const wid = 15 + rnd() * 5
      let grad =
        t < 0.28 ? (rnd() < 0.5 ? 'kpCoral' : 'kpMag') : t > 0.72 ? (rnd() < 0.5 ? 'kpMag' : 'kpPink') : 'kpPink'
      if (rnd() < 0.22) grad = ACCENT[(rnd() * ACCENT.length) | 0]
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', petalPath(FCx, FCy, ang, len, wid))
      p.setAttribute('fill', `url(#${grad})`)
      p.setAttribute('opacity', (0.78 + rnd() * 0.2).toFixed(2))
      leavesG.appendChild(p)
    }
    const MID = 16
    for (let i = 0; i < MID; i++) {
      const t = i / (MID - 1)
      const ang = 134 + t * 272 + (rnd() - 0.5) * 6
      let grad = t < 0.3 ? 'kpCoral' : 'kpPink'
      if (rnd() < 0.16) grad = ACCENT[(rnd() * ACCENT.length) | 0]
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', petalPath(FCx, FCy, ang, 42 + rnd() * 6, 17))
      p.setAttribute('fill', `url(#${grad})`)
      p.setAttribute('opacity', '0.9')
      leavesG.appendChild(p)
    }
    for (let i = 0; i < 4; i++) {
      const ang = 150 + i * 14 + rnd() * 6
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', petalPath(FCx, FCy, ang, 72 + rnd() * 12, 9 + rnd() * 2))
      p.setAttribute('fill', `url(#${i % 2 ? 'kpCoral' : 'kpMag'})`)
      p.setAttribute('opacity', '.62')
      leavesG.appendChild(p)
    }
    for (let i = 0; i < 11; i++) {
      const a = ((150 + rnd() * 240) * Math.PI) / 180
      const r = 30 + rnd() * 42
      const c = document.createElementNS(SVGNS, 'circle')
      c.setAttribute('cx', (FCx + Math.cos(a) * r).toFixed(1))
      c.setAttribute('cy', (FCy + Math.sin(a) * r).toFixed(1))
      c.setAttribute('r', (0.8 + rnd() * 1.4).toFixed(1))
      c.setAttribute('fill', '#fff')
      c.setAttribute('opacity', (0.5 + rnd() * 0.4).toFixed(2))
      leavesG.appendChild(c)
    }
    const M = 16
    for (let i = 0; i < M; i++) {
      const t = i / (M - 1)
      const ang = 132 + t * 276
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', petalPath(FCx, FCy, ang, 40 + rnd() * 4, 20))
      p.setAttribute('fill', 'url(#kpRose)')
      p.setAttribute('opacity', '0.96')
      inner.appendChild(p)
    }
    const K = 5
    for (let i = 0; i < K; i++) {
      const t = i / (K - 1)
      const bx = FCx + (t - 0.5) * 42
      const sway = (rnd() - 0.5) * 30
      const len = 46 + rnd() * 18
      const baseY = 104
      const w = 8 - Math.abs(t - 0.5) * 6 + 3
      const tipx = bx + sway
      const tipy = baseY + len
      const d =
        `M ${(bx - w).toFixed(1)} ${baseY} C ${(bx - w).toFixed(1)} ${(baseY + len * 0.45).toFixed(1)} ${(tipx - 2).toFixed(1)} ${(tipy - 8).toFixed(1)} ${tipx.toFixed(1)} ${tipy.toFixed(1)} ` +
        `C ${(tipx + 2).toFixed(1)} ${(tipy - 8).toFixed(1)} ${(bx + w).toFixed(1)} ${(baseY + len * 0.45).toFixed(1)} ${(bx + w).toFixed(1)} ${baseY} Z`
      const p = document.createElementNS(SVGNS, 'path')
      p.setAttribute('d', d)
      p.setAttribute('fill', 'url(#kpFlowG)')
      p.setAttribute('opacity', (0.5 + rnd() * 0.3).toFixed(2))
      flow.appendChild(p)
    }
    // slow staggered hue ripple around the bloom
    const petals = [...leavesG.querySelectorAll('path'), ...inner.querySelectorAll('path')]
    const D = 16
    petals.forEach((p, i) => {
      p.style.animation = `kp-hue ${D}s linear infinite`
      p.style.animationDelay = ((i / petals.length) * D).toFixed(2) + 's'
    })
  }

  const aura = document.createElement('div')
  aura.className = 'kp-aura'
  document.body.insertBefore(aura, root)
  function buildAura(seed) {
    const rnd = mulberry32(seed + 91)
    for (let i = 0; i < 9; i++) {
      const m = document.createElement('div')
      m.className = 'kp-mote'
      const a = rnd() * Math.PI * 2
      const r = 72 + rnd() * 54
      const s = 5 + rnd() * 6
      const col = MAGIC[(rnd() * MAGIC.length) | 0]
      m.style.width = s.toFixed(1) + 'px'
      m.style.height = s.toFixed(1) + 'px'
      m.style.setProperty('--bx', (Math.cos(a) * r - s / 2).toFixed(1) + 'px')
      m.style.setProperty('--by', (Math.sin(a) * r - 10 - s / 2).toFixed(1) + 'px')
      m.style.setProperty('--md', (4 + rnd() * 3.5).toFixed(2) + 's')
      m.style.setProperty('--mdelay', (-rnd() * 6).toFixed(2) + 's')
      m.style.setProperty('--mc', col.c)
      m.style.setProperty('--mglow', col.g)
      aura.appendChild(m)
    }
  }

  const trail = document.createElement('div')
  trail.className = 'kp-trail'
  document.body.insertBefore(trail, root)
  const NDROPS = 7
  const drops = []
  for (let i = 0; i < NDROPS; i++) {
    const d = document.createElement('div')
    d.className = 'kp-drop'
    const col = MAGIC[i % MAGIC.length]
    d.style.setProperty('--mc', col.c)
    d.style.setProperty('--mglow', col.g)
    trail.appendChild(d)
    drops.push(d)
  }
  const hist = []

  // ── state ──────────────────────────────────────────────────────────────────
  const S = {
    x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0,
    look: { x: 0, y: 0 }, lookTarget: null, face: 1,
    state: 'idle', stateUntil: 0, nextIdle: 0,
    blinkUntil: 0, nextBlink: 0, lidAmt: 0, hop: 0, hopAmp: 0, sway: 0, breathe: 0,
    dragging: false, interest: null,
    shakeMeter: 0, shakeDir: 0, lastSX: null, lastShakeT: 0, reactT: 0, pendingSleep: false,
    activity: null, actStart: 0, actUntil: 0, actPhase: '', actData: null,
    pageActivity: null, // the activity the current page wants (null = roam)
    previewing: false, // a hover preview is active (overview list)
    previewActivity: null, // the previewed activity (null = roam) when previewing
    hidden: false, // fully hidden + paused (e.g. the professional Experience pages)
    chasing: false, // currently chasing the bouncing orb/balls
  }
  let noteT = 0
  let paintDabT = 0
  let artStrokes = []
  let paintStep = 0
  let sceneIdx = 0
  let sleepTimer = 0
  let curiousClearT = 0

  function setMouth(name) {
    mouth.setAttribute('d', MOUTHS[name] || MOUTHS.idle)
  }
  function restSpot() {
    const w = innerWidth
    const h = innerHeight
    const margin = 40
    const spots = [
      { x: margin + 20, y: h - 150 },
      { x: w - margin - 120, y: h - 156 },
      { x: w * 0.5 - 60, y: h - 140 },
      { x: margin + 10, y: h * 0.5 },
      { x: w - margin - 128, y: h * 0.52 },
    ]
    return spots[(Math.random() * spots.length) | 0]
  }
  function moveTo(x, y) {
    S.tx = clamp(x, 6, innerWidth - PETW - 6)
    S.ty = clamp(y, 6, innerHeight - PETH - 2)
  }
  // Hard-teleport her to (x, y) — no easing. Used by the game layer when
  // changing frames (pitfall in/out) so she doesn't visibly slide across the
  // viewport between mazes.
  function snap(x, y) {
    const sx = clamp(x, 6, innerWidth - PETW - 6)
    const sy = clamp(y, 6, innerHeight - PETH - 2)
    S.x = S.tx = sx
    S.y = S.ty = sy
    S.vx = 0
    S.vy = 0
  }
  // Change her scale at runtime. The transform string in the loop reads
  // opts.scale every frame, so mutating it takes effect immediately.
  function setScale(s) {
    opts.scale = s
  }
  function setState(s, dur) {
    S.state = s
    S.stateUntil = dur ? now() + dur : 0
    if (s === 'happy') {
      setMouth('happy')
      S.hopAmp = 16
      bouncePetals(1.6)
    } else if (s === 'curious') setMouth('curious')
    else if (s === 'sleepy') setMouth('sleepy')
    else if (s === 'dizzy') setMouth('dizzy')
    else if (s === 'mad' || s === 'grumpy') setMouth('mad')
    else setMouth('idle')
  }
  function say(kind) {
    if (REDUCE) return
    const e = document.createElement('div')
    e.className = 'kp-emote ' + kind
    e.textContent = kind === 'spark' ? '✦' : kind === 'love' ? '♥' : kind === 'dizzy' ? '✱' : kind === 'anger' ? '' : 'z'
    e.style.setProperty('--ex', (Math.random() * 26 - 13).toFixed(0) + 'px')
    e.style.left = (Math.random() * 20 - 10).toFixed(0) + 'px'
    emotes.appendChild(e)
    setTimeout(() => e.remove(), 1700)
  }
  function bouncePetals(power) {
    leavesG.animate(
      [
        { transform: 'scale(1) rotate(0)' },
        { transform: `scale(${1 + 0.09 * power}) rotate(${5 * power}deg)`, offset: 0.4 },
        { transform: 'scale(1) rotate(0)' },
      ],
      { duration: 760, easing: 'cubic-bezier(.3,1.4,.5,1)' },
    )
  }
  function emote(mood) {
    if (mood === 'happy') {
      setState('happy', 1400)
      say('spark')
    } else if (mood === 'curious') setState('curious', 1600)
    else if (mood === 'sleepy') setState('sleepy')
    else setState('idle')
  }
  function goIdleSoon(delay) {
    S.nextIdle = now() + (delay != null ? delay : 800)
  }

  // ── activities ─────────────────────────────────────────────────────────────
  function spawnNote(kind) {
    if (REDUCE) return
    const e = document.createElement('div')
    e.className = 'kp-note ' + kind
    e.textContent = NOTE_GLYPHS[(Math.random() * NOTE_GLYPHS.length) | 0]
    const col = MAGIC[(Math.random() * MAGIC.length) | 0]
    e.style.setProperty('--nc', col.c)
    e.style.setProperty('--ng', col.g)
    if (kind === 'in') {
      const side = Math.random() < 0.5 ? -1 : 1
      e.style.left = '72px'
      e.style.top = '66px'
      e.style.setProperty('--sx', (side * (66 + Math.random() * 44)).toFixed(0) + 'px')
      e.style.setProperty('--sy', (-26 + Math.random() * 44).toFixed(0) + 'px')
      e.style.setProperty('--nd', (1.5 + Math.random() * 0.8).toFixed(2) + 's')
    } else {
      e.style.left = (70 + Math.random() * 10).toFixed(0) + 'px'
      e.style.top = '64px'
      e.style.setProperty('--ndx', ((Math.random() - 0.5) * 52).toFixed(0) + 'px')
      e.style.setProperty('--nr', ((Math.random() - 0.5) * 40).toFixed(0) + 'deg')
      e.style.setProperty('--nd', (2 + Math.random()).toFixed(2) + 's')
    }
    actLayer.appendChild(e)
    setTimeout(() => e.remove(), 2900)
  }
  function spawnCode() {
    if (REDUCE) return
    const e = document.createElement('div')
    e.className = 'kp-note up'
    const glyphs = ['{ }', '< >', '( )', ';', '=>', '/*', '#', '[]']
    e.textContent = glyphs[(Math.random() * glyphs.length) | 0]
    const cols = ['#6fd08a', '#6fb0ff', '#c07bf0', '#ffd24a']
    const c = cols[(Math.random() * cols.length) | 0]
    e.style.setProperty('--nc', c)
    e.style.setProperty('--ng', c + '88')
    e.style.fontSize = '11px'
    e.style.fontWeight = '700'
    e.style.left = (66 + Math.random() * 18).toFixed(0) + 'px'
    e.style.top = '70px'
    e.style.setProperty('--ndx', ((Math.random() - 0.5) * 40).toFixed(0) + 'px')
    e.style.setProperty('--nr', ((Math.random() - 0.5) * 30).toFixed(0) + 'deg')
    e.style.setProperty('--nd', (1.8 + Math.random()).toFixed(2) + 's')
    actLayer.appendChild(e)
    setTimeout(() => e.remove(), 2900)
  }
  function spawnMystic() {
    if (REDUCE) return
    const e = document.createElement('div')
    e.className = 'kp-note up'
    e.textContent = Math.random() < 0.5 ? '✦' : '✧'
    e.style.setProperty('--nc', '#caa8ff')
    e.style.setProperty('--ng', 'rgba(180,140,255,.6)')
    e.style.left = (62 + Math.random() * 26).toFixed(0) + 'px'
    e.style.top = '118px'
    e.style.setProperty('--ndx', ((Math.random() - 0.5) * 34).toFixed(0) + 'px')
    e.style.setProperty('--nr', ((Math.random() - 0.5) * 30).toFixed(0) + 'deg')
    e.style.setProperty('--nd', (1.9 + Math.random()).toFixed(2) + 's')
    actLayer.appendChild(e)
    setTimeout(() => e.remove(), 2900)
  }
  function buildArt(idx) {
    if (!canvasEl) return
    canvasEl.innerHTML = ''
    const art = document.createElement('div')
    art.style.cssText = 'position:absolute;inset:0;overflow:hidden;'
    artStrokes = []
    paintStep = 0
    const add = (el, css) => {
      el.style.cssText +=
        ';position:absolute;opacity:0;transform:scale(.35);transition:opacity .35s ease,transform .45s cubic-bezier(.3,1.5,.5,1);transform-origin:bottom center;' +
        css
      art.appendChild(el)
      artStrokes.push(el)
      return el
    }
    const box = () => document.createElement('div')
    if (idx === 1) {
      add(box(), 'left:0;top:0;width:100%;height:58%;background:linear-gradient(#ffd6a0,#ffeccb);transform-origin:top center;')
      add(box(), 'left:41%;top:30%;width:13px;height:13px;border-radius:50%;background:radial-gradient(circle,#fff1b4,#ff9e3d);box-shadow:0 0 8px #ffb15a;transform-origin:center;')
      add(box(), 'left:0;bottom:0;width:100%;height:44%;background:linear-gradient(#4a93c4,#1f5a86);transform-origin:bottom center;')
      add(box(), 'left:45%;bottom:0;width:7px;height:42%;background:linear-gradient(rgba(255,221,150,.85),rgba(255,221,150,0));transform-origin:bottom center;')
      add(box(), 'left:5px;bottom:24%;width:18px;height:1.6px;border-radius:2px;background:rgba(255,255,255,.7);transform-origin:center;')
      add(box(), 'left:30px;bottom:15%;width:20px;height:1.6px;border-radius:2px;background:rgba(255,255,255,.6);transform-origin:center;')
      add(tri(6, 11, '#fafafa'), 'left:13px;bottom:47%;')
      add(box(), 'left:10px;bottom:44%;width:16px;height:4px;border-radius:0 0 5px 5px;background:#7a3b1f;transform-origin:center;')
    } else if (idx === 2) {
      add(box(), 'left:0;top:0;width:100%;height:100%;background:linear-gradient(#efe6d2,#e2d4ba);transform-origin:center;')
      add(box(), 'left:0;bottom:0;width:100%;height:26%;background:linear-gradient(#c9a87a,#a9854f);transform-origin:bottom center;')
      add(box(), 'left:37%;bottom:20%;width:26%;height:24%;border-radius:5px 5px 11px 11px;background:linear-gradient(#3f8fa6,#2b6b80);transform-origin:bottom center;')
      add(box(), 'left:48%;bottom:42%;width:1.6px;height:20%;background:#3f7d3a;transform-origin:bottom center;')
      add(box(), 'left:41%;bottom:42%;width:1.6px;height:16%;background:#3f7d3a;transform-origin:bottom center;')
      add(box(), 'left:56%;bottom:42%;width:1.6px;height:14%;background:#3f7d3a;transform-origin:bottom center;')
      add(box(), 'left:43%;bottom:58%;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#ffd1e6,#e25fb0);box-shadow:0 0 4px rgba(226,95,176,.5);transform-origin:center;')
      add(box(), 'left:34%;bottom:53%;width:8px;height:8px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff0b0,#ffc23d);transform-origin:center;')
      add(box(), 'left:55%;bottom:51%;width:8px;height:8px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#d8c4ff,#9b6bff);transform-origin:center;')
    } else {
      add(box(), 'left:0;top:0;width:100%;height:62%;background:linear-gradient(#bfe3ff,#eaf6ff);transform-origin:top center;')
      add(box(), 'left:62%;top:7%;width:11px;height:11px;border-radius:50%;background:radial-gradient(circle,#fff3b0,#ffd24a);box-shadow:0 0 6px #ffd24a;transform-origin:center;')
      add(tri(17, 22, '#b9c4d6'), 'left:3px;bottom:15px;')
      add(tri(23, 31, '#5d6b86'), 'left:15px;bottom:14px;')
      add(tri(7, 9, '#f4f8ff'), 'left:31px;bottom:36px;')
      add(box(), 'left:0;bottom:0;width:100%;height:28%;background:linear-gradient(#7bbf55,#4f9a3e);transform-origin:bottom center;')
      const tree = (x, y) => {
        const w = document.createElement('div')
        const tk = document.createElement('div')
        tk.style.cssText = 'position:absolute;left:4px;bottom:0;width:2px;height:4px;background:#6b4a2a;'
        const cn = tri(5, 12, '#2f7d3a')
        cn.style.cssText += ';position:absolute;left:0;bottom:3px;'
        w.appendChild(tk)
        w.appendChild(cn)
        add(w, 'left:' + x + 'px;bottom:' + y + 'px;width:10px;height:16px;')
      }
      tree(7, 11)
      tree(40, 9)
      tree(25, 8)
    }
    canvasEl.appendChild(art)
  }
  function addStroke() {
    if (paintStep >= artStrokes.length) return
    const s = artStrokes[paintStep++]
    s.style.opacity = '1'
    s.style.transform = 'scale(1)'
    if (brush) {
      const cols = ['#6fb6ff', '#ffd24a', '#e25fb0', '#2ec77f', '#ff9a6b', '#9b6bff', '#7fd08a', '#5d6b86', '#f4f8ff']
      brush.style.setProperty('--bc', cols[(paintStep - 1) % cols.length])
    }
  }
  function flipPage() {
    if (!book) return
    book.classList.remove('peek')
    void book.offsetWidth
    book.classList.add('peek')
  }
  function spawnBloom() {
    if (REDUCE) return
    const palettes = [
      ['#ff7ab0', '#ffd1e6'],
      ['#ff9a6b', '#ffe0c4'],
      ['#ffd24a', '#fff0b8'],
      ['#c79bff', '#ece0ff'],
      ['#7fd08a', '#d6f3da'],
      ['#6fb0ff', '#d6e8ff'],
    ]
    const pal = palettes[(Math.random() * palettes.length) | 0]
    const f = document.createElement('div')
    f.className = 'kp-bloom'
    const np = 5
    let html = ''
    for (let i = 0; i < np; i++) {
      const a = (i / np) * 360 + Math.random() * 10
      html += `<i class="kp-petal" style="transform:rotate(${a.toFixed(0)}deg) translateY(-7px);background:linear-gradient(${pal[1]},${pal[0]})"></i>`
    }
    html += '<i class="kp-core"></i>'
    f.innerHTML = html
    const ang = Math.random() * Math.PI * 2
    const rad = 60 + Math.random() * 28
    const cx = 75 + Math.cos(ang) * rad
    const cy = 84 + Math.sin(ang) * rad * 0.92
    f.style.left = cx.toFixed(1) + 'px'
    f.style.top = cy.toFixed(1) + 'px'
    f.style.setProperty('--s', (0.62 + Math.random() * 0.7).toFixed(2))
    f.style.setProperty('--dx', (Math.cos(ang) * (26 + Math.random() * 24)).toFixed(0) + 'px') // drift outward
    f.style.setProperty('--dy', (Math.sin(ang) * (24 + Math.random() * 22) - 14).toFixed(0) + 'px')
    f.style.setProperty('--dr', ((Math.random() - 0.5) * 60).toFixed(0) + 'deg')
    f.style.setProperty('--dur', (2.9 + Math.random() * 1.5).toFixed(2) + 's')
    f.style.setProperty('--cc', Math.random() < 0.5 ? '#ffd86a' : '#fff2c0')
    actLayer.appendChild(f)
    setTimeout(() => f.remove(), 4500)
  }
  function startActivity(name, ms) {
    stopActivity(true)
    S.activity = name
    S.actStart = now()
    S.actUntil = ms != null ? (ms ? now() + ms : 0) : ACT_DUR[name] ? now() + ACT_DUR[name] : 0
    S.actPhase = ''
    S.actData = null
    S.lookTarget = null
    S.state = 'idle'
    S.stateUntil = 0
    noteT = 0
    paintDabT = 0
    if (name === 'painting') {
      if (paintStep >= artStrokes.length) {
        sceneIdx = (sceneIdx + 1) % 3
        buildArt(sceneIdx)
      }
      easel.classList.add('on')
      mouth.setAttribute('d', MOUTHS.determined)
    } else if (name === 'reading') {
      book.classList.add('on')
      S.actData = { flip: now() + 5000 }
      mouth.setAttribute('d', MOUTHS.sleepy)
    } else if (name === 'music') {
      phones.classList.add('on')
      setMouth('happy')
    } else if (name === 'coding') {
      laptop.classList.add('on')
      mouth.setAttribute('d', MOUTHS.determined)
    } else if (name === 'fortune') {
      fortune.classList.add('on')
      mouth.setAttribute('d', MOUTHS.curious)
    } else if (name === 'blooming') {
      root.classList.add('kp-bloomy')
      setMouth('happy')
    } else if (name === 'sleep') {
      S.actPhase = 'circle'
      S.actData = { cx: clamp(S.x, 40, innerWidth - PETW - 40), cy: clamp(S.y, 60, innerHeight - PETH - 12) }
    }
  }
  function stopActivity(silent) {
    if (!S.activity) return
    easel && easel.classList.remove('on')
    book && book.classList.remove('on')
    phones && phones.classList.remove('on')
    snore && snore.classList.remove('on')
    drool && drool.classList.remove('on')
    laptop && laptop.classList.remove('on')
    fortune && fortune.classList.remove('on')
    root.classList.remove('kp-rest')
    root.classList.remove('kp-bloomy')
    S.activity = null
    S.actPhase = ''
    S.actData = null
    S.actUntil = 0
    setMouth('idle')
    if (!silent) S.nextIdle = now() + 600
  }
  function wakeUp() {
    if (S.activity === 'sleep') {
      if (S.actPhase !== 'rise') {
        S.actPhase = 'rise'
        S.actStart = now()
      }
    } else stopActivity()
  }
  function applySleep(t, el, AM) {
    const d = S.actData || (S.actData = { cx: S.x, cy: S.y })
    if (S.actPhase === 'circle') {
      const dur = 2200
      const p = clamp(el / dur, 0, 1)
      const ang = p * Math.PI * 4 - Math.PI / 2
      S.x = d.cx + Math.cos(ang) * 26
      S.y = d.cy + Math.sin(ang) * 13
      S.vx = -Math.sin(ang)
      if (S.vx > 0.05) S.face = 1
      else if (S.vx < -0.05) S.face = -1
      AM.rot = Math.sin(ang) * 6
      AM.mouth = MOUTHS.mad
      if (el >= dur) {
        S.actPhase = 'settle'
        S.actStart = t
      }
    } else if (S.actPhase === 'settle') {
      const dur = 600
      const p = clamp(el / dur, 0, 1)
      const e = p * p * (3 - 2 * p)
      root.classList.add('kp-rest')
      AM.mouth = MOUTHS.mad
      AM.sy = 1 - e * 0.08
      AM.sx = 1 + e * 0.05
      AM.bobY = e * 6
      AM.leafDroop = e * 0.25
      if (p > 0.4) AM.lids = true
      if (el >= dur) {
        S.actPhase = 'snooze'
        S.actStart = t
        snore && snore.classList.add('on')
        drool && drool.classList.add('on')
      }
    } else if (S.actPhase === 'rise') {
      const dur = 420
      const p = clamp(el / dur, 0, 1)
      const e = p * p * (3 - 2 * p)
      snore && snore.classList.remove('on')
      drool && drool.classList.remove('on')
      AM.sy = 0.92 + 0.08 * e
      AM.bobY = 6 * (1 - e)
      AM.leafDroop = 0.25 * (1 - e)
      if (p < 0.5) AM.lids = true
      if (el >= dur) {
        stopActivity()
        emote('happy')
      }
    } else {
      const br = Math.sin(el / 900)
      root.classList.add('kp-rest')
      AM.mouth = MOUTHS.sleepy
      AM.sx = 1.05 + br * 0.04
      AM.sy = 0.92 + br * 0.05
      AM.bobY = 6 + br * 2
      AM.leafDroop = 0.25
      AM.lids = true
      if (t > sleepTimer) {
        say('sleep')
        sleepTimer = t + 3000 + Math.random() * 1500
      }
    }
  }
  function applyActivity(t, AM) {
    const a = S.activity
    if (!a) return
    AM.noWander = true
    const el = t - S.actStart
    if (a === 'singing') {
      const o = (Math.sin(el / 200) + 1) / 2
      AM.mouth = singMouth(0.45 + o * 0.55)
      AM.lids = true
      AM.bobX = Math.sin(el / 300) * 17
      AM.bobY = -Math.abs(Math.sin(el / 230)) * 9
      AM.rot = Math.sin(el / 300) * 8
      AM.leafRot = Math.sin(el / 230) * 9
      S.lookTarget = null
      if (t > noteT) {
        spawnNote(Math.random() < 0.4 ? 'belt' : 'up')
        noteT = t + 300 + Math.random() * 240
      }
      if (S.actUntil && t > S.actUntil) stopActivity()
    } else if (a === 'music') {
      AM.lids = true
      AM.bobY = -Math.abs(Math.sin(el / 230)) * 4
      AM.rot = Math.sin(el / 300) * 4
      AM.leafRot = Math.sin(el / 300) * 5
      if (t > noteT) {
        spawnNote('in')
        noteT = t + 520 + Math.random() * 300
      }
      if (S.actUntil && t > S.actUntil) stopActivity()
    } else if (a === 'coding') {
      // hunched over the laptop, focused, typing away
      const lp = laptop ? laptop.getBoundingClientRect() : null
      if (lp && lp.width) S.lookTarget = { x: lp.left + lp.width * 0.5, y: lp.top + lp.height * 0.32 }
      else S.lookTarget = { x: S.x + 75, y: S.y + 150 }
      AM.eyeDown = 0.7
      AM.bobY = 1.4 + Math.sin(el / 110) * 1.1
      AM.rot = Math.sin(el / 900) * 1.2
      AM.mouth = MOUTHS.determined
      if (t > noteT) {
        spawnCode()
        noteT = t + 620 + Math.random() * 460
      }
      if (S.actUntil && t > S.actUntil) stopActivity()
    } else if (a === 'fortune') {
      // peering into the crystal ball, entranced
      const orb = fortune ? fortune.querySelector('.kp-orb').getBoundingClientRect() : null
      if (orb && orb.width) S.lookTarget = { x: orb.left + orb.width / 2, y: orb.top + orb.height / 2 }
      else S.lookTarget = { x: S.x + 75, y: S.y + 128 }
      AM.eyeDown = 0.5
      AM.lidHalf = true
      AM.bobY = Math.sin(el / 700) * 1.6
      AM.rot = Math.sin(el / 1200) * 1.6
      AM.leafRot = Math.sin(el / 900) * 3
      AM.mouth = MOUTHS.curious
      if (t > noteT) {
        spawnMystic()
        noteT = t + 540 + Math.random() * 360
      }
      if (S.actUntil && t > S.actUntil) stopActivity()
    } else if (a === 'painting') {
      AM.rot = 3 + Math.sin(el / 500) * 1.5
      AM.bobY = Math.sin(el / 300) * 1.5
      const cv = canvasEl ? canvasEl.getBoundingClientRect() : null
      if (cv && cv.width) S.lookTarget = { x: cv.left + cv.width * 0.5, y: cv.top + cv.height * 0.7 }
      else S.lookTarget = { x: S.x + 150, y: S.y + 80 }
      if (t > paintDabT) {
        addStroke()
        paintDabT = t + 1050 + Math.random() * 350
      }
      if (S.actUntil && t > S.actUntil) stopActivity()
    } else if (a === 'reading') {
      const line = 1200
      const ph = (el % line) / line
      S.lookTarget = { x: S.x + 60 + ph * 30, y: S.y + 168 }
      AM.eyeDown = 1
      AM.bobY = Math.sin(el / 900) * 0.8
      if (S.actData && t > S.actData.flip) {
        flipPage()
        S.actData.flip = t + 5000
      }
      if (S.actUntil && t > S.actUntil) stopActivity()
    } else if (a === 'blooming') {
      // flowers blooming off of her — blissful, swaying, gazing at the blossoms
      AM.mouth = MOUTHS.happy
      AM.bobY = Math.sin(el / 520) * 3.4
      AM.rot = Math.sin(el / 900) * 2.6
      AM.leafRot = Math.sin(el / 460) * 7
      S.lookTarget = { x: S.x + 75 + Math.sin(el / 560) * 26, y: S.y + 34 }
      if (t > noteT) {
        spawnBloom()
        if (Math.random() < 0.5) spawnBloom()
        noteT = t + 230 + Math.random() * 200
      }
      if (S.actUntil && t > S.actUntil) stopActivity()
    } else if (a === 'sleep') {
      applySleep(t, el, AM)
    }
  }

  // ── per-page activity + dark-mode override ────────────────────────────────
  function applyEffective() {
    if (opts.playful || S.dragging || S.hidden) return
    if (S.state === 'dizzy' || S.state === 'mad') return // let the tantrum play out
    // same behaviour in both themes — a hover preview wins over the page activity
    const want = S.previewing ? S.previewActivity : S.pageActivity
    if (!want) {
      if (S.activity === 'sleep') wakeUp()
      else if (S.activity) stopActivity()
      return
    }
    if (S.activity === want) return
    startActivity(want, 0) // 0 → run until the page/preview changes
  }
  function setActivity(name) {
    S.pageActivity = name || null
    S.previewing = false // a page change clears any lingering hover preview
    S.previewActivity = null
    applyEffective()
  }
  function previewActivity(name) {
    S.previewing = true
    S.previewActivity = name || null
    applyEffective()
  }
  function clearPreview() {
    S.previewing = false
    S.previewActivity = null
    applyEffective()
  }
  function setHidden(v) {
    v = !!v
    if (S.hidden === v) return
    S.hidden = v
    const disp = v ? 'none' : ''
    root.style.display = disp
    aura.style.display = disp
    trail.style.display = disp
    if (v) stopActivity(true) // leave no activity running while she's away
    else applyEffective() // resume the page's activity when she returns
  }

  // ── reactions ──────────────────────────────────────────────────────────────
  const sel = opts.controlled ? '' : opts.reactSelectors || '.node, .btn, .theme-toggle, .dock .orb, .center'
  const onReactorOver = (ev) => {
    if (S.activity || !sel) return
    const t = ev.target.closest(sel)
    if (!t || t.classList.contains('kp-hit')) return
    const r = t.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const side = cx > innerWidth / 2 ? -1 : 1
    const px = clamp(cx + side * (r.width / 2 + 34) - PETW / 2, 10, innerWidth - PETW - 10)
    const py = clamp(r.bottom + 2, 10, innerHeight - PETH - 6)
    moveTo(px, py)
    S.lookTarget = { x: cx, y: r.top + r.height / 2 }
    S.interest = S.lookTarget
    setState('curious', 0)
    clearTimeout(curiousClearT)
    curiousClearT = setTimeout(() => {
      S.lookTarget = null
      S.interest = null
      applyEffective()
    }, 2600)
  }
  const onReactorClick = (ev) => {
    if (S.activity || !sel) return
    const t = ev.target.closest(sel)
    if (t && !t.classList.contains('kp-hit')) emote('happy')
  }
  if (!opts.controlled) {
    document.addEventListener('mouseover', onReactorOver, { passive: true })
    document.addEventListener('click', onReactorClick, { passive: true })
  }

  // pat / drag / shake
  const hit = root.querySelector('.kp-hit')
  let downAt = null
  let moved = false
  const onHitDown = (e) => {
    if (S.activity) stopActivity()
    S.dragging = true
    moved = false
    root.classList.add('kp-grab')
    S.shakeMeter = 0
    S.shakeDir = 0
    S.lastSX = null
    downAt = { x: e.clientX - S.x, y: e.clientY - S.y }
    hit.setPointerCapture(e.pointerId)
  }
  const onHitMove = (e) => {
    if (!S.dragging) return
    moved = true
    if (S.lastSX != null) {
      const d = e.clientX - S.lastSX
      if (Math.abs(d) > 4) {
        const dir = d > 0 ? 1 : -1
        if (S.shakeDir && dir !== S.shakeDir) {
          S.shakeMeter += 1.2
          S.lastShakeT = now()
        }
        S.shakeDir = dir
      }
    }
    S.lastSX = e.clientX
    S.x = clamp(e.clientX - downAt.x, 0, innerWidth - PETW)
    S.y = clamp(e.clientY - downAt.y, 0, innerHeight - PETH)
    S.tx = S.x
    S.ty = S.y
    S.vx = 0
    S.vy = 0
  }
  const onHitUp = () => {
    S.dragging = false
    root.classList.remove('kp-grab')
    if (S.shakeMeter >= 6 && !REDUCE) {
      S.shakeMeter = 0
      S.reactT = 0
      setState('dizzy', 2600)
      say('dizzy')
    } else if (!moved) {
      emote('happy')
      say(Math.random() < 0.5 ? 'spark' : 'love')
    } else {
      goIdleSoon(400)
      applyEffective() // resume the page activity she was dragged out of
    }
  }
  if (opts.controlled) {
    hit.style.pointerEvents = 'none'
  } else {
    hit.addEventListener('pointerdown', onHitDown)
    hit.addEventListener('pointermove', onHitMove)
    hit.addEventListener('pointerup', onHitUp)
  }

  const mouse = { x: innerWidth / 2, y: innerHeight / 2, last: 0 }
  const onMouseMove = (e) => {
    mouse.x = e.clientX
    mouse.y = e.clientY
    mouse.last = now()
  }
  document.addEventListener('mousemove', onMouseMove, { passive: true })

  const mo = new MutationObserver(applyEffective)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  // ── main loop ──────────────────────────────────────────────────────────────
  let last = now()
  let raf = 0
  let destroyed = false
  function tick() {
    if (destroyed) return
    try {
      const t = now()
      const dt = Math.min(40, t - last)
      last = t
      const f = dt / 16.67
      if (window.__petPause || S.hidden) {
        raf = requestAnimationFrame(tick)
        return
      }

      // idle roam (no spontaneous activities — those are page-driven now)
      if (!opts.controlled && S.state === 'idle' && !S.activity && !S.pendingSleep && t > S.nextIdle && !S.dragging) {
        if (Math.random() < 0.5) {
          const s = restSpot()
          moveTo(s.x, s.y)
        } else {
          S.lookTarget = { x: mouse.x, y: mouse.y }
          setTimeout(() => {
            if (S.state === 'idle' && !S.activity) S.lookTarget = null
          }, 1400)
        }
        S.nextIdle = t + 3200 + Math.random() * 3400
      }

      // Orb / ball chase: she drops whatever she's doing to chase bouncing things
      // (the dock orb, the burst shower, or the error-page foam — anything that
      // publishes window.__ballsState), then resumes her page activity after.
      const inTantrum = S.state === 'dizzy' || S.state === 'mad' || S.pendingSleep
      const balls = !opts.controlled && !S.dragging && !inTantrum ? window.__ballsState : null
      if (balls && balls.length) {
        if (S.activity) stopActivity(true) // interrupt her activity to give chase
        S.chasing = true
        S.state = 'idle'
        let best = null
        let bd = 1e9
        for (const b of balls) {
          const d = Math.abs(b.x - (S.x + PETW / 2))
          if (d < bd) {
            bd = d
            best = b
          }
        }
        if (best) {
          // leap toward it in 2D so she jumps up as the orb flies
          moveTo(best.x - PETW / 2, clamp(best.y - PETH * 0.42, 6, innerHeight - PETH - 8))
          S.lookTarget = { x: best.x, y: best.y }
        }
      } else if (S.chasing) {
        S.chasing = false
        applyEffective() // settled → back to her page activity
      }

      const k = S.dragging ? 0 : S.chasing ? 0.034 : 0.018
      S.vx += (S.tx - S.x) * k
      S.vy += (S.ty - S.y) * k
      S.vx *= 0.84
      S.vy *= 0.84
      if (!S.dragging) {
        S.x += S.vx * f
        S.y += S.vy * f
      }

      const speed = Math.hypot(S.vx, S.vy)
      const moving = speed > 0.35
      if (S.vx > 0.4) S.face = 1
      else if (S.vx < -0.4) S.face = -1

      const AM = {
        bobX: 0, bobY: 0, sx: 1, sy: 1, rot: 0, mouth: null, lids: false, lidHalf: false,
        leafRot: 0, leafDroop: 0, originY: 118, flat: false, eyeDown: 0, dizzy: false,
      }
      applyActivity(t, AM)
      if (S.shakeMeter > 0 && t - S.lastShakeT > 320) S.shakeMeter = Math.max(0, S.shakeMeter - 0.06)
      if (S.state === 'dizzy') {
        AM.rot = Math.sin(t / 95) * 11
        AM.bobX = Math.sin(t / 150) * 5
        AM.mouth = MOUTHS.dizzy
        AM.dizzy = true
      } else if (S.state === 'mad') {
        AM.rot = Math.sin(t / 38) * 4.5
        AM.mouth = MOUTHS.mad
        AM.leafRot = Math.sin(t / 60) * 5
      }
      if ((S.state === 'dizzy' || S.state === 'mad') && t > S.reactT) {
        say(S.state === 'dizzy' ? 'dizzy' : 'anger')
        S.reactT = t + (S.state === 'dizzy' ? 460 : 620)
      }

      if (moving) {
        S.hop += 0.3 * f
        S.hopAmp = lerp(S.hopAmp, clamp(speed * 1.5, 4, 12), 0.1)
      } else S.hopAmp = lerp(S.hopAmp, 0, 0.08)
      const hopY = -Math.abs(Math.sin(S.hop)) * S.hopAmp

      S.breathe += 0.045 * f
      S.sway += (S.state === 'happy' ? 0.16 : 0.05) * f
      const breath = Math.sin(S.breathe) * 1.6
      const swayDeg = Math.sin(S.sway) * (S.state === 'sleepy' ? 1.6 : 3.2)

      let sx = 1
      let sy = 1
      if (moving) {
        const st = clamp(speed * 0.012, 0, 0.1)
        sy = 1 + st
        sx = 1 - st * 0.7
      } else {
        sy = 1 - breath * 0.01
        sx = 1 + breath * 0.01
      }
      sx *= AM.sx
      sy *= AM.sy

      const scaleStr = opts.scale ? ` scale(${opts.scale})` : ''
      root.style.transform = `translate(${(S.x + AM.bobX).toFixed(1)}px, ${(S.y + hopY + AM.bobY).toFixed(1)}px) rotate(${AM.rot.toFixed(2)}deg)${scaleStr}`
      bodyG.style.transform = `scale(${(sx * S.face).toFixed(3)}, ${sy.toFixed(3)})`
      bodyG.style.transformOrigin = `75px ${AM.originY}px`
      leavesG.style.transformOrigin = AM.flat ? `75px ${AM.originY}px` : '75px 92px'
      const leafSx = AM.flat ? S.face * AM.sx : S.face
      const leafSy = AM.flat ? AM.sy : 1 - AM.leafDroop * 0.5
      leavesG.style.transform = `rotate(${(swayDeg + AM.leafRot).toFixed(2)}deg) scaleX(${leafSx.toFixed(3)}) scaleY(${leafSy.toFixed(3)})`
      const sc = clamp(1 + hopY * 0.012, 0.6, 1.05)
      shadow.setAttribute('rx', (34 * sc * (0.7 + 0.3 * AM.sx)).toFixed(1))
      shadow.setAttribute('opacity', ((0.18 + (AM.sx > 1.2 ? 0.1 : 0)) * sc).toFixed(2))

      aura.style.transform = `translate(${(S.x + 75).toFixed(1)}px, ${(S.y + hopY + 78).toFixed(1)}px)`

      const ax = S.x + 75
      const ay = S.y + hopY + 100
      hist.unshift({ x: ax, y: ay })
      if (hist.length > 80) hist.pop()
      const tailVis = clamp(speed / 2.6, 0, 1)
      for (let i = 0; i < NDROPS; i++) {
        const h = hist[Math.min(hist.length - 1, 4 + i * 4)] || { x: ax, y: ay }
        const sz = 13 * (1 - i / NDROPS) + 5
        const dd = drops[i]
        dd.style.width = sz.toFixed(1) + 'px'
        dd.style.height = sz.toFixed(1) + 'px'
        dd.style.opacity = ((1 - i / NDROPS) * 0.6 * tailVis).toFixed(2)
        dd.style.transform = `translate(${(h.x - sz / 2).toFixed(1)}px, ${(h.y - sz / 2).toFixed(1)}px)`
      }

      // eyes
      let lx
      let ly
      const tgt = S.lookTarget || (t - mouse.last < 2600 ? mouse : null)
      if (tgt) {
        const petCx = S.x + 75
        const petCy = S.y + 80
        const dx = tgt.x - petCx
        const dy = tgt.y - petCy
        const a = Math.atan2(dy, dx)
        const mag = clamp(Math.hypot(dx, dy) / 60, 0, 1)
        lx = Math.cos(a) * 3.4 * mag
        ly = Math.sin(a) * 3.2 * mag
      } else {
        lx = 0
        ly = 0.7
      }
      if (AM.eyeDown) ly = Math.max(ly, 5.4 * AM.eyeDown)
      S.look.x = lerp(S.look.x, lx, 0.18)
      S.look.y = lerp(S.look.y, ly, 0.18)
      pups.forEach((p, i) => {
        p.setAttribute('cx', (EYE[i].x + S.look.x).toFixed(1))
        p.setAttribute('cy', (EYE[i].y + S.look.y).toFixed(1))
      })
      glints.forEach((g, i) => {
        g.setAttribute('cx', (EYE[i].x + 2.4 + S.look.x * 0.5).toFixed(1))
        g.setAttribute('cy', (EYE[i].y - 3.4 + S.look.y * 0.5).toFixed(1))
      })
      if (AM.dizzy) {
        const sp = t / 90
        pups.forEach((p, i) => {
          p.setAttribute('cx', (EYE[i].x + Math.cos(sp + i * 0.7) * 3).toFixed(1))
          p.setAttribute('cy', (EYE[i].y + Math.sin(sp + i * 0.7) * 3).toFixed(1))
        })
      }
      const mad = S.state === 'mad'
      brows.forEach((b) => b.setAttribute('opacity', mad ? '1' : '0'))

      if (AM.mouth) mouth.setAttribute('d', AM.mouth)

      const eyesClosed = S.state === 'sleepy' || AM.lids
      if (!eyesClosed && t > S.nextBlink) {
        S.blinkUntil = t + 140
        S.nextBlink = t + 2200 + Math.random() * 3400
      }
      const blinking = !eyesClosed && t < S.blinkUntil
      const lidTarget = eyesClosed || blinking ? 1 : AM.lidHalf ? 0.5 : 0
      S.lidAmt = lerp(S.lidAmt, lidTarget, eyesClosed ? 0.2 : 0.42)
      if (S.lidAmt < 0.004) S.lidAmt = 0
      const la = S.lidAmt
      const openF = 1 - la
      lids.forEach((l) => (l.style.transform = 'scaleY(' + la.toFixed(3) + ')'))
      glints.forEach((g) => g.setAttribute('opacity', openF.toFixed(2)))
      pups.forEach((p) => p.setAttribute('opacity', (0.3 + openF * 0.7).toFixed(2)))
      if (S.state === 'sleepy' && t > sleepTimer) {
        say('sleep')
        sleepTimer = t + 2400 + Math.random() * 1500
      }

      cheeks.forEach((c) => {
        c.setAttribute('opacity', mad || S.state === 'happy' ? '0.85' : '0.55')
        c.setAttribute('fill', mad ? '#ff5147' : '#ff7ea8')
      })

      // after a tantrum: stomp off to the corner and sulk to sleep
      if (!opts.controlled && S.pendingSleep && !S.dragging && !S.activity) {
        const tx = 30
        const ty = innerHeight - PETH - 8
        if (Math.abs(S.x - tx) < 14 && Math.abs(S.y - ty) < 14) {
          S.pendingSleep = false
          startActivity('sleep')
        }
      }

      if (S.stateUntil && t > S.stateUntil) {
        if (S.state === 'dizzy') {
          setState('mad', 2400)
          say('anger')
        } else if (S.state === 'mad') {
          setState('grumpy')
          S.pendingSleep = true
          S.nextIdle = t + 999999
          moveTo(30, innerHeight - PETH - 8)
        } else {
          setState('idle')
          applyEffective() // resume the page activity after a reaction
        }
      }
    } catch (e) {
      window.__petTickErr = (e && e.stack) || String(e)
    }
    raf = requestAnimationFrame(tick)
  }

  // ── init ──────────────────────────────────────────────────────────────────
  const seed = opts.seed != null ? opts.seed : 3 + ((Math.random() * 60) | 0)
  buildFlower(seed)
  buildAura(seed)
  buildProps()
  root.style.transformOrigin = '75px 150px'
  const start = opts.start || { x: 40, y: innerHeight - 160 }
  S.x = S.tx = start.x
  S.y = S.ty = start.y
  setState('idle')
  applyEffective()
  S.nextIdle = now() + 4000
  S.nextBlink = now() + 1800
  raf = requestAnimationFrame(tick)
  const onResize = () => moveTo(S.tx, S.ty)
  window.addEventListener('resize', onResize)
  const helloT = setTimeout(() => {
    if (!S.activity) emote('happy')
  }, 700)

  // ── controls + teardown ──────────────────────────────────────────────────
  function destroy() {
    destroyed = true
    cancelAnimationFrame(raf)
    clearTimeout(curiousClearT)
    clearTimeout(helloT)
    mo.disconnect()
    document.removeEventListener('mouseover', onReactorOver)
    document.removeEventListener('click', onReactorClick)
    document.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('resize', onResize)
    aura.remove()
    trail.remove()
    root.remove()
    style.remove()
  }

  return { destroy, setActivity, previewActivity, clearPreview, setHidden, moveTo, snap, setScale, emote }
}
