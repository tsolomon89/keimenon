import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}));

import IngestPage from './page';

describe('IngestPage', () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it('redirects legacy ingest route to /keimenon', () => {
    IngestPage();
    expect(redirectMock).toHaveBeenCalledWith('/keimenon');
  });
});
