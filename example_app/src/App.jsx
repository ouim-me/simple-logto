import React, { useEffect, useMemo, useState } from 'react';
import {
  AuthProvider,
  CallbackPage,
  SignInButton,
  SignInPage,
  UserCenter,
  UserScope,
  useAuth
} from '@ouim/simple-logto';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCcw,
  Route,
  ShieldCheck
} from 'lucide-react';

const parseCommaList = (value) =>
  value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];

const navigate = (path, replace = false) => {
  if (replace) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }

  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new CustomEvent('navigate', { detail: { url: path, replace } }));
};

const useCurrentPath = () => {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener('navigate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('navigate', sync);
    };
  }, []);

  return path;
};

const getLogtoConfig = () => {
  const scopes = parseCommaList(import.meta.env.VITE_LOGTO_SCOPES);
  const resources = parseCommaList(import.meta.env.VITE_LOGTO_RESOURCES);
  const endpoint = import.meta.env.VITE_LOGTO_ENDPOINT?.trim();
  const appId = import.meta.env.VITE_LOGTO_APP_ID?.trim();

  return {
    isReady: Boolean(endpoint && appId),
    config: {
      endpoint: endpoint ?? '',
      appId: appId ?? '',
      resources,
      scopes: scopes.length > 0 ? scopes : [UserScope.Profile, UserScope.Email]
    }
  };
};

const EventLog = ({ events }) => (
  <div className="rounded-[28px] border border-stone-200/80 bg-white/80 p-5 shadow-[0_20px_60px_rgba(71,53,30,0.08)] backdrop-blur">
    <div className="mb-4 flex items-center justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-stone-500">Event log</p>
        <h3 className="mt-1 text-xl text-stone-900">Auth lifecycle traces</h3>
      </div>
      <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-stone-50">
        {events.length}
      </span>
    </div>

    <div className="space-y-3">
      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-5 text-sm text-stone-500">
          No auth events yet. Start a sign-in flow or refresh auth state.
        </div>
      ) : (
        events.map((event) => (
          <div
            key={event.id}
            className="rounded-2xl border border-stone-200 bg-stone-50/90 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-stone-900">{event.type}</p>
              <time className="text-xs text-stone-500">{event.time}</time>
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-stone-600">
              {event.payload}
            </pre>
          </div>
        ))
      )}
    </div>
  </div>
);

const SetupPanel = () => (
  <main className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
    <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[32px] border border-stone-200/80 bg-[rgba(255,252,245,0.86)] p-8 shadow-[0_28px_80px_rgba(71,53,30,0.1)] backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.32em] text-stone-500">Example app</p>
        <h1 className="mt-4 text-5xl leading-tight text-stone-900">
          Local auth playground for <span className="text-[#b85d38]">simple-logto</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-stone-700">
          This app reads the library directly from the repository source, so any feature or fix you
          add in <code>@ouim/simple-logto</code> is immediately testable here.
        </p>

        <div className="mt-8 rounded-[28px] border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <p className="font-semibold text-amber-950">Missing Logto environment variables</p>
              <p className="mt-1 text-sm leading-6 text-amber-900/80">
                Create <code>example_app/.env.local</code> from <code>.env.example</code>, then
                restart <code>npm run dev</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-4 rounded-[28px] border border-stone-200 bg-white/85 p-6">
          <p className="text-sm font-semibold text-stone-900">Expected variables</p>
          <code className="block rounded-2xl bg-stone-950 px-4 py-4 text-sm leading-7 text-stone-100">
            VITE_LOGTO_ENDPOINT=https://your-tenant.logto.app{'\n'}
            VITE_LOGTO_APP_ID=your-app-id{'\n'}
            VITE_LOGTO_RESOURCES=https://your-api.example.com{'\n'}
            VITE_LOGTO_SCOPES=openid,profile,email
          </code>
        </div>
      </div>

      <aside className="rounded-[32px] border border-stone-200/70 bg-white/72 p-8 shadow-[0_24px_70px_rgba(71,53,30,0.08)] backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.32em] text-stone-500">Quick start</p>
        <ol className="mt-5 space-y-4 text-sm leading-7 text-stone-700">
          <li>
            1. Run <code>npm install</code> inside <code>example_app</code>.
          </li>
          <li>
            2. Copy <code>.env.example</code> to <code>.env.local</code>.
          </li>
          <li>
            3. Add the redirect URI <code>http://localhost:3002/callback</code> in Logto.
          </li>
          <li>
            4. Start the app with <code>npm run dev</code>.
          </li>
        </ol>

        <a
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-stone-50 no-underline transition hover:bg-stone-700"
          href="https://docs.logto.io/"
          rel="noreferrer"
          target="_blank"
        >
          Open Logto docs
          <ExternalLink className="h-4 w-4" />
        </a>
      </aside>
    </section>
  </main>
);

const HomePage = ({ events, pushEvent, configSummary }) => {
  const { user, isLoadingUser, signIn, signOut, refreshAuth, enablePopupSignIn } = useAuth();
  const cookieValue = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('logto_authtoken='));

  const handleAction = async (label, action) => {
    try {
      await action();
      pushEvent(label, { ok: true });
    } catch (error) {
      pushEvent(`${label}:error`, {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[36px] border border-stone-200/80 bg-[rgba(255,251,244,0.85)] p-8 shadow-[0_32px_90px_rgba(71,53,30,0.1)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-stone-500">
                simple-logto sandbox
              </p>
              <h1 className="mt-4 text-5xl leading-tight text-stone-900">
                Test auth flows against the{' '}
                <span className="text-[#b85d38]">live library source</span>
              </h1>
              <p className="mt-5 text-base leading-8 text-stone-700">
                Use this page after any library change. It covers redirect sign-in, popup sign-in,
                callback handling, logout paths, and the current resolved auth state.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start rounded-full border border-stone-200 bg-white/80 px-4 py-3">
              <ShieldCheck className="h-5 w-5 text-[#7b9f70]" />
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-stone-500">Status</p>
                <p className="text-sm font-semibold text-stone-900">
                  {isLoadingUser ? 'Restoring session' : user ? 'Authenticated' : 'Signed out'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[28px] border border-stone-200 bg-white/85 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-stone-500">
                Current route
              </p>
              <p className="mt-3 flex items-center gap-2 text-lg font-semibold text-stone-900">
                <Route className="h-4 w-4 text-[#b85d38]" />
                {window.location.pathname}
              </p>
            </div>
            <div className="rounded-[28px] border border-stone-200 bg-white/85 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-stone-500">
                Popup mode
              </p>
              <p className="mt-3 text-lg font-semibold text-stone-900">
                {enablePopupSignIn ? 'Enabled in provider' : 'Disabled in provider'}
              </p>
            </div>
            <div className="rounded-[28px] border border-stone-200 bg-white/85 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-stone-500">
                Auth cookie
              </p>
              <p className="mt-3 text-lg font-semibold text-stone-900">
                {cookieValue ? 'Present' : 'Missing'}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-stone-50 transition hover:bg-stone-700"
              onClick={() => handleAction('signIn:redirect', () => signIn(undefined, false))}
              type="button"
            >
              <LogIn className="h-4 w-4" />
              Redirect sign-in
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-[#b85d38] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#9f4f2d]"
              onClick={() => handleAction('signIn:popup', () => signIn(undefined, true))}
              type="button"
            >
              <LogIn className="h-4 w-4" />
              Popup sign-in
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900 transition hover:border-stone-400 hover:bg-stone-50"
              onClick={() => handleAction('refreshAuth', () => refreshAuth())}
              type="button"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh auth
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900 transition hover:border-stone-400 hover:bg-stone-50"
              onClick={() =>
                handleAction('signOut:local', () =>
                  signOut({ callbackUrl: window.location.origin, global: false })
                )
              }
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Local sign-out
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-900 transition hover:border-stone-400 hover:bg-stone-50"
              onClick={() =>
                handleAction('signOut:global', () =>
                  signOut({ callbackUrl: window.location.origin, global: true })
                )
              }
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Global sign-out
            </button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              className="rounded-full border border-dashed border-stone-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600 transition hover:border-stone-500 hover:text-stone-900"
              onClick={() => navigate('/')}
              type="button"
            >
              Home route
            </button>
            <button
              className="rounded-full border border-dashed border-stone-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600 transition hover:border-stone-500 hover:text-stone-900"
              onClick={() => navigate('/signin')}
              type="button"
            >
              Test /signin
            </button>
            <button
              className="rounded-full border border-dashed border-stone-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600 transition hover:border-stone-500 hover:text-stone-900"
              onClick={() => navigate('/callback')}
              type="button"
            >
              Test /callback
            </button>
            <SignInButton
              className="rounded-full px-5"
              label="Library SignInButton"
              usePopup={true}
            />
          </div>

          <div className="mt-8 rounded-[28px] border border-stone-200 bg-white/82 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.26em] text-stone-500">
                  Current user payload
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  Live output from <code>useAuth()</code>
                </p>
              </div>
              {user ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Authenticated
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                  <KeyRound className="h-4 w-4" />
                  No active user
                </span>
              )}
            </div>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-stone-950 px-4 py-4 text-xs leading-6 text-stone-100">
              {JSON.stringify(
                {
                  isLoadingUser,
                  user,
                  config: configSummary,
                  cookiePresent: Boolean(cookieValue)
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-stone-200/80 bg-white/82 p-6 shadow-[0_24px_70px_rgba(71,53,30,0.08)] backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.26em] text-stone-500">
                  Account UI
                </p>
                <h2 className="mt-2 text-2xl text-stone-900">Built-in user controls</h2>
              </div>
              <UserCenter signoutCallbackUrl={window.location.origin} globalSignOut={false} />
            </div>
            <p className="mt-4 text-sm leading-7 text-stone-600">
              This uses the actual library dropdown so component-level auth regressions are easy to
              spot while testing.
            </p>
          </div>

          <div className="rounded-[32px] border border-stone-200/80 bg-white/82 p-6 shadow-[0_24px_70px_rgba(71,53,30,0.08)] backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-stone-500">
              Resolved config
            </p>
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-stone-950 px-4 py-4 text-xs leading-6 text-stone-100">
              {JSON.stringify(configSummary, null, 2)}
            </pre>
          </div>

          <EventLog events={events} />
        </div>
      </section>
    </main>
  );
};

const RoutedContent = ({ events, pushEvent, configSummary }) => {
  const path = useCurrentPath();

  if (path === '/callback') {
    return (
      <CallbackPage
        className="px-6"
        onError={(error) =>
          pushEvent('callback:error', { message: error.message, path: window.location.pathname })
        }
        onSuccess={() =>
          pushEvent('callback:success', {
            path: window.location.pathname,
            search: window.location.search
          })
        }
        redirectTo="/"
      />
    );
  }

  if (path === '/signin') {
    return (
      <SignInPage
        className="px-6"
        errorComponent={(error) => (
          <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-800">
            Failed to start sign-in: {error.message}
          </div>
        )}
        loadingComponent={
          <div className="rounded-[28px] border border-stone-200 bg-white/85 px-6 py-5 text-sm text-stone-700">
            Starting the Logto sign-in flow...
          </div>
        }
      />
    );
  }

  return <HomePage configSummary={configSummary} events={events} pushEvent={pushEvent} />;
};

const AppShell = ({ configSummary }) => {
  const [events, setEvents] = useState([]);

  const pushEvent = useMemo(
    () => (type, payload) => {
      setEvents((current) =>
        [
          {
            id: crypto.randomUUID(),
            type,
            time: new Date().toLocaleTimeString(),
            payload: JSON.stringify(payload, null, 2)
          },
          ...current
        ].slice(0, 12)
      );
    },
    []
  );

  useEffect(() => {
    const handleAuthStateChanged = () => {
      pushEvent('window:auth-state-changed', {
        href: window.location.href
      });
    };

    window.addEventListener('auth-state-changed', handleAuthStateChanged);
    return () => window.removeEventListener('auth-state-changed', handleAuthStateChanged);
  }, [pushEvent]);

  return <RoutedContent configSummary={configSummary} events={events} pushEvent={pushEvent} />;
};

const App = () => {
  const { config, isReady } = getLogtoConfig();

  if (!isReady) {
    return <SetupPanel />;
  }

  const configSummary = {
    endpoint: config.endpoint,
    appId: config.appId,
    resources: config.resources,
    scopes: config.scopes,
    callbackUrl: `${window.location.origin}/callback`
  };

  return (
    <AuthProvider
      callbackUrl={configSummary.callbackUrl}
      config={config}
      enablePopupSignIn={true}
      onAuthError={({ error, isTransient, willSignOut }) =>
        console.warn('[example_app] onAuthError', {
          message: error.message,
          isTransient,
          willSignOut
        })
      }
      onSignOut={({ reason, global, callbackUrl }) =>
        console.info('[example_app] onSignOut', { reason, global, callbackUrl })
      }
      onTokenRefresh={({ expiresAt, previousExpiresAt }) =>
        console.info('[example_app] onTokenRefresh', { expiresAt, previousExpiresAt })
      }
    >
      <AppShell configSummary={configSummary} />
    </AuthProvider>
  );
};

export default App;
