import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { BOARD_FIELDS } from './monopolyData'

const TW     = 180          // tile width  (was 240 — smaller = fits screen)
const TH     = 90           // tile height
const COLS   = 11
const WALL_H = 12

const ISO_A  = Math.atan2(TH, TW)   // ≈ 26.57°
const BAR    = 0.30                  // color bar = top 30 % of upper half

function isoToScreen(col, row) {
  return { x: (col - row) * (TW / 2), y: (col + row) * (TH / 2) }
}
function fieldToGrid(idx) {
  if (idx <= 10) return { col: 10 - idx, row: 10 }
  if (idx <= 20) return { col: 0,        row: 10 - (idx - 10) }
  if (idx <= 30) return { col: idx - 20, row: 0 }
  return            { col: 10,       row: idx - 30 }
}
function getFieldSide(fieldId) {
  if ([0, 10, 20, 30].includes(fieldId)) return 'corner'
  if (fieldId < 10) return 'bottom'
  if (fieldId < 20) return 'left'
  if (fieldId < 30) return 'top'
  return 'right'
}
function getTextRotation(fieldId) {
  const s = getFieldSide(fieldId)
  if (s === 'bottom' || s === 'top')   return +ISO_A
  if (s === 'left'   || s === 'right') return -ISO_A
  return 0
}

// ── Field background color ────────────────────────────────────────────────────
function fieldBgColor(field) {
  if (field.type === 'corner' && field.name === 'START')        return [0xeaffe8, 0xcff0d0]
  if (field.type === 'corner' && field.name === 'Więzienie')    return [0xddeeff, 0xbbd0f0]
  if (field.type === 'corner' && field.name === 'Parking')      return [0xe0f8e0, 0xc4e8c4]
  if (field.type === 'corner')                                   return [0xffd8d8, 0xffbbbb]
  if (field.type === 'tax'    && field.name.includes('Kasa'))   return [0xfffbe0, 0xf0e8b8]
  if (field.type === 'tax')                                      return [0xffe8d0, 0xf0cfb0]
  if (field.type === 'chance')                                   return [0xf0e0ff, 0xddc0f8]
  if (field.type === 'station')                                  return [0xdcebff, 0xbbd0f0]
  if (field.type === 'utility')                                  return [0xdcfff0, 0xbbf0d8]
  return [0xf8f8ff, 0xe8eaf8]
}

function hexToInt(hex) {
  if (!hex) return 0xaaaaaa
  return parseInt(hex.replace('#', ''), 16)
}
function blendColor(hex, blendWith, amount) {
  const r1=(hex>>16)&0xff, g1=(hex>>8)&0xff, b1=hex&0xff
  const r2=(blendWith>>16)&0xff, g2=(blendWith>>8)&0xff, b2=blendWith&0xff
  return (Math.round(r1+(r2-r1)*amount)<<16)|(Math.round(g1+(g2-g1)*amount)<<8)|Math.round(b1+(b2-b1)*amount)
}
function darken(c,a)  { return blendColor(c,0x000000,a) }
function lighten(c,a) { return blendColor(c,0xffffff,a) }

function wrapText(text, maxChars) {
  const words = text.split(' ')
  if (words.length === 1) {
    if (text.length <= maxChars) return text
    const mid = Math.ceil(text.length / 2)
    return text.slice(0, mid) + '\n' + text.slice(mid)
  }
  const lines = []; let cur = ''
  for (const w of words) {
    if ((cur + (cur ? ' ' : '') + w).length > maxChars) { if (cur) lines.push(cur); cur = w }
    else cur = cur ? cur + ' ' + w : w
  }
  if (cur) lines.push(cur)
  return lines.join('\n')
}

const PAWN_Y = TH * 0.5

function getTileCenter(fieldId) {
  const { col, row } = fieldToGrid(fieldId)
  const { x, y }     = isoToScreen(col, row)
  return { x, y: y + PAWN_Y }
}

// ── Inner (green board) tile ──────────────────────────────────────────────────
function drawInnerTile(root, x, y) {
  const hw = TW/2, hh = TH/2
  const shade = (Math.floor(x/TW+y/TH) % 2 === 0) ? 0x0e4422 : 0x0c3a1c
  const g = new PIXI.Graphics()
  g.poly([x, y, x+hw, y+hh, x, y+hh*2, x-hw, y+hh])
  g.fill(shade)
  g.poly([x, y, x+hw, y+hh, x, y+hh*2, x-hw, y+hh])
  g.stroke({ color: 0x082a10, width: 0.8, alpha: 0.9 })
  root.addChild(g)
}

// ── Edge tile ─────────────────────────────────────────────────────────────────
// Layout:
//   ┌── thin colored bar (top BAR fraction of upper half) ──┐
//   │  full pearl-white tile face below                     │
//   │  NAME text ~80-88% of upper-half height               │
//   ├───────────────── center line ─────────────────────────┤
//   │  icon (if any)  ·  PRICE                              │
//   └───────────────────────────────────────────────────────┘
function drawTile(root, x, y, field, ownerColor, propColorInt) {
  const hw = TW/2, hh = TH/2
  const rot = getTextRotation(field.id)
  const [bgTop, bgBot] = fieldBgColor(field)
  const g = new PIXI.Graphics()

  // ── Walls ──
  g.poly([x-hw, y+hh, x, y+hh*2, x, y+hh*2+WALL_H, x-hw, y+hh+WALL_H])
  g.fill(0xbbc2d8)
  g.poly([x+hw, y+hh, x, y+hh*2, x, y+hh*2+WALL_H, x+hw, y+hh+WALL_H])
  g.fill(0xd0d8ee)

  // ── Full tile face: pearl gradient ──
  const grad = new PIXI.FillGradient({ x0: x, y0: y, x1: x, y1: y+hh*2 })
  grad.addColorStop(0,   lighten(bgTop, 0.12))
  grad.addColorStop(0.5, bgTop)
  grad.addColorStop(1,   bgBot)
  g.poly([x, y, x+hw, y+hh, x, y+hh*2, x-hw, y+hh])
  g.fill(grad)

  // ── Color bar: thin triangle at TOP of tile (outer edge) ──
  // BAR = 0.30 → bar occupies top 30 % of the upper-half height
  if (propColorInt) {
    const bx = hw * BAR, by = hh * BAR
    g.poly([x, y, x+bx, y+by, x-bx, y+by])
    g.fill({ color: propColorInt, alpha: 1.0 })
    // subtle gloss inside bar
    g.poly([x, y, x+bx*0.55, y+by*0.55, x-bx*0.55, y+by*0.55])
    g.fill({ color: 0xffffff, alpha: 0.20 })
    // thin divider line at bar bottom
    g.moveTo(x - bx, y + by)
    g.lineTo(x + bx, y + by)
    g.stroke({ color: darken(propColorInt, 0.30), width: 1.5, alpha: 0.9 })
  }

  // ── Tile border ──
  g.poly([x, y, x+hw, y+hh, x, y+hh*2, x-hw, y+hh])
  g.stroke({ color: 0x8888aa, width: 1.0, alpha: 0.35 })

  root.addChild(g)

  // ── CORNER tile ──
  if (field.type === 'corner') {
    const labels = { START: '▶ START', Więzienie: '🔒\nWIĘZIENIE', Parking: '🅿\nPARKING' }
    const label  = labels[field.name] ?? '→🔒\nIDŹ DO\nWIĘZIENIA'
    const t = new PIXI.Text({
      text: label,
      style: { fontSize: 13, fill: 0x0a0a22, fontWeight: '900', align: 'center',
               lineHeight: 16, fontFamily: 'Arial Black, Arial, sans-serif',
               stroke: { color: 0xffffff, width: 3 } },
    })
    t.anchor.set(0.5, 0.5); t.x = x; t.y = y + hh
    root.addChild(t)
    return
  }

  // ── Name label ──
  // Placed between the bar bottom and the center line, ~82-88 % of upper-half height.
  // This keeps text well below the bar and well above the center.
  const rawLabel =
    field.type === 'chance'  ? 'SZANSA' :
    field.type === 'station' ? field.name.replace('✈ ', '').toUpperCase() :
    field.name.toUpperCase()
  const wrapped   = wrapText(rawLabel, 8)
  const lineCount = wrapped.split('\n').length

  const nameCY = y + hh * (lineCount > 1 ? 0.82 : 0.88)

  const nameTxt = new PIXI.Text({
    text: wrapped,
    style: {
      fontSize:   12,
      fill:       0x0a0a22,
      fontWeight: '900',
      align:      'center',
      lineHeight: 14,
      fontFamily: 'Arial Black, Arial, sans-serif',
    },
  })
  nameTxt.anchor.set(0.5, 0.5)
  nameTxt.x = x; nameTxt.y = nameCY
  nameTxt.rotation = rot
  root.addChild(nameTxt)

  // ── Icon — lower half ──
  let icon = null
  if      (field.type === 'station')                                       icon = '✈'
  else if (field.type === 'utility' && field.name.includes('Elektrownia')) icon = '⚡'
  else if (field.type === 'utility' && field.name.includes('Wodociągi'))   icon = '💧'
  else if (field.type === 'chance')                                        icon = '❓'
  else if (field.name.includes('Kasa'))                                    icon = '💰'
  else if (field.name.includes('Podatek') || field.name.includes('Luksus')) icon = '💸'

  if (icon) {
    const it = new PIXI.Text({ text: icon, style: { fontSize: 14, align: 'center' } })
    it.anchor.set(0.5, 0.5); it.x = x; it.y = y + hh * 1.22
    it.rotation = rot
    root.addChild(it)
  }

  // ── Price — lower half ──
  if (field.price > 0) {
    const pt = new PIXI.Text({
      text: `${field.price}€`,
      style: {
        fontSize:   14,
        fill:       0x111144,
        fontWeight: '900',
        align:      'center',
        fontFamily: 'Arial Black, Arial, sans-serif',
      },
    })
    pt.anchor.set(0.5, 0.5)
    pt.x = x
    pt.y = y + hh * (icon ? 1.56 : 1.46)
    pt.rotation = rot
    root.addChild(pt)
  }

  // ── Owner dot ──
  if (ownerColor) {
    const dot = new PIXI.Graphics()
    dot.circle(x + hw * 0.48, y + hh * 0.52, 6)
    dot.fill(ownerColor)
    dot.circle(x + hw * 0.48, y + hh * 0.52, 6)
    dot.stroke({ color: 0xffffff, width: 1.5 })
    root.addChild(dot)
  }
}

// ── House ─────────────────────────────────────────────────────────────────────
function drawHouse(root, x, y, ownerColor) {
  const c = ownerColor || 0x22aa44
  const g = new PIXI.Graphics()
  g.rect(x-6, y-5, 12, 8);  g.fill(darken(c, 0.08))
  g.poly([x+6, y-5, x+10, y-7, x+10, y+3, x+6, y+3]); g.fill(darken(c, 0.32))
  g.poly([x-6, y-5, x, y-13, x+6, y-5]); g.fill(lighten(c, 0.28))
  g.poly([x+6, y-5, x, y-13, x+4, y-15, x+10, y-7]); g.fill(darken(c, 0.18))
  g.rect(x-2, y-3, 5, 5); g.fill(darken(c, 0.62))
  root.addChild(g)
}

// ── Hotel ─────────────────────────────────────────────────────────────────────
function drawHotel(root, x, y, ownerColor) {
  const c = ownerColor ? blendColor(ownerColor, 0xff2222, 0.5) : 0xcc2222
  const g = new PIXI.Graphics()
  g.rect(x-10, y-14, 20, 14); g.fill(darken(c, 0.07))
  g.poly([x+10, y-14, x+15, y-17, x+15, y-3, x+10, y]); g.fill(darken(c, 0.32))
  g.poly([x-10, y-14, x+10, y-14, x+15, y-17, x-5, y-17]); g.fill(lighten(c, 0.16))
  for (let i = 0; i < 3; i++) { g.rect(x-7+i*6, y-11, 4, 4); g.fill(0xffee88) }
  g.rect(x-3, y-7, 7, 7); g.fill(darken(c, 0.58))
  root.addChild(g)
}

// ── Pawn ──────────────────────────────────────────────────────────────────────
function drawPawnAt(root, px, py, color) {
  const shadow = new PIXI.Graphics()
  shadow.ellipse(px, py+15, 9, 3); shadow.fill({ color: 0x000000, alpha: 0.38 })
  root.addChild(shadow)
  const g = new PIXI.Graphics()
  g.circle(px, py+3, 9); g.fill(color)
  g.circle(px, py+3, 9); g.stroke({ color: 0xffffff, width: 2, alpha: 0.95 })
  g.poly([px-3, py+11, px+3, py+11, px+2.5, py+16, px-2.5, py+16])
  g.fill(darken(color, 0.4))
  root.addChild(g)
  const shine = new PIXI.Graphics()
  shine.circle(px-3, py-1, 3); shine.fill({ color: 0xffffff, alpha: 0.38 })
  root.addChild(shine)
}

// ── Board background glow ────────────────────────────────────────────────────
function drawBoardBackground(root) {
  const hw = (COLS-1)*TW/2, hh = (COLS-1)*TH/2
  for (let i = 5; i >= 1; i--) {
    const exp = i*8, alpha = 0.04 - i*0.005
    const g = new PIXI.Graphics()
    g.poly([0,-hh-exp, hw+exp, 0, 0, hh+exp, -hw-exp, 0])
    g.fill({ color: 0x6688ff, alpha })
    root.addChild(g)
  }
}

// ── Build board ───────────────────────────────────────────────────────────────
function buildBoard(boardLayer, gs) {
  boardLayer.removeChildren()
  const board   = gs?.board   || {}
  const players = gs?.players || {}
  const gridToField = {}
  BOARD_FIELDS.forEach(f => {
    const { col, row } = fieldToGrid(f.id)
    gridToField[`${col},${row}`] = f
  })

  for (let row = 0; row < COLS; row++) {
    for (let col = 0; col < COLS; col++) {
      const { x, y } = isoToScreen(col, row)
      const isEdge   = col===0 || col===10 || row===0 || row===10
      const field    = gridToField[`${col},${row}`]
      if (!isEdge) { drawInnerTile(boardLayer, x, y); continue }
      if (!field)  continue

      const owned      = board[field.id]
      const propColor  = field.color ? hexToInt(field.color) : null
      const ownerColor = owned ? hexToInt(players[owned.owner]?.color || '#888') : null
      drawTile(boardLayer, x, y, field, ownerColor, propColor)

      const hh = TH/2
      if (owned?.houses > 0 && owned.houses < 5) {
        const oc = hexToInt(players[owned.owner]?.color || '#22aa44')
        for (let i = 0; i < owned.houses; i++) {
          drawHouse(boardLayer, x+(i-(owned.houses-1)/2)*14, y+hh*1.55, oc)
        }
      } else if (owned?.houses === 5) {
        const oc = hexToInt(players[owned.owner]?.color || '#cc2222')
        drawHotel(boardLayer, x, y+hh*1.55, oc)
      }
    }
  }
}

// ── Highlight ─────────────────────────────────────────────────────────────────
function buildHighlight(highlightLayer, currentFieldId) {
  highlightLayer.removeChildren()
  if (currentFieldId < 0) return
  const { col, row } = fieldToGrid(currentFieldId)
  const { x, y }     = isoToScreen(col, row)
  const hw = TW/2, hh = TH/2
  for (let i = 5; i >= 1; i--) {
    const exp = i*3.5, alpha = 0.10 - i*0.016
    const g = new PIXI.Graphics()
    g.poly([x, y-exp, x+hw+exp, y+hh, x, y+hh*2+exp, x-hw-exp, y+hh])
    g.fill({ color: 0xffd700, alpha })
    highlightLayer.addChild(g)
  }
  const border = new PIXI.Graphics()
  border.poly([x, y, x+hw, y+hh, x, y+hh*2, x-hw, y+hh])
  border.stroke({ color: 0xffd700, width: 2.5, alpha: 0.95 })
  highlightLayer.addChild(border)
}

// ── Pawns ─────────────────────────────────────────────────────────────────────
function buildPawns(pawnLayer, gs, animatingPawns) {
  pawnLayer.removeChildren()
  const players = gs?.players || {}
  BOARD_FIELDS.forEach(f => {
    const { col, row } = fieldToGrid(f.id)
    const { x, y }     = isoToScreen(col, row)
    const here = Object.values(players).filter(p => !p.bankrupt && p.position === f.id)
    here.forEach((p, i) => {
      const offsetX = (i - (here.length-1)/2) * 18
      const anim    = animatingPawns?.[p.nick]
      if (anim) {
        drawPawnAt(pawnLayer, anim.cx, anim.cy, hexToInt(p.color))
      } else {
        drawPawnAt(pawnLayer, x+offsetX, y+PAWN_Y, hexToInt(p.color))
      }
    })
  })
}

// ── React Component ───────────────────────────────────────────────────────────
export function MonopolyPixiBoard({ gameState, currentPlayerNick }) {
  const containerRef      = useRef(null)
  const canvasRef         = useRef(null)
  const appRef            = useRef(null)
  const boardLayerRef     = useRef(null)
  const highlightLayerRef = useRef(null)
  const pawnLayerRef      = useRef(null)
  const initDoneRef       = useRef(false)
  const animatingPawnsRef = useRef({})
  const prevPositionsRef  = useRef({})
  const gameStateRef      = useRef(gameState)
  const cpNickRef         = useRef(currentPlayerNick)

  useEffect(() => { gameStateRef.current = gameState },         [gameState])
  useEffect(() => { cpNickRef.current    = currentPlayerNick }, [currentPlayerNick])

  useEffect(() => {
    if (!containerRef.current || initDoneRef.current) return
    initDoneRef.current = true

    const container = containerRef.current
    const dpr = Math.max(2, window.devicePixelRatio || 1)
    const app = new PIXI.Application()
    let destroyed = false, resizeObserver = null, wheelHandler = null

    const BOARD_W = (COLS-1) * TW   // 1800
    const BOARD_H = COLS * TH       // 990

    // userZoom: controlled by mouse wheel (0.4 – 3.0)
    let userZoom = 1.0

    const getBaseScale = () => {
      const rect = container.getBoundingClientRect()
      const cw   = rect.width  || 800
      const ch   = rect.height || 600
      return Math.min(cw / (BOARD_W + TW), ch / (BOARD_H + TH)) * 0.90
    }

    const updateRoot = (root) => {
      const rect  = container.getBoundingClientRect()
      const cw    = rect.width  || 800
      const ch    = rect.height || 600
      const scale = getBaseScale() * userZoom
      root.scale.set(scale)
      root.x = cw / 2
      root.y = (ch - BOARD_H * scale) / 2 + TH * scale * 0.4
    }

    const { w, h } = (() => {
      const r = container.getBoundingClientRect()
      return { w: r.width||800, h: r.height||600 }
    })()

    app.init({
      canvas:          canvasRef.current,
      width:           w * dpr,
      height:          h * dpr,
      backgroundColor: 0x07090f,
      antialias:       true,
      resolution:      dpr,
      autoDensity:     true,
    }).then(() => {
      if (destroyed) return
      appRef.current = app

      const root       = new PIXI.Container()
      const bgLayer    = new PIXI.Container()
      const boardLayer = new PIXI.Container()
      const hlLayer    = new PIXI.Container()
      const pawnLayer  = new PIXI.Container()
      app.stage.addChild(root)
      root.addChild(bgLayer, boardLayer, hlLayer, pawnLayer)
      boardLayerRef.current     = boardLayer
      highlightLayerRef.current = hlLayer
      pawnLayerRef.current      = pawnLayer

      drawBoardBackground(bgLayer)
      updateRoot(root)

      if (gameStateRef.current) {
        buildBoard(boardLayer, gameStateRef.current)
        const cpf = (cpNickRef.current && gameStateRef.current.players?.[cpNickRef.current]?.position) ?? -1
        buildHighlight(hlLayer, cpf)
        buildPawns(pawnLayer, gameStateRef.current, animatingPawnsRef.current)
      }

      // ── Mouse wheel zoom ──
      wheelHandler = (e) => {
        e.preventDefault()
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        userZoom = Math.max(0.4, Math.min(3.0, userZoom * factor))
        updateRoot(root)
      }
      container.addEventListener('wheel', wheelHandler, { passive: false })

      const FRAMES = 8
      app.ticker.add(() => {
        const anims = animatingPawnsRef.current
        let hasAnim = false
        for (const nick of Object.keys(anims)) {
          const a = anims[nick]
          a.progress = Math.min(1, a.progress + 1/FRAMES)
          const t    = a.progress
          const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t
          a.cx = a.fromX + (a.toX - a.fromX) * ease
          a.cy = a.fromY + (a.toY - a.fromY) * ease - Math.sin(Math.PI * t) * 22
          if (a.progress >= 1) {
            a.stepIndex++
            if (a.stepIndex >= a.path.length) {
              delete anims[nick]
            } else {
              const from = getTileCenter(a.path[a.stepIndex-1])
              const to   = getTileCenter(a.path[a.stepIndex])
              Object.assign(a, { fromX:from.x, fromY:from.y, toX:to.x, toY:to.y, cx:from.x, cy:from.y, progress:0 })
              hasAnim = true
            }
          } else { hasAnim = true }
        }
        if (hasAnim && pawnLayerRef.current && gameStateRef.current) {
          buildPawns(pawnLayerRef.current, gameStateRef.current, animatingPawnsRef.current)
        }
      })

      resizeObserver = new ResizeObserver(() => {
        if (destroyed || !appRef.current) return
        const rect = container.getBoundingClientRect()
        app.renderer.resize(Math.max(rect.width,1), Math.max(rect.height,1))
        updateRoot(root)
        if (gameStateRef.current && boardLayerRef.current) {
          buildBoard(boardLayerRef.current, gameStateRef.current)
          const cpf = (cpNickRef.current && gameStateRef.current.players?.[cpNickRef.current]?.position) ?? -1
          buildHighlight(highlightLayerRef.current, cpf)
          buildPawns(pawnLayerRef.current, gameStateRef.current, animatingPawnsRef.current)
        }
      })
      resizeObserver.observe(container)
    })

    return () => {
      destroyed = true
      initDoneRef.current = false
      if (resizeObserver) resizeObserver.disconnect()
      if (wheelHandler)   container.removeEventListener('wheel', wheelHandler)
      boardLayerRef.current = highlightLayerRef.current = pawnLayerRef.current = appRef.current = null
      if (app.stage) { try { app.destroy(false) } catch (_) {} }
    }
  }, [])

  useEffect(() => {
    if (!boardLayerRef.current || !gameState) return
    const players = gameState.players || {}
    for (const nick of Object.keys(players)) {
      const p    = players[nick]
      if (p.bankrupt) { prevPositionsRef.current[nick] = p.position; continue }
      const prev = prevPositionsRef.current[nick]
      if (prev !== undefined && prev !== p.position) {
        const path = []; let cur = prev
        while (cur !== p.position) { cur = (cur+1)%40; path.push(cur) }
        const from  = getTileCenter(prev)
        const first = getTileCenter(path[0])
        animatingPawnsRef.current[nick] = {
          path, stepIndex: 0,
          fromX: from.x, fromY: from.y, toX: first.x, toY: first.y,
          cx: from.x, cy: from.y, progress: 0,
        }
      }
      prevPositionsRef.current[nick] = p.position
    }
    buildBoard(boardLayerRef.current, gameState)
    const cpf = (currentPlayerNick && gameState.players?.[currentPlayerNick]?.position) ?? -1
    buildHighlight(highlightLayerRef.current, cpf)
    buildPawns(pawnLayerRef.current, gameState, animatingPawnsRef.current)
  }, [gameState, currentPlayerNick])

  return (
    <div ref={containerRef} style={{ width:'100%', height:'100%', position:'relative' }}>
      <canvas ref={canvasRef} style={{ display:'block', width:'100%', height:'100%' }} />
    </div>
  )
}
