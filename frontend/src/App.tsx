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
    <AppProvider>
      <AppLayout>
        <Router />
      </AppLayout>
      <AuthModal />
    </AppProvider>
  );
}
