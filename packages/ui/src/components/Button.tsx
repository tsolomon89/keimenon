import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';
import { PolymorphicComponentPropsWithRef, PolymorphicForwardRef } from '../utils/polymorphic';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-purple-600 text-white hover:bg-purple-700',
        secondary: 'bg-slate-700 text-white hover:bg-slate-600',
        outline: 'border border-slate-600 bg-transparent hover:bg-slate-800',
        ghost: 'hover:bg-slate-800 hover:text-white',
        danger: 'bg-red-600 text-white hover:bg-red-700',
        warning: 'bg-yellow-600 text-white hover:bg-yellow-700',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-sm',
        lg: 'h-12 px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export type ButtonOwnProps = VariantProps<typeof buttonVariants>;

export type ButtonProps<C extends React.ElementType = 'button'> = PolymorphicComponentPropsWithRef<
  C,
  ButtonOwnProps
>;

export const Button: PolymorphicForwardRef<'button', ButtonOwnProps> = React.forwardRef(
  ({ className, variant, size, as, ...props }: any, ref: any) => {
    const Component = as || 'button';
    return (
      <Component
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
) as any;

Button.displayName = 'Button';

export { buttonVariants };
