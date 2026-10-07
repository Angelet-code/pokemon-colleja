import { Link, NavLink, Outlet } from 'react-router';
import { Segmented } from '../components/ui';
import { useSettings } from '../stores/settings';

export function Layout() {
  const theme = useSettings((state) => state.theme);
  const toggleTheme = useSettings((state) => state.toggleTheme);
  const namesLocale = useSettings((state) => state.namesLocale);
  const setNamesLocale = useSettings((state) => state.setNamesLocale);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/favicon.svg" alt="" className="size-6" />
            <span className="hidden sm:inline">Pokémon Colleja Simulator</span>
            <span className="sm:hidden">Colleja</span>
          </Link>
          <span className="hidden rounded bg-panel-2 px-1.5 py-0.5 text-xs text-muted md:inline">
            Champions · Reg M-C
          </span>
          <nav aria-label="Secciones" className="ml-2 flex gap-1">
            <NavItem to="/" end>
              Combate
            </NavItem>
            <NavItem to="/equipos">Equipos</NavItem>
            <NavItem to="/rivales">Rivales</NavItem>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted sm:inline">Nombres</span>
            <Segmented
              label="Idioma de los nombres"
              size="sm"
              value={namesLocale}
              onChange={setNamesLocale}
              options={[
                { value: 'es', label: 'ES', title: 'Nombres en español' },
                { value: 'en', label: 'EN', title: 'Nombres en inglés' },
              ]}
            />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
              className="rounded-lg p-2 text-muted transition hover:bg-panel-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-4">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, end, children }: { to: string; end?: boolean; children: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `rounded-lg px-2.5 py-1 text-sm font-medium transition hover:bg-panel-2 ${
          isActive ? 'bg-panel-2 text-text' : 'text-muted hover:text-text'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
