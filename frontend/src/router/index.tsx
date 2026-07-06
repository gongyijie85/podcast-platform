import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { Loading } from '../components/common/Loading';

const Login = lazy(() => import('../pages/Login').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('../pages/Register').then((m) => ({ default: m.Register })));
const Dashboard = lazy(() => import('../pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Projects = lazy(() => import('../pages/Projects').then((m) => ({ default: m.Projects })));
const BookLibrary = lazy(() => import('../pages/BookLibrary').then((m) => ({ default: m.BookLibrary })));
const BookDetail = lazy(() => import('../pages/BookDetail').then((m) => ({ default: m.BookDetail })));
const ScanCover = lazy(() => import('../pages/ScanCover').then((m) => ({ default: m.ScanCover })));
const ProjectCreate = lazy(() => import('../pages/ProjectCreate').then((m) => ({ default: m.ProjectCreate })));
const ProjectDetail = lazy(() => import('../pages/ProjectDetail').then((m) => ({ default: m.ProjectDetail })));
const SharePreview = lazy(() => import('../pages/SharePreview').then((m) => ({ default: m.SharePreview })));
const Settings = lazy(() => import('../pages/Settings').then((m) => ({ default: m.Settings })));
const NotFound = lazy(() => import('../pages/NotFound').then((m) => ({ default: m.NotFound })));

/**
 * Route table. Pages are code-split via React.lazy for faster initial load.
 * The MainLayout component itself renders <Outlet/>, so child routes are nested.
 */
export const AppRoutes = (): JSX.Element => (
  <Suspense fallback={<Loading fullScreen />}>
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/new" element={<ProjectCreate />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/books" element={<BookLibrary />} />
        <Route path="/books/:isbn" element={<BookDetail />} />
        <Route path="/scan" element={<ScanCover />} />
        <Route path="/book-search" element={<Navigate to="/books" replace />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="/404" element={<NotFound />} />
      <Route path="/share/:token" element={<SharePreview />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  </Suspense>
);

export default AppRoutes;
