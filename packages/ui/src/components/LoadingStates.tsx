'use client';

import * as React from 'react';
import { PolymorphicComponentPropsWithRef, PolymorphicForwardRef } from '../utils/polymorphic';

export interface SpinnerLoaderOwnProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export type SpinnerLoaderProps<C extends React.ElementType = 'div'> =
  PolymorphicComponentPropsWithRef<C, SpinnerLoaderOwnProps>;

export const SpinnerLoader: PolymorphicForwardRef<'div', SpinnerLoaderOwnProps> = React.forwardRef(
  ({ size = 'md', className = '', as, ...props }: any, ref: any) => {
    const Component = as || 'div';
    const sizes = {
      sm: 'w-4 h-4 border-2',
      md: 'w-8 h-8 border-3',
      lg: 'w-12 h-12 border-4',
    };

    return (
      <Component
        ref={ref}
        className={`
          ${sizes[size as keyof typeof sizes] || sizes.md}
          border-purple-600 border-t-transparent
          rounded-full animate-spin ${className}
        `.trim()}
        {...props}
      />
    );
  }
) as any;
SpinnerLoader.displayName = 'SpinnerLoader';

export interface ProgressBarOwnProps {
  progress: number;
  className?: string;
}

export type ProgressBarProps<C extends React.ElementType = 'div'> =
  PolymorphicComponentPropsWithRef<C, ProgressBarOwnProps>;

export const ProgressBar: PolymorphicForwardRef<'div', ProgressBarOwnProps> = React.forwardRef(
  ({ progress, className = '', as, ...props }: any, ref: any) => {
    const Component = as || 'div';
    return (
      <Component
        className={`w-full bg-slate-800 rounded-full h-2 overflow-hidden ${className}`.trim()}
        ref={ref}
        {...props}
      >
        <div
          className="h-full bg-purple-600 transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </Component>
    );
  }
) as any;
ProgressBar.displayName = 'ProgressBar';

export interface SkeletonLoaderOwnProps {
  className?: string;
}

export type SkeletonLoaderProps<C extends React.ElementType = 'div'> =
  PolymorphicComponentPropsWithRef<C, SkeletonLoaderOwnProps>;

export const SkeletonLoader: PolymorphicForwardRef<'div', SkeletonLoaderOwnProps> =
  React.forwardRef(({ className = '', as, ...props }: any, ref: any) => {
    const Component = as || 'div';
    return (
      <Component
        className={`animate-pulse bg-slate-800 rounded ${className}`.trim()}
        ref={ref}
        {...props}
      >
        <div className="h-full w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent animate-shimmer" />
      </Component>
    );
  }) as any;
SkeletonLoader.displayName = 'SkeletonLoader';

export interface PulsingDotOwnProps {
  className?: string;
}

export type PulsingDotProps<C extends React.ElementType = 'div'> = PolymorphicComponentPropsWithRef<
  C,
  PulsingDotOwnProps
>;

export const PulsingDot: PolymorphicForwardRef<'div', PulsingDotOwnProps> = React.forwardRef(
  ({ className = '', as, ...props }: any, ref: any) => {
    const Component = as || 'div';
    return (
      <Component className={`flex items-center space-x-1 ${className}`.trim()} ref={ref} {...props}>
        <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
        <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse delay-75" />
        <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse delay-150" />
      </Component>
    );
  }
) as any;
PulsingDot.displayName = 'PulsingDot';

export interface LoadingOverlayOwnProps {
  message?: string;
  progress?: number;
  showProgress?: boolean;
  className?: string;
}

export type LoadingOverlayProps<C extends React.ElementType = 'div'> =
  PolymorphicComponentPropsWithRef<C, LoadingOverlayOwnProps>;

export const LoadingOverlay: PolymorphicForwardRef<'div', LoadingOverlayOwnProps> =
  React.forwardRef(
    ({ message, progress, showProgress, className = '', as, ...props }: any, ref: any) => {
      const Component = as || 'div';
      return (
        <Component
          className={`absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 ${className}`.trim()}
          ref={ref}
          {...props}
        >
          <div className="text-center space-y-4 max-w-sm w-full px-4">
            <SpinnerLoader size="lg" className="mx-auto" />
            {message && <p className="text-sm font-medium text-white">{message}</p>}
            {showProgress && progress !== undefined && (
              <div className="space-y-1">
                <ProgressBar progress={progress} />
                <p className="text-xs text-slate-400">{Math.round(progress)}%</p>
              </div>
            )}
          </div>
        </Component>
      );
    }
  ) as any;
LoadingOverlay.displayName = 'LoadingOverlay';
