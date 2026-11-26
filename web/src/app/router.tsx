import { lazy, type ComponentType } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import DashboardLayout from "../layouts/DashboardLayout";
import { NAVIGATION } from "../config/navigation";
import DashboardPage from "../pages/dashboard/DashboardPage";
import NotFoundPage from "../pages/NotFoundPage";
import PlaceholderPage from "../pages/PlaceholderPage";

// the old tabs: each is its own chunk, and their CSS only loads when one is opened
const DEMOS: Record<string, ComponentType> = {
  "/demos/airport": lazy(() => import("../pages/demos/AirportDemo")),
  "/demos/scale": lazy(() => import("../pages/demos/ScaleDemo")),
  "/demos/journey": lazy(() => import("../pages/demos/JourneyDemo")),
  "/demos/replay": lazy(() => import("../pages/demos/ReplayDemo")),
  "/demos/scenarios": lazy(() => import("../pages/demos/ScenariosDemo")),
  "/demos/benchmarks": lazy(() => import("../pages/demos/BenchDemo")),
};

const pages = NAVIGATION.flatMap((group) => group.items)
  .filter((item) => item.path !== "/dashboard")
  .map((item) => {
    const Demo = DEMOS[item.path];
    return { path: item.path, element: Demo ? <Demo /> : <PlaceholderPage item={item} /> };
  });

const router = createBrowserRouter([
  {
    path: "/",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <DashboardPage /> },
      ...pages,
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
