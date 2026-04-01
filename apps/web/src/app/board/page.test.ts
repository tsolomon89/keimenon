import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}));

import BoardPage from './page';

describe('BoardPage', () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it('redirects legacy board route to /keimenon', () => {
    BoardPage();
    expect(redirectMock).toHaveBeenCalledWith('/keimenon');
  });
});
