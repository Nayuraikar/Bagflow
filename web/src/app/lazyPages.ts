import { lazy } from 'react'

// these pages load when first opened, to keep the first download small
export const AirportNetworkPage = lazy(() => import('../pages/AirportNetworkPage').then((m) => ({ default: m.AirportNetworkPage })))
export const BaggageTrackerPage = lazy(() => import('../pages/BaggageTrackerPage').then((m) => ({ default: m.BaggageTrackerPage })))
export const CongestionPage = lazy(() => import('../pages/CongestionPage').then((m) => ({ default: m.CongestionPage })))
export const HistoryPage = lazy(() => import('../pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))
export const ScenarioStudioPage = lazy(() => import('../pages/ScenarioStudioPage').then((m) => ({ default: m.ScenarioStudioPage })))
export const ParallelSweepsPage = lazy(() => import('../pages/ParallelSweepsPage').then((m) => ({ default: m.ParallelSweepsPage })))
export const PerformanceLabPage = lazy(() => import('../pages/PerformanceLabPage').then((m) => ({ default: m.PerformanceLabPage })))
export const BackendComparisonPage = lazy(() => import('../pages/BackendComparisonPage').then((m) => ({ default: m.BackendComparisonPage })))
