import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { Toaster } from './components/ui/sonner';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Applicant data changes on ANAC's side: refetch when the tab regains
      // focus, but don't hammer the API on every remount.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // One retry for transient network/server errors; a 4xx won't change.
      retry: (failureCount, error) => {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
    <Toaster />
  </React.StrictMode>
);
