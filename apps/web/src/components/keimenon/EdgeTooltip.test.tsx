import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EdgeTooltip } from './EdgeTooltip';

describe('EdgeTooltip', () => {
  it('renders edge metadata when visible', () => {
    render(
      <EdgeTooltip
        edge={{
          id: 'edge_1',
          kind: 'NEAR_DUP',
          data: {
            score: 0.82,
            algorithm: 'cosine',
            features_used: ['tfidf', 'mass'],
          },
        }}
        position={{ x: 100, y: 120 }}
        visible={true}
      />
    );

    expect(screen.getByText('Near Duplicate')).toBeInTheDocument();
    expect(screen.getByText('82.0%')).toBeInTheDocument();
    expect(screen.getByText('cosine')).toBeInTheDocument();
    expect(screen.getByText('tfidf, mass')).toBeInTheDocument();
  });

  it('does not render when hidden', () => {
    const { container } = render(
      <EdgeTooltip
        edge={{ id: 'edge_2', kind: 'SIMILAR_TO' }}
        position={{ x: 0, y: 0 }}
        visible={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
