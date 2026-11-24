import { useState, type ReactNode } from 'react';
import { useCan } from '../permissions';
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery';

export type Route =
  | 'dashboard'
  | 'bills'
  | 'recurring'
  | 'paychecks'
  | 'accounts'
  | 'investment-income'
  | 'allocation'
  | 'year-in-review';

export interface ShellProps {
  route: Route;
  onNavigate: (route: Route) => void;
  children: ReactNode;
}

/** Spec §6 intro, in this order. */
const NAV: { route: Route; label: string }[] = [
  { route: 'dashboard', label: 'Dashboard' },
  { route: 'bills', label: 'Bills & cash flow' },
  { route: 'recurring', label: 'Recurring bills' },
  { route: 'paychecks', label: 'Paychecks & income' },
  { route: 'accounts', label: 'Accounts' },
  { route: 'investment-income', label: 'Investment income' },
  { route: 'allocation', label: 'Allocation settings' },
];

/** Spec §6.15: what the phone's More tab holds. */
const MORE: { route: Route; label: string }[] = [
  { route: 'paychecks', label: 'Paychecks' },
  { route: 'recurring', label: 'Recurring bills' },
  { route: 'accounts', label: 'Accounts' },
  { route: 'allocation', label: 'Allocation settings' },
  { route: 'year-in-review', label: 'Year in review' },
];

/** The responsive frame: sidebar from 768px up, tab bar below. */
export function Shell({ route, onNavigate, children }: ShellProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  return (
    <div className="shell">
      {phone ? null : <Sidebar route={route} onNavigate={onNavigate} />}
      <div className="shell-main">{children}</div>
      {phone ? <TabBar route={route} onNavigate={onNavigate} /> : null}
    </div>
  );
}

type NavProps = Pick<ShellProps, 'route' | 'onNavigate'>;

function Sidebar({ route, onNavigate }: NavProps) {
  const can = useCan();
  return (
    <aside className="sidebar">
      <p className="brand">Within Means</p>
      {can.write && (
        <button type="button" className="button">
          + Add
        </button>
      )}
      <nav aria-label="Main">
        <ul>
          {NAV.map((item) => (
            <li key={item.route}>
              <a
                href={`/${item.route}`}
                className="nav-link"
                aria-current={item.route === route ? 'page' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(item.route);
                }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <section className="moves-card">
        <p>This week&apos;s money moves</p>
        <p className="moves-card-note">Nothing to move yet.</p>
      </section>
    </aside>
  );
}

function TabBar({ route, onNavigate }: NavProps) {
  const can = useCan();
  const [moreOpen, setMoreOpen] = useState(false);
  const go = (to: Route) => {
    setMoreOpen(false);
    onNavigate(to);
  };
  const tab = (to: Route, label: string) => (
    <button
      type="button"
      className="tab"
      aria-current={to === route ? 'page' : undefined}
      onClick={() => go(to)}
    >
      {label}
    </button>
  );
  return (
    <>
      {moreOpen && (
        <div role="menu" aria-label="More" className="more-menu">
          {MORE.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="more-item"
              onClick={() => go(item.route)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <nav aria-label="Tabs" className="tab-bar">
        {tab('dashboard', 'Home')}
        {tab('bills', 'Bills')}
        {can.write && (
          <button type="button" className="tab-add" aria-label="Add">
            <span aria-hidden="true">+</span>
          </button>
        )}
        {tab('investment-income', 'Income')}
        <button
          type="button"
          className="tab"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          More
        </button>
      </nav>
    </>
  );
}
