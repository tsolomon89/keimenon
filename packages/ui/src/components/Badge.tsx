import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';
import { PolymorphicComponentPropsWithRef, PolymorphicForwardRef } from '../utils/polymorphic';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-purple-600 text-white',
        secondary: 'border-transparent bg-slate-700 text-slate-100',
        outline: 'text-slate-100 border-slate-600',
        success: 'border-transparent bg-green-600 text-white',
        warning: 'border-transparent bg-yellow-600 text-white',
        danger: 'border-transparent bg-red-600 text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type BadgeOwnProps = VariantProps<typeof badgeVariants>;

export type BadgeProps<C extends React.ElementType = 'div'> = PolymorphicComponentPropsWithRef<
  C,
  BadgeOwnProps
>;

export const Badge: PolymorphicForwardRef<'div', BadgeOwnProps> = React.forwardRef(
  ({ className, variant, as, ...props }: any, ref: any) => {
    const Component = as || 'div';
    return <Component className={cn(badgeVariants({ variant }), className)} ref={ref} {...props} />;
  }
) as any;

Badge.displayName = 'Badge';

export { badgeVariants };
