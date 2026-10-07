import { createBrowserRouter, RouterProvider } from 'react-router';
import { BattlePage } from '../features/battle/BattlePage';
import { SetupPage } from '../features/setup/SetupPage';
import { TeamEditorPage } from '../features/teams/TeamEditorPage';
import { TeamsPage } from '../features/teams/TeamsPage';
import { Layout } from './Layout';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <SetupPage /> },
      { path: '/combate', element: <BattlePage /> },
      { path: '/equipos', element: <TeamsPage /> },
      { path: '/equipos/nuevo', element: <TeamEditorPage /> },
      { path: '/equipos/:id', element: <TeamEditorPage /> },
      { path: '*', element: <SetupPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
