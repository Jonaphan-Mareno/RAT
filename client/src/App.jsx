import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import RepoView from './pages/RepoView';

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    setDark(document.documentElement.classList.contains('dark'));
    return () => obs.disconnect();
  }, []);
  return dark;
}

export default function App() {
  const isDark = useIsDark();

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: isDark ? '#1B1B1B' : '#FFFFFF',
            color: isDark ? '#F0F0F0' : '#121212',
            border: `2px solid ${isDark ? '#F0F0F0' : '#121212'}`,
            borderRadius: '0',
            boxShadow: isDark ? '4px 4px 0 0 #F0F0F0' : '4px 4px 0 0 #121212',
            fontFamily: 'Outfit, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: '13px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          },
          success: {
            style: { borderLeftWidth: '4px', borderLeftColor: '#0B7A3B' },
          },
          error: {
            style: { borderLeftWidth: '4px', borderLeftColor: '#D02020' },
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="repos/:repoId" element={<RepoView />} />
        </Route>
      </Routes>
    </>
  );
}
