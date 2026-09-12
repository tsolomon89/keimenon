import * as React from 'react';

/**
 * Helper types for creating polymorphic React components with `as` prop support.
 */

export type AsProp<E extends React.ElementType> = {
  as?: E;
};

export type PropsToOmit<E extends React.ElementType, P> = keyof (AsProp<E> & P);

export type PolymorphicComponentProps<
  E extends React.ElementType,
  P = {},
> = React.PropsWithChildren<P & AsProp<E>> &
  Omit<React.ComponentPropsWithoutRef<E>, PropsToOmit<E, P>>;

export type PolymorphicRef<E extends React.ElementType> = React.ComponentPropsWithRef<E>['ref'];

export type PolymorphicComponentPropsWithRef<
  E extends React.ElementType,
  P = {},
> = PolymorphicComponentProps<E, P> & { ref?: PolymorphicRef<E> };

export interface PolymorphicForwardRef<DefaultTag extends React.ElementType, OwnProps = {}> {
  <C extends React.ElementType = DefaultTag>(
    props: PolymorphicComponentPropsWithRef<C, OwnProps>
  ): React.ReactNode;
  displayName?: string;
}
