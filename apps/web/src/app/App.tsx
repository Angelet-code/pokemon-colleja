import { createBrowserRouter, RouterProvider } from 'react-router';
import { BattlePage } from '../features/battle/BattlePage';
import { SetupPage } from '../features/setup/SetupPage';
import { Layout } from './Layout';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <SetupPage /> },
      { path: '/combate', element: <BattlePage /> },
      { path: '*', element: <SetupPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
