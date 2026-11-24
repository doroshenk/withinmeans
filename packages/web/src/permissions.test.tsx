import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RoleProvider, useCan, type Role } from './permissions';

function AddButton() {
  const can = useCan();
  return can.write ? <button type="button">Add bill</button> : <p>Read only</p>;
}

function renderAs(role: Role | undefined) {
  render(
    <RoleProvider role={role}>
      <AddButton />
    </RoleProvider>,
  );
}

describe('T21: useCan', () => {
  it('T21: a view-only member sees no write controls', () => {
    renderAs('view');
    expect(screen.queryByRole('button', { name: 'Add bill' })).not.toBeInTheDocument();
  });

  it('P1-06: the owner always has full access', () => {
    renderAs('owner');
    expect(screen.getByRole('button', { name: 'Add bill' })).toBeInTheDocument();
  });

  it('P1-06: a full-access member can write', () => {
    renderAs('full');
    expect(screen.getByRole('button', { name: 'Add bill' })).toBeInTheDocument();
  });

  it('T21: with no role known yet (loading, no household) nothing is writable', () => {
    renderAs(undefined);
    expect(screen.queryByRole('button', { name: 'Add bill' })).not.toBeInTheDocument();
  });

  it('T21: outside any provider nothing is writable', () => {
    render(<AddButton />);
    expect(screen.queryByRole('button', { name: 'Add bill' })).not.toBeInTheDocument();
  });
});
