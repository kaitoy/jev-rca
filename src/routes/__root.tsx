import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { Shell } from '../components/ui.tsx'
import appCss from '../styles.css?url'

const THEME_INIT = `try{var t=localStorage.getItem('jev-rca.theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.theme=t}catch(e){}`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'jev-rca' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&family=Space+Grotesk:wght@600&display=swap' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  component: () => <Shell><Outlet /></Shell>,
  errorComponent: ({ error }) => (
    <div className="rounded-2xl glass-panel-strong p-6">
      <h1 className="font-display text-lg font-semibold">Error</h1>
      <p className="mt-2 font-mono text-xs text-error">{error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
