import { Link, NavLink, Outlet } from 'react-router';
import { IconMoon, IconSun } from '../components/icons';
import { IconButton, Segmented } from '../components/ui';
import { useSettings } from '../stores/settings';

const SECTIONS: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Combate', end: true },
  { to: '/equipos', label: 'Equipos' },
  { to: '/rivales', label: 'Rivales' },
  { to: '/calculadora', label: 'Calculadora' },
  { to: '/replays', label: 'Replays' },
];

export function Layout() {
  const theme = useSettings((state) => state.theme);
  const toggleTheme = useSettings((state) => state.toggleTheme);
  const namesLocale = useSettings((state) => state.namesLocale);
  const setNamesLocale = useSettings((state) => state.setNamesLocale);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link to="/" className="group flex items-center gap-2.5" aria-label="Colleja: inicio">
            <Logo />
            <span className="display hidden text-[22px] tracking-[0.02em] sm:inline">Colleja</span>
            <span className="eyebrow hidden border-l border-line-strong pl-2.5 text-faint lg:inline">
              Champions · Reg M-C
            </span>
          </Link>
          <nav
            aria-label="Secciones"
            className="flex h-full min-w-0 overflow-x-auto [scrollbar-width:none]"
          >
            {SECTIONS.map((section) => (
              <NavLink
                key={section.to}
                to={section.to}
                end={section.end}
                className={({ isActive }) =>
                  `relative flex h-full shrink-0 items-center px-3 font-display text-[15px] font-semibold tracking-[0.06em] uppercase transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:transition-colors ${
                    isActive
                      ? 'text-text after:bg-accent-fg'
                      : 'text-faint after:bg-transparent hover:text-text'
                  }`
                }
              >
                {section.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
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
            <IconButton
              label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </IconButton>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}

/** The mark: a cut square with the volt slash (same drawing as the favicon). */
function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
      <path d="M7 1h24v24l-6 6H1V7z" className="fill-text" />
      <path d="M9 24L21 8h5L14 24z" className="fill-accent" />
    </svg>
  );
}
