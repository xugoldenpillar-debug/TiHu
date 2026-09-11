import React from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { AppLayout } from "./components/layout/AppLayout";
import { AuthModal } from "./components/pages/Auth/AuthModal";

// Pages
import { ExplorePage } from "./pages/Explore/ExplorePage";
import { ChallengePage } from "./pages/Challenge/ChallengePage";
import { NewChallengePage } from "./pages/NewChallenge/NewChallengePage";
import { GalleryPage } from "./pages/Gallery/GalleryPage";
import { LeaderboardPage } from "./pages/Leaderboard/LeaderboardPage";
import { StudioPage } from "./pages/Studio/StudioPage";
import { RunPage } from "./pages/Run/RunPage";
import { MyRunsPage } from "./pages/Run/MyRunsPage";
import { ComparePage } from "./pages/Compare/ComparePage";
import { ConnectionsPage } from "./pages/Connections/ConnectionsPage";
import { SkillsPage } from "./pages/Skills/SkillsPage";
import { PromptsPage } from "./pages/Prompts/PromptsPage";
import { AdminPage } from "./pages/Admin/AdminPage";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-4 text-2xl font-black">
            !
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">页面加载遇到异常</h2>
          <p className="text-sm text-slate-500 mb-6">
            {this.state.error?.message || "发生了未知错误，请尝试刷新页面。"}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/explore";
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-xs"
            >
              返回探索大厅
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  const { activePath } = useApp();

  // Pattern matching for dynamic routes
  if (activePath.startsWith("/challenge/")) {
    const id = activePath.replace("/challenge/", "").split("?")[0];
    return <ChallengePage id={id} />;
  }

  if (activePath.startsWith("/run/")) {
    const id = activePath.replace("/run/", "").split("?")[0];
    return <RunPage id={id} />;
  }

  switch (activePath.split("?")[0]) {
    case "/":
    case "/explore":
      return <ExplorePage />;
    case "/gallery":
      return <GalleryPage />;
    case "/leaderboard":
      return <LeaderboardPage />;
    case "/new-challenge":
      return <NewChallengePage />;
    case "/studio":
      return <StudioPage />;
    case "/my-runs":
      return <MyRunsPage />;
    case "/compare":
      return <ComparePage />;
    case "/connections":
      return <ConnectionsPage />;
    case "/skills":
      return <SkillsPage />;
    case "/prompts":
      return <PromptsPage />;
    case "/admin":
      return <AdminPage />;
    default:
      return <ExplorePage />;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppLayout>
          <Router />
        </AppLayout>
        <AuthModal />
      </AppProvider>
    </ErrorBoundary>
  );
}
