import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MonthNavigator } from './MonthNavigator';

describe('P1-07: MonthNavigator', () => {
  it('shows the month name and an Open chip', () => {
    render(<MonthNavigator month="2026-11" status="open" onChange={() => {}} />);
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows Closed and Not started chips', () => {
    const { rerender } = render(
      <MonthNavigator month="2026-10" status="closed" onChange={() => {}} />,
    );
    expect(screen.getByText('Closed')).toBeInTheDocument();
    rerender(<MonthNavigator month="2026-12" status="not-started" onChange={() => {}} />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('moves to the previous and next month', async () => {
    const onChange = vi.fn();
    render(<MonthNavigator month="2026-01" status="open" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onChange).toHaveBeenLastCalledWith('2025-12');
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-02');
  });
});
