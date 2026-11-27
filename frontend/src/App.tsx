import { Navigate, Route, Routes } from "react-router";
import { IssueSheet } from "./components/IssueSheet";
import { Shell } from "./components/Shell";
import { HttpError, useMe, useSnapshot } from "./lib/api";
import { LiveProvider } from "./lib/live";
import { ModelProvider } from "./lib/model";
import type { Me } from "./lib/types";
import { Board } from "./pages/Board";
import { Deadlines } from "./pages/Deadlines";
import { Login, Splash } from "./pages/Login";
import { Project } from "./pages/Project";
import { Team } from "./pages/Team";
import { Today } from "./pages/Today";

function Signed({ me }: { me: Me }) {
  const snapshot = useSnapshot(true);

  if (snapshot.data) {
    return (
      <LiveProvider>
        <ModelProvider snap={snapshot.data} me={me}>
          <Shell>
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/tableau" element={<Board />} />
              <Route path="/equipe" element={<Team />} />
              <Route path="/echeances" element={<Deadlines />} />
              <Route path="/projet" element={<Project />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <IssueSheet />
          </Shell>
        </ModelProvider>
      </LiveProvider>
    );
  }
  if (snapshot.isError) {
    return (
      <Splash
        title="Le serveur ne répond pas"
        note="Impossible de lire l'état du projet. Ça vient du serveur, pas de toi."
        onRetry={() => void snapshot.refetch()}
      />
    );
  }
  return <Splash title="Mise sous tension…" />;
}

export function App() {
  const me = useMe();

  if (me.data) return <Signed me={me.data} />;
  if (me.isError) {
    const status = me.error instanceof HttpError ? me.error.status : 0;
    if (status === 401 || status === 403) return <Login />;
    return (
      <Splash
        title="Le serveur ne répond pas"
        note="Impossible de vérifier ta connexion pour l'instant."
        onRetry={() => void me.refetch()}
      />
    );
  }
  return <Splash title="Mise sous tension…" />;
}
