// Dynamic imports for heavy dependencies to improve bundle splitting

// Lazy load heavy markdown processing
export const loadMarkdownProcessor = () => import('marked').then(mod => mod.marked);

// Lazy load PDF processing (if used)
export const loadPDFProcessor = () => import('pdfjs-dist').then(mod => mod.default);

// Lazy load chart libraries (if used)
export const loadChartLibrary = () => import('chart.js').then(mod => mod.default);

// Lazy load Three.js (if used)
export const loadThreeJS = () => import('three').then(mod => mod.default);

// Lazy load D3 (if used)
export const loadD3 = () => import('d3').then(mod => mod.default);

// Lazy load syntax highlighting
export const loadPrismJS = () => import('prismjs').then(mod => mod.default);

// Lazy load date utilities
export const loadDateFns = () => import('date-fns').then(mod => mod);

// Helper function to load components with error handling
export const loadComponentWithFallback = async <T>(
  loader: () => Promise<T>,
  fallback: T
): Promise<T> => {
  try {
    return await loader();
  } catch (error) {
    console.warn('Failed to load component, using fallback:', error);
    return fallback;
  }
};