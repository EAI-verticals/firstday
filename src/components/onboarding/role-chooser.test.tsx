import { fireEvent, render, screen } from '@testing-library/react';
import { RoleChooser } from './role-chooser';

describe('Firstday role chooser', () => {
  it('shows two choices and opens the selected local preview', () => {
    const onSelect = jest.fn();
    render(<RoleChooser onSelect={onSelect} localPreview />);

    expect(
      screen.getByRole('heading', { name: 'Choose your role' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Employer/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Admin/ }));
    expect(onSelect).toHaveBeenCalledWith('admin');
    expect(
      screen.getByText(/Demo: you can switch roles without losing progress/),
    ).toBeTruthy();
  });
});
