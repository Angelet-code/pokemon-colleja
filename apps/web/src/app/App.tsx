import { createBrowserRouter, RouterProvider } from 'react-router';
import { BattlePage } from '../features/battle/BattlePage';
import { SetupPage } from '../features/setup/SetupPage';
import { OPPONENT_DESTINATION, TEAM_DESTINATION } from '../features/teams/editor-destination';
import { OpponentsPage } from '../features/teams/OpponentsPage';
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
      { path: '/equipos/nuevo', element: <TeamEditorPage destination={TEAM_DESTINATION} /> },
      { path: '/equipos/:id', element: <TeamEditorPage destination={TEAM_DESTINATION} /> },
      { path: '/rivales', element: <OpponentsPage /> },
      { path: '/rivales/nuevo', element: <TeamEditorPage destination={OPPONENT_DESTINATION} /> },
      { path: '/rivales/:id', element: <TeamEditorPage destination={OPPONENT_DESTINATION} /> },
      { path: '*', element: <SetupPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
