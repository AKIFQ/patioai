'use client';

import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy load heavy components
export const LazyPDFViewer = lazy(() => import('./PDFViewer'));
export const LazyMemoizedMarkdown = lazy(() => import('./tools/MemoizedMarkdown'));
export const LazySourceView = lazy(() => import('./tools/SourceView'));

// Loading fallback component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-4">
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
);

// Wrapper components with Suspense
export const PDFViewerWithSuspense = (props: any) => (
  <Suspense fallback={<LoadingSpinner />}>
    <LazyPDFViewer {...props} />
  </Suspense>
);

export const MemoizedMarkdownWithSuspense = (props: any) => (
  <Suspense fallback={<div className="animate-pulse bg-muted h-4 rounded" />}>
    <LazyMemoizedMarkdown {...props} />
  </Suspense>
);

export const SourceViewWithSuspense = (props: any) => (
  <Suspense fallback={<LoadingSpinner />}>
    <LazySourceView {...props} />
  </Suspense>
);