import * as React from 'react';
import { cn } from '../utils/cn';
import { PolymorphicComponentPropsWithRef, PolymorphicForwardRef } from '../utils/polymorphic';

export type CardProps<C extends React.ElementType = 'div'> = PolymorphicComponentPropsWithRef<C>;

export const Card: PolymorphicForwardRef<'div'> = React.forwardRef(
  ({ className, as, ...props }: any, ref: any) => {
    const Component = as || 'div';
    return (
      <Component
        ref={ref}
        className={cn(
          'rounded-lg border border-slate-700 bg-slate-900/50 backdrop-blur-sm text-slate-100 shadow-sm',
          className
        )}
        {...props}
      />
    );
  }
) as any;
Card.displayName = 'Card';

export const CardHeader: PolymorphicForwardRef<'div'> = React.forwardRef(
  ({ className, as, ...props }: any, ref: any) => {
    const Component = as || 'div';
    return (
      <Component ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
    );
  }
) as any;
CardHeader.displayName = 'CardHeader';

export type CardTitleProps<C extends React.ElementType = 'h3'> =
  PolymorphicComponentPropsWithRef<C>;

export const CardTitle: PolymorphicForwardRef<'h3'> = React.forwardRef(
  ({ className, as, ...props }: any, ref: any) => {
    const Component = as || 'h3';
    return (
      <Component
        ref={ref}
        className={cn('text-lg font-semibold leading-none tracking-tight', className)}
        {...props}
      />
    );
  }
) as any;
CardTitle.displayName = 'CardTitle';

export const CardContent: PolymorphicForwardRef<'div'> = React.forwardRef(
  ({ className, as, ...props }: any, ref: any) => {
    const Component = as || 'div';
    return <Component ref={ref} className={cn('p-6 pt-0', className)} {...props} />;
  }
) as any;
CardContent.displayName = 'CardContent';

export const CardFooter: PolymorphicForwardRef<'div'> = React.forwardRef(
  ({ className, as, ...props }: any, ref: any) => {
    const Component = as || 'div';
    return (
      <Component ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
    );
  }
) as any;
CardFooter.displayName = 'CardFooter';
