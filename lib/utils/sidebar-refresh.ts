// Utility to refresh sidebar data after room operations

export function refreshSidebar() {
  // Trigger a page refresh to reload sidebar data
  // In a production app, you'd want to use SWR or similar for more granular updates
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

export function refreshSidebarAfterDelay(delay: number = 1000) {
  setTimeout(() => {
    refreshSidebar();
  }, delay);
}