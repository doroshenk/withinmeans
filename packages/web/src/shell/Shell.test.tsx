import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoleProvider, type Role } from '../permissions';
import { Shell } from './Shell';

/** jsdom has no layout: fake matchMedia so the 768px query matches (phone) or not. */
function setWidth(px: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    return {
      matches: max ? px <= Number(max[1]) : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });
}

function renderShell(role: Role = 'owner', onNavigate = vi.fn()) {
  render(
    <RoleProvider role={role}>
      <Shell route="dashboard" onNavigate={onNavigate}>
        <p>page body</p>
      </Shell>
    </RoleProvider>,
  );
  return onNavigate;
}

afterEach(() => vi.unstubAllGlobals());

describe('P1-07: Shell at desktop width', () => {
  it('shows the sidebar, not the tab bar, at 768px and wider', () => {
    setWidth(1440);
    renderShell();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Tabs' })).not.toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('lists the seven nav links in spec order and marks the current page', () => {
    setWidth(1440);
    renderShell();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const names = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(names).toEqual([
      'Dashboard',
      'Bills & cash flow',
      'Recurring bills',
      'Paychecks & income',
      'Accounts',
      'Investment income',
      'Allocation settings',
    ]);
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('navigates when a link is clicked', async () => {
    setWidth(1440);
    const onNavigate = renderShell();
    await userEvent.click(screen.getByRole('link', { name: 'Accounts' }));
    expect(onNavigate).toHaveBeenCalledWith('accounts');
  });

  it('has a + Add button above the money-moves card placeholder', () => {
    setWidth(1440);
    renderShell();
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument();
    expect(screen.getByText("This week's money moves")).toBeInTheDocument();
  });

  it('T21: hides + Add from a view-only member', () => {
    setWidth(1440);
    renderShell('view');
    expect(screen.queryByRole('button', { name: '+ Add' })).not.toBeInTheDocument();
  });
});

describe('P1-07: Shell at phone width', () => {
  it('shows the tab bar, not the sidebar, below 768px', () => {
    setWidth(390);
    renderShell();
    expect(screen.getByRole('navigation', { name: 'Tabs' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('has Home, Bills, Add, Income and More tabs', () => {
    setWidth(390);
    renderShell();
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    const names = within(tabs)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['Home', 'Bills', 'Add', 'Income', 'More']);
  });

  it('More opens Paychecks, Recurring bills, Accounts, Allocation settings and Year in review', async () => {
    setWidth(390);
    const onNavigate = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    const menu = screen.getByRole('menu', { name: 'More' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([
      'Paychecks',
      'Recurring bills',
      'Accounts',
      'Allocation settings',
      'Year in review',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Accounts' }));
    expect(onNavigate).toHaveBeenCalledWith('accounts');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('T21: hides the Add tab from a view-only member', () => {
    setWidth(390);
    renderShell('view');
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });
});

describe('P1-07: accessibility', () => {
  it('every button with no visible text has an aria-label', () => {
    for (const width of [1440, 390]) {
      setWidth(width);
      renderShell();
      for (const button of screen.getAllByRole('button')) {
        const label = button.getAttribute('aria-label') ?? button.textContent?.trim();
        expect(label, button.outerHTML).toBeTruthy();
      }
      document.body.innerHTML = '';
    }
  });

  it('draws a visible focus ring and never removes outlines', () => {
    const css = readFileSync(join(__dirname, '../styles.css'), 'utf8');
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline:\s*2px solid/);
    expect(css).not.toMatch(/outline:\s*(none|0)/);
  });
});
