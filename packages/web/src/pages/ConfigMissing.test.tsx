import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConfigMissing } from './ConfigMissing';

describe('ConfigMissing', () => {
  it('tells the developer which variables to set, with role="alert"', () => {
    render(<ConfigMissing missing={['VITE_USER_POOL_ID', 'VITE_USER_POOL_CLIENT_ID']} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('VITE_USER_POOL_ID');
    expect(alert).toHaveTextContent('VITE_USER_POOL_CLIENT_ID');
    expect(alert).toHaveTextContent('packages/web/README.md');
  });
});
