// The Cytoscape drawing of the engine's graph. The parent decides every label, colour and marker.

import cytoscape, { type Core, type StylesheetJson } from 'cytoscape'
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { FACILITY_STATUS } from '../../config/ops'
import type { FacilityStatus, Network } from '../../types/ops'
import type { Marker } from '../../utils/network'

export type Selection = { kind: 'node'; id: number } | { kind: 'edge'; id: string } | null

export interface GraphHandle {
  fit: () => void
  zoom: (factor: number) => void
}

interface Props {
  network: Network
  /** Indexed like `network.nodes`. A `null` status draws the node without a status colour. */
  nodes: { label: string; status: FacilityStatus | null }[]
  downEdges: Set<string>
  showLabels: boolean
  /** Link width follows whole-run traffic, with direction arrows. */
  showFlow: boolean
  hiddenTypes: Set<string>
  selection: Selection
  onSelect: (selection: Selection) => void
  markers: Marker[]
  ref?: Ref<GraphHandle>
}

// the engine's layout is a wide strip; stretching it vertically separates the links
const Y_STRETCH = 1.7
// room for labels that grow as queues do
const PADDING = 44

const STYLE: StylesheetJson = [
  {
    selector: 'node.facility',
    style: {
      width: 46, height: 46, 'background-color': '#ffffff', 'border-width': 2, 'border-color': '#172b45',
      label: 'data(label)', 'text-valign': 'bottom', 'text-margin-y': 5, 'text-wrap': 'wrap', 'font-size': 13, color: '#172b45',
      'text-background-color': '#ffffff', 'text-background-opacity': 0.85, 'text-background-padding': '2px',
    },
  },
  ...Object.entries(FACILITY_STATUS).map(([status, { color }]) => ({
    selector: `node.facility.${status}`, style: { 'background-color': color, 'border-color': color },
  })),
  { selector: 'node.facility.nolabel', style: { label: '' } },
  { selector: 'node.facility.selected', style: { 'border-color': '#172b45', 'border-width': 6 } },
  { selector: 'edge', style: { width: 2, 'line-color': '#c3ccd7', 'curve-style': 'straight', 'target-arrow-color': '#c3ccd7' } },
  { selector: 'edge.flow', style: { width: 'data(width)', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.9 } },
  { selector: 'edge.down', style: { 'line-style': 'dashed', 'line-color': '#d95757', 'target-arrow-color': '#d95757' } },
  // an underlay marks the selection without hiding the red of a link that is down
  { selector: 'edge.selected', style: { 'underlay-color': '#172b45', 'underlay-opacity': 0.28, 'underlay-padding': 6, 'z-index': 5 } },
  {
    selector: 'node.bag',
    style: { width: 8, height: 8, 'background-color': '#2a78d6', 'border-width': 1.5, 'border-color': '#ffffff', events: 'no', 'z-index': 10 },
  },
  { selector: 'node.bag.redirected', style: { 'background-color': '#4a3aa7', shape: 'diamond', width: 11, height: 11 } },
  { selector: '.hidden', style: { display: 'none' } },
]

export default function NetworkGraph(props: Props) {
  const { network, nodes, downEdges, showLabels, showFlow, hiddenTypes, selection, onSelect, markers, ref } = props
  const container = useRef<HTMLDivElement>(null)
  const graph = useRef<Core | null>(null)
  const fitted = useRef(false)
  const select = useRef(onSelect)
  useEffect(() => {
    select.current = onSelect
  })

  useImperativeHandle(ref, () => ({
    fit: () => graph.current?.fit(undefined, PADDING),
    zoom: (factor) => {
      const cy = graph.current
      if (cy) cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
    },
  }), [])

  useEffect(() => {
    const maxTraffic = Math.max(1, ...network.edges.map((e) => e.trafficTotal))
    const element = container.current!
    const cy = cytoscape({
      container: element,
      style: STYLE,
      layout: { name: 'preset' },
      autoungrabify: true,
      boxSelectionEnabled: false,
      minZoom: 0.2,
      maxZoom: 4,
      elements: [
        ...network.nodes.map((n) => ({ data: { id: `n${n.id}`, node: n.id }, position: { x: n.x, y: n.y * Y_STRETCH }, classes: 'facility' })),
        ...network.edges.map((e) => ({
          data: { id: e.id, source: `n${e.source}`, target: `n${e.target}`, width: 1 + (8 * e.trafficTotal) / maxTraffic },
        })),
      ],
    })
    cy.on('tap', (event) => {
      const target = event.target
      if (target === cy) select.current(null)
      else if (target.isNode()) select.current({ kind: 'node', id: target.data('node') })
      else select.current({ kind: 'edge', id: target.id() })
    })
    graph.current = cy
    fitted.current = false
    // Cytoscape lets the first wheel events through while it measures the device, which would scroll
    // the page; over the graph the wheel only ever zooms
    const keepPage = (event: WheelEvent) => event.preventDefault()
    element.addEventListener('wheel', keepPage, { passive: false })
    // refit only when the box really changes size, so a pan or zoom is not undone
    let size = `${element.clientWidth}x${element.clientHeight}`
    const observer = new ResizeObserver(() => {
      const next = `${element.clientWidth}x${element.clientHeight}`
      if (next === size) return
      size = next
      cy.resize()
      cy.fit(undefined, PADDING)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      element.removeEventListener('wheel', keepPage)
      cy.destroy()
      graph.current = null
    }
  }, [network])

  useEffect(() => {
    const cy = graph.current
    if (!cy) return
    cy.batch(() => {
      network.nodes.forEach((n, i) => {
        const el = cy.getElementById(`n${n.id}`)
        el.data('label', nodes[i].label)
        for (const status of Object.keys(FACILITY_STATUS)) el.toggleClass(status, nodes[i].status === status)
        el.toggleClass('nolabel', !showLabels)
        el.toggleClass('hidden', hiddenTypes.has(n.type))
        el.toggleClass('selected', selection?.kind === 'node' && selection.id === n.id)
      })
      for (const e of network.edges) {
        const el = cy.getElementById(e.id)
        el.toggleClass('flow', showFlow)
        el.toggleClass('down', downEdges.has(e.id))
        el.toggleClass('selected', selection?.kind === 'edge' && selection.id === e.id)
      }
    })
    // the first fit waits for the labels, so that none starts outside the box
    if (!fitted.current) {
      fitted.current = true
      cy.fit(undefined, PADDING)
    }
  }, [network, nodes, downEdges, showLabels, showFlow, hiddenTypes, selection])

  useEffect(() => {
    const cy = graph.current
    if (!cy) return
    const types = new Map(network.nodes.map((n) => [n.id, n.type]))
    cy.batch(() => {
      const keep = new Set<string>()
      for (const m of markers) {
        if (hiddenTypes.has(types.get(m.from)!) || hiddenTypes.has(types.get(m.to)!)) continue
        const a = cy.getElementById(`n${m.from}`).position()
        const b = cy.getElementById(`n${m.to}`).position()
        const atNode = m.from === m.to
        const angle = m.slot * 2.4
        const radius = atNode ? 29 + (m.slot % 3) * 5 : 0
        const position = {
          x: a.x + (b.x - a.x) * m.progress + radius * Math.cos(angle),
          y: a.y + (b.y - a.y) * m.progress + radius * Math.sin(angle),
        }
        const id = `bag-${m.id}`
        keep.add(id)
        const el = cy.getElementById(id)
        if (el.empty()) cy.add({ data: { id }, position, classes: m.redirected ? 'bag redirected' : 'bag', selectable: false })
        else el.position(position)
      }
      cy.nodes('.bag').filter((el) => !keep.has(el.id())).remove()
    })
  }, [network, markers, hiddenTypes])

  return (
    <div
      ref={container} role="img" className="h-120 w-full"
      aria-label="Airport network graph, check-in on the left and loading areas on the right. The same details are available from the selection list."
    />
  )
}
